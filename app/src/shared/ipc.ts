import type {
  CanvasListEntry,
  ClientCanvasRefresh,
  ClientTurn,
  ServerMessage,
} from './protocol.js';

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
  /** failed because no valid kernel session exists (issue #7) — the renderer
   *  surfaces a sign-in prompt instead of a generic connection error */
  authRequired?: boolean;
}

/** kernel auth surface (GET /api/v1/auth/providers, issue #7) */
export interface AuthProvider {
  id: string;
  displayName: string;
  kind: 'password' | 'oidc';
}

export interface AuthDiscovery {
  providers: AuthProvider[];
  setupRequired: boolean;
}

export interface AuthLoginResult {
  ok: boolean;
  /** machine-readable failure; detail carries the human-readable specifics */
  error?: 'invalid_credentials' | 'unknown_provider' | 'unreachable' | 'cancelled';
  detail?: string;
}

export interface AuthSessionInfo {
  valid: boolean;
  email?: string;
  /** unix seconds */
  expiresAt?: number;
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
  /** deterministic refresh (issue #5) — re-resolve the data behind the
   *  current tree; answered with ordinary surface_patch events */
  refreshCanvas(slotKey: string, refresh: ClientCanvasRefresh): void;
  /** abort the in-flight turn (issue #13) — answered with turn_error 'aborted' */
  abortTurn(slotKey: string, forTurn: string): void;
  requestResync(slotKey: string): void;
  /** per-user canvas registry sync (multi-canvas sidebar) */
  requestCanvasList(slotKey: string): void;
  saveCanvasList(slotKey: string, canvases: CanvasListEntry[]): void;
  /** notification seen/dismissed (issue #15) */
  ackNotification(slotKey: string, id: string): void;
  onServerMessage(cb: (slotKey: string, msg: ServerMessage) => void): () => void;
  onStatus(cb: (slotKey: string, status: ConnectionStatus) => void): () => void;
  getSettings(): Promise<AppSettings | null>;
  saveSettings(settings: AppSettings): Promise<void>;
  /** native auth (issue #7): vault-backed session probe, method discovery,
   *  JSON credential login; the embedded-web-window flow stays as fallback
   *  for OIDC tenants and kernels without the discovery endpoint */
  authSession(opts: ConnectOptions): Promise<AuthSessionInfo>;
  authDiscover(opts: ConnectOptions): Promise<AuthDiscovery | null>;
  authLogin(
    opts: ConnectOptions,
    providerId: string,
    email: string,
    password: string,
  ): Promise<AuthLoginResult>;
  authLoginBrowser(opts: ConnectOptions): Promise<AuthLoginResult>;
}

export const IPC = {
  connect: 'canvas:connect',
  disconnect: 'canvas:disconnect',
  disconnectAll: 'canvas:disconnect-all',
  turn: 'canvas:turn',
  refresh: 'canvas:refresh',
  abort: 'canvas:abort',
  resync: 'canvas:resync',
  canvasListGet: 'canvas:list-get',
  canvasListPut: 'canvas:list-put',
  notificationAck: 'canvas:notification-ack',
  serverMessage: 'canvas:server-message',
  status: 'canvas:status',
  settingsGet: 'settings:get',
  settingsSave: 'settings:save',
  authSession: 'auth:session',
  authDiscover: 'auth:discover',
  authLogin: 'auth:login',
  authLoginBrowser: 'auth:login-browser',
} as const;
