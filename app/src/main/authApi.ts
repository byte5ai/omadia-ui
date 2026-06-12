import type { AuthDiscovery, AuthProvider } from '../shared/ipc.js';

/**
 * REST client for the kernel's auth surface (middleware `/api/v1/auth/*`,
 * issue #7) — native credential login instead of the embedded web window.
 * Electron-free on purpose so the node test suite exercises it directly.
 */

/** ws(s)://host/omadia-ui/canvas → http(s)://host — the auth API lives on
 *  the same middleware origin as the canvas WS (NOT the web-ui port). */
export function wsToHttpOrigin(wsUrl: string): string {
  const u = new URL(wsUrl);
  u.protocol = u.protocol === 'wss:' ? 'https:' : 'http:';
  return u.origin;
}

const TIMEOUT_MS = 5000;
export const SESSION_COOKIE = 'omadia_session';

const apiFetch = (url: string, init?: RequestInit): Promise<Response> =>
  fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS), redirect: 'manual' });

const isProvider = (p: unknown): p is AuthProvider => {
  if (typeof p !== 'object' || p === null) return false;
  const o = p as Record<string, unknown>;
  return (
    typeof o['id'] === 'string' &&
    typeof o['displayName'] === 'string' &&
    (o['kind'] === 'password' || o['kind'] === 'oidc')
  );
};

/** GET /api/v1/auth/providers — null means "no discovery": kernel predates
 *  the endpoint or is unreachable; the caller falls back to the web window. */
export async function discoverProviders(origin: string): Promise<AuthDiscovery | null> {
  try {
    const res = await apiFetch(`${origin}/api/v1/auth/providers`);
    if (!res.ok) return null;
    const body = (await res.json()) as { providers?: unknown; setup_required?: unknown };
    if (!Array.isArray(body.providers)) return null;
    return {
      providers: body.providers.filter(isProvider),
      setupRequired: body.setup_required === true,
    };
  } catch {
    return null;
  }
}

export type PasswordLoginResult =
  | { ok: true; cookie: string; expiresAt?: number }
  | { ok: false; error: 'invalid_credentials' | 'unknown_provider' | 'unreachable'; detail?: string };

/** Extract `omadia_session=…` (and its Max-Age, if present) from Set-Cookie. */
function sessionFromSetCookie(headers: string[]): { cookie: string; expiresAt?: number } | null {
  const raw = headers.find((h) => h.startsWith(`${SESSION_COOKIE}=`));
  if (!raw) return null;
  const parts = raw.split(';').map((s) => s.trim());
  const maxAge = parts
    .map((p) => /^max-age=(\d+)$/i.exec(p))
    .find((m) => m !== null);
  return {
    cookie: parts.find((p) => p.startsWith(`${SESSION_COOKIE}=`)) as string,
    ...(maxAge ? { expiresAt: Math.floor(Date.now() / 1000) + Number(maxAge[1]) } : {}),
  };
}

/** POST /api/v1/auth/login/:providerId with {email, password} — success sets
 *  the `omadia_session` cookie this client lifts into the vault. */
export async function loginWithPassword(
  origin: string,
  providerId: string,
  email: string,
  password: string,
): Promise<PasswordLoginResult> {
  let res: Response;
  try {
    res = await apiFetch(`${origin}/api/v1/auth/login/${encodeURIComponent(providerId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
    });
  } catch (err) {
    return {
      ok: false,
      error: 'unreachable',
      detail: err instanceof Error ? err.message : String(err),
    };
  }
  if (res.status === 404) return { ok: false, error: 'unknown_provider' };
  if (!res.ok) return { ok: false, error: 'invalid_credentials' };
  const session = sessionFromSetCookie(res.headers.getSetCookie());
  if (!session) return { ok: false, error: 'unreachable', detail: 'login ok but no session cookie' };
  return { ok: true, ...session };
}

export interface SessionCheck {
  valid: boolean;
  email?: string;
  expiresAt?: number;
}

/** GET /api/v1/auth/me with the stored cookie. Returns null when the server
 *  is unreachable — the caller keeps the cookie and lets the WS upgrade
 *  decide, instead of throwing a stored session away on a network blip. */
export async function validateSession(origin: string, cookie: string): Promise<SessionCheck | null> {
  let res: Response;
  try {
    res = await apiFetch(`${origin}/api/v1/auth/me`, { headers: { Cookie: cookie } });
  } catch {
    return null;
  }
  if (!res.ok) return { valid: false };
  try {
    const body = (await res.json()) as { user?: { email?: unknown }; expires_at?: unknown };
    return {
      valid: true,
      ...(typeof body.user?.email === 'string' ? { email: body.user.email } : {}),
      ...(typeof body.expires_at === 'number' ? { expiresAt: body.expires_at } : {}),
    };
  } catch {
    return { valid: true };
  }
}
