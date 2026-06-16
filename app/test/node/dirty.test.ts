import { describe, expect, it } from 'vitest';
import { collectStateReads, changedStatePaths, isDirty, RegionMemo } from '../../src/renderer/src/render/lumen/dirty.js';
import type { LxNode } from '../../src/renderer/src/lx/index.js';

describe('collectStateReads', () => {
  it('gathers every state path an expression reads', () => {
    const node: LxNode = { if: { '>': [{ state: 'score' }, { lit: 0 }] }, then: { state: 'pos.x' }, else: { state: 'board', at: [{ state: 'cx' }, { lit: 0 }] } };
    expect([...collectStateReads(node)].sort()).toEqual(['board', 'cx', 'pos.x', 'score']);
  });
  it('a static region (no state reads) collects nothing', () => {
    expect(collectStateReads({ lit: { type: 'text', content: 'hi' } }).size).toBe(0);
  });
});

describe('changedStatePaths + isDirty', () => {
  it('detects changed top-level keys', () => {
    expect([...changedStatePaths({ a: 1, b: 2 }, { a: 1, b: 3 })]).toEqual(['b']);
  });
  it('prefix-matches: a read of pos.x is dirty when pos changed', () => {
    expect(isDirty(new Set(['pos.x']), new Set(['pos']))).toBe(true);
    expect(isDirty(new Set(['pos.x']), new Set(['score']))).toBe(false);
  });
  it('a read of a record is dirty when a sub-field changed', () => {
    expect(isDirty(new Set(['pos']), new Set(['pos.x']))).toBe(true);
  });
});

describe('RegionMemo (§5 re-evaluate only dirty regions)', () => {
  it('re-evaluates only when the region’s reads changed; static once', () => {
    const memo = new RegionMemo();
    let scoreEvals = 0;
    let staticEvals = 0;
    const scoreNode: LxNode = { state: 'score' };
    const staticNode: LxNode = { lit: 'banner' };

    const step = (changed: Set<string>) => {
      memo.evaluate('score', scoreNode, changed, () => { scoreEvals++; return 1; });
      memo.evaluate('banner', staticNode, changed, () => { staticEvals++; return 'banner'; });
    };

    step(new Set()); // first paint — both evaluate once
    expect([scoreEvals, staticEvals]).toEqual([1, 1]);

    step(new Set(['pos'])); // unrelated change — neither re-evaluates
    expect([scoreEvals, staticEvals]).toEqual([1, 1]);

    step(new Set(['score'])); // score changed — only score re-evaluates
    expect([scoreEvals, staticEvals]).toEqual([2, 1]);

    step(new Set(['anything'])); // static region never re-evaluates
    expect(staticEvals).toBe(1);
  });
});
