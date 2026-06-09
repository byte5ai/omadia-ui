import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { startStubServer } from '../../tools/stub-server/stubServer.js';
import { parseServerMessage, SURFACE_EVENT_TYPES, type ServerMessage } from '../../src/shared/protocol.js';
import { validateSurfaceEvent } from '../../src/renderer/src/validate/validator.js';

let server: Awaited<ReturnType<typeof startStubServer>>;
beforeAll(async () => {
  server = await startStubServer(0);
});
afterAll(async () => {
  await server.close();
});

describe('stub server (WT1 replay)', () => {
  it('handshakes and replays a schema-valid WT1 sequence', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}/omadia-ui/canvas`);
    const received: ServerMessage[] = [];

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timed out')), 15_000);
      ws.on('message', (raw) => {
        const msg = parseServerMessage(String(raw));
        if (!msg) return;
        received.push(msg);
        if (msg.type === 'handshake_offer') {
          ws.send(
            JSON.stringify({
              type: 'handshake_select',
              handshakeId: msg.handshakeId,
              protocolVersion: '1.0',
              opsCatalogVersion: '1.0',
              localOperations: [],
            }),
          );
        } else if (msg.type === 'handshake_ack') {
          ws.send(JSON.stringify({ type: 'turn', turnId: 't1', text: 'show my team' }));
        } else if (msg.type === 'turn_complete') {
          clearTimeout(timer);
          ws.close();
          resolve();
        }
      });
      ws.on('error', reject);
    });

    const surface = received.filter((m) => SURFACE_EVENT_TYPES.has(m.type));
    expect(surface.length).toBeGreaterThanOrEqual(3); // snapshot + 2 patches
    for (const ev of surface) {
      const valid = validateSurfaceEvent(ev);
      expect(valid.errors).toBeNull();
    }
    expect(surface[0]?.type).toBe('surface_snapshot');
  }, 20_000);
});
