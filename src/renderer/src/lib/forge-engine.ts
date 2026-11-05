import { type Block, guessLayout, signatureOf } from "./forge-layout";

/**
 * While omadia builds a new canvas there is no panel yet, only the ground.
 * The dot travels in straight lines and draws the outline of each region the
 * view will have: a quiet guess first, then the real layout once the tree
 * arrives. What is filled rises into the light; nothing else moves.
 */

export interface ForgeFeed {
  /** the real layout; empty until the first snapshot */
  blocks: Block[];
  /** the node omadia works on */
  focusId?: string;
  changed: readonly string[];
  changedAt: number;
}

export interface Forge {
  feed(next: ForgeFeed): void;
  destroy(): void;
}

interface P {
  x: number;
  y: number;
}

interface Rect extends P {
  w: number;
  h: number;
}

interface Live {
  block: Block;
  cur: Rect | null;
  drawAt: number;
  drawDur: number;
  doneAt: number;
  flashAt: number;
}

interface Draft {
  real: boolean;
  sig: string;
  items: Live[];
  /** when this draft started to give way to the next one */
  leaveAt: number;
  /** rounds the dot has made since everything was drawn */
  rounds: number;
}

type Task =
  | { kind: "travel"; from: P; to: () => P; t0: number; dur: number }
  | { kind: "outline"; live: Live; t0: number; dur: number }
  | { kind: "trace"; live: Live; t0: number; dur: number }
  | { kind: "rest"; at: () => P; t0: number; dur: number };

type Rgb = [number, number, number];

const LEAVE_MS = 520;
const RADIUS = 10;

const clamp = (v: number, a = 0, b = 1): number => Math.min(b, Math.max(a, v));
const easeInOut = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
const easeOut = (t: number): number => 1 - (1 - t) ** 3;

function parseColor(raw: string, fallback: Rgb): Rgb {
  const m = /^#([0-9a-f]{6})$/i.exec(raw.trim());
  if (!m) return fallback;
  const n = parseInt(m[1] as string, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function readPalette(): { ink: Rgb; surface: Rgb; light: Rgb } {
  const css = getComputedStyle(document.documentElement);
  return {
    ink: parseColor(css.getPropertyValue("--ink"), [243, 239, 230]),
    surface: parseColor(css.getPropertyValue("--surface"), [17, 17, 19]),
    light: parseColor(css.getPropertyValue("--light"), [243, 239, 230]),
  };
}

const rgba = (c: Rgb, a: number): string =>
  `rgba(${c[0]},${c[1]},${c[2]},${clamp(a)})`;

function perimeterPoint(r: Rect, f: number): P {
  const d = clamp(f) * 2 * (r.w + r.h);
  if (d <= r.w) return { x: r.x + d, y: r.y };
  if (d <= r.w + r.h) return { x: r.x + r.w, y: r.y + d - r.w };
  if (d <= 2 * r.w + r.h)
    return { x: r.x + r.w - (d - r.w - r.h), y: r.y + r.h };
  return { x: r.x, y: r.y + r.h - (d - 2 * r.w - r.h) };
}

export function startForge(
  canvas: HTMLCanvasElement,
  anchor: HTMLElement | null,
  opts: { reduced: boolean },
): Forge {
  const ctx = canvas.getContext("2d");
  let W = 0;
  let H = 0;
  let dpr = 1;
  let palette = readPalette();
  let paletteAt = 0;
  let feed: ForgeFeed = { blocks: [], changed: [], changedAt: 0 };
  let lastChangedAt = 0;

  const makeDraft = (blocks: Block[], real: boolean): Draft => ({
    real,
    sig: signatureOf(blocks),
    items: blocks.map((block) => ({
      block,
      cur: null,
      drawAt: 0,
      drawDur: 0,
      doneAt: 0,
      flashAt: 0,
    })),
    leaveAt: 0,
    rounds: 0,
  });

  let guessSeed = Date.now() % 9973;
  let draft = makeDraft(guessLayout(guessSeed), false);
  let next: Draft | null = null;
  let pen: P | null = null;
  let task: Task | null = null;

  const resize = (): void => {
    const box = canvas.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = Math.max(1, box.width);
    H = Math.max(1, box.height);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
  };
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  resize();

  /** Where the canvas will stand: the same measure as the canvas flow. */
  const stage = (): Rect => {
    const w = Math.min(W - 56, 1384);
    const top = 96;
    return { x: (W - w) / 2, y: top, w, h: Math.max(80, H - top - 40) };
  };

  const goalOf = (b: Block): Rect => {
    const s = stage();
    return {
      x: s.x + b.x * s.w,
      y: s.y + b.y * s.h,
      w: b.w * s.w,
      h: b.h * s.h,
    };
  };
  const rectOf = (l: Live): Rect => l.cur ?? goalOf(l.block);

  const pace = (): number => (opts.reduced ? 50 : 1);

  const travel = (to: () => P, now: number, from: P): Task => {
    const goal = to();
    const dist = Math.hypot(goal.x - from.x, goal.y - from.y);
    return {
      kind: "travel",
      from,
      to,
      t0: now,
      dur: clamp(260 + dist * 0.9, 320, 900) / pace(),
    };
  };

  const plan = (now: number, at: P): Task => {
    const todo = draft.items.find((l) => !l.drawAt);
    if (todo) {
      const r = rectOf(todo);
      if (Math.hypot(r.x - at.x, r.y - at.y) > 2)
        return travel(() => rectOf(todo), now, at);
      todo.drawAt = now;
      todo.drawDur = clamp((2 * (r.w + r.h)) / 1.2, 700, 2200) / pace();
      return { kind: "outline", live: todo, t0: now, dur: todo.drawDur };
    }
    // All drawn, omadia still at work: the dot rounds the region it works
    // on, and a guess gives way to the next one after a round.
    if (!draft.real && draft.rounds > 0 && !opts.reduced) {
      draft.leaveAt = now;
      return { kind: "rest", at: () => at, t0: now, dur: 80 };
    }
    const largest = [...draft.items].sort(
      (a, b) => b.block.w * b.block.h - a.block.w * a.block.h,
    )[0];
    const target = draft.real
      ? (draft.items.find((l) => l.block.id === feed.focusId) ??
        draft.items.find((l) => l.block.loading) ??
        largest)
      : largest;
    if (!target || opts.reduced)
      return { kind: "rest", at: () => at, t0: now, dur: 1000 };
    const r = rectOf(target);
    if (Math.hypot(r.x - at.x, r.y - at.y) > 2)
      return travel(() => rectOf(target), now, at);
    draft.rounds += 1;
    const dur = clamp((2 * (r.w + r.h)) / 0.32, 2400, 6500);
    return { kind: "trace", live: target, t0: now, dur };
  };

  const penAt = (t: Task, now: number): P => {
    const f = clamp((now - t.t0) / Math.max(1, t.dur));
    if (t.kind === "travel") {
      const goal = t.to();
      const e = easeInOut(f);
      return {
        x: t.from.x + (goal.x - t.from.x) * e,
        y: t.from.y + (goal.y - t.from.y) * e,
      };
    }
    if (t.kind === "outline")
      return perimeterPoint(rectOf(t.live), easeInOut(f));
    if (t.kind === "trace") return perimeterPoint(rectOf(t.live), f);
    return t.at();
  };

  // ── drawing ──

  const outline = (c: CanvasRenderingContext2D, r: Rect, f: number): void => {
    if (f >= 1) {
      c.beginPath();
      c.roundRect(r.x + 0.5, r.y + 0.5, r.w, r.h, RADIUS);
      c.stroke();
      return;
    }
    const total = 2 * (r.w + r.h);
    c.beginPath();
    c.moveTo(r.x + 0.5, r.y + 0.5);
    for (const at of [r.w, r.w + r.h, 2 * r.w + r.h]) {
      if (at / total >= f) break;
      const p = perimeterPoint(r, at / total);
      c.lineTo(p.x + 0.5, p.y + 0.5);
    }
    const end = perimeterPoint(r, f);
    c.lineTo(end.x + 0.5, end.y + 0.5);
    c.stroke();
  };

  /** A stretch of the outline, from one perimeter fraction to another. */
  const span = (
    c: CanvasRenderingContext2D,
    r: Rect,
    from: number,
    to: number,
  ): void => {
    if (from < 0) {
      span(c, r, 1 + from, 1);
      span(c, r, 0, to);
      return;
    }
    const total = 2 * (r.w + r.h);
    const start = perimeterPoint(r, from);
    c.beginPath();
    c.moveTo(start.x + 0.5, start.y + 0.5);
    for (const at of [r.w, r.w + r.h, 2 * r.w + r.h]) {
      const corner = at / total;
      if (corner <= from || corner >= to) continue;
      const p = perimeterPoint(r, corner);
      c.lineTo(p.x + 0.5, p.y + 0.5);
    }
    const end = perimeterPoint(r, to);
    c.lineTo(end.x + 0.5, end.y + 0.5);
    c.stroke();
  };

  /** The light the dot leaves on the edge it is rounding. */
  const drawTrace = (c: CanvasRenderingContext2D, r: Rect, f: number): void => {
    const length = Math.min(0.14, 160 / (2 * (r.w + r.h)));
    const pieces = 8;
    c.lineWidth = 1.2;
    for (let i = 0; i < pieces; i++) {
      const a = f - length + (length * i) / pieces;
      c.strokeStyle = rgba(palette.light, 0.5 * ((i + 1) / pieces) ** 2);
      span(c, r, a, a + length / pieces + 0.0005);
    }
    c.lineWidth = 1;
  };

  const fillRegion = (c: CanvasRenderingContext2D, r: Rect): void => {
    c.beginPath();
    c.roundRect(r.x, r.y, r.w, r.h, RADIUS);
    c.fill();
  };

  const drawItem = (
    c: CanvasRenderingContext2D,
    l: Live,
    now: number,
    fade: number,
  ): void => {
    const r = rectOf(l);
    const f = l.doneAt ? 1 : easeInOut(clamp((now - l.drawAt) / l.drawDur));
    // A filled region rises out of the half-dark, like a panel.
    if (draft.real && l.doneAt && !l.block.loading) {
      const since = now - Math.max(l.doneAt, l.flashAt);
      c.fillStyle = rgba(palette.surface, easeOut(clamp(since / 700)) * fade);
      fillRegion(c, r);
    }
    if (l.flashAt && now - l.flashAt < 900) {
      const k = 1 - (now - l.flashAt) / 900;
      c.fillStyle = rgba(palette.light, 0.06 * k * fade);
      fillRegion(c, r);
    }
    c.strokeStyle = rgba(palette.ink, (draft.real ? 0.26 : 0.11) * fade);
    c.lineWidth = 1;
    outline(c, r, f);
    if (task?.kind === "trace" && task.live === l && fade === 1)
      drawTrace(c, r, clamp((now - task.t0) / task.dur));
  };

  const render = (c: CanvasRenderingContext2D, now: number): void => {
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, W, H);
    const fade = draft.leaveAt
      ? 1 - clamp((now - draft.leaveAt) / LEAVE_MS)
      : 1;
    for (const l of draft.items) if (l.drawAt) drawItem(c, l, now, fade);
    if (!pen) return;
    // the pen's light; the dot itself is omadia's own
    const halo = c.createRadialGradient(pen.x, pen.y, 0, pen.x, pen.y, 28);
    halo.addColorStop(0, rgba(palette.light, 0.16));
    halo.addColorStop(1, rgba(palette.light, 0));
    c.fillStyle = halo;
    c.fillRect(pen.x - 28, pen.y - 28, 56, 56);
  };

  // ── the loop ──

  let frame = 0;
  let last = performance.now();

  const step = (now: number): void => {
    frame = requestAnimationFrame(step);
    const dt = Math.min(64, now - last);
    last = now;
    if (!ctx) return;
    if (now - paletteAt > 600) {
      palette = readPalette();
      paletteAt = now;
    }
    if (draft.leaveAt && now - draft.leaveAt > LEAVE_MS) {
      draft = next ?? makeDraft(guessLayout(++guessSeed), false);
      next = null;
      task = null;
    }
    // The layout follows the stage smoothly when the window moves.
    const k = Math.min(1, dt / 90);
    for (const l of draft.items) {
      const goal = goalOf(l.block);
      l.cur = l.cur
        ? {
            x: l.cur.x + (goal.x - l.cur.x) * k,
            y: l.cur.y + (goal.y - l.cur.y) * k,
            w: l.cur.w + (goal.w - l.cur.w) * k,
            h: l.cur.h + (goal.h - l.cur.h) * k,
          }
        : goal;
    }
    const at = pen ?? { x: stage().x, y: stage().y };
    if (!task || now - task.t0 >= task.dur) {
      if (task?.kind === "outline") task.live.doneAt = now;
      task = draft.leaveAt
        ? { kind: "rest", at: () => at, t0: now, dur: 80 }
        : plan(now, at);
    }
    pen = penAt(task, now);
    if (anchor) anchor.style.transform = `translate(${pen.x}px, ${pen.y}px)`;
    render(ctx, now);
  };

  frame = requestAnimationFrame(step);

  /** The structure moved: keep what is drawn, draw what is new. */
  const morph = (blocks: Block[], sig: string): void => {
    const old = new Map(draft.items.map((l) => [l.block.id, l]));
    draft.sig = sig;
    draft.items = blocks.map((block) => {
      const kept = old.get(block.id);
      if (kept) return Object.assign(kept, { block });
      return {
        block,
        cur: null,
        drawAt: 0,
        drawDur: 0,
        doneAt: 0,
        flashAt: 0,
      };
    });
  };

  const adopt = (blocks: Block[]): void => {
    const sig = signatureOf(blocks);
    if (!draft.real) {
      // The guess gives way to the real layout.
      if (!next || next.sig !== sig) next = makeDraft(blocks, true);
      if (!draft.leaveAt) draft.leaveAt = performance.now();
      return;
    }
    morph(blocks, sig);
  };

  return {
    feed(input) {
      feed = input;
      if (input.blocks.length) adopt(input.blocks);
      if (input.changedAt !== lastChangedAt) {
        lastChangedAt = input.changedAt;
        const now = performance.now();
        for (const l of (next ?? draft).items)
          if (input.changed.includes(l.block.id)) l.flashAt = now;
      }
    },
    destroy() {
      cancelAnimationFrame(frame);
      observer.disconnect();
    },
  };
}
