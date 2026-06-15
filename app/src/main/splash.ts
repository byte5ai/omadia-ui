import { BrowserWindow } from 'electron';
import { join } from 'node:path';

/** Frameless splash shown the instant the app is ready, while the main
 *  renderer boots. index.ts closes it on the main window's `ready-to-show`
 *  (with a hard timeout fallback so a slow/failed renderer never strands it).
 *  Lagoon palette — the app's Standard/default (matches the app icon). */
export function createSplashWindow(): BrowserWindow {
  const splash = new BrowserWindow({
    width: 560,
    height: 350,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    center: true,
    hasShadow: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });

  // Paint only once the image is decoded — avoids a one-frame empty flash.
  splash.once('ready-to-show', () => splash.show());

  if (process.env['ELECTRON_RENDERER_URL']) {
    void splash.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/splash.html`); // electron-vite dev
  } else {
    void splash.loadFile(join(import.meta.dirname, '../renderer/splash.html'));
  }
  return splash;
}
