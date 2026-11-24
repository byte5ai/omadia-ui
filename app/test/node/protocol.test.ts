import { describe, expect, it } from 'vitest';
import { parseServerMessage, SURFACE_EVENT_TYPES } from '../../src/shared/protocol.js';

describe('parseServerMessage', () => {
  it('parses a handshake_offer', () => {
    const msg = parseServerMessage(
      JSON.stringify({
        type: 'handshake_offer',
        handshakeId: 'h1',
        protocolVersions: ['1.0'],
        opsCatalogVersions: ['1.0'],
      }),
    );
    expect(msg).not.toBeNull();
    expect(msg?.type).toBe('handshake_offer');
  });

  it('parses every surface_* type', () => {
    for (const type of SURFACE_EVENT_TYPES) {
      const msg = parseServerMessage(JSON.stringify({ type, canvasSessionId: 'c1', surfaceSeq: 0 }));
      expect(msg?.type).toBe(type);
    }
  });

  it('parses an agent_text_retract', () => {
    const msg = parseServerMessage(JSON.stringify({ type: 'agent_text_retract', forTurn: 't1', chars: 5 }));
    expect(msg).toEqual({ type: 'agent_text_retract', forTurn: 't1', chars: 5 });
  });

  it('rejects non-JSON, non-object, and unknown types', () => {
    expect(parseServerMessage('not json')).toBeNull();
    expect(parseServerMessage('42')).toBeNull();
    expect(parseServerMessage(JSON.stringify({ type: 'iteration_start' }))).toBeNull();
  });
});
