import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import {
  IPC,
  type AppSettings,
  type ConnectOptions,
  type ConnectionStatus,
  type OmadiaCanvasApi,
} from '../shared/ipc.js';
import type { CanvasListEntry, ClientTurn, ServerMessage } from '../shared/protocol.js';

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
  disconnectAll: () => ipcRenderer.invoke(IPC.disconnectAll) as Promise<void>,
  sendTurn: (slotKey: string, turn: ClientTurn) => ipcRenderer.send(IPC.turn, slotKey, turn),
  requestResync: (slotKey: string) => ipcRenderer.send(IPC.resync, slotKey),
  requestCanvasList: (slotKey: string) => ipcRenderer.send(IPC.canvasListGet, slotKey),
  saveCanvasList: (slotKey: string, canvases: CanvasListEntry[]) =>
    ipcRenderer.send(IPC.canvasListPut, slotKey, canvases),
  ackNotification: (slotKey: string, id: string) =>
    ipcRenderer.send(IPC.notificationAck, slotKey, id),
  onServerMessage: (cb: (slotKey: string, msg: ServerMessage) => void) =>
    subscribeKeyed(IPC.serverMessage, cb),
  onStatus: (cb: (slotKey: string, status: ConnectionStatus) => void) =>
    subscribeKeyed(IPC.status, cb),
  getSettings: () => ipcRenderer.invoke(IPC.settingsGet) as Promise<AppSettings | null>,
  saveSettings: (settings: AppSettings) =>
    ipcRenderer.invoke(IPC.settingsSave, settings) as Promise<void>,
};

contextBridge.exposeInMainWorld('omadiaCanvas', api);
