import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";

import { IPC, type OmadiaApi } from "../shared/ipc";

const listen = <A extends unknown[]>(
  channel: string,
  cb: (...args: A) => void,
): (() => void) => {
  const handler = (_e: IpcRendererEvent, ...args: unknown[]): void =>
    cb(...(args as A));
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};

const api: OmadiaApi = {
  settingsGet: () => ipcRenderer.invoke(IPC.settingsGet),
  settingsSave: (patch) => ipcRenderer.invoke(IPC.settingsSave, patch),

  pairingDiscover: (input) => ipcRenderer.invoke(IPC.pairingDiscover, input),
  pairingScanStart: () => ipcRenderer.invoke(IPC.pairingScanStart),
  pairingScanStop: () => ipcRenderer.invoke(IPC.pairingScanStop),
  onPairingFound: (cb) => listen(IPC.pairingFound, cb),

  authSession: (wsUrl) => ipcRenderer.invoke(IPC.authSession, wsUrl),
  authDiscover: (wsUrl) => ipcRenderer.invoke(IPC.authDiscover, wsUrl),
  authLogin: (wsUrl, providerId, email, password) =>
    ipcRenderer.invoke(IPC.authLogin, wsUrl, providerId, email, password),
  authLoginBrowser: (wsUrl, providerId) =>
    ipcRenderer.invoke(IPC.authLoginBrowser, wsUrl, providerId),
  authCancelBrowser: () => ipcRenderer.invoke(IPC.authCancelBrowser),
  authLogout: (wsUrl) => ipcRenderer.invoke(IPC.authLogout, wsUrl),

  connect: (req) => ipcRenderer.invoke(IPC.connect, req),
  disconnect: (slotKey) => ipcRenderer.invoke(IPC.disconnect, slotKey),
  disconnectAll: () => ipcRenderer.invoke(IPC.disconnectAll),
  send: (slotKey, message) => ipcRenderer.send(IPC.send, slotKey, message),
  resync: (slotKey) => ipcRenderer.send(IPC.resync, slotKey),
  onServerMessage: (cb) => listen(IPC.serverMessage, cb),
  onStatus: (cb) => listen(IPC.status, cb),

  onMenuCommand: (cb) => listen(IPC.menuCommand, cb),
  platform: process.platform,
};

contextBridge.exposeInMainWorld("omadia", api);
