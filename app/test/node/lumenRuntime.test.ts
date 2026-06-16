import { describe, expect, it } from 'vitest';
import {
  applyEvent,
  applyWireInput,
  evalView,
  initState,
  matchTransition,
  tickRate,
  type LumenSpec,
} from '../../src/renderer/src/render/lumen/lumenRuntime.js';

const ctx = { now: 0, seed: 1 };

describe('initState', () => {
  it('seeds leaves from the schema (defaults + declared init)', () => {
    const state = initState({
      count: { type: 'int', init: 0 },
      name: { type: 'string', init: 'hi' },
      mode: { type: 'enum', values: ['run', 'over'] },
      flag: { type: 'bool' },
      xs: { type: 'list', of: { type: 'int' } },
    });
    expect(state).toEqual({ count: 0, name: 'hi', mode: 'run', flag: false, xs: [] });
  });
  it('builds a w×h grid', () => {
    const state = initState({ board: { type: 'grid', w: 3, h: 2, of: { type: 'bool', init: false } } });
    expect(state['board']).toEqual([[false, false, false], [false, false, false]]);
  });
  it('builds a nested record', () => {
    const state = initState({ pos: { type: 'record', fields: { x: { type: 'int', init: 5 }, y: { type: 'int' } } } });
    expect(state['pos']).toEqual({ x: 5, y: 0 });
  });
});

const counter: LumenSpec = {
  type: 'lumen',
  id: 'counter',
  state: { count: { type: 'int', init: 0 } },
  transitions: { inc: { set: { count: { '+': [{ state: 'count' }, { lit: 1 }] } } } },
  view: { record: { type: { lit: 'text' }, content: { call: 'fmt', args: [{ state: 'count' }] } } },
  events: [{ on: 'tap', run: 'inc' }],
};

describe('matchTransition', () => {
  const events: LumenSpec['events'] = [
    { on: 'tap', target: { kind: 'element', elementId: 'btn' }, run: 'pressBtn' },
    { on: 'tap', run: 'anyTap' },
    { on: 'key', key: 'ArrowLeft', run: 'left' },
  ];
  it('matches a targeted tap by element id', () => {
    expect(matchTransition(events, { on: 'tap', targetId: 'btn' })).toBe('pressBtn');
  });
  it('falls through to an untargeted tap', () => {
    expect(matchTransition(events, { on: 'tap', targetId: 'other' })).toBe('anyTap');
  });
  it('matches a declared key', () => {
    expect(matchTransition(events, { on: 'key', key: 'ArrowLeft' })).toBe('left');
    expect(matchTransition(events, { on: 'key', key: 'ArrowRight' })).toBeNull();
  });
  it('returns null when nothing matches', () => {
    expect(matchTransition(events, { on: 'swipe' })).toBeNull();
  });
});

describe('applyEvent', () => {
  it('runs the matched transition, producing new state', () => {
    let state = initState(counter.state);
    state = applyEvent(counter, state, { on: 'tap' }, ctx);
    state = applyEvent(counter, state, { on: 'tap' }, ctx);
    expect(state['count']).toBe(2);
  });
  it('returns the SAME state reference when no binding matches', () => {
    const state = initState(counter.state);
    expect(applyEvent(counter, state, { on: 'swipe' }, ctx)).toBe(state);
  });
  it('a tick steps a simulation deterministically', () => {
    const sim: LumenSpec = {
      type: 'lumen', id: 'sim',
      state: { x: { type: 'number', init: 0 }, v: { type: 'number', init: 2 } },
      transitions: { step: { set: { x: { '+': [{ state: 'x' }, { state: 'v' }] } } } },
      view: { lit: 1 },
      events: [{ on: 'tick', rate: 60, run: 'step' }],
      cadence: { tick: 60 },
    };
    let s = initState(sim.state);
    for (let i = 0; i < 3; i++) s = applyEvent(sim, s, { on: 'tick' }, ctx);
    expect(s['x']).toBe(6);
  });
});

describe('evalView', () => {
  it('evaluates the view to a primitive tree reflecting state', () => {
    let state = initState(counter.state);
    state = applyEvent(counter, state, { on: 'tap' }, ctx);
    expect(evalView(counter, state, ctx)).toEqual({ type: 'text', content: '1' });
  });
});

describe('cadence', () => {
  it('tickRate reports the Hz for a ticking Lumen, null otherwise', () => {
    expect(tickRate({ ...counter, cadence: { tick: 30 } })).toBe(30);
    expect(tickRate({ ...counter, cadence: 'reactive' })).toBeNull();
    expect(tickRate(counter)).toBeNull();
  });
});

describe('applyWireInput (§7 cross-element interaction → state)', () => {
  const wired: LumenSpec = {
    type: 'lumen', id: 'highlight',
    state: { incoming: { type: 'list', of: { type: 'string' }, maxLen: 8, init: [] } },
    transitions: { recv: { set: { incoming: { event: 'value' } } } },
    view: { lit: 1 },
    events: [{ on: 'wire', run: 'recv' }],
  };
  it('a wired in-port value drives the matched transition', () => {
    let s = initState(wired.state);
    s = applyWireInput(wired, s, 'selection', ['row-3'], { now: 0, seed: 1 });
    expect(s['incoming']).toEqual(['row-3']);
  });
});

describe('determinism (replay / share)', () => {
  it('random in a transition is identical for the same seed', () => {
    const dice: LumenSpec = {
      type: 'lumen', id: 'dice',
      state: { r: { type: 'number', init: 0 } },
      transitions: { roll: { set: { r: { call: 'random', args: [] } } } },
      view: { lit: 1 },
      events: [{ on: 'tap', run: 'roll' }],
    };
    const a = applyEvent(dice, initState(dice.state), { on: 'tap' }, { now: 0, seed: 7 });
    const b = applyEvent(dice, initState(dice.state), { on: 'tap' }, { now: 0, seed: 7 });
    const c = applyEvent(dice, initState(dice.state), { on: 'tap' }, { now: 0, seed: 8 });
    expect(a['r']).toBe(b['r']);
    expect(a['r']).not.toBe(c['r']);
  });
});
