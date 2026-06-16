import { describe, expect, it } from 'vitest';
import { sampleAnimation, reducedMotionValue, animateToCss, cssTimingFunction, type Animate } from '../../src/renderer/src/render/scene/animate.js';

const fade: Animate = { property: 'opacity', from: 0, to: 1, durationMs: 200, easing: 'linear' };

describe('sampleAnimation (§5 declarative motion)', () => {
  it('interpolates from→to over the duration (linear)', () => {
    expect(sampleAnimation(fade, 0).value).toBe(0);
    expect(sampleAnimation(fade, 100).value).toBeCloseTo(0.5);
    expect(sampleAnimation(fade, 200)).toEqual({ value: 1, done: true });
  });
  it('honours delayMs (holds at `from` until the delay passes)', () => {
    const delayed: Animate = { ...fade, delayMs: 50 };
    expect(sampleAnimation(delayed, 25).value).toBe(0);
    expect(sampleAnimation(delayed, 50).value).toBe(0);
    expect(sampleAnimation(delayed, 150).value).toBeCloseTo(0.5);
  });
  it('eases (ease-out is ahead of linear at the midpoint)', () => {
    const eo: Animate = { ...fade, easing: 'ease-out' };
    expect(sampleAnimation(eo, 100).value).toBeGreaterThan(0.5);
  });
  it('loops forever when repeat=true (never done)', () => {
    const loop: Animate = { ...fade, repeat: true };
    expect(sampleAnimation(loop, 250).done).toBe(false); // past one cycle, still looping
    expect(sampleAnimation(loop, 250).value).toBeCloseTo(0.25); // 50ms into 2nd cycle
  });
  it('repeats a finite number of cycles then settles at `to`', () => {
    const twice: Animate = { ...fade, repeat: 2 };
    expect(sampleAnimation(twice, 399).done).toBe(false);
    expect(sampleAnimation(twice, 400)).toEqual({ value: 1, done: true });
  });
});

describe('reduced motion (visual-spec §2.11 collapse)', () => {
  it('collapses instantly to the final value', () => {
    expect(sampleAnimation(fade, 0, { reducedMotion: true })).toEqual({ value: 1, done: true });
    expect(reducedMotionValue(fade)).toBe(1);
  });
  it('animateToCss drops the transition under reduced motion', () => {
    expect(animateToCss(fade, { reducedMotion: true })).toEqual({ value: 1, transition: null });
  });
});

describe('GPU/CSS path (zero JS per frame)', () => {
  it('emits a CSS transition with a Lume timing function', () => {
    const css = animateToCss({ ...fade, easing: 'standard' });
    expect(css.transition).toContain('opacity 200ms');
    expect(css.transition).toContain('--lume-ease-standard');
    expect(css.value).toBe(1);
  });
  it('maps easing tokens to Lume CSS vars', () => {
    expect(cssTimingFunction('emphasis')).toContain('--lume-ease-emphasis');
    expect(cssTimingFunction('linear')).toBe('linear');
  });
});
