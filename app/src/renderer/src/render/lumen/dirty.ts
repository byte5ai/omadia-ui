/**
 * omadia-canvas-protocol/1.1 — per-region dirty-tracking (lumens-spec.md §5).
 *
 * The runtime dirty-tracks changed state slices and re-evaluates only the view
 * branches that depend on them (retained-mode + memoisation). At rest a Lumen
 * costs ~0% CPU. Pure (no DOM): collect the state paths a view branch reads,
 * diff old→new state, and re-evaluate a region only when its reads intersect the
 * change set. Conservative (top-level diff + prefix match) ⇒ never stale.
 */
import type { LxNode, LxValue, StateValue } from '../../lx/index.js';

/** All state paths an LX expression reads (the `{state:path}` leaves). */
export function collectStateReads(node: LxNode, acc: Set<string> = new Set()): Set<string> {
  if (node === null || typeof node !== 'object') return acc;
  const n = node as Record<string, unknown>;
  if (typeof n.state === 'string') {
    acc.add(n.state);
    if (Array.isArray(n.at)) for (const e of n.at) collectStateReads(e as LxNode, acc);
    return acc;
  }
  for (const v of Object.values(n)) {
    if (Array.isArray(v)) for (const e of v) collectStateReads(e as LxNode, acc);
    else if (v && typeof v === 'object') collectStateReads(v as LxNode, acc);
  }
  return acc;
}

const eq = (a: LxValue, b: LxValue): boolean => JSON.stringify(a) === JSON.stringify(b);

/** Top-level state keys whose value changed between two states. Conservative:
 *  a changed record key marks the whole key dirty (prefix-covers its fields). */
export function changedStatePaths(prev: StateValue, next: StateValue): Set<string> {
  const changed = new Set<string>();
  for (const k of new Set([...Object.keys(prev), ...Object.keys(next)])) {
    if (!eq(prev[k] as LxValue, next[k] as LxValue)) changed.add(k);
  }
  return changed;
}

const pathsOverlap = (read: string, changed: string): boolean =>
  read === changed || read.startsWith(`${changed}.`) || changed.startsWith(`${read}.`);

/** Does a region (its set of reads) need re-evaluation given the change set? */
export function isDirty(reads: Set<string>, changed: Set<string>): boolean {
  for (const r of reads) for (const c of changed) if (pathsOverlap(r, c)) return true;
  return false;
}

interface MemoEntry {
  reads: Set<string>;
  value: LxValue;
}

/** Memoises evaluated view regions by stable id; re-evaluates a region only
 *  when the state it reads changed (§5). `static` regions (no reads) are
 *  evaluated once and never again. */
export class RegionMemo {
  private readonly cache = new Map<string, MemoEntry>();

  /** Return the region's value, re-evaluating only if its reads are dirty. */
  evaluate(regionId: string, node: LxNode, changed: Set<string>, evalFn: (n: LxNode) => LxValue): LxValue {
    const cached = this.cache.get(regionId);
    if (cached && !isDirty(cached.reads, changed)) return cached.value;
    const reads = collectStateReads(node);
    const value = evalFn(node);
    this.cache.set(regionId, { reads, value });
    return value;
  }

  /** Number of regions currently memoised (for tests/diagnostics). */
  get size(): number {
    return this.cache.size;
  }

  invalidate(regionId?: string): void {
    if (regionId === undefined) this.cache.clear();
    else this.cache.delete(regionId);
  }
}
