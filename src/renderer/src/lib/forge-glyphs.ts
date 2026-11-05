/**
 * Line icons that turn into one another. Every glyph is drawn as one line
 * through a 48 unit box; the jumps between its strokes are invisible. All
 * glyphs share the same number of points, so one can flow into the next.
 */

export type GlyphName =
  | "document"
  | "lens"
  | "nodes"
  | "sources"
  | "grid"
  | "table"
  | "bars"
  | "trend"
  | "check";

/** x, y in the 48 unit box; v = 1 where the line shows, 0 on a jump */
export interface GlyphPoint {
  x: number;
  y: number;
  v: number;
}

type Stroke = Array<[number, number]>;

export const GLYPH_POINTS = 180;

const line = (x1: number, y1: number, x2: number, y2: number): Stroke => [
  [x1, y1],
  [x2, y2],
];

function arc(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  from: number,
  to: number,
): Stroke {
  const steps = Math.max(8, Math.round(Math.abs(to - from) * 10));
  return Array.from({ length: steps + 1 }, (_, i) => {
    const a = from + ((to - from) * i) / steps;
    return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry];
  });
}

const circle = (cx: number, cy: number, r: number, start = -Math.PI / 2) =>
  arc(cx, cy, r, r, start, start + Math.PI * 2);

function rect(x: number, y: number, w: number, h: number, r: number): Stroke {
  const q = Math.PI / 2;
  return [
    ...arc(x + r, y + r, r, r, Math.PI, Math.PI + q),
    ...arc(x + w - r, y + r, r, r, -q, 0),
    ...arc(x + w - r, y + h - r, r, r, 0, q),
    ...arc(x + r, y + h - r, r, r, q, Math.PI),
    [x, y + r],
  ];
}

const bar = (x: number, top: number, w: number): Stroke => [
  [x, 40],
  [x, top],
  [x + w, top],
  [x + w, 40],
];

const STROKES: Record<GlyphName, Stroke[]> = {
  document: [
    rect(12, 6, 24, 36, 3),
    line(17, 16, 31, 16),
    line(17, 22, 31, 22),
    line(17, 28, 26, 28),
  ],
  lens: [circle(21, 21, 11, Math.PI / 4), line(29, 29, 39, 39)],
  nodes: [
    circle(12, 14, 4),
    line(16, 13.5, 32, 12.5),
    circle(36, 12, 4),
    line(34, 15.5, 26, 32.5),
    circle(24, 36, 4),
    line(22, 32.5, 14, 17.5),
  ],
  sources: [
    arc(24, 12, 14, 5, Math.PI, Math.PI * 3),
    [[10, 12], [10, 36], ...arc(24, 36, 14, 5, Math.PI, 0), [38, 12]],
    arc(24, 24, 14, 5, Math.PI, 0),
  ],
  grid: [rect(6, 8, 36, 32, 3), line(6, 18, 42, 18), line(22, 18, 22, 40)],
  table: [
    rect(6, 9, 36, 30, 3),
    line(6, 19, 42, 19),
    line(6, 29, 42, 29),
    line(18, 9, 18, 39),
  ],
  bars: [bar(10, 26, 6), bar(21, 12, 6), bar(32, 20, 6), line(6, 40, 42, 40)],
  trend: [
    [
      [6, 8],
      [6, 40],
      [42, 40],
    ],
    [
      [11, 33],
      [19, 23],
      [27, 28],
      [39, 12],
    ],
  ],
  check: [
    circle(24, 24, 17, -Math.PI / 2),
    [
      [16, 24.5],
      [22, 30],
      [32, 18],
    ],
  ],
};

/** One path through every stroke, jumps marked invisible, evenly spaced. */
function resample(strokes: Stroke[], n: number): GlyphPoint[] {
  const path: GlyphPoint[] = [];
  for (const s of strokes) {
    s.forEach(([x, y], i) => path.push({ x, y, v: i === 0 ? 0 : 1 }));
  }
  const lengths = [0];
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1] as GlyphPoint;
    const b = path[i] as GlyphPoint;
    // Jumps count a little, so the line does not crowd at their ends.
    const d = Math.hypot(b.x - a.x, b.y - a.y) * (b.v ? 1 : 0.15);
    lengths.push((lengths[i - 1] ?? 0) + d);
  }
  const total = lengths[lengths.length - 1] ?? 0;
  const out: GlyphPoint[] = [];
  let j = 1;
  for (let k = 0; k < n; k++) {
    const at = (total * k) / (n - 1);
    while (j < path.length - 1 && (lengths[j] ?? 0) < at) j++;
    const a = path[j - 1] as GlyphPoint;
    const b = path[j] as GlyphPoint;
    const l0 = lengths[j - 1] ?? 0;
    const span = (lengths[j] ?? 0) - l0;
    const f = span > 0 ? (at - l0) / span : 0;
    out.push({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, v: b.v });
  }
  return out;
}

const cache = new Map<GlyphName, GlyphPoint[]>();

export function glyph(name: GlyphName): GlyphPoint[] {
  let g = cache.get(name);
  if (!g) {
    g = resample(STROKES[name], GLYPH_POINTS);
    cache.set(name, g);
  }
  return g;
}

const easeInOut = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;

/** The line between two glyphs; the start of the line moves first. */
export function morph(
  from: GlyphPoint[],
  to: GlyphPoint[],
  t: number,
): GlyphPoint[] {
  const n = to.length;
  return to.map((b, i) => {
    const a = from[i] ?? b;
    const lag = 0.35 * (i / n);
    const e = easeInOut(Math.min(1, Math.max(0, (t - lag) / 0.65)));
    return {
      x: a.x + (b.x - a.x) * e,
      y: a.y + (b.y - a.y) * e,
      v: a.v + (b.v - a.v) * e,
    };
  });
}
