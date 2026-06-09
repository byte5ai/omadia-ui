import { describe, expect, it } from 'vitest';
import { applyServerMessage, initialCanvasState } from '../../src/renderer/src/store/canvasStore.js';
import type { ServerMessage } from '../../src/shared/protocol.js';

const TREE = { type: 'container', id: 'root', children: [{ type: 'status', id: 's', text: 'hi' }] };
const snapshot = (seq: number, rev: string): ServerMessage => ({
  type: 'surface_snapshot',
  canvasSessionId: 'c',
  surfaceSeq: seq,
  producesRevision: rev,
  tree: TREE,
  protocolVersion: '1.0',
  opsCatalogVersion: '1.0',
});
const patch = (seq: number, base: string, prod: string, patches: unknown[]): ServerMessage => ({
  type: 'surface_patch',
  canvasSessionId: 'c',
  surfaceSeq: seq,
  basedOnRevision: base,
  producesRevision: prod,
  patches,
});

describe('applyServerMessage', () => {
  it('applies snapshot then a matching patch', () => {
    let r = applyServerMessage(initialCanvasState, snapshot(0, '0'));
    expect(r.resync).toBe(false);
    expect(r.state.revision).toBe('0');
    r = applyServerMessage(
      r.state,
      patch(1, '0', '1', [{ op: 'replace', path: '/children/0/text', value: 'done' }]),
    );
    expect(r.resync).toBe(false);
    expect(r.state.revision).toBe('1');
    expect(JSON.stringify(r.state.tree)).toContain('"done"');
  });

  it('requests resync on basedOnRevision mismatch (equality-only)', () => {
    const s = applyServerMessage(initialCanvasState, snapshot(0, '0')).state;
    const r = applyServerMessage(s, patch(1, '7', '8', []));
    expect(r.resync).toBe(true);
    expect(r.state.revision).toBe('0'); // unchanged
  });

  it('requests resync on a surfaceSeq gap', () => {
    const s = applyServerMessage(initialCanvasState, snapshot(0, '0')).state;
    const r = applyServerMessage(s, patch(5, '0', '1', []));
    expect(r.resync).toBe(true);
  });

  it('rejects an invalid snapshot tree hard, keeping prior state', () => {
    const s = applyServerMessage(initialCanvasState, snapshot(0, '0')).state;
    const bad = { ...snapshot(1, '1'), tree: { type: 'iframe' } } as ServerMessage;
    const r = applyServerMessage(s, bad);
    expect(r.resync).toBe(false);
    expect(r.state.revision).toBe('0');
    expect(r.state.notices.some((n) => n.includes('rejected'))).toBe(true);
  });

  it('accumulates prose and settles the turn', () => {
    let r = applyServerMessage(initialCanvasState, { type: 'agent_text_delta', forTurn: 't1', text: 'Three ' });
    r = applyServerMessage(r.state, { type: 'agent_text_delta', forTurn: 't1', text: 'people' });
    expect(r.state.prose).toBe('Three people');
    r = applyServerMessage(r.state, { type: 'turn_complete', forTurn: 't1' });
    expect(r.state.turnPending).toBe(false);
  });

  it('surfaces turn_error as a notice', () => {
    const r = applyServerMessage(initialCanvasState, { type: 'turn_error', forTurn: 't1', message: 'boom' });
    expect(r.state.notices.some((n) => n.includes('boom'))).toBe(true);
    expect(r.state.turnPending).toBe(false);
  });
});
