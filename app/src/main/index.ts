import './wsEnv.js';
import { app, BrowserWindow, ipcMain, Menu, nativeTheme, safeStorage, session } from 'electron';
import { join } from 'node:path';
import { IPC, type AppSettings, type ConnectOptions } from '../shared/ipc.js';
import type {
  CanvasListEntry,
  ClientCanvasRefresh,
  ClientTurn,
  DesktopListEntry,
} from '../shared/protocol.js';
import { acquireSessionCookie, authDebug } from './auth.js';
import { discoverProviders, loginWithPassword, validateSession, wsToHttpOrigin } from './authApi.js';
import { discoverPairing } from './discovery.js';
import { startMdnsBrowser, type MdnsBrowserHandle } from './mdnsBrowser.js';
import { CanvasSocket } from './canvasSocket.js';
import { createFileSessionStore } from './sessionStore.js';
import { createSessionVault, type SessionVault } from './sessionVault.js';
import { createFileSettingsStore } from './settingsStore.js';

/** the ops-catalog subset this build implements. M1 ships none; M2 adds
 *  brush/blur/select-magic-wand — extend here AND in the catalog handler. */
const LOCAL_OPERATIONS: string[] = [];

let win: BrowserWindow | null = null;
/** One socket per canvas slot — background canvases keep their streams
 *  flowing while another canvas is in front (multi-canvas sidebar). */
const sockets = new Map<string, CanvasSocket>();
/** safeStorage-encrypted session cookies per server origin (issue #7);
 *  lazy — both userData path and safeStorage need the ready app */
let vaultInstance: SessionVault | null = null;
const getVault = (): SessionVault =>
  (vaultInstance ??= createSessionVault(app.getPath('userData'), safeStorage));

/** Vaulted session for the origin — with a one-time migration: installs that
 *  signed in through the legacy web window still hold the cookie in its
 *  partition; lift it into the vault so nobody re-authenticates on update. */
async function resolveVaultedSession(
  origin: string,
): Promise<{ cookie: string; expiresAt?: number } | null> {
  const vault = getVault();
  const stored = vault.load(origin);
  if (stored) return stored;
  try {
    const ses = session.fromPartition('persist:omadia-auth');
    const cookies = await ses.cookies.get({ url: origin, name: 'omadia_session' });
    const c = cookies[0];
    if (!c) return null;
    const cookie = `omadia_session=${c.value}`;
    authDebug(`vault miss for ${origin} — lifting partition cookie`);
    const check = await validateSession(origin, cookie, authDebug);
    if (check !== null && !check.valid) {
      authDebug(`partition cookie for ${origin} rejected by /auth/me`);
      return null;
    }
    vault.save(origin, cookie, check?.expiresAt);
    return { cookie, ...(check?.expiresAt !== undefined ? { expiresAt: check.expiresAt } : {}) };
  } catch {
    return null;
  }
}

/** webContents.send AFTER the window died throws "Object has been destroyed"
 *  (late socket close events during app quit) — guard every push. */
function safeSend(channel: string, ...args: unknown[]): void {
  if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) {
    win.webContents.send(channel, ...args);
  }
}

function createWindow(): void {
  win = new BrowserWindow({
    width: 1440,
    height: 920,
    // pre-paint fill matching the Lume bg.canvas pair (visual-spec §2.2):
    // dark #1B1D24 / light #F7F8FB — avoids a wrong-scheme flash before CSS
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1b1d24' : '#f7f8fb',
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      // ESM preload scripts require sandbox: false (electron-vite, "type": "module");
      // contextIsolation stays the hard boundary.
      sandbox: false,
    },
  });

  const menu = Menu.buildFromTemplate([
    { role: 'appMenu' },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { role: 'togglefullscreen' }, // fullscreen-overlay vs windowed (concept Req 4)
        { role: 'toggleDevTools' },
        // ⌘1–3 canvas hotkeys are reserved; single canvas until WT5.
        ...[1, 2, 3].map((n) => ({
          label: `Canvas ${n}`,
          accelerator: `CommandOrControl+${n}`,
          click: () =>
            win?.webContents.send(IPC.status, {
              state: 'ready',
              detail: `canvas ${n} (single-canvas M1)`,
            }),
        })),
      ],
    },
  ]);
  Menu.setApplicationMenu(menu);

  if (process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL']); // electron-vite dev
  } else {
    void win.loadFile(join(import.meta.dirname, '../renderer/index.html'));
  }
}

ipcMain.handle(IPC.connect, async (_e, slotKey: string, opts: ConnectOptions) => {
  sockets.get(slotKey)?.close();
  sockets.delete(slotKey);
  let cookie: string | undefined;
  if (opts.useAuth) {
    // native flow (issue #7): connect only ever uses the vaulted session —
    // sign-in happens BEFORE connect via the auth IPC surface below. A
    // missing/expired session is an auth prompt, not a connection error.
    const stored = await resolveVaultedSession(wsToHttpOrigin(opts.url));
    if (!stored) {
      safeSend(IPC.status, slotKey, {
        state: 'failed',
        detail: 'Sign-in required',
        authRequired: true,
      });
      return;
    }
    cookie = stored.cookie;
  }
  // Multi-canvas: the renderer pins a specific session per slot (sidebar)
  // or forces a fresh one (new canvas) — the file store stays the fallback
  // and always tracks the LAST-ACTIVE session for cold app starts.
  const fileStore = createFileSessionStore(app.getPath('userData'));
  // Resume priority: explicit pin > the session THIS socket already acked >
  // file fallback. The acked id matters: a resync reconnect on a freshSession
  // slot must NOT mint another server session — that would orphan everything
  // keyed by canvasSessionId (registry entry, server-side refresh recipes).
  let ackedSession: string | undefined = opts.freshSession ? undefined : opts.canvasSessionId;
  const session = {
    load: (): string | undefined =>
      ackedSession ??
      (opts.freshSession || opts.canvasSessionId ? undefined : (fileStore.load() ?? undefined)),
    save: (id: string): void => {
      ackedSession = id;
      fileStore.save(id);
    },
  };
  const socket = new CanvasSocket({
    url: opts.url,
    cookie,
    localOperations: LOCAL_OPERATIONS,
    session,
    onMessage: (msg) => safeSend(IPC.serverMessage, slotKey, msg),
    onStatus: (status) => safeSend(IPC.status, slotKey, status),
  });
  sockets.set(slotKey, socket);
  socket.connect();
});

ipcMain.handle(IPC.disconnect, (_e, slotKey: string) => {
  sockets.get(slotKey)?.close();
  sockets.delete(slotKey);
});

ipcMain.handle(IPC.disconnectAll, () => {
  for (const s of sockets.values()) s.close();
  sockets.clear();
});

ipcMain.on(IPC.turn, (_e, slotKey: string, turn: ClientTurn) =>
  sockets.get(slotKey)?.sendTurn(turn),
);
ipcMain.on(IPC.refresh, (_e, slotKey: string, refresh: ClientCanvasRefresh) =>
  sockets.get(slotKey)?.sendMessage(refresh),
);
ipcMain.on(IPC.abort, (_e, slotKey: string, forTurn: string) =>
  sockets.get(slotKey)?.sendMessage({ type: 'turn_abort', forTurn }),
);
ipcMain.on(IPC.resync, (_e, slotKey: string) => sockets.get(slotKey)?.resync());
ipcMain.on(IPC.canvasListGet, (_e, slotKey: string) =>
  sockets.get(slotKey)?.sendMessage({ type: 'canvas_list_get' }),
);
ipcMain.on(IPC.canvasListPut, (_e, slotKey: string, canvases: CanvasListEntry[]) =>
  sockets.get(slotKey)?.sendMessage({ type: 'canvas_list_put', canvases }),
);
ipcMain.on(IPC.desktopListGet, (_e, slotKey: string) =>
  sockets.get(slotKey)?.sendMessage({ type: 'desktop_list_get' }),
);
ipcMain.on(IPC.desktopListPut, (_e, slotKey: string, desktops: DesktopListEntry[]) =>
  sockets.get(slotKey)?.sendMessage({ type: 'desktop_list_put', desktops }),
);
ipcMain.on(IPC.notificationAck, (_e, slotKey: string, id: string) =>
  sockets.get(slotKey)?.sendMessage({ type: 'notification_ack', id }),
);

// ── native auth surface (issue #7) ──
// probe the vaulted session: cheap local check first, then /api/v1/auth/me.
// An unreachable server keeps the cookie (null check result) — the WS upgrade
// is the authority then; only a definite 401 clears the vault.
ipcMain.handle(IPC.authSession, async (_e, opts: ConnectOptions) => {
  const origin = wsToHttpOrigin(opts.url);
  const stored = await resolveVaultedSession(origin);
  authDebug(`authSession probe ${origin}: vault=${stored ? 'hit' : 'miss'}`);
  if (!stored) return { valid: false };
  const check = await validateSession(origin, stored.cookie, authDebug);
  if (check === null) {
    return { valid: true, ...(stored.expiresAt !== undefined ? { expiresAt: stored.expiresAt } : {}) };
  }
  if (!check.valid) {
    authDebug(`authSession probe ${origin}: stored cookie rejected — vault cleared`);
    getVault().clear(origin);
    return { valid: false };
  }
  return {
    valid: true,
    ...(check.email !== undefined ? { email: check.email } : {}),
    ...(check.expiresAt !== undefined ? { expiresAt: check.expiresAt } : {}),
  };
});

ipcMain.handle(IPC.authDiscover, (_e, opts: ConnectOptions) =>
  discoverProviders(wsToHttpOrigin(opts.url)),
);

ipcMain.handle(
  IPC.authLogin,
  async (_e, opts: ConnectOptions, providerId: string, email: string, password: string) => {
    const origin = wsToHttpOrigin(opts.url);
    const res = await loginWithPassword(origin, providerId, email, password);
    if (res.ok) {
      getVault().save(origin, res.cookie, res.expiresAt);
      return { ok: true };
    }
    return { ok: false, error: res.error, ...(res.detail ? { detail: res.detail } : {}) };
  },
);

// embedded-web-window fallback — OIDC tenants and kernels without the
// discovery endpoint; the acquired cookie lands in the same vault
ipcMain.handle(IPC.authLoginBrowser, async (_e, opts: ConnectOptions) => {
  const httpOrigin = opts.url.replace(/^ws/, 'http').replace(/\/omadia-ui\/canvas$/, '');
  try {
    const cookie = await acquireSessionCookie(opts.loginUrl ?? httpOrigin);
    authDebug(`authLoginBrowser: captured cookie, vault save under ${wsToHttpOrigin(opts.url)}`);
    getVault().save(wsToHttpOrigin(opts.url), cookie);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: 'cancelled',
      detail: err instanceof Error ? err.message : String(err),
    };
  }
});

// Friction-free pairing (#293): resolve a human-typed host/URL into a
// connect-ready descriptor. Runs in the main process so it is not bound by the
// renderer's CSP / mixed-content rules and can probe http LAN hosts.
ipcMain.handle(IPC.pairingDiscover, (_e, input: string) => discoverPairing(input));

// LAN discovery (#293, Scenario A): one browser at a time, streaming the host
// list to the renderer. A second start tears the previous one down first so a
// re-opened setup card never leaks responders.
let mdnsBrowser: MdnsBrowserHandle | null = null;
ipcMain.handle(IPC.pairingScanStart, async () => {
  mdnsBrowser?.stop();
  mdnsBrowser = await startMdnsBrowser(
    (hosts) => safeSend(IPC.pairingDiscovered, hosts),
    (msg) => authDebug(msg),
  );
});
ipcMain.handle(IPC.pairingScanStop, () => {
  mdnsBrowser?.stop();
  mdnsBrowser = null;
});

ipcMain.handle(IPC.settingsGet, () => createFileSettingsStore(app.getPath('userData')).load());
ipcMain.handle(IPC.settingsSave, (_e, settings: AppSettings) =>
  createFileSettingsStore(app.getPath('userData')).save(settings),
);

void app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  for (const s of sockets.values()) s.close();
  sockets.clear();
  if (process.platform !== 'darwin') app.quit();
});
