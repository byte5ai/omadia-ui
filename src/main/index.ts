// ws reads these at import time; they must be set before anything loads it.
import "./ws-env";

import { join } from "node:path";

import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  nativeTheme,
  safeStorage,
  shell,
} from "electron";

import {
  type AppSettings,
  type ConnectRequest,
  IPC,
  type LoginResult,
  type SessionInfo,
} from "../shared/ipc";
import { buildAppMenu } from "./app-menu";
import {
  discoverProviders,
  loginWithPassword,
  logout,
  validateSession,
  wsToHttpOrigin,
} from "./auth/auth-api";
import { acquireSessionCookie, cancelBrowserLogin } from "./auth/browser-login";
import { createSessionVault } from "./auth/session-vault";
import { CanvasConnection } from "./canvas/canvas-connection";
import { discoverPairing } from "./pairing/discovery";
import { type LanScan, startLanScan } from "./pairing/lan-scan";
import { createSettingsStore } from "./settings-store";

// omadia-desktop (the server supervisor in omadia-core) calls itself
// "omadia" too; keep our profile in a folder of its own.
app.setPath("userData", join(app.getPath("appData"), "omadia-ui-2"));
app.setName("omadia UI");

const userData = app.getPath("userData");
const settings = createSettingsStore(userData);
const vault = createSessionVault(userData, safeStorage);
const connections = new Map<string, CanvasConnection>();
let mainWindow: BrowserWindow | null = null;
let lanScan: LanScan | null = null;

const sendToRenderer = (channel: string, ...args: unknown[]): void => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, ...args);
  }
};

// On macOS the window is a vibrancy view unless the user turned it off; the
// renderer keeps only the canvas panels opaque, so the desktop shines through
// everything around them.
const macos = process.platform === "darwin";
const vibrant = (s: AppSettings): boolean => macos && s.translucent;

function backgroundFor(s: AppSettings): string {
  if (vibrant(s)) return "#00000000";
  const night =
    s.mode === "night" ||
    (s.mode === "system" && nativeTheme.shouldUseDarkColors);
  return night ? "#0a0a0b" : "#e2e2de";
}

// The vibrancy material follows the window appearance, not our CSS, so the
// app's room has to drive the native theme.
function applyThemeSource(s: AppSettings): void {
  nativeTheme.themeSource =
    s.mode === "night" ? "dark" : s.mode === "day" ? "light" : "system";
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 960,
    minHeight: 600,
    show: false,
    title: "omadia",
    backgroundColor: backgroundFor(settings.get()),
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    trafficLightPosition: { x: 18, y: 18 },
    ...(vibrant(settings.get()) ? { vibrancy: "sidebar" as const } : {}),
    webPreferences: {
      preload: join(import.meta.dirname, "../preload/index.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void mainWindow.loadFile(
      join(import.meta.dirname, "../renderer/index.html"),
    );
  }
}

async function sessionInfo(wsUrl: string): Promise<SessionInfo> {
  const origin = wsToHttpOrigin(wsUrl);
  const stored = vault.load(origin);
  if (!stored) {
    // A server without auth accepts the socket without a cookie.
    const providers = await discoverProviders(origin);
    return providers === null
      ? { valid: false, unknown: true }
      : { valid: false };
  }
  const check = await validateSession(origin, stored.cookie);
  if (check === null) return { valid: true, unknown: true };
  if (!check.valid) {
    vault.clear(origin);
    return { valid: false };
  }
  return {
    valid: true,
    ...(check.email ? { email: check.email } : {}),
    ...(check.expiresAt ? { expiresAt: check.expiresAt } : {}),
  };
}

function registerIpc(): void {
  ipcMain.handle(IPC.settingsGet, () => settings.get());
  ipcMain.handle(IPC.settingsSave, (_e, patch: Partial<AppSettings>) => {
    const next = settings.save(patch);
    applyThemeSource(next);
    if (macos && patch.translucent !== undefined) {
      mainWindow?.setVibrancy(next.translucent ? "sidebar" : null);
    }
    mainWindow?.setBackgroundColor(backgroundFor(next));
    return next;
  });

  ipcMain.handle(IPC.pairingDiscover, (_e, input: string) =>
    discoverPairing(input),
  );
  ipcMain.handle(IPC.pairingScanStart, async () => {
    if (lanScan) return;
    lanScan = await startLanScan((found) =>
      sendToRenderer(IPC.pairingFound, found),
    ).catch(() => null);
  });
  ipcMain.handle(IPC.pairingScanStop, () => {
    lanScan?.stop();
    lanScan = null;
  });

  ipcMain.handle(IPC.authSession, (_e, wsUrl: string) => sessionInfo(wsUrl));
  ipcMain.handle(IPC.authDiscover, (_e, wsUrl: string) =>
    discoverProviders(wsToHttpOrigin(wsUrl)),
  );
  ipcMain.handle(
    IPC.authLogin,
    async (
      _e,
      wsUrl: string,
      providerId: string,
      email: string,
      password: string,
    ): Promise<LoginResult> => {
      const origin = wsToHttpOrigin(wsUrl);
      const result = await loginWithPassword(
        origin,
        providerId,
        email,
        password,
      );
      if (!result.ok) return result;
      vault.save(origin, {
        cookie: result.cookie,
        ...(result.expiresAt ? { expiresAt: result.expiresAt } : {}),
      });
      return { ok: true, email: email.trim().toLowerCase() };
    },
  );
  ipcMain.handle(
    IPC.authLoginBrowser,
    async (_e, wsUrl: string, providerId?: string): Promise<LoginResult> => {
      const origin = wsToHttpOrigin(wsUrl);
      const start = providerId
        ? `${origin}/api/v1/auth/login/${encodeURIComponent(providerId)}/start`
        : `${origin}/`;
      return await acquireSessionCookie(start, mainWindow)
        .then((session): LoginResult => {
          vault.save(origin, session);
          return { ok: true };
        })
        .catch((): LoginResult => ({ ok: false, error: "cancelled" }));
    },
  );
  ipcMain.handle(IPC.authCancelBrowser, () => cancelBrowserLogin());
  ipcMain.handle(IPC.authLogout, async (_e, wsUrl: string) => {
    const origin = wsToHttpOrigin(wsUrl);
    const stored = vault.load(origin);
    vault.clear(origin);
    for (const c of connections.values()) c.close();
    connections.clear();
    if (stored) await logout(origin, stored.cookie);
  });

  ipcMain.handle(IPC.connect, (_e, req: ConnectRequest) => {
    connections.get(req.slotKey)?.close();
    const origin = wsToHttpOrigin(req.wsUrl);
    const conn = new CanvasConnection({
      wsUrl: req.wsUrl,
      ...(req.canvasSessionId ? { canvasSessionId: req.canvasSessionId } : {}),
      cookie: () => vault.load(origin)?.cookie,
      onMessage: (msg) => sendToRenderer(IPC.serverMessage, req.slotKey, msg),
      onStatus: (status) => sendToRenderer(IPC.status, req.slotKey, status),
    });
    connections.set(req.slotKey, conn);
    conn.connect();
  });
  ipcMain.handle(IPC.disconnect, (_e, slotKey: string) => {
    connections.get(slotKey)?.close();
    connections.delete(slotKey);
  });
  ipcMain.handle(IPC.disconnectAll, () => {
    for (const c of connections.values()) c.close();
    connections.clear();
  });
  ipcMain.on(IPC.send, (_e, slotKey: string, message: unknown) => {
    const sent = connections.get(slotKey)?.send(message) ?? false;
    if (!sent) {
      sendToRenderer(IPC.status, slotKey, {
        state: "failed",
        detail: "message dropped: socket not ready",
      });
    }
  });
  ipcMain.on(IPC.resync, (_e, slotKey: string) =>
    connections.get(slotKey)?.resync(),
  );
}

void app.whenReady().then(() => {
  registerIpc();
  applyThemeSource(settings.get());
  Menu.setApplicationMenu(
    buildAppMenu((command) => sendToRenderer(IPC.menuCommand, command)),
  );
  createWindow();
  nativeTheme.on("updated", () =>
    mainWindow?.setBackgroundColor(backgroundFor(settings.get())),
  );
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  for (const c of connections.values()) c.close();
  connections.clear();
  lanScan?.stop();
  if (process.platform !== "darwin") app.quit();
});
