import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import {
  IPC,
  type AppSettings,
  type AuthDiscovery,
  type AuthLoginResult,
  type AuthSessionInfo,
  type ConnectOptions,
  type ConnectionStatus,
  type OmadiaCanvasApi,
} from '../shared/ipc.js';
import type {
  CanvasListEntry,
  ClientCanvasRefresh,
  ClientTurn,
  DesktopListEntry,
  ServerMessage,
} from '../shared/protocol.js';

const subscribeKeyed = <T>(
  channel: string,
  cb: (slotKey: string, payload: T) => void,
): (() => void) => {
  const listener = (_e: IpcRendererEvent, slotKey: string, payload: T) => cb(slotKey, payload);
  ipcRenderer.on(channel, listener);
  return () => {
    ipcRenderer.removeListener(channel, listener);
  };
};

const api: OmadiaCanvasApi = {
  connect: (slotKey: string, opts: ConnectOptions) =>
    ipcRenderer.invoke(IPC.connect, slotKey, opts) as Promise<void>,
  disconnect: (slotKey: string) => ipcRenderer.invoke(IPC.disconnect, slotKey) as Promise<void>,
  disconnectAll: () => ipcRenderer.invoke(IPC.disconnectAll) as Promise<void>,
  sendTurn: (slotKey: string, turn: ClientTurn) => ipcRenderer.send(IPC.turn, slotKey, turn),
  refreshCanvas: (slotKey: string, refresh: ClientCanvasRefresh) =>
    ipcRenderer.send(IPC.refresh, slotKey, refresh),
  abortTurn: (slotKey: string, forTurn: string) => ipcRenderer.send(IPC.abort, slotKey, forTurn),
  requestResync: (slotKey: string) => ipcRenderer.send(IPC.resync, slotKey),
  requestCanvasList: (slotKey: string) => ipcRenderer.send(IPC.canvasListGet, slotKey),
  saveCanvasList: (slotKey: string, canvases: CanvasListEntry[]) =>
    ipcRenderer.send(IPC.canvasListPut, slotKey, canvases),
  requestDesktopList: (slotKey: string) => ipcRenderer.send(IPC.desktopListGet, slotKey),
  saveDesktopList: (slotKey: string, desktops: DesktopListEntry[]) =>
    ipcRenderer.send(IPC.desktopListPut, slotKey, desktops),
  ackNotification: (slotKey: string, id: string) =>
    ipcRenderer.send(IPC.notificationAck, slotKey, id),
  onServerMessage: (cb: (slotKey: string, msg: ServerMessage) => void) =>
    subscribeKeyed(IPC.serverMessage, cb),
  onStatus: (cb: (slotKey: string, status: ConnectionStatus) => void) =>
    subscribeKeyed(IPC.status, cb),
  getSettings: () => ipcRenderer.invoke(IPC.settingsGet) as Promise<AppSettings | null>,
  saveSettings: (settings: AppSettings) =>
    ipcRenderer.invoke(IPC.settingsSave, settings) as Promise<void>,
  authSession: (opts: ConnectOptions) =>
    ipcRenderer.invoke(IPC.authSession, opts) as Promise<AuthSessionInfo>,
  authDiscover: (opts: ConnectOptions) =>
    ipcRenderer.invoke(IPC.authDiscover, opts) as Promise<AuthDiscovery | null>,
  authLogin: (opts: ConnectOptions, providerId: string, email: string, password: string) =>
    ipcRenderer.invoke(IPC.authLogin, opts, providerId, email, password) as Promise<AuthLoginResult>,
  authLoginBrowser: (opts: ConnectOptions) =>
    ipcRenderer.invoke(IPC.authLoginBrowser, opts) as Promise<AuthLoginResult>,
};

contextBridge.exposeInMainWorld('omadiaCanvas', api);
