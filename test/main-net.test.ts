import { afterEach, describe, expect, it, vi } from "vitest";

import {
  sessionFromSetCookie,
  wsToHttpOrigin,
} from "../src/main/auth/auth-api";
import {
  candidateOrigins,
  discoverPairing,
  isCanvasTransportUrl,
} from "../src/main/pairing/discovery";

describe("pairing", () => {
  it("probes LAN hosts over http only", () => {
    expect(candidateOrigins("localhost:8080")).toEqual([
      "http://localhost:8080",
    ]);
    expect(candidateOrigins("omadia.byte5.de")).toEqual([
      "https://omadia.byte5.de",
      "http://omadia.byte5.de",
    ]);
  });

  it("accepts a pasted transport url verbatim", () => {
    expect(isCanvasTransportUrl("wss://x.de/omadia-ui/canvas")).toBe(true);
    expect(isCanvasTransportUrl("https://x.de")).toBe(false);
  });
});

describe("discoverPairing", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const WELL_KNOWN = {
    wsUrl: "wss://x.de/omadia-ui/canvas",
    protocolVersion: "1.0",
    auth: { mode: "password", providers: [] },
  };

  it("returns the descriptor the server hands out", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(Response.json(WELL_KNOWN))),
    );
    const result = await discoverPairing("https://x.de");
    expect(result.ok && result.descriptor.wsUrl).toBe(WELL_KNOWN.wsUrl);
  });

  it("reports unreachable when nothing answers", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new TypeError("fetch failed"))),
    );
    expect(await discoverPairing("x.de")).toEqual({
      ok: false,
      reason: "unreachable",
    });
  });

  it("reports no_discovery when another app answers on that address", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) =>
        Promise.resolve(
          url.endsWith("/omadia-ui/info")
            ? new Response(null, {
                status: 302,
                headers: { location: "/login" },
              })
            : new Response("<!doctype html>", { status: 404 }),
        ),
      ),
    );
    expect(await discoverPairing("https://x.de")).toEqual({
      ok: false,
      reason: "no_discovery",
    });
  });

  it("reports no_discovery for a 200 that is not JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response("<!doctype html>"))),
    );
    expect(await discoverPairing("https://x.de")).toEqual({
      ok: false,
      reason: "no_discovery",
    });
  });
});

describe("auth", () => {
  it("maps the socket url to the auth origin", () => {
    expect(wsToHttpOrigin("wss://x.de/omadia-ui/canvas")).toBe("https://x.de");
  });

  it("lifts the session cookie and its lifetime", () => {
    const s = sessionFromSetCookie([
      "omadia_session=abc; Path=/; Max-Age=60; HttpOnly",
    ]);
    expect(s?.cookie).toBe("omadia_session=abc");
    expect(s?.expiresAt).toBeGreaterThan(Date.now() / 1000);
  });
});
