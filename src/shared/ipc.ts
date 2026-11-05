/**
 * The contract between the Electron main process and the renderer.
 * All network traffic (discovery, auth, canvas sockets) lives in main;
 * the renderer only sees these typed calls and events.
 */

export type AuthKind = "password" | "oidc";

export interface AuthProvider {
  id: string;
  displayName: string;
  kind: AuthKind;
}

export interface AuthDiscovery {
  providers: AuthProvider[];
  setupRequired: boolean;
}

export interface PairingAuth {
  mode: "none" | "password" | "oidc" | "unknown";
  providers?: AuthProvider[];
  loginStartUrl?: string;
}

/** What a server tells us about itself when we pair with it. */
export interface PairingDescriptor {
  name?: string;
  wsUrl: string;
  protocolVersion: string;
  auth: PairingAuth;
}

export interface FoundServer {
  name: string;
  host: string;
  port: number;
  address: string;
}

export interface ServerEntry {
  id: string;
  name: string;
  wsUrl: string;
}

export type ColorMode = "night" | "day" | "system";
export type LightTemperature = 2700 | 4500 | 6500;

export interface AppSettings {
  servers: ServerEntry[];
  activeServerId: string | null;
  mode: ColorMode;
  temperature: LightTemperature;
  translucent: boolean;
  devTurnLog: boolean;
}

export interface SessionInfo {
  valid: boolean;
  email?: string;
  expiresAt?: number;
  /** true when the server could not be asked; the socket decides. */
  unknown?: boolean;
}

export type LoginResult =
  | { ok: true; email?: string }
  | {
      ok: false;
      error:
        | "invalid_credentials"
        | "unknown_provider"
        | "unreachable"
        | "cancelled";
      detail?: string;
    };

export type SocketState =
  | "disconnected"
  | "connecting"
  | "ready"
  | "failed"
  | "unauthenticated"
  | "forbidden";

export interface SocketStatus {
  state: SocketState;
  canvasSessionId?: string;
  detail?: string;
  sessionExpiresAt?: number;
}

export interface ConnectRequest {
  slotKey: string;
  wsUrl: string;
  /** resume this canvas session; omitted → the server mints a fresh one */
  canvasSessionId?: string;
}

export interface OmadiaApi {
  settingsGet(): Promise<AppSettings>;
  settingsSave(patch: Partial<AppSettings>): Promise<AppSettings>;

  pairingDiscover(input: string): Promise<PairingDescriptor | null>;
  pairingScanStart(): Promise<void>;
  pairingScanStop(): Promise<void>;
  onPairingFound(cb: (server: FoundServer) => void): () => void;

  authSession(wsUrl: string): Promise<SessionInfo>;
  authDiscover(wsUrl: string): Promise<AuthDiscovery | null>;
  authLogin(
    wsUrl: string,
    providerId: string,
    email: string,
    password: string,
  ): Promise<LoginResult>;
  authLoginBrowser(wsUrl: string, providerId?: string): Promise<LoginResult>;
  authCancelBrowser(): Promise<void>;
  authLogout(wsUrl: string): Promise<void>;

  connect(req: ConnectRequest): Promise<void>;
  disconnect(slotKey: string): Promise<void>;
  disconnectAll(): Promise<void>;
  send(slotKey: string, message: unknown): void;
  resync(slotKey: string): void;
  onServerMessage(cb: (slotKey: string, message: unknown) => void): () => void;
  onStatus(cb: (slotKey: string, status: SocketStatus) => void): () => void;

  onMenuCommand(cb: (command: string) => void): () => void;
  platform: string;
}

export const IPC = {
  settingsGet: "settings:get",
  settingsSave: "settings:save",
  pairingDiscover: "pairing:discover",
  pairingScanStart: "pairing:scan-start",
  pairingScanStop: "pairing:scan-stop",
  pairingFound: "pairing:found",
  authSession: "auth:session",
  authDiscover: "auth:discover",
  authLogin: "auth:login",
  authLoginBrowser: "auth:login-browser",
  authCancelBrowser: "auth:cancel-browser",
  authLogout: "auth:logout",
  connect: "canvas:connect",
  disconnect: "canvas:disconnect",
  disconnectAll: "canvas:disconnect-all",
  send: "canvas:send",
  resync: "canvas:resync",
  serverMessage: "canvas:server-message",
  status: "canvas:status",
  menuCommand: "app:menu-command",
} as const;
