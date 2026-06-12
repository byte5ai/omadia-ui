import type { DesktopLayoutWire, DesktopListEntry } from '../../../shared/protocol.js';
import type { CanvasSlotMeta } from './canvasSlots.js';
import { prefsKey } from './prefsNamespace.js';
import {
  collectSlotIds,
  leaf,
  type WorkspaceNode,
} from './workspaceStore.js';

/** Multi-desktop workspaces: a DESKTOP is a named, colored tiling layout
 *  (split tree of canvases). The sidebar lists desktops as their own
 *  category above the canvases; switching desktops swaps the whole layout
 *  while every canvas socket keeps streaming. Metadata persists client-side;
 *  LVL2 materialisation is the documented follow-up. */
export interface DesktopMeta {
  desktopId: string;
  /** user-renamable; defaults to "Desktop N" */
  name: string;
  /** index into the fixed color cycle (same palette as canvas dots) */
  color: number;
  layout: WorkspaceNode;
  /** last local mutation — drives last-write-wins merging across installs */
  updatedAt: number;
}

const STORAGE_KEY = 'omadia.ui-prefs.desktops';
/** pre-desktop single-workspace key — migrated into Desktop 1 once */
const LEGACY_WORKSPACE_KEY = 'omadia.ui-prefs.workspace';
const COLOR_CYCLE = 6;
const MAX_DESKTOPS = 24;

export function newDesktop(index: number, layout: WorkspaceNode): DesktopMeta {
  return {
    desktopId: crypto.randomUUID(),
    name: `Desktop ${index + 1}`,
    color: index % COLOR_CYCLE,
    layout,
    updatedAt: Date.now(),
  };
}

/** Validate a stored layout's SHAPE only — every leaf with a non-empty slotId is
 *  kept. We deliberately do NOT prune against the currently-known slot set here:
 *  at load/merge time that set can be transiently incomplete (canvas list not
 *  yet synced), and dropping a "not-yet-known" leaf then PERSISTING the shrunk
 *  layout silently destroys the user's desktops. A genuinely deleted canvas is
 *  removed from every desktop explicitly by `deleteCanvas` (App.tsx) — that is
 *  the only sanctioned way a pane leaves a layout. */
function sanitizeLayout(node: unknown): WorkspaceNode | null {
  if (typeof node !== 'object' || node === null) return null;
  const n = node as Record<string, unknown>;
  if (n['kind'] === 'leaf') {
    return typeof n['slotId'] === 'string' && n['slotId'].length > 0 ? leaf(n['slotId']) : null;
  }
  if (n['kind'] === 'split' && (n['dir'] === 'columns' || n['dir'] === 'rows')) {
    const a = sanitizeLayout(n['a']);
    const b = sanitizeLayout(n['b']);
    if (a && b) {
      return {
        kind: 'split',
        dir: n['dir'],
        ratio: typeof n['ratio'] === 'number' ? Math.min(Math.max(n['ratio'], 0.15), 0.85) : 0.5,
        a,
        b,
      };
    }
    return a ?? b;
  }
  return null;
}

/** Load persisted desktops (shape-validated, layouts kept intact — see
 *  sanitizeLayout for why we no longer prune against the known slot set).
 *  Falls back to a one-time migration of the legacy single-workspace layout. */
export function loadDesktops(): { desktops: DesktopMeta[]; activeId: string } | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(prefsKey(STORAGE_KEY)) ?? '') as {
      desktops?: unknown;
      activeId?: unknown;
    };
    if (Array.isArray(parsed.desktops)) {
      const desktops = parsed.desktops
        .filter(
          (d): d is Record<string, unknown> => typeof d === 'object' && d !== null,
        )
        .map((d): DesktopMeta | null => {
          if (typeof d['desktopId'] !== 'string') return null;
          const layout = sanitizeLayout(d['layout']);
          if (!layout) return null;
          return {
            desktopId: d['desktopId'],
            name:
              typeof d['name'] === 'string' && d['name'].trim()
                ? (d['name'] as string).slice(0, 48)
                : 'Desktop',
            color:
              typeof d['color'] === 'number' && Number.isInteger(d['color'])
                ? Math.min(Math.max(d['color'], 0), COLOR_CYCLE - 1)
                : 0,
            layout,
            updatedAt: typeof d['updatedAt'] === 'number' ? d['updatedAt'] : 0,
          };
        })
        .filter((d): d is DesktopMeta => d !== null)
        .slice(0, MAX_DESKTOPS);
      if (desktops.length > 0) {
        const activeId = desktops.some((d) => d.desktopId === parsed.activeId)
          ? (parsed.activeId as string)
          : (desktops[0] as DesktopMeta).desktopId;
        return { desktops, activeId };
      }
    }
  } catch {
    /* fall through to legacy migration */
  }
  // legacy migration: the single pre-desktop workspace becomes Desktop 1
  try {
    const legacy = sanitizeLayout(
      JSON.parse(localStorage.getItem(LEGACY_WORKSPACE_KEY) ?? ''),
    );
    if (legacy) {
      const d = newDesktop(0, legacy);
      return { desktops: [d], activeId: d.desktopId };
    }
  } catch {
    /* no legacy layout either */
  }
  return null;
}

export function saveDesktops(desktops: DesktopMeta[], activeId: string): void {
  try {
    localStorage.setItem(
      prefsKey(STORAGE_KEY),
      JSON.stringify({ desktops: desktops.slice(0, MAX_DESKTOPS), activeId }),
    );
  } catch {
    /* quota — desktops degrade to session-only */
  }
}

/** Every canvas referenced by any desktop (sockets to keep / to dial). */
export function allDesktopSlotIds(desktops: DesktopMeta[]): Set<string> {
  const ids = new Set<string>();
  for (const d of desktops) for (const id of collectSlotIds(d.layout)) ids.add(id);
  return ids;
}

// ── LVL2 materialisation: slotIds are device-local, the WIRE speaks
// canvasSessionIds. Translate both ways. ──

function layoutToWire(
  node: WorkspaceNode,
  sessionOf: (slotId: string) => string | undefined,
): DesktopLayoutWire | null {
  if (node.kind === 'leaf') {
    const sessionId = sessionOf(node.slotId);
    return sessionId ? { kind: 'leaf', sessionId } : null; // sessionless pane (fresh chooser) prunes
  }
  const a = layoutToWire(node.a, sessionOf);
  const b = layoutToWire(node.b, sessionOf);
  if (a && b) return { kind: 'split', dir: node.dir, ratio: node.ratio, a, b };
  return a ?? b;
}

/** Desktops → wire entries. Desktops whose layout prunes away entirely
 *  (only sessionless panes) are skipped — they re-sync once real. */
export function desktopsToWire(
  desktops: DesktopMeta[],
  slots: CanvasSlotMeta[],
): DesktopListEntry[] {
  const sessionOf = (slotId: string): string | undefined =>
    slots.find((s) => s.slotId === slotId)?.sessionId;
  return desktops
    .map((d): DesktopListEntry | null => {
      const layout = layoutToWire(d.layout, sessionOf);
      return layout
        ? { desktopId: d.desktopId, name: d.name, color: d.color, updatedAt: d.updatedAt, layout }
        : null;
    })
    .filter((d): d is DesktopListEntry => d !== null);
}

function layoutFromWire(
  node: DesktopLayoutWire,
  slotOf: (sessionId: string) => string | undefined,
): WorkspaceNode | null {
  if (node.kind === 'leaf') {
    const slotId = slotOf(node.sessionId);
    return slotId ? leaf(slotId) : null; // unknown session (deleted canvas) prunes
  }
  const a = layoutFromWire(node.a, slotOf);
  const b = layoutFromWire(node.b, slotOf);
  if (a && b) return { kind: 'split', dir: node.dir, ratio: node.ratio, a, b };
  return a ?? b;
}

/** Every sessionId referenced by a wire layout (for the "fully resolvable"
 *  check below — a wire layout that maps only partially must not overwrite a
 *  local desktop). */
function wireSessionIds(node: DesktopLayoutWire): string[] {
  return node.kind === 'leaf'
    ? [node.sessionId]
    : [...wireSessionIds(node.a), ...wireSessionIds(node.b)];
}

/** Merge the server's desktop list into the local one: last-write-wins per
 *  desktopId via `updatedAt`; server-only desktops are added (their layouts
 *  mapped sessionId→slotId — leaves whose canvas is unknown prune); local-only
 *  desktops survive (the next put uploads them); tombstoned ids stay dead. */
export function mergeWireDesktops(
  local: DesktopMeta[],
  wire: DesktopListEntry[],
  slots: CanvasSlotMeta[],
  tombstones: ReadonlySet<string>,
): DesktopMeta[] {
  const slotOf = (sessionId: string): string | undefined =>
    slots.find((s) => s.sessionId === sessionId)?.slotId;
  const byId = new Map(local.map((d) => [d.desktopId, d]));
  const merged: DesktopMeta[] = [];
  for (const w of wire) {
    if (tombstones.has(w.desktopId)) continue;
    const existing = byId.get(w.desktopId);
    if (existing && existing.updatedAt >= w.updatedAt) {
      merged.push(existing);
      continue;
    }
    const layout = layoutFromWire(w.layout, slotOf);
    if (!layout) {
      // nothing resolvable on this device (yet) — keep the local version if
      // present rather than materialising an empty desktop
      if (existing) merged.push(existing);
      continue;
    }
    // Hardening: a wire layout that references a canvas this device doesn't know
    // YET (some sessions unmappable because the canvas list is mid-sync) maps to
    // a SHRUNK layout. Never overwrite a local desktop with that lossy mapping —
    // it silently collapses the user's desktop (the bug this fixes). Keep local;
    // the next sync, once slots are complete, reconciles cleanly.
    if (existing && !wireSessionIds(w.layout).every((sid) => slotOf(sid) !== undefined)) {
      merged.push(existing);
      continue;
    }
    merged.push({
      desktopId: w.desktopId,
      name: w.name,
      color: Math.min(Math.max(w.color, 0), COLOR_CYCLE - 1),
      layout,
      updatedAt: w.updatedAt,
    });
  }
  const wireIds = new Set(wire.map((w) => w.desktopId));
  for (const d of local) {
    if (!wireIds.has(d.desktopId)) merged.push(d);
  }
  return merged.slice(0, MAX_DESKTOPS);
}
