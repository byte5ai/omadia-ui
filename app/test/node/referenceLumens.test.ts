import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { validateLumen } from '../../src/renderer/src/validate/validator.js';
import { validateLumenSemantics } from '../../src/renderer/src/lx/validate.js';
import { applyEvent, evalView, initState, type LumenSpec } from '../../src/renderer/src/render/lumen/lumenRuntime.js';
import type { LxValue, StateValue } from '../../src/renderer/src/lx/index.js';

// L9 — the four reference Lumens, traced end-to-end through the validator (L0)
// and interpreter (L1) exactly as the renderer would run them. This is the
// conformance capstone: it proves the whole Tier-1 stack composes.
const dir = join(dirname(fileURLToPath(import.meta.url)), '../fixtures/lumens');
const load = (name: string): LumenSpec => JSON.parse(readFileSync(join(dir, `${name}.json`), 'utf8')) as LumenSpec;
const ctx = { now: 0, seed: 5 };

const REFERENCE = ['arcade-bounce', 'workflow-wizard', 'defrag-viz', 'map-explore'];

describe('reference Lumens — structural + semantic validity', () => {
  for (const name of REFERENCE) {
    it(`${name} validates against the schema and the semantic layer`, () => {
      const lumen = load(name);
      const structural = validateLumen(lumen);
      expect(structural.errors).toBeNull();
      expect(structural.ok).toBe(true);
      expect(validateLumenSemantics(lumen)).toMatchObject({ ok: true });
    });
  }
});

function sceneDraw(tree: LxValue): unknown[] {
  const t = tree as { type?: string; draw?: unknown[] };
  expect(t.type).toBe('scene');
  return t.draw ?? [];
}

describe('arcade-bounce — a real bouncing game', () => {
  const lumen = load('arcade-bounce');
  it('advances the ball each tick and bounces off the walls', () => {
    let s = initState(lumen.state);
    expect(s['x']).toBe(20);
    s = applyEvent(lumen, s, { on: 'tick' }, ctx);
    expect(s['x']).toBe(26); // 20 + vx(6)
    // run enough ticks to hit the right wall at least once
    for (let i = 0; i < 200; i++) s = applyEvent(lumen, s, { on: 'tick' }, ctx);
    expect(s['bounces'] as number).toBeGreaterThan(0);
    expect(s['x'] as number).toBeGreaterThanOrEqual(0);
    expect(s['x'] as number).toBeLessThanOrEqual(300);
  });
  it('tap reverses direction', () => {
    let s = initState(lumen.state); // vx = 6
    s = applyEvent(lumen, s, { on: 'tap' }, ctx);
    expect(s['vx']).toBe(-6);
  });
  it('the view is a scene whose ball tracks state.x', () => {
    let s = initState(lumen.state);
    s = applyEvent(lumen, s, { on: 'tick' }, ctx);
    const draw = sceneDraw(evalView(lumen, s, ctx));
    const ball = draw.find((n) => (n as { id?: string }).id === 'ball') as { cx?: number };
    expect(ball?.cx).toBe(26);
  });
});

describe('workflow-wizard — primitive-composed wizard', () => {
  const lumen = load('workflow-wizard');
  it('advances and clamps steps, then finishes', () => {
    let s = initState(lumen.state);
    const tapNext = (st: StateValue) => applyEvent(lumen, st, { on: 'tap', targetId: 'next' }, ctx);
    s = tapNext(s);
    s = tapNext(s);
    expect(s['step']).toBe(2);
    s = tapNext(s); // clamped
    expect(s['step']).toBe(2);
    s = applyEvent(lumen, s, { on: 'tap', targetId: 'finish' }, ctx);
    expect(s['done']).toBe(true);
  });
  it('renders a container whose heading reflects the step', () => {
    let s = initState(lumen.state);
    s = applyEvent(lumen, s, { on: 'tap', targetId: 'next' }, ctx);
    const tree = evalView(lumen, s, ctx) as { type: string; children: { content?: string }[] };
    expect(tree.type).toBe('container');
    expect(tree.children[0]?.content).toBe('Step 2 of 3');
  });
});

describe('defrag-viz — scene built by map(range) over a frame counter', () => {
  const lumen = load('defrag-viz');
  it('renders 8 blocks that compact left as the frame advances', () => {
    let s = initState(lumen.state);
    const at0 = sceneDraw(evalView(lumen, s, ctx)) as { x: number; id: string }[];
    expect(at0.length).toBe(8);
    expect(at0[0]?.id).toBe('b0');
    const block5At0 = at0[5]!.x; // max(150, 220) = 220
    expect(block5At0).toBe(220);
    for (let i = 0; i < 40; i++) s = applyEvent(lumen, s, { on: 'tick' }, ctx);
    const after = sceneDraw(evalView(lumen, s, ctx)) as { x: number }[];
    expect(after[5]!.x).toBe(150); // fully compacted to idx*30
  });
});

describe('map-explore — markers via map + get, selection + zoom', () => {
  const lumen = load('map-explore');
  it('selecting a marker (scene-hit id) highlights only it', () => {
    let s = initState(lumen.state);
    s = applyEvent(lumen, s, { on: 'tap', targetId: 'b', payload: { id: 'b' } }, ctx);
    expect(s['sel']).toBe('b');
    const draw = sceneDraw(evalView(lumen, s, ctx)) as { id?: string; fill?: string }[];
    const markerB = draw.find((n) => n.id === 'b');
    const markerA = draw.find((n) => n.id === 'a');
    expect(markerB?.fill).toBe('success');
    expect(markerA?.fill).toBe('accent');
  });
  it('zoom keys grow the markers and clamp at 5', () => {
    let s = initState(lumen.state); // zoom 2
    s = applyEvent(lumen, s, { on: 'key', key: '+' }, ctx);
    expect(s['zoom']).toBe(3);
    for (let i = 0; i < 10; i++) s = applyEvent(lumen, s, { on: 'key', key: '+' }, ctx);
    expect(s['zoom']).toBe(5); // clamped
  });
});
