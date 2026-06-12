/** Workspace tiling model (issue #14): a binary split tree composes multiple
 *  canvases onto one screen. Leaf = one canvas slot; split = two children
 *  laid out as COLUMNS (side by side, "New Column") or ROWS (stacked,
 *  "New Row") with a draggable ratio. The layout persists client-side like
 *  the slot metadata does. */

export type SplitDir = 'columns' | 'rows';

export type WorkspaceNode =
  | { kind: 'leaf'; slotId: string }
  | { kind: 'split'; dir: SplitDir; ratio: number; a: WorkspaceNode; b: WorkspaceNode };

const STORAGE_KEY = 'omadia.ui-prefs.workspace';
const MIN_RATIO = 0.15;
const MAX_RATIO = 0.85;

export const leaf = (slotId: string): WorkspaceNode => ({ kind: 'leaf', slotId });

export const clampRatio = (r: number): number => Math.min(Math.max(r, MIN_RATIO), MAX_RATIO);

export function collectSlotIds(node: WorkspaceNode): string[] {
  return node.kind === 'leaf' ? [node.slotId] : [...collectSlotIds(node.a), ...collectSlotIds(node.b)];
}

/** Split the target leaf: the existing canvas keeps side A, the new one
 *  becomes side B (right of / below it). No-op if the target is missing. */
export function splitLeaf(
  node: WorkspaceNode,
  targetSlotId: string,
  dir: SplitDir,
  newSlotId: string,
): WorkspaceNode {
  if (node.kind === 'leaf') {
    return node.slotId === targetSlotId
      ? { kind: 'split', dir, ratio: 0.5, a: node, b: leaf(newSlotId) }
      : node;
  }
  return {
    ...node,
    a: splitLeaf(node.a, targetSlotId, dir, newSlotId),
    b: splitLeaf(node.b, targetSlotId, dir, newSlotId),
  };
}

/** Remove a pane; its sibling takes the space. Removing the last leaf
 *  returns null — the caller falls back to the single-canvas view. */
export function removeLeaf(node: WorkspaceNode, slotId: string): WorkspaceNode | null {
  if (node.kind === 'leaf') {
    return node.slotId === slotId ? null : node;
  }
  const a = removeLeaf(node.a, slotId);
  const b = removeLeaf(node.b, slotId);
  if (a === null) return b;
  if (b === null) return a;
  return { ...node, a, b };
}

/** Point the focused pane at another canvas (sidebar pick into the pane). */
export function replaceLeaf(
  node: WorkspaceNode,
  oldSlotId: string,
  newSlotId: string,
): WorkspaceNode {
  if (node.kind === 'leaf') {
    return node.slotId === oldSlotId ? leaf(newSlotId) : node;
  }
  return {
    ...node,
    a: replaceLeaf(node.a, oldSlotId, newSlotId),
    b: replaceLeaf(node.b, oldSlotId, newSlotId),
  };
}

/** Set a split's ratio by path ('a'/'b' steps from the root). */
export function setRatioAt(node: WorkspaceNode, path: string, ratio: number): WorkspaceNode {
  if (node.kind === 'leaf') return node;
  if (path.length === 0) return { ...node, ratio: clampRatio(ratio) };
  const step = path[0];
  return step === 'a'
    ? { ...node, a: setRatioAt(node.a, path.slice(1), ratio) }
    : { ...node, b: setRatioAt(node.b, path.slice(1), ratio) };
}

function sanitize(node: unknown, knownSlotIds: ReadonlySet<string>): WorkspaceNode | null {
  if (typeof node !== 'object' || node === null) return null;
  const n = node as Record<string, unknown>;
  if (n['kind'] === 'leaf') {
    return typeof n['slotId'] === 'string' && knownSlotIds.has(n['slotId'])
      ? leaf(n['slotId'])
      : null;
  }
  if (n['kind'] === 'split' && (n['dir'] === 'columns' || n['dir'] === 'rows')) {
    const a = sanitize(n['a'], knownSlotIds);
    const b = sanitize(n['b'], knownSlotIds);
    if (a && b) {
      return {
        kind: 'split',
        dir: n['dir'],
        ratio: clampRatio(typeof n['ratio'] === 'number' ? n['ratio'] : 0.5),
        a,
        b,
      };
    }
    return a ?? b; // a vanished canvas collapses its split
  }
  return null;
}

/** Load the persisted layout, pruning leaves whose canvas no longer exists. */
export function loadWorkspace(knownSlotIds: ReadonlySet<string>): WorkspaceNode | null {
  try {
    return sanitize(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? ''), knownSlotIds);
  } catch {
    return null;
  }
}

export function saveWorkspace(node: WorkspaceNode): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(node));
  } catch {
    /* quota — layout degrades to session-only */
  }
}
