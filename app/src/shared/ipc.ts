import type { ClientTurn, ServerMessage } from './protocol.js';

export interface ConnectOptions {
  /** ws(s)://host/omadia-ui/canvas */
  url: string;
  /** true → run the login-window cookie flow before connecting */
  useAuth: boolean;
}

export interface ConnectionStatus {
  state: 'disconnected' | 'connecting' | 'ready' | 'failed';
  canvasSessionId?: string;
  detail?: string;
}

export interface OmadiaCanvasApi {
  connect(opts: ConnectOptions): Promise<void>;
  sendTurn(turn: ClientTurn): void;
  requestResync(): void;
  onServerMessage(cb: (msg: ServerMessage) => void): () => void;
  onStatus(cb: (status: ConnectionStatus) => void): () => void;
}

export const IPC = {
  connect: 'canvas:connect',
  turn: 'canvas:turn',
  resync: 'canvas:resync',
  serverMessage: 'canvas:server-message',
  status: 'canvas:status',
} as const;
