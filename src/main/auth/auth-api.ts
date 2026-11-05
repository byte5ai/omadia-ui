import type {
  AuthDiscovery,
  AuthProvider,
  LoginResult,
} from "../../shared/ipc";

/**
 * REST client for the kernel's auth surface (/api/v1/auth/*). The auth API
 * lives on the same origin as the canvas socket. Electron-free so the node
 * tests can exercise it directly.
 */

const TIMEOUT_MS = 5000;
export const SESSION_COOKIE = "omadia_session";

export function wsToHttpOrigin(wsUrl: string): string {
  const u = new URL(wsUrl);
  u.protocol = u.protocol === "wss:" ? "https:" : "http:";
  return u.origin;
}

const apiFetch = (url: string, init?: RequestInit): Promise<Response> =>
  fetch(url, {
    ...init,
    signal: AbortSignal.timeout(TIMEOUT_MS),
    redirect: "manual",
  });

function isProvider(p: unknown): p is AuthProvider {
  if (typeof p !== "object" || p === null) return false;
  const o = p as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.displayName === "string" &&
    (o.kind === "password" || o.kind === "oidc")
  );
}

/** null means "no discovery": the kernel predates it or is unreachable. */
export async function discoverProviders(
  origin: string,
): Promise<AuthDiscovery | null> {
  return await apiFetch(`${origin}/api/v1/auth/providers`)
    .then(async (res) => {
      if (!res.ok) return null;
      const body = (await res.json()) as {
        providers?: unknown;
        setup_required?: unknown;
      };
      if (!Array.isArray(body.providers)) return null;
      return {
        providers: body.providers.filter(isProvider),
        setupRequired: body.setup_required === true,
      };
    })
    .catch(() => null);
}

export interface StoredCookie {
  cookie: string;
  expiresAt?: number;
}

export function sessionFromSetCookie(headers: string[]): StoredCookie | null {
  const raw = headers.find((h) => h.startsWith(`${SESSION_COOKIE}=`));
  if (!raw) return null;
  const parts = raw.split(";").map((s) => s.trim());
  const maxAge = parts
    .map((p) => /^max-age=(\d+)$/i.exec(p))
    .find((m) => m !== null);
  return {
    cookie: parts[0] as string,
    ...(maxAge
      ? { expiresAt: Math.floor(Date.now() / 1000) + Number(maxAge[1]) }
      : {}),
  };
}

export type PasswordLogin =
  (StoredCookie & { ok: true }) | Extract<LoginResult, { ok: false }>;

export async function loginWithPassword(
  origin: string,
  providerId: string,
  email: string,
  password: string,
): Promise<PasswordLogin> {
  const url = `${origin}/api/v1/auth/login/${encodeURIComponent(providerId)}`;
  return await apiFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
  })
    .then((res): PasswordLogin => {
      if (res.status === 404) return { ok: false, error: "unknown_provider" };
      if (!res.ok) return { ok: false, error: "invalid_credentials" };
      const session = sessionFromSetCookie(res.headers.getSetCookie());
      if (!session) {
        return {
          ok: false,
          error: "unreachable",
          detail: "login ok but no session cookie",
        };
      }
      return { ok: true, ...session };
    })
    .catch((err: unknown): PasswordLogin => ({
      ok: false,
      error: "unreachable",
      detail: err instanceof Error ? err.message : String(err),
    }));
}

export interface SessionCheck {
  valid: boolean;
  email?: string;
  expiresAt?: number;
}

/** null = server could not be asked; keep the cookie, the socket decides. */
export async function validateSession(
  origin: string,
  cookie: string,
): Promise<SessionCheck | null> {
  return await apiFetch(`${origin}/api/v1/auth/me`, {
    headers: { Cookie: cookie },
  })
    .then(async (res): Promise<SessionCheck | null> => {
      if (res.status === 401 || res.status === 403) return { valid: false };
      if (res.status >= 300 && res.status < 400) return { valid: false };
      if (!res.ok) return null;
      const body = (await res.json().catch(() => ({}))) as {
        user?: { email?: unknown };
        expires_at?: unknown;
      };
      return {
        valid: true,
        ...(typeof body.user?.email === "string"
          ? { email: body.user.email }
          : {}),
        ...(typeof body.expires_at === "number"
          ? { expiresAt: body.expires_at }
          : {}),
      };
    })
    .catch(() => null);
}

export async function logout(origin: string, cookie: string): Promise<void> {
  await apiFetch(`${origin}/api/v1/auth/logout`, {
    method: "POST",
    headers: { Cookie: cookie },
  })
    .then(() => undefined)
    .catch(() => undefined);
}
