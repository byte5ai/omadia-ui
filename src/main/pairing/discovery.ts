import type {
  AuthProvider,
  PairingAuth,
  PairingDescriptor,
  PairingResult,
} from "../../shared/ipc";

/**
 * Turns whatever the user types (bare host, http(s) origin or a full
 * ws(s)://…/omadia-ui/canvas URL) into one pairing descriptor. The server
 * owns the mapping from human URL to transport URL via /.well-known/omadia-ui,
 * with /omadia-ui/info as the legacy fallback.
 */

const TIMEOUT_MS = 5000;
const CANVAS_WS_PATH = "/omadia-ui/canvas";
const WELL_KNOWN_PATH = "/.well-known/omadia-ui";
const INFO_PATH = "/omadia-ui/info";

const isWs = (v: string): boolean => /^wss?:\/\/\S+$/.test(v);
const isHttp = (v: string): boolean => /^https?:\/\/\S+$/.test(v);

const fetchJson = async (
  url: string,
  onResponse: () => void,
): Promise<Record<string, unknown>> => {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    redirect: "manual",
  });
  onResponse();
  if (!res.ok) throw new Error(`${url} answered ${res.status}`);
  return (await res.json()) as Record<string, unknown>;
};

export function isCanvasTransportUrl(input: string): boolean {
  const v = input.trim();
  return isWs(v) && v.replace(/\/+$/, "").endsWith(CANVAS_WS_PATH);
}

/** LAN and dev hosts are reached over plain http by convention. */
function prefersHttp(host: string): boolean {
  const h = host.split(":")[0]?.toLowerCase() ?? "";
  return (
    h === "localhost" ||
    h === "127.0.0.1" ||
    h === "::1" ||
    h.endsWith(".local") ||
    /^10\./.test(h) ||
    /^192\.168\./.test(h) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(h)
  );
}

export function candidateOrigins(input: string): string[] {
  const v = input.trim().replace(/\/+$/, "");
  if (!v) return [];
  if (isHttp(v)) {
    try {
      return [new URL(v).origin];
    } catch {
      return [];
    }
  }
  const host = v.replace(/^\/\//, "").split("/")[0] ?? "";
  if (!host) return [];
  return prefersHttp(host)
    ? [`http://${host}`]
    : [`https://${host}`, `http://${host}`];
}

function toAbsoluteWsUrl(origin: string, pathOrUrl: string): string | null {
  if (isWs(pathOrUrl)) return pathOrUrl;
  try {
    const u = new URL(origin);
    const proto = u.protocol === "https:" ? "wss:" : "ws:";
    const path = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
    return `${proto}//${u.host}${path}`;
  } catch {
    return null;
  }
}

function isProvider(p: unknown): p is AuthProvider {
  if (typeof p !== "object" || p === null) return false;
  const o = p as Record<string, unknown>;
  return (
    typeof o.id === "string" && (o.kind === "password" || o.kind === "oidc")
  );
}

function parseAuth(raw: unknown): PairingAuth {
  if (typeof raw !== "object" || raw === null) return { mode: "unknown" };
  const o = raw as Record<string, unknown>;
  const mode =
    o.mode === "none" || o.mode === "password" || o.mode === "oidc"
      ? o.mode
      : "unknown";
  const providers = Array.isArray(o.providers)
    ? o.providers.filter(isProvider).map((p) => ({
        ...p,
        displayName: p.displayName ?? p.id,
      }))
    : undefined;
  return {
    mode,
    ...(providers ? { providers } : {}),
    ...(typeof o.loginStartUrl === "string"
      ? { loginStartUrl: o.loginStartUrl }
      : {}),
  };
}

function firstVersion(body: Record<string, unknown>): string {
  if (typeof body.protocolVersion === "string") return body.protocolVersion;
  const list = body.protocolVersions;
  return Array.isArray(list) && typeof list[0] === "string" ? list[0] : "1.0";
}

function parseWellKnown(
  body: Record<string, unknown>,
): PairingDescriptor | null {
  if (typeof body.wsUrl !== "string" || !isWs(body.wsUrl)) return null;
  return {
    ...(typeof body.name === "string" ? { name: body.name } : {}),
    wsUrl: body.wsUrl,
    protocolVersion: firstVersion(body),
    auth: parseAuth(body.auth),
  };
}

function parseInfo(
  origin: string,
  body: Record<string, unknown>,
): PairingDescriptor | null {
  const raw =
    typeof body.wsUrl === "string"
      ? body.wsUrl
      : typeof body.websocket === "string" && body.websocket !== "unavailable"
        ? body.websocket
        : null;
  const wsUrl = raw ? toAbsoluteWsUrl(origin, raw) : null;
  if (!wsUrl) return null;
  return {
    wsUrl,
    protocolVersion: firstVersion(body),
    auth: { mode: "unknown" },
  };
}

interface Probe {
  descriptor: PairingDescriptor | null;
  /** any HTTP response counts, also a 404 or a redirect to a login page */
  answered: boolean;
}

async function probeOrigin(origin: string): Promise<Probe> {
  let answered = false;
  const onResponse = (): void => {
    answered = true;
  };
  const wellKnown = await fetchJson(`${origin}${WELL_KNOWN_PATH}`, onResponse)
    .then((body) => parseWellKnown(body))
    .catch(() => null);
  const descriptor =
    wellKnown ??
    (await fetchJson(`${origin}${INFO_PATH}`, onResponse)
      .then((body) => parseInfo(origin, body))
      .catch(() => null));
  return { descriptor, answered };
}

export async function discoverPairing(input: string): Promise<PairingResult> {
  const v = input.trim();
  if (isCanvasTransportUrl(v)) {
    return {
      ok: true,
      descriptor: {
        wsUrl: v,
        protocolVersion: "1.0",
        auth: { mode: "unknown" },
      },
    };
  }
  let answered = false;
  for (const origin of candidateOrigins(v)) {
    const probe = await probeOrigin(origin);
    if (probe.descriptor) return { ok: true, descriptor: probe.descriptor };
    answered ||= probe.answered;
  }
  return { ok: false, reason: answered ? "no_discovery" : "unreachable" };
}
