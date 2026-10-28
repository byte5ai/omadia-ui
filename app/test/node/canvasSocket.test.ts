import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WebSocketServer } from 'ws';
import { startStubServer } from '../../tools/stub-server/stubServer.js';
import { CanvasSocket } from '../../src/main/canvasSocket.js';
import type { ServerMessage } from '../../src/shared/protocol.js';
import type { ConnectionStatus } from '../../src/shared/ipc.js';

let server: Awaited<ReturnType<typeof startStubServer>>;
beforeAll(async () => {
  server = await startStubServer(0);
});
afterAll(async () => {
  await server.close();
});

describe('CanvasSocket', () => {
  it('connects, handshakes, persists the session id, and streams a turn', async () => {
    const messages: ServerMessage[] = [];
    const statuses: ConnectionStatus[] = [];
    let persisted: string | undefined;

    const socket = new CanvasSocket({
      url: `ws://127.0.0.1:${server.port}/omadia-ui/canvas`,
      localOperations: [],
      session: {
        load: () => persisted,
        save: (id) => {
          persisted = id;
        },
      },
      onMessage: (m) => messages.push(m),
      onStatus: (s) => statuses.push(s),
    });
    socket.connect();

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('never ready')), 5000);
      const poll = setInterval(() => {
        if (statuses.some((s) => s.state === 'ready')) {
          clearTimeout(timer);
          clearInterval(poll);
          resolve();
        }
      }, 20);
    });
    expect(persisted).toBe('stub-canvas');

    socket.sendTurn({ type: 'turn', turnId: 't1', text: 'hello' });
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('no turn_complete')), 15_000);
      const poll = setInterval(() => {
        if (messages.some((m) => m.type === 'turn_complete')) {
          clearTimeout(timer);
          clearInterval(poll);
          resolve();
        }
      }, 50);
    });
    expect(messages.some((m) => m.type === 'surface_snapshot')).toBe(true);
    socket.close();
  }, 25_000);
});

/** A kernel that acks the handshake, then ends the session with `closeCode`
 *  (#1262: 4401 expired, 4403 revoked). Counts upgrades to catch reconnects. */
async function startSessionEndingServer(
  closeCode: number,
): Promise<{ port: number; connections: () => number; close: () => Promise<void> }> {
  const wss = new WebSocketServer({ port: 0 });
  await new Promise<void>((resolve) => wss.once('listening', () => resolve()));
  let connections = 0;
  wss.on('connection', (ws) => {
    connections += 1;
    ws.send(
      JSON.stringify({
        type: 'handshake_offer',
        handshakeId: 'h1',
        protocolVersions: ['1.0'],
        opsCatalogVersions: ['1.0'],
      }),
    );
    ws.on('message', () => {
      ws.send(
        JSON.stringify({
          type: 'handshake_ack',
          handshakeId: 'h1',
          canvasSessionId: 'c1',
          sessionExpiresAt: Math.floor(Date.now() / 1000),
        }),
      );
      setTimeout(() => ws.close(closeCode, 'session ended'), 20);
    });
  });
  return {
    port: (wss.address() as AddressInfo).port,
    connections: () => connections,
    close: () => new Promise<void>((resolve) => wss.close(() => resolve())),
  };
}

describe('CanvasSocket session end (#1262 close codes)', () => {
  it.each([
    [4401, 'Session expired — sign in again'],
    [4403, 'Session revoked — sign in again'],
  ])('close %i → sign-in prompt, no reconnect', async (code, detail) => {
    const srv = await startSessionEndingServer(code);
    const statuses: ConnectionStatus[] = [];
    const socket = new CanvasSocket({
      url: `ws://127.0.0.1:${srv.port}/omadia-ui/canvas`,
      localOperations: [],
      session: { load: () => undefined, save: () => undefined },
      onMessage: () => undefined,
      onStatus: (s) => statuses.push(s),
    });
    socket.connect();

    // longer than the first backoff step (1000ms): a reconnect would show up
    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect(statuses.map((s) => s.state)).toEqual(['connecting', 'ready', 'failed']);
    expect(statuses.at(-1)).toEqual({ state: 'failed', detail, authRequired: true });
    expect(srv.connections()).toBe(1);

    socket.close();
    await srv.close();
  });

  it('a non-session close still reconnects with backoff', async () => {
    const srv = await startSessionEndingServer(1011);
    const statuses: ConnectionStatus[] = [];
    const socket = new CanvasSocket({
      url: `ws://127.0.0.1:${srv.port}/omadia-ui/canvas`,
      localOperations: [],
      session: { load: () => undefined, save: () => undefined },
      onMessage: () => undefined,
      onStatus: (s) => statuses.push(s),
    });
    socket.connect();

    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect(statuses.some((s) => s.authRequired)).toBe(false);
    expect(srv.connections()).toBeGreaterThanOrEqual(2);

    socket.close();
    await srv.close();
  });
});
