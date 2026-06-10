import WebSocket from 'ws';
import type { ConnectionStatus } from '../shared/ipc.js';
import {
  parseServerMessage,
  type ClientMessage,
  type ClientTurn,
  type ServerMessage,
} from '../shared/protocol.js';
import { createHandshake } from './handshake.js';

export interface SessionPersistence {
  load(): string | undefined;
  save(canvasSessionId: string): void;
}

export interface CanvasSocketOptions {
  url: string;
  /** `omadia_session=…` header value; omit for the stub server */
  cookie?: string;
  localOperations: string[];
  session: SessionPersistence;
  onMessage: (msg: ServerMessage) => void;
  onStatus: (status: ConnectionStatus) => void;
}

const BACKOFF_MS = [1000, 2000, 5000, 10_000, 30_000] as const;

/**
 * Owns the WebSocket to omadia-ui-channel: handshake on every (re)connect,
 * exponential-backoff reconnect, canvasSessionId persistence across sessions.
 * Resync (surfaceSeq gap / revision mismatch) = reconnect + re-select with the
 * same canvasSessionId — the v1 snapshot-re-request mechanism (protocol §5.1).
 */
export class CanvasSocket {
  private ws: WebSocket | null = null;
  private ready = false;
  private closedByUser = false;
  /** upgrade rejected 401/403 — the failed/authRequired status must stand;
   *  reconnecting with the same dead cookie would loop forever (issue #7) */
  private authFailed = false;
  private attempt = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;

  constructor(private readonly opts: CanvasSocketOptions) {}

  connect(): void {
    this.closedByUser = false;
    this.authFailed = false;
    this.open();
  }

  sendTurn(turn: ClientTurn): void {
    if (this.ready && this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(turn));
    } else {
      this.opts.onStatus({ state: 'failed', detail: 'turn dropped: socket not ready' });
    }
  }

  /** Non-turn client messages (canvas_list_get/put) — silently dropped when
   *  the socket isn't ready; the next ready re-syncs anyway. */
  sendMessage(msg: ClientMessage): void {
    if (this.ready && this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  /** Tear down and re-handshake with the persisted canvasSessionId. */
  resync(): void {
    this.ws?.close(4000, 'client resync');
  }

  close(): void {
    this.closedByUser = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close(1000, 'client shutdown');
  }

  private open(): void {
    this.ready = false;
    this.opts.onStatus({ state: 'connecting' });
    const headers = this.opts.cookie ? { Cookie: this.opts.cookie } : undefined;
    const ws = new WebSocket(this.opts.url, { headers });
    this.ws = ws;

    const handshake = createHandshake({
      protocolVersions: ['1.0'],
      opsCatalogVersions: ['1.0'],
      localOperations: this.opts.localOperations,
      canvasSessionId: this.opts.session.load(),
    });

    ws.on('message', (raw) => {
      const msg = parseServerMessage(String(raw));
      if (!msg) return;

      if (!this.ready) {
        const action = handshake.onMessage(msg);
        if (!action) return;
        if (action.kind === 'send') {
          ws.send(JSON.stringify(action.message));
        } else if (action.kind === 'ready') {
          this.ready = true;
          this.attempt = 0;
          this.opts.session.save(action.canvasSessionId);
          this.opts.onStatus({ state: 'ready', canvasSessionId: action.canvasSessionId });
        } else {
          this.opts.onStatus({ state: 'failed', detail: action.reason });
          this.closedByUser = true; // version failure is terminal, not retryable
          ws.close(1002, action.reason);
        }
        return;
      }
      this.opts.onMessage(msg);
    });

    ws.on('close', () => {
      this.ready = false;
      if (this.authFailed) return; // the failed/authRequired status stands
      if (this.closedByUser) {
        this.opts.onStatus({ state: 'disconnected' });
        return;
      }
      const delay = BACKOFF_MS[Math.min(this.attempt, BACKOFF_MS.length - 1)] as number;
      this.attempt += 1;
      this.opts.onStatus({ state: 'connecting', detail: `reconnecting in ${delay}ms` });
      this.reconnectTimer = setTimeout(() => this.open(), delay);
    });

    ws.on('error', (err) => {
      // upgrade rejected pre-101 (verifySession): 401 = missing/expired
      // session, 403 = not on the whitelist — a re-auth prompt, not an error
      const auth = /unexpected server response: 40[13]/i.test(err.message);
      if (auth) {
        this.authFailed = true;
        this.closedByUser = true;
        this.opts.onStatus({
          state: 'failed',
          detail: 'Session expired — sign in again',
          authRequired: true,
        });
        return;
      }
      this.opts.onStatus({ state: 'failed', detail: err.message });
      // 'close' follows and drives the backoff.
    });
  }
}
