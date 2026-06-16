/**
 * omadia-canvas-protocol/1.1 — Lumen runtime (Tier 1, lumens-spec.md §1,§2,§4,§5).
 *
 * Pure, React-free core that the useLumen hook drives. Initialises state from
 * the declared schema, maps a pointer/key/tick event to its transition, runs it
 * through the vendored LX interpreter (deterministic, gas-bounded), and
 * evaluates the `view` to a primitive/scene tree. No DOM here — unit-testable.
 */
import { evaluate, runTransition, type LxNode, type LxValue, type StateValue } from '../../lx/index.js';

interface StateLeaf {
  type: string;
  init?: unknown;
  values?: string[];
  fields?: Record<string, StateLeaf>;
  of?: StateLeaf;
  w?: number;
  h?: number;
  // client-checkable bounds (enforced by the schema/validator, not initState)
  min?: number;
  max?: number;
  maxLength?: number;
  maxLen?: number;
}

export interface EventBinding {
  on: 'tap' | 'longPress' | 'drag' | 'pinch' | 'swipe' | 'pointerMove' | 'key' | 'tick' | 'timer' | 'wire';
  target?: { kind?: string; elementId?: string };
  key?: string;
  rate?: number;
  everyMs?: number;
  run: string;
}

export interface LumenSpec {
  type: 'lumen';
  id: string;
  state: Record<string, StateLeaf>;
  transitions: Record<string, LxNode>;
  view: LxNode;
  events: EventBinding[];
  cadence?: 'static' | 'reactive' | { tick: number };
}

/** Build the initial value for one state leaf (§1.1). */
function initLeaf(leaf: StateLeaf): LxValue {
  if (leaf.init !== undefined) return leaf.init as LxValue;
  switch (leaf.type) {
    case 'int':
    case 'number':
      return 0;
    case 'bool':
      return false;
    case 'string':
      return '';
    case 'enum':
      return leaf.values?.[0] ?? '';
    case 'list':
      return [];
    case 'record':
      return leaf.fields ? initState(leaf.fields) : {};
    case 'grid': {
      const w = leaf.w ?? 0;
      const h = leaf.h ?? 0;
      const cell = leaf.of ? initLeaf(leaf.of) : 0;
      return Array.from({ length: h }, () => Array.from({ length: w }, () => cell));
    }
    case 'dataRef':
    default:
      return null as unknown as LxValue;
  }
}

/** Initialise the full state record from its schema. */
export function initState(schema: Record<string, StateLeaf>): StateValue {
  const out: StateValue = {};
  for (const [key, leaf] of Object.entries(schema)) out[key] = initLeaf(leaf);
  return out;
}

export interface EventInput {
  on: EventBinding['on'];
  targetId?: string;
  key?: string;
  payload?: Record<string, LxValue>;
}

/** Find the transition an event should run, honouring target/key matching. */
export function matchTransition(events: EventBinding[], input: EventInput): string | null {
  for (const b of events) {
    if (b.on !== input.on) continue;
    if (b.on === 'key' && b.key !== undefined && b.key !== input.key) continue;
    if (b.target?.elementId !== undefined && b.target.elementId !== input.targetId) continue;
    return b.run;
  }
  return null;
}

export interface RunContext {
  now: number;
  seed: number;
  gas?: number;
}

/** Apply an event: returns the new state, or the SAME reference if no binding
 *  matched (lets the caller skip a re-render). Throws LxError on a runaway
 *  transition (caller surfaces surface_error and halts the Lumen). */
export function applyEvent(lumen: LumenSpec, state: StateValue, input: EventInput, ctx: RunContext): StateValue {
  const run = matchTransition(lumen.events, input);
  if (run === null) return state;
  const transition = lumen.transitions[run];
  if (!transition) return state;
  return runTransition(transition, { state, event: input.payload ?? {}, now: ctx.now, seed: ctx.seed, gas: ctx.gas });
}

/** Evaluate the Lumen `view` to a primitive/scene tree. */
export function evalView(lumen: LumenSpec, state: StateValue, ctx: RunContext): LxValue {
  return evaluate(lumen.view, { state, now: ctx.now, seed: ctx.seed, gas: ctx.gas });
}

/** Deliver a resolved wire value to an `in` port (§7): dispatches an `on:'wire'`
 *  event carrying { port, value } so the matched transition can read it via
 *  {event:'value'} / {event:'port'}. The host computes the value with
 *  resolveWires (wires.ts); this is how cross-element interaction reaches a
 *  Lumen's state, deterministically and without a turn. */
export function applyWireInput(lumen: LumenSpec, state: StateValue, port: string, value: LxValue, ctx: RunContext): StateValue {
  return applyEvent(lumen, state, { on: 'wire', payload: { port, value } }, ctx);
}

/** The tick rate (Hz) if this Lumen has a ticking cadence, else null. */
export function tickRate(lumen: LumenSpec): number | null {
  const c = lumen.cadence;
  if (c && typeof c === 'object' && typeof c.tick === 'number') return c.tick;
  return null;
}
