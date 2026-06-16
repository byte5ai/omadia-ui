/**
 * omadia-canvas-protocol/1.1 — declarative animation layer (lumens-spec.md §5).
 *
 * Presentation motion (fade, glow-pulse, count-up, camera ease, Ken-Burns,
 * parallax) is DECLARATIVE — the host runs it, ZERO LX per frame. Only
 * *simulation* (state evolving by rules) is an LX `tick`. Easing/durations come
 * from the Lume motion tokens (visual-spec.md §2.11). `prefers-reduced-motion`
 * collapses animations to their final value. This module is the pure
 * interpolation core (no DOM) so it is unit-testable and deterministic.
 */
export type Easing = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'standard' | 'emphasis';

export interface Animate {
  property: string; // e.g. 'opacity', 'glow', 'scale', 'x', 'camera.zoom'
  from: number;
  to: number;
  durationMs: number;
  easing?: Easing;
  /** true = loop forever; a number = that many cycles; absent/false = one-shot. */
  repeat?: boolean | number;
  delayMs?: number;
}

/** Pure easing functions on a normalised t ∈ [0,1]. The Lume tokens map onto
 *  these shapes; the real cubic-beziers live in CSS for the GPU path, but the
 *  same monotonic shape is used here for headless sampling. */
const EASINGS: Record<Easing, (t: number) => number> = {
  linear: (t) => t,
  'ease-in': (t) => t * t,
  'ease-out': (t) => 1 - (1 - t) * (1 - t),
  'ease-in-out': (t) => (t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t)),
  standard: (t) => (t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t)), // --lume-ease-standard
  emphasis: (t) => 1 - (1 - t) * (1 - t), // --lume-ease-emphasis (decelerate)
};

/** The CSS timing-function var for the GPU path (visual-spec §2.11). */
export function cssTimingFunction(easing: Easing = 'standard'): string {
  if (easing === 'standard') return 'var(--lume-ease-standard, ease)';
  if (easing === 'emphasis') return 'var(--lume-ease-emphasis, ease-out)';
  return easing;
}

const clamp01 = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t);

export interface Sample {
  value: number;
  done: boolean;
}

/** Sample an animation's property value at `elapsedMs` since it began.
 *  reduced-motion collapses instantly to the final value (done). */
export function sampleAnimation(anim: Animate, elapsedMs: number, opts: { reducedMotion?: boolean } = {}): Sample {
  if (opts.reducedMotion) return { value: anim.to, done: true };
  const delay = anim.delayMs ?? 0;
  if (elapsedMs < delay) return { value: anim.from, done: false };

  const local = elapsedMs - delay;
  const dur = Math.max(1, anim.durationMs);
  const ease = EASINGS[anim.easing ?? 'standard'];

  const infinite = anim.repeat === true;
  const cycles = typeof anim.repeat === 'number' ? Math.max(1, anim.repeat) : 1;
  const totalDur = dur * (infinite ? Infinity : cycles);

  if (!infinite && local >= totalDur) return { value: anim.to, done: true };

  const phase = clamp01((local % dur) / dur);
  const eased = ease(phase);
  return { value: anim.from + (anim.to - anim.from) * eased, done: false };
}

/** The collapsed value under reduced motion (visual-spec §2.11). */
export function reducedMotionValue(anim: Animate): number {
  return anim.to;
}

/** Translate an Animate descriptor to a GPU/CSS transition descriptor — the
 *  production path (zero JS per frame). Under reduced motion the transition is
 *  dropped and only the final value is applied. */
export function animateToCss(
  anim: Animate,
  opts: { reducedMotion?: boolean } = {},
): { value: number; transition: string | null } {
  if (opts.reducedMotion) return { value: anim.to, transition: null };
  const iter = anim.repeat === true ? 'infinite' : typeof anim.repeat === 'number' ? String(anim.repeat) : '1';
  const delay = anim.delayMs ? ` ${anim.delayMs}ms` : '';
  return {
    value: anim.to,
    transition: `${anim.property} ${anim.durationMs}ms ${cssTimingFunction(anim.easing)}${delay}` + (iter !== '1' ? ` /* x${iter} */` : ''),
  };
}
