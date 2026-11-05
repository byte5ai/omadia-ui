import type { FoundServer } from "../../shared/ipc";

/** Browses the `_omadia._tcp` services the middleware advertises. */

interface RawService {
  name?: string;
  host?: string;
  port?: number;
  addresses?: string[];
  txt?: Record<string, string>;
}

interface Browser {
  on(event: "up", cb: (svc: RawService) => void): void;
  stop(): void;
}

interface Bonjour {
  find(opts: { type: string }): Browser;
  destroy(): void;
}

const isIpv4 = (a: string): boolean => /^\d{1,3}(\.\d{1,3}){3}$/.test(a);

export function normalizeService(svc: RawService): FoundServer | null {
  const address = svc.addresses?.find(isIpv4) ?? svc.addresses?.[0] ?? svc.host;
  if (!address || !svc.port) return null;
  return {
    name: (svc.txt?.name || svc.name || address).trim(),
    host: svc.host ?? address,
    port: svc.port,
    address,
  };
}

export interface LanScan {
  stop(): void;
}

export async function startLanScan(
  onFound: (server: FoundServer) => void,
): Promise<LanScan> {
  const mod = (await import("bonjour-service")) as unknown as {
    Bonjour: new () => Bonjour;
  };
  const bonjour = new mod.Bonjour();
  const browser = bonjour.find({ type: "omadia" });
  browser.on("up", (svc) => {
    const found = normalizeService(svc);
    if (found) onFound(found);
  });
  return {
    stop() {
      browser.stop();
      bonjour.destroy();
    },
  };
}
