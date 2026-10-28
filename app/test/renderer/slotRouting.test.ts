import { describe, expect, it } from 'vitest';
import { initialCanvasState, type CanvasState } from '../../src/renderer/src/store/canvasStore.js';
import { routeServerMessage } from '../../src/renderer/src/store/slotRouting.js';
import type { ServerMessage } from '../../src/shared/protocol.js';

// The end-of-turn burst recorded live against a kernel (2026-10-28): skeleton
// snapshot, the patch resolving it, prose, turn_complete — delivered as
// separate IPC messages with no React render in between.
const SKELETON = {
  type: 'container',
  id: 'root',
  layout: 'stack',
  children: [
    { type: 'heading', content: 'Geburtstage im Dezember', level: 2 },
    {
      type: 'table',
      id: 'birthdays_december',
      loading: 'skeleton',
      columns: [
        { fieldKey: 'name', label: 'Name' },
        { fieldKey: 'birthday', label: 'Geburtstag', type: 'date' },
      ],
      rows: [],
    },
  ],
};
const BURST: ServerMessage[] = [
  {
    type: 'surface_snapshot',
    canvasSessionId: 'c',
    surfaceSeq: 0,
    producesRevision: '0',
    tree: SKELETON,
    protocolVersion: '1.0',
    opsCatalogVersion: '1.0',
  },
  {
    type: 'surface_patch',
    canvasSessionId: 'c',
    surfaceSeq: 1,
    basedOnRevision: '0',
    producesRevision: '1',
    patches: [{ op: 'replace', path: '/children/1/loading', value: 'none' }],
  },
  { type: 'agent_text_delta', text: 'Im Dezember hat niemand Geburtstag.' },
  { type: 'turn_complete', forTurn: 't1' },
] as ServerMessage[];

const table = (s: CanvasState): Record<string, unknown> =>
  (s.tree as { children: Record<string, unknown>[] }).children[1] as Record<string, unknown>;

describe('routeServerMessage', () => {
  it('chains a burst on the active slot without waiting for a render', () => {
    // never reassigned from outside: models React not re-rendering mid-burst
    const activeState = { current: initialCanvasState };
    const slotStates = new Map<string, CanvasState>();
    for (const msg of BURST) routeServerMessage('s1', msg, 's1', activeState, slotStates);

    const final = activeState.current;
    expect(final.revision).toBe('1');
    expect(table(final)['loading']).toBe('none');
    expect(final.prose).toBe('Im Dezember hat niemand Geburtstag.');
    expect(final.turnPending).toBe(false);
    expect(final.notices).toEqual([]);
    expect(slotStates.get('s1')).toBe(final);
  });

  it('routes a background slot through its own stored state', () => {
    const activeState = { current: initialCanvasState };
    const slotStates = new Map<string, CanvasState>();
    for (const msg of BURST) {
      const r = routeServerMessage('bg', msg, 's1', activeState, slotStates);
      expect(r.active).toBe(false);
    }
    expect(table(slotStates.get('bg') as CanvasState)['loading']).toBe('none');
    expect(activeState.current).toBe(initialCanvasState);
  });
});
