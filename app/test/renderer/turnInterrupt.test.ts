import { describe, expect, it } from 'vitest';
import {
  applyServerMessage,
  initialCanvasState,
  interruptTurn,
  TURN_INTERRUPTED_MESSAGE,
  type CanvasState,
} from '../../src/renderer/src/store/canvasStore.js';
import {
  addNotification,
  isLocalNotification,
  turnInterruptedNotification,
} from '../../src/renderer/src/store/notificationStore.js';
import { interruptSlotTurn } from '../../src/renderer/src/store/slotRouting.js';
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

/** a turn mid-stream: a server snapshot rendered, some prose, still pending */
const midTurn = (): CanvasState => {
  let s = applyServerMessage(initialCanvasState, snapshot(0, '0')).state;
  s = applyServerMessage(s, { type: 'agent_text_delta', forTurn: 't1', text: 'Halb' }).state;
  return { ...s, turnPending: true };
};

describe('interruptTurn', () => {
  it('ends a pending turn with the German notice and keeps rendered content', () => {
    const before = midTurn();
    const s = interruptTurn(before, 't1');
    expect(s.turnPending).toBe(false);
    expect(s.turnError).toBe(TURN_INTERRUPTED_MESSAGE);
    expect(TURN_INTERRUPTED_MESSAGE).toBe('Verbindung unterbrochen – Anfrage bitte erneut senden.');
    expect(s.notices.at(-1)).toContain(TURN_INTERRUPTED_MESSAGE);
    // partial content stays
    expect(s.tree).toEqual(TREE);
    expect(s.revision).toBe('0');
    expect(s.prose).toBe('Halb');
    // the dead connection's seq run is closed; the turn is remembered
    expect(s.lastSurfaceSeq).toBeNull();
    expect(s.interruptedTurns).toEqual(['t1']);
  });

  it('drops a client-local pending skeleton (no server snapshot yet)', () => {
    const pending: CanvasState = {
      ...initialCanvasState,
      tree: { type: 'container', id: 'local-pending', children: [] },
      turnPending: true,
    };
    expect(interruptTurn(pending, 't1').tree).toBeNull();
  });

  it('is a no-op (same object) when no turn is pending', () => {
    const idle = applyServerMessage(initialCanvasState, snapshot(0, '0')).state;
    expect(interruptTurn(idle, 't1')).toBe(idle);
  });

  it('works without a known turnId and bounds the remembered ids', () => {
    expect(interruptTurn(midTurn()).interruptedTurns).toEqual([]);
    let s = midTurn();
    for (let i = 0; i < 15; i += 1) s = interruptTurn({ ...s, turnPending: true }, `t${i}`);
    expect(s.interruptedTurns).toHaveLength(10);
    expect(s.interruptedTurns.at(-1)).toBe('t14');
  });

  it('accepts the next turn on the new connection (fresh seq run)', () => {
    const s = interruptTurn(midTurn(), 't1');
    // after reconnect the server's next turn starts again at surfaceSeq 0
    const r = applyServerMessage({ ...s, turnPending: true }, snapshot(0, '7'));
    expect(r.resync).toBe(false);
    expect(r.state.revision).toBe('7');
  });
});

describe('late frames of an interrupted turn', () => {
  const resent = (): CanvasState => ({ ...interruptTurn(midTurn(), 't1'), turnPending: true, prose: '' });

  it('a late turn_complete does not end the re-sent turn', () => {
    const r = applyServerMessage(resent(), { type: 'turn_complete', forTurn: 't1' });
    expect(r.state.turnPending).toBe(true);
    expect(r.resync).toBe(false);
  });

  it('a late turn_error does not end the re-sent turn or set an error', () => {
    const before = resent();
    const r = applyServerMessage(before, { type: 'turn_error', forTurn: 't1', message: 'aborted' });
    expect(r.state.turnPending).toBe(true);
    expect(r.state.turnError).toBe(before.turnError);
  });

  it('late prose is dropped untouched', () => {
    const before = resent();
    const r = applyServerMessage(before, { type: 'agent_text_delta', forTurn: 't1', text: 'alt' });
    expect(r.state).toBe(before);
  });

  it('frames of the NEW turn still apply', () => {
    let s = applyServerMessage(resent(), { type: 'agent_text_delta', forTurn: 't2', text: 'neu' }).state;
    s = applyServerMessage(s, { type: 'turn_complete', forTurn: 't2' }).state;
    expect(s.prose).toBe('neu');
    expect(s.turnPending).toBe(false);
    expect(s.turnError).toBeNull();
  });
});

describe('interruptSlotTurn', () => {
  it('interrupts the active and a background slot independently', () => {
    const activeState = { current: midTurn() };
    const slotStates = new Map<string, CanvasState>([
      ['s1', activeState.current],
      ['bg', midTurn()],
      ['idle', initialCanvasState],
    ]);

    const a = interruptSlotTurn('s1', 't1', 's1', activeState, slotStates);
    expect(a.interrupted).toBe(true);
    expect(a.active).toBe(true);
    expect(activeState.current.turnPending).toBe(false);
    expect(slotStates.get('s1')).toBe(activeState.current);

    const activeAfter = activeState.current;
    const b = interruptSlotTurn('bg', 'tb', 's1', activeState, slotStates);
    expect(b.interrupted).toBe(true);
    expect(b.active).toBe(false);
    expect(slotStates.get('bg')?.turnPending).toBe(false);
    expect(slotStates.get('bg')?.interruptedTurns).toEqual(['tb']);
    expect(activeState.current).toBe(activeAfter); // the visible slot untouched

    const idle = interruptSlotTurn('idle', undefined, 's1', activeState, slotStates);
    expect(idle.interrupted).toBe(false);
    expect(slotStates.get('idle')).toBe(initialCanvasState);
  });

  it('is idempotent — a second non-ready status (error → close) changes nothing', () => {
    const activeState = { current: midTurn() };
    const slotStates = new Map<string, CanvasState>();
    interruptSlotTurn('s1', 't1', 's1', activeState, slotStates);
    const once = activeState.current;
    const again = interruptSlotTurn('s1', 't1', 's1', activeState, slotStates);
    expect(again.interrupted).toBe(false);
    expect(activeState.current).toBe(once);
    expect(once.notices.filter((n) => n.startsWith('turn_interrupted'))).toHaveLength(1);
  });

  it('never resurrects state for an unknown (deleted) slot', () => {
    const activeState = { current: initialCanvasState };
    const slotStates = new Map<string, CanvasState>();
    expect(interruptSlotTurn('gone', 't1', 's1', activeState, slotStates).interrupted).toBe(false);
    expect(slotStates.has('gone')).toBe(false);
  });
});

describe('turnInterruptedNotification', () => {
  it('is a local warning banner, coalesced across slots', () => {
    const n1 = turnInterruptedNotification(TURN_INTERRUPTED_MESSAGE, 1);
    expect(n1.severity).toBe('warning');
    expect(n1.title).toBe(TURN_INTERRUPTED_MESSAGE);
    expect(isLocalNotification(n1)).toBe(true);
    expect(isLocalNotification({ id: 'srv-1' })).toBe(false);

    // a deploy drops every slot's socket: one banner, not one per canvas
    let list = addNotification([], n1, 's1', 1);
    list = addNotification(list, turnInterruptedNotification(TURN_INTERRUPTED_MESSAGE, 2), 'bg', 2);
    expect(list.filter((n) => !n.dismissed)).toHaveLength(1);
  });
});
