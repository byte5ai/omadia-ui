import { childrenOf, isNode, isQuestion, type Node, str } from "./tree";

/**
 * The forge draws a canvas before it exists: first as guesses, then as the
 * blueprint of the tree omadia is filling. A block is one drawable region in
 * a unit box (0..1 on both axes); the engine scales it to the stage.
 */

export type BlockKind =
  "title" | "text" | "kpi" | "table" | "list" | "chart" | "control" | "media";

export interface Block {
  id: string;
  kind: BlockKind;
  /** what the drafting label says: `table · tickets` */
  label: string;
  loading: boolean;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Item {
  id: string;
  kind: BlockKind;
  label: string;
  loading: boolean;
}

type Row = Item[];

/** Relative row heights: a table needs room, a heading does not. */
const HEIGHT: Record<BlockKind, number> = {
  title: 0.55,
  text: 0.8,
  kpi: 1.15,
  control: 0.55,
  list: 2.6,
  table: 3.6,
  chart: 3.1,
  media: 2.8,
};

const SMALL = new Set(["heading", "text", "status", "progress", "divider"]);
const MAX_ROWS = 9;
const MAX_PER_ROW = 6;

function leafKind(n: Node): BlockKind | null {
  switch (n.type) {
    case "heading":
      return "title";
    case "text":
      return "text";
    case "status":
    case "progress":
      return "kpi";
    case "table":
    case "tree":
      return "table";
    case "list":
      return "list";
    case "chart":
      return "chart";
    case "button":
    case "input":
    case "choice":
    case "toggle":
      return "control";
    case "image":
    case "media":
    case "timeline":
    case "canvas-region":
    case "vector-path":
    case "lumen":
    case "scene":
      return "media";
    default:
      return null;
  }
}

/** A small container of a few headings and values: a KPI card. */
function isCard(n: Node): boolean {
  if (n.type !== "container") return false;
  let leaves = 0;
  let small = true;
  const visit = (c: Node): void => {
    for (const k of childrenOf(c)) {
      if (k.type === "container") visit(k);
      else {
        leaves += 1;
        if (!SMALL.has(k.type)) small = false;
      }
    }
  };
  visit(n);
  return small && leaves > 0 && leaves <= 4;
}

const isLoading = (n: Node): boolean =>
  n.loading === "skeleton" || n.loading === "spinner";

function itemOf(n: Node, kind: BlockKind, index: number): Item {
  const name =
    str(n.title) ?? str(n.id) ?? (kind === "kpi" ? "wert" : `n${index}`);
  return {
    id: str(n.id) ?? `${kind}-${index}`,
    kind,
    label: `${n.type === "container" ? "kpi" : n.type} · ${name.slice(0, 24)}`,
    loading: isLoading(n),
  };
}

function rowsOf(n: Node, counter: { i: number }): Row[] {
  if (n.type === "toolbar" || n.type === "menubar" || isQuestion(n)) return [];
  const kind = leafKind(n);
  if (kind) return [[itemOf(n, kind, counter.i++)]];
  if (isCard(n)) return [[itemOf(n, "kpi", counter.i++)]];
  const kids = childrenOf(n);
  const sideBySide =
    n.type === "container" &&
    (n.layout === "flow" || n.layout === "grid" || n.layout === "split");
  if (sideBySide && kids.length > 1) {
    const flat = kids.flatMap((k) => rowsOf(k, counter));
    // Only one level of side-by-side: a row of rows becomes a row of blocks.
    if (flat.every((r) => r.length === 1)) {
      const items = flat.map((r) => r[0] as Item);
      const out: Row[] = [];
      for (let i = 0; i < items.length; i += MAX_PER_ROW)
        out.push(items.slice(i, i + MAX_PER_ROW));
      return out;
    }
    return flat;
  }
  return kids.flatMap((k) => rowsOf(k, counter));
}

/** Rows to unit-box blocks: rows stack, items in a row share the width. */
export function pack(rows: Row[]): Block[] {
  const kept = rows.filter((r) => r.length > 0).slice(0, MAX_ROWS);
  if (kept.length === 0) return [];
  const gap = 0.045;
  const heights = kept.map((r) => Math.max(...r.map((it) => HEIGHT[it.kind])));
  const total = heights.reduce((a, b) => a + b, 0);
  const unit = Math.min(0.24, (1 - gap * (kept.length - 1)) / total);
  const out: Block[] = [];
  let y = 0;
  kept.forEach((row, ri) => {
    const h = (heights[ri] as number) * unit;
    const hGap = 0.022;
    // A heading or text line stays as wide as its content would be.
    const span = row.length === 1 && row[0]?.kind === "title" ? 0.46 : 1;
    const w = (span - hGap * (row.length - 1)) / row.length;
    row.forEach((it, ci) => {
      const ownH = it.kind === "title" ? Math.min(h, 0.55 * unit) : h;
      out.push({ ...it, x: ci * (w + hGap), y, w, h: ownH });
    });
    y += h + gap;
  });
  return out;
}

/** The blueprint of a real tree. Empty when there is nothing to draw yet. */
export function blueprintOf(tree: unknown): Block[] {
  if (!isNode(tree)) return [];
  return pack(rowsOf(tree, { i: 0 }));
}

/** A stable fingerprint: the forge redrafts only when the structure moves. */
export const signatureOf = (blocks: Block[]): string =>
  blocks.map((b) => `${b.id}:${b.kind}`).join("|");

// ── guesses, before the first snapshot ──

const hex = (rand: () => number): string =>
  Math.floor(rand() * 0xffff)
    .toString(16)
    .padStart(4, "0");

const guess = (
  kind: BlockKind,
  rand: () => number,
  name: string = kind,
): Item => ({
  id: `g-${kind}-${hex(rand)}`,
  kind,
  label: `${name} · ${hex(rand)}`,
  loading: true,
});

const TEMPLATES: Array<(r: () => number) => Row[]> = [
  (r) => [
    [guess("title", r, "heading")],
    [guess("kpi", r), guess("kpi", r), guess("kpi", r), guess("kpi", r)],
    [guess("table", r)],
  ],
  (r) => [
    [guess("title", r, "heading")],
    [guess("chart", r), guess("list", r)],
    [guess("table", r)],
  ],
  (r) => [
    [guess("title", r, "heading")],
    [guess("text", r)],
    [guess("kpi", r), guess("kpi", r), guess("kpi", r)],
    [guess("chart", r)],
  ],
  (r) => [
    [guess("title", r, "heading")],
    [guess("table", r), guess("chart", r)],
    [guess("control", r, "button"), guess("control", r, "button")],
  ],
  (r) => [
    [guess("title", r, "heading")],
    [guess("kpi", r), guess("kpi", r)],
    [guess("list", r), guess("chart", r), guess("list", r)],
  ],
];

/** Small deterministic PRNG, so a seed always drafts the same guess. */
export function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x9e3779b9) >>> 0;
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 0x100000000;
  };
}

export function guessLayout(seed: number): Block[] {
  const rand = rng(seed);
  const template = TEMPLATES[seed % TEMPLATES.length] ?? TEMPLATES[0];
  return pack((template as (r: () => number) => Row[])(rand));
}

/** Blocks a patch touched: the block that holds a changed node, or every
 *  block below a changed container. */
export function touchedBlocks(
  tree: unknown,
  blocks: Block[],
  changed: readonly string[],
): string[] {
  if (changed.length === 0 || blocks.length === 0) return [];
  const ids = new Set(blocks.map((b) => b.id));
  const out = new Set<string>();
  const visit = (n: Node, owner: string | undefined, hit: boolean): void => {
    const id = str(n.id);
    const own = id && ids.has(id) ? id : owner;
    const isHit = hit || (id !== undefined && changed.includes(id));
    if (isHit && own) out.add(own);
    for (const c of childrenOf(n)) visit(c, own, isHit);
  };
  if (isNode(tree)) visit(tree, undefined, false);
  return [...out];
}
