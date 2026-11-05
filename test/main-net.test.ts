import { describe, expect, it } from "vitest";

import {
  sessionFromSetCookie,
  wsToHttpOrigin,
} from "../src/main/auth/auth-api";
import {
  candidateOrigins,
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
