/** Helpers that read the untyped canvas tree. The validator guarantees shape. */

export type Node = Record<string, unknown> & { type: string; id?: string };

export const isNode = (v: unknown): v is Node =>
  typeof v === "object" &&
  v !== null &&
  typeof (v as { type?: unknown }).type === "string";

export const str = (v: unknown): string | undefined =>
  typeof v === "string" ? v : undefined;

export const num = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? v : undefined;

export const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** Direct child nodes of any container-like primitive. */
export function childrenOf(node: Node): Node[] {
  const out: Node[] = [];
  for (const c of arr(node.children)) if (isNode(c)) out.push(c);
  if (node.type === "pane" && isNode(node.container))
    out.unshift(node.container);
  if (node.type === "tabs") {
    for (const t of arr(node.tabs)) {
      const child = (t as { child?: unknown }).child;
      if (isNode(child)) out.push(child);
    }
  }
  return out;
}

export function walk(
  root: unknown,
  visit: (node: Node) => boolean | void,
): void {
  if (!isNode(root)) return;
  if (visit(root) === false) return;
  for (const c of childrenOf(root)) walk(c, visit);
}

export function findNode(
  root: unknown,
  match: (node: Node) => boolean,
): Node | undefined {
  let found: Node | undefined;
  walk(root, (n) => {
    if (found) return false;
    if (match(n)) {
      found = n;
      return false;
    }
    return undefined;
  });
  return found;
}

/** Title for the pane bar and the sidebar: first container title or heading. */
export function deriveTitle(tree: unknown): string | undefined {
  const node = findNode(
    tree,
    (n) =>
      (n.type === "container" &&
        typeof n.title === "string" &&
        n.title !== "") ||
      (n.type === "heading" && typeof n.content === "string"),
  );
  const raw = node ? (str(node.title) ?? str(node.content)) : undefined;
  return raw ? clip(stripMarkdown(raw), 48) : undefined;
}

export const clip = (s: string, max: number): string =>
  s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;

export const stripMarkdown = (s: string): string => s.replace(/\*\*|__|`/g, "");

/** After a turn settles nothing may keep pulsing as a skeleton. */
export function settleLoading(tree: unknown): unknown {
  if (Array.isArray(tree)) return tree.map(settleLoading);
  if (typeof tree !== "object" || tree === null) return tree;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(tree)) {
    out[k] = k === "loading" && v !== "none" ? "none" : settleLoading(v);
  }
  return out;
}

/** The first node still waiting for content: where omadia works next. */
export function firstLoadingId(tree: unknown): string | undefined {
  return findNode(
    tree,
    (n) =>
      typeof n.id === "string" &&
      (n.loading === "skeleton" || n.loading === "spinner"),
  )?.id;
}

/** A root toolbar becomes the pane menu (visual rule: root toolbar = pane menu). */
export function rootToolbar(tree: unknown): Node | undefined {
  if (!isNode(tree) || tree.type !== "container") return undefined;
  return arr(tree.children).find(
    (c): c is Node => isNode(c) && c.type === "toolbar",
  );
}

/** omadia's questions back (canvas_publish_choice) arrive as a `choice` the
 *  core appends with the id `choice_<8 hex>`. They steer how the view gets
 *  built, so they are asked beside the canvas, not inside it. */
export const isQuestion = (n: Node): boolean =>
  n.type === "choice" &&
  typeof n.id === "string" &&
  /^choice_[0-9a-f]{8}$/.test(n.id);

/** The question omadia is waiting on: the newest one not yet answered. */
export function openQuestion(
  tree: unknown,
  answered: readonly string[] = [],
): Node | undefined {
  let open: Node | undefined;
  walk(tree, (n) => {
    if (isQuestion(n) && !answered.includes(n.id as string)) open = n;
  });
  return open;
}

/** The tree as the canvas shows it: without omadia's questions. */
export function withoutQuestions(tree: unknown): unknown {
  if (!isNode(tree)) return tree;
  let changed = false;
  const strip = (v: unknown): unknown => {
    const next = withoutQuestions(v);
    if (next !== v) changed = true;
    return next;
  };
  const out: Node = { ...tree };
  if (Array.isArray(tree.children)) {
    const kept = tree.children.filter((c) => !(isNode(c) && isQuestion(c)));
    if (kept.length !== tree.children.length) changed = true;
    out.children = kept.map(strip);
  }
  if (isNode(tree.container)) out.container = strip(tree.container);
  if (tree.type === "tabs") {
    out.tabs = arr(tree.tabs).map((t) => {
      const tab = t as { child?: unknown };
      return isNode(tab.child) ? { ...tab, child: strip(tab.child) } : t;
    });
  }
  return changed ? out : tree;
}

export function treeSize(tree: unknown): number {
  try {
    return JSON.stringify(tree).length;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

export function collectSuggestions(tree: unknown): SuggestedAction[] {
  const out: SuggestedAction[] = [];
  walk(tree, (n) => {
    for (const s of arr(n.suggestedActions)) {
      const o = s as Partial<SuggestedAction>;
      if (typeof o.id === "string" && typeof o.label === "string") {
        out.push({ ...(o as SuggestedAction), containerId: n.id });
      }
    }
  });
  return out;
}

export interface SuggestedAction {
  id: string;
  label: string;
  effect: string;
  target: unknown;
  prompt?: string;
  validUntilRevision?: string;
  containerId?: string;
}
