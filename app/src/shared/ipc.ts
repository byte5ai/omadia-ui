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

export interface OmadiaCanvasApi {
  connect(opts: ConnectOptions): Promise<void>;
  sendTurn(turn: ClientTurn): void;
  requestResync(): void;
  /** per-user canvas registry sync (multi-canvas sidebar) */
  requestCanvasList(): void;
  saveCanvasList(canvases: CanvasListEntry[]): void;
  onServerMessage(cb: (msg: ServerMessage) => void): () => void;
  onStatus(cb: (status: ConnectionStatus) => void): () => void;
  getSettings(): Promise<AppSettings | null>;
  saveSettings(settings: AppSettings): Promise<void>;
}

export const IPC = {
  connect: 'canvas:connect',
  turn: 'canvas:turn',
  resync: 'canvas:resync',
  canvasListGet: 'canvas:list-get',
  canvasListPut: 'canvas:list-put',
  serverMessage: 'canvas:server-message',
  status: 'canvas:status',
  settingsGet: 'settings:get',
  settingsSave: 'settings:save',
} as const;
