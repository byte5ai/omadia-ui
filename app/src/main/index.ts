import { app, BrowserWindow, ipcMain, Menu } from 'electron';
import { join } from 'node:path';
import { IPC, type ConnectOptions } from '../shared/ipc.js';
import type { ClientTurn } from '../shared/protocol.js';
import { acquireSessionCookie } from './auth.js';
import { CanvasSocket } from './canvasSocket.js';
import { createFileSessionStore } from './sessionStore.js';

/** the ops-catalog subset this build implements. M1 ships none; M2 adds
 *  brush/blur/select-magic-wand — extend here AND in the catalog handler. */
const LOCAL_OPERATIONS: string[] = [];

let win: BrowserWindow | null = null;
let socket: CanvasSocket | null = null;

function createWindow(): void {
  win = new BrowserWindow({
    width: 1440,
    height: 920,
    backgroundColor: '#101417',
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

ipcMain.handle(IPC.connect, async (_e, opts: ConnectOptions) => {
  socket?.close();
  let cookie: string | undefined;
  if (opts.useAuth) {
    const httpOrigin = opts.url.replace(/^ws/, 'http').replace(/\/omadia-ui\/canvas$/, '');
    cookie = await acquireSessionCookie(httpOrigin);
  }
  socket = new CanvasSocket({
    url: opts.url,
    cookie,
    localOperations: LOCAL_OPERATIONS,
    session: createFileSessionStore(app.getPath('userData')),
    onMessage: (msg) => win?.webContents.send(IPC.serverMessage, msg),
    onStatus: (status) => win?.webContents.send(IPC.status, status),
  });
  socket.connect();
});

ipcMain.on(IPC.turn, (_e, turn: ClientTurn) => socket?.sendTurn(turn));
ipcMain.on(IPC.resync, () => socket?.resync());

void app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  socket?.close();
  if (process.platform !== 'darwin') app.quit();
});
