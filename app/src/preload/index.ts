import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import {
  IPC,
  type AppSettings,
  type ConnectOptions,
  type ConnectionStatus,
  type OmadiaCanvasApi,
} from '../shared/ipc.js';
import type { ClientTurn, ServerMessage } from '../shared/protocol.js';

const subscribe = <T>(channel: string, cb: (payload: T) => void): (() => void) => {
  const listener = (_e: IpcRendererEvent, payload: T) => cb(payload);
  ipcRenderer.on(channel, listener);
  return () => {
    ipcRenderer.removeListener(channel, listener);
  };
};

const api: OmadiaCanvasApi = {
  connect: (opts: ConnectOptions) => ipcRenderer.invoke(IPC.connect, opts) as Promise<void>,
  sendTurn: (turn: ClientTurn) => ipcRenderer.send(IPC.turn, turn),
  requestResync: () => ipcRenderer.send(IPC.resync),
  onServerMessage: (cb: (msg: ServerMessage) => void) => subscribe(IPC.serverMessage, cb),
  onStatus: (cb: (status: ConnectionStatus) => void) => subscribe(IPC.status, cb),
  getSettings: () => ipcRenderer.invoke(IPC.settingsGet) as Promise<AppSettings | null>,
  saveSettings: (settings: AppSettings) =>
    ipcRenderer.invoke(IPC.settingsSave, settings) as Promise<void>,
};

contextBridge.exposeInMainWorld('omadiaCanvas', api);
