// Spec 2042 §6 criterion 1 (Strategist regression): every turn a canvas
// sends carries the agent of THAT canvas as `agentId`; a canvas without an
// agent sends nothing (the server never picks one). Mirrors omadia-ui-mobile
// `apps/mobile/test/wireTap.test.ts`.
import { describe, expect, it } from 'vitest';
import { turnForSlot, type CanvasSlotMeta } from '../../src/renderer/src/store/canvasSlots.js';

const slots: CanvasSlotMeta[] = [
  { slotId: 'a', title: 'Canvas 1', color: 0, agentId: 'agent-strategist' },
  { slotId: 'b', title: 'Canvas 2', color: 1, agentId: 'agent-helper' },
  { slotId: 'c', title: 'Canvas 3', color: 2 },
];

describe('criterion 1 — the turn frame carries the canvas agent', () => {
  it('a text turn carries the agentId of its canvas', () => {
    const frame = turnForSlot({ type: 'turn', turnId: 't1', text: 'Umsatz?' }, slots, 'a');
    expect(frame).toEqual({ type: 'turn', turnId: 't1', text: 'Umsatz?', agentId: 'agent-strategist' });
    expect(JSON.parse(JSON.stringify(frame))).toMatchObject({ type: 'turn', agentId: 'agent-strategist' });
  });

  it('each canvas addresses its own agent', () => {
    expect(turnForSlot({ type: 'turn', text: 'x' }, slots, 'b')?.agentId).toBe('agent-helper');
  });

  it('an action turn carries it too, and the slot wins over a stale agentId', () => {
    const frame = turnForSlot(
      { type: 'turn', turnId: 't2', action: { type: 'pick' }, agentId: 'agent-other' },
      slots,
      'a',
    );
    expect(frame?.agentId).toBe('agent-strategist');
    expect(frame?.action).toEqual({ type: 'pick' });
  });

  it('a canvas without an agent (or an unknown canvas) sends no turn', () => {
    expect(turnForSlot({ type: 'turn', text: 'x' }, slots, 'c')).toBeNull();
    expect(turnForSlot({ type: 'turn', text: 'x' }, slots, 'missing')).toBeNull();
  });
});
