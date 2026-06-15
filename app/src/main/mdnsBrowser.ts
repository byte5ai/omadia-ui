import type { DiscoveredHost } from '../shared/ipc.js';

/**
 * LAN discovery — client browser half (#293, Scenario A).
 *
 * Browses the `_omadia._tcp` services the middleware advertises and normalises
 * each into a {@link DiscoveredHost}. The renderer shows them in a picker; on
 * click the address flows through the same HTTP discovery as a typed host, so
 * this module only has to find hosts — not resolve descriptors.
 *
 * `bonjour-service` is imported lazily (variable specifier) so neither the
 * dependency nor a live responder is required to typecheck or run the tests.
 */

/** Shape of a `bonjour-service` "up"/"down" event we care about. */
export interface RawMdnsService {
  name?: string;
  host?: string;
  fqdn?: string;
  port?: number;
  addresses?: string[];
  txt?: Record<string, string>;
}

const isIpv4 = (a: string): boolean => /^\d{1,3}(\.\d{1,3}){3}$/.test(a);

function pickAddress(svc: RawMdnsService): string | undefined {
  // Prefer a routable IPv4 literal (no .local resolution needed); fall back to
  // the advertised hostname.
  const v4 = svc.addresses?.find(isIpv4);
  if (v4) return v4;
  return svc.addresses?.[0] ?? svc.host;
}

function authModeOf(txt: Record<string, string> | undefined): DiscoveredHost['authMode'] {
  const m = txt?.['auth'];
  return m === 'none' || m === 'password' || m === 'oidc' ? m : undefined;
}

/** Map a raw mDNS service to a DiscoveredHost, or null when it lacks the bits
 *  needed to connect (no address / no port). Pure + exported for tests. */
export function normalizeService(svc: RawMdnsService): DiscoveredHost | null {
  const address = pickAddress(svc);
  const port = svc.port;
  if (!address || !port) return null;
  const txt = svc.txt;
  const name = (txt?.['name'] || svc.name || address).trim();
  const id = svc.fqdn || `${name}@${address}:${port}`;
  return {
    id,
    name,
    address,
    port,
    ...(authModeOf(txt) ? { authMode: authModeOf(txt) } : {}),
  };
}

export interface MdnsBrowserHandle {
  stop(): void;
}

interface BonjourBrowserLike {
  on(event: 'up' | 'down', cb: (svc: RawMdnsService) => void): void;
  stop?(): void;
}
interface BonjourLike {
  find(opts: { type: string; protocol: 'tcp' }): BonjourBrowserLike;
  destroy(): void;
}

/**
 * Start browsing `_omadia._tcp`. `onUpdate` is called with the full current
 * host list (de-duped by id) on every up/down. Returns a handle whose `stop()`
 * tears the browser down. Never throws — on any failure it logs and the list
 * simply stays empty.
 */
export async function startMdnsBrowser(
  onUpdate: (hosts: DiscoveredHost[]) => void,
  log: (msg: string) => void = () => {},
): Promise<MdnsBrowserHandle> {
  const found = new Map<string, DiscoveredHost>();
  const emit = (): void => onUpdate([...found.values()]);
  try {
    const specifier = 'bonjour-service';
    const mod = (await import(specifier)) as {
      Bonjour: new () => BonjourLike;
      default?: new () => BonjourLike;
    };
    const Ctor = mod.Bonjour ?? mod.default;
    if (!Ctor) {
      log('[pairing/mdns-browser] no usable constructor — scan disabled');
      return { stop() {} };
    }
    const bonjour = new Ctor();
    const browser = bonjour.find({ type: 'omadia', protocol: 'tcp' });
    browser.on('up', (svc) => {
      const host = normalizeService(svc);
      if (host) {
        found.set(host.id, host);
        emit();
      }
    });
    browser.on('down', (svc) => {
      const host = normalizeService(svc);
      if (host && found.delete(host.id)) emit();
    });
    log('[pairing/mdns-browser] browsing _omadia._tcp');
    return {
      stop() {
        try {
          browser.stop?.();
          bonjour.destroy();
        } catch {
          /* best-effort teardown */
        }
      },
    };
  } catch (err) {
    log(`[pairing/mdns-browser] failed to start (non-fatal): ${String(err)}`);
    return { stop() {} };
  }
}
