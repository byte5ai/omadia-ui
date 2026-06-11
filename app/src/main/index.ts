import './wsEnv.js';
import { app, BrowserWindow, ipcMain, Menu, nativeTheme } from 'electron';
import { join } from 'node:path';
import { IPC, type AppSettings, type ConnectOptions } from '../shared/ipc.js';
import type { CanvasListEntry, ClientTurn } from '../shared/protocol.js';
import { acquireSessionCookie } from './auth.js';
import { CanvasSocket } from './canvasSocket.js';
import { createFileSessionStore } from './sessionStore.js';
import { createFileSettingsStore } from './settingsStore.js';

/** the ops-catalog subset this build implements. M1 ships none; M2 adds
 *  brush/blur/select-magic-wand — extend here AND in the catalog handler. */
const LOCAL_OPERATIONS: string[] = [];

let win: BrowserWindow | null = null;
/** One socket per canvas slot — background canvases keep their streams
 *  flowing while another canvas is in front (multi-canvas sidebar). */
const sockets = new Map<string, CanvasSocket>();

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
    const httpOrigin = opts.url.replace(/^ws/, 'http').replace(/\/omadia-ui\/canvas$/, '');
    try {
      cookie = await acquireSessionCookie(opts.loginUrl ?? httpOrigin);
    } catch (err) {
      // aborted login window — surface as failed status so onboarding stays open
      safeSend(IPC.status, slotKey, {
        state: 'failed',
        detail: err instanceof Error ? err.message : String(err),
      });
      return;
    }
  }
  // Multi-canvas: the renderer pins a specific session per slot (sidebar)
  // or forces a fresh one (new canvas) — the file store stays the fallback
  // and always tracks the LAST-ACTIVE session for cold app starts.
  const fileStore = createFileSessionStore(app.getPath('userData'));
  const session = opts.freshSession
    ? { load: (): string | undefined => undefined, save: (id: string) => fileStore.save(id) }
    : opts.canvasSessionId
      ? { load: (): string | undefined => opts.canvasSessionId, save: (id: string) => fileStore.save(id) }
      : fileStore;
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

ipcMain.handle(IPC.disconnectAll, () => {
  for (const s of sockets.values()) s.close();
  sockets.clear();
});

ipcMain.on(IPC.turn, (_e, slotKey: string, turn: ClientTurn) =>
  sockets.get(slotKey)?.sendTurn(turn),
);
ipcMain.on(IPC.resync, (_e, slotKey: string) => sockets.get(slotKey)?.resync());
ipcMain.on(IPC.canvasListGet, (_e, slotKey: string) =>
  sockets.get(slotKey)?.sendMessage({ type: 'canvas_list_get' }),
);
ipcMain.on(IPC.canvasListPut, (_e, slotKey: string, canvases: CanvasListEntry[]) =>
  sockets.get(slotKey)?.sendMessage({ type: 'canvas_list_put', canvases }),
);
ipcMain.on(IPC.notificationAck, (_e, slotKey: string, id: string) =>
  sockets.get(slotKey)?.sendMessage({ type: 'notification_ack', id }),
);

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
