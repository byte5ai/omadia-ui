import { glyph, type GlyphName, type GlyphPoint, morph } from "./forge-glyphs";

/**
 * Plays a sequence of glyphs on a small canvas: each one flows into the next,
 * and the pen (the agent dot's anchor) keeps running along the line, so the
 * icon is never still while omadia works.
 */

export interface GlyphPlayer {
  play(sequence: GlyphName[]): void;
  destroy(): void;
}

const MORPH_MS = 1100;
const HOLD_MS = 2600;
const PEN_SPEED = 0.05; // box units per ms
const TRAIL = 22; // box units of light behind the pen
const BOX = 48;

export function startGlyphs(
  canvas: HTMLCanvasElement,
  anchor: HTMLElement | null,
  opts: {
    reduced: boolean;
    /** light on a point of the canvas (CSS px), 0..1; lit lines are ink */
    lightAt?: (x: number, y: number) => number;
  },
): GlyphPlayer {
  const ctx = canvas.getContext("2d");
  let sequence: GlyphName[] = [];
  let index = 0;
  let from: GlyphPoint[] = glyph("document").map((p) => ({ ...p, v: 0 }));
  let to: GlyphPoint[] = from;
  let morphAt = 0;
  /** share of the visible line the pen has run, 0..1 */
  let pen = 0;
  let last = performance.now();
  let ink = "#888";
  let shade = "#777";
  let light = "#fff";
  let frame = 0;
  let raf = 0;

  const shapeAt = (now: number): GlyphPoint[] =>
    opts.reduced ? to : morph(from, to, (now - morphAt) / MORPH_MS);
  const go = (name: GlyphName, now: number): void => {
    from = shapeAt(now);
    to = glyph(name);
    morphAt = now;
  };

  function readColours(): void {
    const css = getComputedStyle(canvas);
    ink = css.getPropertyValue("--ink").trim() || ink;
    shade = css.getPropertyValue("--meta").trim() || shade;
    light = css.getPropertyValue("--light").trim() || light;
  }

  function draw(points: GlyphPoint[], scale: number, dt: number): void {
    if (!ctx) return;
    const size = canvas.width;
    ctx.clearRect(0, 0, size, size);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 1.5 * (size / canvas.clientWidth || 1);
    const k = canvas.clientWidth / BOX;
    // Lengths along the visible line, for the pen and its trail.
    let run = 0;
    const along: number[] = [0];
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1] as GlyphPoint;
      const b = points[i] as GlyphPoint;
      const v = Math.min(a.v, b.v);
      run += v > 0.5 ? Math.hypot(b.x - a.x, b.y - a.y) : 0;
      along.push(run);
      if (v < 0.02) continue;
      // Material in the dark, ink where the light falls on it.
      const lit = opts.lightAt
        ? opts.lightAt(((a.x + b.x) / 2) * k, ((a.y + b.y) / 2) * k)
        : 1;
      for (const [colour, alpha] of [
        [shade, v * (1 - lit)],
        [ink, v * lit],
      ] as const) {
        if (alpha < 0.02) continue;
        ctx.strokeStyle = colour;
        ctx.globalAlpha = alpha * 0.9;
        ctx.beginPath();
        ctx.moveTo(a.x * scale, a.y * scale);
        ctx.lineTo(b.x * scale, b.y * scale);
        ctx.stroke();
      }
    }
    if (run === 0) return;
    // The pen keeps its share of the way round while the line changes shape.
    if (!opts.reduced) pen = (pen + (dt * PEN_SPEED) / run) % 1;
    const at = pen * run;
    let penX = 0;
    let penY = 0;
    ctx.strokeStyle = light;
    ctx.shadowColor = light;
    ctx.shadowBlur = 10;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1] as GlyphPoint;
      const b = points[i] as GlyphPoint;
      const s = along[i] ?? 0;
      const behind = (at - s + run) % run;
      if (behind < TRAIL && Math.min(a.v, b.v) > 0.5) {
        ctx.globalAlpha = 0.9 * (1 - behind / TRAIL);
        ctx.beginPath();
        ctx.moveTo(a.x * scale, a.y * scale);
        ctx.lineTo(b.x * scale, b.y * scale);
        ctx.stroke();
      }
      const s0 = along[i - 1] ?? 0;
      if (at >= s0 && at <= s && s > s0) {
        const f = (at - s0) / (s - s0);
        penX = a.x + (b.x - a.x) * f;
        penY = a.y + (b.y - a.y) * f;
      }
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    if (anchor) {
      anchor.style.transform = `translate(${penX * k}px, ${penY * k}px)`;
    }
  }

  function step(now: number): void {
    raf = requestAnimationFrame(step);
    const dt = Math.min(64, now - last);
    last = now;
    if (frame++ % 30 === 0) readColours();
    const size = Math.round(
      canvas.clientWidth * (window.devicePixelRatio || 1),
    );
    if (size > 0 && canvas.width !== size) {
      canvas.width = size;
      canvas.height = size;
    }
    if (
      sequence.length > 1 &&
      !opts.reduced &&
      now - morphAt > MORPH_MS + HOLD_MS
    ) {
      index = (index + 1) % sequence.length;
      go(sequence[index] as GlyphName, now);
    }
    draw(shapeAt(now), canvas.width / BOX, dt);
  }
  raf = requestAnimationFrame(step);

  return {
    play(next) {
      if (next.join() === sequence.join()) return;
      sequence = next;
      index = 0;
      const first = next[0];
      if (first) go(first, performance.now());
    },
    destroy() {
      cancelAnimationFrame(raf);
    },
  };
}
