import WebSocket from "ws";

import { createHandshake, type ServerMessage } from "../../shared/canvas-core";
import type { SocketStatus } from "../../shared/ipc";

/**
 * One WebSocket to omadia-ui-channel per canvas slot. Handshake on every
 * (re)connect, backoff reconnect, and the acked canvasSessionId is reused so
 * a reconnect never orphans the canvas. Every post-handshake frame is passed
 * through raw: notifications and desktop lists are not in canvas-core's
 * message union, so filtering here would silently drop them.
 */

const BACKOFF_MS = [1000, 2000, 5000, 10_000, 30_000] as const;
const CLOSE_SESSION_EXPIRED = 4401;
const CLOSE_SESSION_FORBIDDEN = 4403;

export interface ConnectionOptions {
  wsUrl: string;
  canvasSessionId?: string;
  cookie: () => string | undefined;
  onMessage: (msg: unknown) => void;
  onStatus: (status: SocketStatus) => void;
}

export class CanvasConnection {
  private ws: WebSocket | null = null;
  private ready = false;
  private stopped = false;
  private attempt = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private sessionId: string | undefined;

  constructor(private readonly opts: ConnectionOptions) {
    this.sessionId = opts.canvasSessionId;
  }

  get canvasSessionId(): string | undefined {
    return this.sessionId;
  }

  connect(): void {
    this.stopped = false;
    this.clearTimer();
    this.open();
  }

  send(message: unknown): boolean {
    if (!this.ready || this.ws?.readyState !== WebSocket.OPEN) return false;
    this.ws.send(JSON.stringify(message));
    return true;
  }

  /** Tear down and re-handshake on the same canvas session. */
  resync(): void {
    this.ws?.close(4000, "client resync");
  }

  close(): void {
    this.stopped = true;
    this.clearTimer();
    this.ws?.close(1000, "client shutdown");
    this.ws = null;
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private open(): void {
    this.ready = false;
    this.opts.onStatus({ state: "connecting" });
    const cookie = this.opts.cookie();
    const ws = new WebSocket(this.opts.wsUrl, {
      ...(cookie ? { headers: { Cookie: cookie } } : {}),
      handshakeTimeout: 10_000,
    });
    this.ws = ws;
    let upgradeRefused: number | null = null;

    const handshake = createHandshake({
      protocolVersions: ["1.0"],
      opsCatalogVersions: ["1.0"],
      localOperations: [],
      ...(this.sessionId ? { canvasSessionId: this.sessionId } : {}),
    });

    // 401/403 before the upgrade means the cookie is not accepted: same
    // meaning as the in-band 4401/4403, and a retry would only be refused.
    ws.on("unexpected-response", (_req, res) => {
      upgradeRefused = res.statusCode ?? 0;
      ws.terminate();
    });

    ws.on("message", (data) => {
      if (this.ws !== ws) return;
      let msg: unknown;
      try {
        msg = JSON.parse(String(data));
      } catch {
        return;
      }
      if (typeof msg !== "object" || msg === null) return;
      if (this.ready) {
        this.opts.onMessage(msg);
        return;
      }
      const action = handshake.onMessage(msg as ServerMessage);
      if (!action) return;
      if (action.kind === "send") {
        ws.send(JSON.stringify(action.message));
      } else if (action.kind === "ready") {
        this.ready = true;
        this.attempt = 0;
        this.sessionId = action.canvasSessionId;
        this.opts.onStatus({
          state: "ready",
          canvasSessionId: action.canvasSessionId,
          ...(action.sessionExpiresAt !== undefined
            ? { sessionExpiresAt: action.sessionExpiresAt }
            : {}),
        });
      } else {
        this.stopped = true;
        this.opts.onStatus({ state: "failed", detail: action.reason });
        ws.close(1002, action.reason);
      }
    });

    ws.on("close", (code, reasonBuf) => {
      if (this.ws !== ws) return;
      this.ready = false;
      const reason = reasonBuf.toString();
      const refused =
        upgradeRefused === 401 || code === CLOSE_SESSION_EXPIRED
          ? "unauthenticated"
          : upgradeRefused === 403 || code === CLOSE_SESSION_FORBIDDEN
            ? "forbidden"
            : null;
      if (refused) {
        this.stopped = true;
        this.opts.onStatus({ state: refused, detail: reason || refused });
        return;
      }
      if (this.stopped) {
        this.opts.onStatus({ state: "disconnected" });
        return;
      }
      const delay = BACKOFF_MS[Math.min(this.attempt, BACKOFF_MS.length - 1)];
      this.attempt += 1;
      this.opts.onStatus({
        state: "connecting",
        detail: `reconnect in ${delay} ms`,
      });
      this.timer = setTimeout(() => {
        this.timer = null;
        this.open();
      }, delay);
    });

    ws.on("error", (err) => {
      if (this.ws !== ws) return;
      this.opts.onStatus({ state: "failed", detail: err.message });
    });
  }
}
