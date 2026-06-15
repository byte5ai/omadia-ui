import type {
  AuthProvider,
  PairingAuth,
  PairingDescriptor,
} from '../shared/ipc.js';

export type { PairingAuth, PairingDescriptor } from '../shared/ipc.js';

/**
 * Friction-free pairing discovery — client half (#293).
 *
 * The server owns the mapping "human-facing URL → transport URL". This module
 * turns whatever the user can reasonably type into the one unified descriptor
 * the connect code consumes, so the renderer never has to know the
 * `wss://…/omadia-ui/canvas` shape:
 *
 *   - a bare host / `https://host` / `http://host`  → GET the discovery
 *     endpoint on that origin and read back an absolute `wsUrl` + auth;
 *   - a full `ws(s)://…/omadia-ui/canvas` transport URL → used verbatim (the
 *     manual fallback for debugging / exotic setups), no network round-trip.
 *
 * Electron-free on purpose so the node test suite exercises it directly
 * (same pattern as `authApi.ts`).
 */

const TIMEOUT_MS = 5000;
const CANVAS_WS_PATH = '/omadia-ui/canvas';
const WELL_KNOWN_PATH = '/.well-known/omadia-ui';
const INFO_PATH = '/omadia-ui/info';

const fetchJson = (url: string): Promise<Response> =>
  fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), redirect: 'manual' });

const isWss = (v: string): boolean => /^wss?:\/\/\S+$/.test(v);
const isHttp = (v: string): boolean => /^https?:\/\/\S+$/.test(v);

/** A full canvas transport URL the user pasted directly. */
export function isCanvasTransportUrl(input: string): boolean {
  const v = input.trim();
  return isWss(v) && v.replace(/\/+$/, '').endsWith(CANVAS_WS_PATH);
}

/** Hosts that are reachable over plain HTTP by convention (LAN / dev). */
function prefersHttp(host: string): boolean {
  const h = host.split(':')[0]?.toLowerCase() ?? '';
  return (
    h === 'localhost' ||
    h === '127.0.0.1' ||
    h === '::1' ||
    h.endsWith('.local') ||
    /^10\./.test(h) ||
    /^192\.168\./.test(h) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(h)
  );
}

/**
 * Turn user input into the ordered list of HTTP origins to probe. An explicit
 * scheme is honoured as-is; a bare host gets a best-guess scheme with the
 * other scheme as a fallback (so a self-hoster typing `omadia.example.com`
 * still pairs whether or not they front it with TLS).
 */
export function candidateOrigins(input: string): string[] {
  const v = input.trim().replace(/\/+$/, '');
  if (!v) return [];
  if (isHttp(v)) {
    try {
      return [new URL(v).origin];
    } catch {
      return [];
    }
  }
  // bare host[:port] — strip any path the user may have pasted.
  const host = v.replace(/^\/\//, '').split('/')[0] ?? '';
  if (!host) return [];
  return prefersHttp(host)
    ? [`http://${host}`]
    : [`https://${host}`, `http://${host}`];
}

function toAbsoluteWsUrl(origin: string, wsPathOrUrl: string): string | null {
  if (isWss(wsPathOrUrl)) return wsPathOrUrl;
  try {
    const u = new URL(origin);
    const proto = u.protocol === 'https:' ? 'wss:' : 'ws:';
    const path = wsPathOrUrl.startsWith('/') ? wsPathOrUrl : `/${wsPathOrUrl}`;
    return `${proto}//${u.host}${path}`;
  } catch {
    return null;
  }
}

function parseWellKnown(
  body: Record<string, unknown>,
): PairingDescriptor | null {
  const wsUrl = body['wsUrl'];
  if (typeof wsUrl !== 'string' || !isWss(wsUrl)) return null;
  const protocolVersion =
    typeof body['protocolVersion'] === 'string'
      ? (body['protocolVersion'] as string)
      : Array.isArray(body['protocolVersions']) &&
          typeof body['protocolVersions'][0] === 'string'
        ? (body['protocolVersions'][0] as string)
        : '1.0';
  const auth = parseAuth(body['auth']);
  return {
    ...(typeof body['name'] === 'string' ? { name: body['name'] } : {}),
    wsUrl,
    protocolVersion,
    auth,
  };
}

function parseAuth(raw: unknown): PairingAuth {
  if (typeof raw !== 'object' || raw === null) return { mode: 'unknown' };
  const o = raw as Record<string, unknown>;
  const mode =
    o['mode'] === 'none' ||
    o['mode'] === 'password' ||
    o['mode'] === 'oidc'
      ? (o['mode'] as PairingAuth['mode'])
      : 'unknown';
  const providers = Array.isArray(o['providers'])
    ? (o['providers'].filter(
        (p): p is AuthProvider =>
          typeof p === 'object' &&
          p !== null &&
          typeof (p as Record<string, unknown>)['id'] === 'string' &&
          ((p as Record<string, unknown>)['kind'] === 'password' ||
            (p as Record<string, unknown>)['kind'] === 'oidc'),
      ) as AuthProvider[])
    : undefined;
  return {
    mode,
    ...(providers ? { providers } : {}),
    ...(typeof o['loginStartUrl'] === 'string'
      ? { loginStartUrl: o['loginStartUrl'] }
      : {}),
  };
}

/** Adapt the legacy `/omadia-ui/info` shape into a descriptor. */
function parseInfo(
  origin: string,
  body: Record<string, unknown>,
): PairingDescriptor | null {
  const raw =
    typeof body['wsUrl'] === 'string'
      ? (body['wsUrl'] as string)
      : typeof body['websocket'] === 'string' &&
          body['websocket'] !== 'unavailable'
        ? (body['websocket'] as string)
        : null;
  if (!raw) return null;
  const wsUrl = toAbsoluteWsUrl(origin, raw);
  if (!wsUrl) return null;
  const protocolVersion =
    Array.isArray(body['protocolVersions']) &&
    typeof body['protocolVersions'][0] === 'string'
      ? (body['protocolVersions'][0] as string)
      : '1.0';
  // `/omadia-ui/info` carries no auth block — leave it `unknown` so the caller
  // keeps probing `/api/v1/auth/providers` as before.
  return { wsUrl, protocolVersion, auth: { mode: 'unknown' } };
}

async function probeOrigin(origin: string): Promise<PairingDescriptor | null> {
  // Prefer the canonical, auth-aware descriptor.
  try {
    const res = await fetchJson(`${origin}${WELL_KNOWN_PATH}`);
    if (res.ok) {
      const body = (await res.json()) as Record<string, unknown>;
      const d = parseWellKnown(body);
      if (d) return d;
    }
  } catch {
    /* fall through to the legacy alias */
  }
  // Back-compat: older hosts only expose `/omadia-ui/info`.
  try {
    const res = await fetchJson(`${origin}${INFO_PATH}`);
    if (res.ok) {
      const body = (await res.json()) as Record<string, unknown>;
      return parseInfo(origin, body);
    }
  } catch {
    /* unreachable on this scheme — caller tries the next candidate */
  }
  return null;
}

/**
 * Resolve user input into a pairing descriptor, or null when nothing on any
 * candidate origin answers. A pasted canvas transport URL short-circuits to a
 * synthetic descriptor (no network).
 */
export async function discoverPairing(
  input: string,
): Promise<PairingDescriptor | null> {
  const v = input.trim();
  if (!v) return null;
  if (isCanvasTransportUrl(v)) {
    return { wsUrl: v, protocolVersion: '1.0', auth: { mode: 'unknown' } };
  }
  for (const origin of candidateOrigins(v)) {
    const d = await probeOrigin(origin);
    if (d) return d;
  }
  return null;
}
