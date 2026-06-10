import type { CanvasListEntry, ClientTurn, ServerMessage } from './protocol.js';

export interface ConnectOptions {
  /** ws(s)://host/omadia-ui/canvas */
  url: string;
  /** true → run the login-window cookie flow before connecting */
  useAuth: boolean;
  /** login page for the cookie flow; defaults to the WS URL's http origin
   *  (local Docker serves login on the web-ui port, not the kernel port) */
  loginUrl?: string;
  /** resume THIS canvas session (multi-canvas sidebar); omitted → last-used */
  canvasSessionId?: string;
  /** force a brand-new canvas session (server mints the id) */
  freshSession?: boolean;
}

export interface ConnectionStatus {
  state: 'disconnected' | 'connecting' | 'ready' | 'failed';
  canvasSessionId?: string;
  detail?: string;
}

/** user-entered server config, persisted in userData (onboarding).
 *  Persisted only after the first successful connect. */
export interface AppSettings {
  /** ws(s)://host/omadia-ui/canvas */
  serverUrl: string;
  useAuth: boolean;
  /** optional login page override for the auth cookie flow */
  loginUrl?: string;
}

/** One socket per canvas slot — streams keep flowing for BACKGROUND
 *  canvases, so switching mid-turn never loses a response. Every call and
 *  every event is keyed by the renderer's slot id. */
export interface OmadiaCanvasApi {
  connect(slotKey: string, opts: ConnectOptions): Promise<void>;
  /** tear down ONE slot's socket — canvas delete (issue #8); also aborts
   *  that slot's in-flight turn stream */
  disconnect(slotKey: string): Promise<void>;
  /** tear down every socket (server change from the setup card) */
  disconnectAll(): Promise<void>;
  sendTurn(slotKey: string, turn: ClientTurn): void;
  requestResync(slotKey: string): void;
  /** per-user canvas registry sync (multi-canvas sidebar) */
  requestCanvasList(slotKey: string): void;
  saveCanvasList(slotKey: string, canvases: CanvasListEntry[]): void;
  onServerMessage(cb: (slotKey: string, msg: ServerMessage) => void): () => void;
  onStatus(cb: (slotKey: string, status: ConnectionStatus) => void): () => void;
  getSettings(): Promise<AppSettings | null>;
  saveSettings(settings: AppSettings): Promise<void>;
}

export const IPC = {
  connect: 'canvas:connect',
  disconnect: 'canvas:disconnect',
  disconnectAll: 'canvas:disconnect-all',
  turn: 'canvas:turn',
  resync: 'canvas:resync',
  canvasListGet: 'canvas:list-get',
  canvasListPut: 'canvas:list-put',
  serverMessage: 'canvas:server-message',
  status: 'canvas:status',
  settingsGet: 'settings:get',
  settingsSave: 'settings:save',
} as const;
