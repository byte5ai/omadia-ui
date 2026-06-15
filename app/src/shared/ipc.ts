import type {
  CanvasListEntry,
  ClientCanvasRefresh,
  ClientTurn,
  DesktopListEntry,
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

/** friction-free pairing descriptor (#293) — the unified shape every entry
 *  path (HTTP discovery, manual paste, future LAN mDNS) resolves to, so the
 *  connect code stays source-agnostic. */
export interface PairingAuth {
  /** `unknown` → discovery gave no auth hint (legacy `/omadia-ui/info`); the
   *  caller probes `/api/v1/auth/providers` the usual way. */
  mode: 'none' | 'password' | 'oidc' | 'unknown';
  providers?: AuthProvider[];
  /** absolute auth base the client should use (`…/api/v1/auth` or a proxied
   *  `…/bot-api/v1/auth`); absent → derive from the wsUrl origin */
  loginStartUrl?: string;
}

export interface PairingDescriptor {
  /** human label for the host, when the server supplied one */
  name?: string;
  /** absolute `ws(s)://host/omadia-ui/canvas` */
  wsUrl: string;
  protocolVersion: string;
  auth: PairingAuth;
}

/** a host found on the LAN via mDNS (`_omadia._tcp`, #293) — feeds the
 *  "Discovered hosts" picker. The user clicks one and the normal HTTP
 *  discovery resolves it into a PairingDescriptor. */
export interface DiscoveredHost {
  /** stable key for de-dup + React lists (service fqdn or name@address:port) */
  id: string;
  /** human label (TXT `name`, else the mDNS service name) */
  name: string;
  /** resolvable host or IP — what we hand to discovery as `address:port` */
  address: string;
  port: number;
  /** auth hint from the TXT record, when present */
  authMode?: 'none' | 'password' | 'oidc';
}

/** one configured omadia server — the bottom-left instance switcher */
export interface OmadiaInstance {
  id: string;
  name: string;
  /** ws(s)://host/omadia-ui/canvas */
  serverUrl: string;
  useAuth: boolean;
  /** optional login page override for the auth cookie flow */
  loginUrl?: string;
}

/** user-entered server config, persisted in userData (onboarding).
 *  Persisted only after the first successful connect. */
export interface AppSettings {
  /** ws(s)://host/omadia-ui/canvas */
  serverUrl: string;
  useAuth: boolean;
  /** optional login page override for the auth cookie flow */
  loginUrl?: string;
  /** all configured instances — ≥1 after migration */
  instances?: OmadiaInstance[];
  /** must reference an instances[i].id */
  activeInstanceId?: string;
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
  /** per-user desktop registry sync (multi-desktop workspaces) */
  requestDesktopList(slotKey: string): void;
  saveDesktopList(slotKey: string, desktops: DesktopListEntry[]): void;
  onServerMessage(cb: (slotKey: string, msg: ServerMessage) => void): () => void;
  onStatus(cb: (slotKey: string, status: ConnectionStatus) => void): () => void;
  getSettings(): Promise<AppSettings | null>;
  saveSettings(settings: AppSettings): Promise<void>;
  /** friction-free pairing (#293): resolve a human-typed host/URL into a
   *  connect-ready descriptor (absolute wsUrl + auth). null → nothing on any
   *  candidate origin answered the discovery probe. */
  pairingDiscover(input: string): Promise<PairingDescriptor | null>;
  /** LAN discovery (#293, Scenario A): browse `_omadia._tcp` and stream the
   *  growing host list to `onHosts`. Returns a stop fn that ends the scan and
   *  unsubscribes — call it on connect / unmount. */
  pairingScan(onHosts: (hosts: DiscoveredHost[]) => void): () => void;
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
  desktopListGet: 'canvas:desktop-list-get',
  desktopListPut: 'canvas:desktop-list-put',
  serverMessage: 'canvas:server-message',
  status: 'canvas:status',
  settingsGet: 'settings:get',
  settingsSave: 'settings:save',
  pairingDiscover: 'pairing:discover',
  pairingScanStart: 'pairing:scan-start',
  pairingScanStop: 'pairing:scan-stop',
  pairingDiscovered: 'pairing:discovered',
  authSession: 'auth:session',
  authDiscover: 'auth:discover',
  authLogin: 'auth:login',
  authLoginBrowser: 'auth:login-browser',
} as const;
