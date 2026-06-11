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
  };
}

function sanitizeLayout(node: unknown, known: ReadonlySet<string>): WorkspaceNode | null {
  if (typeof node !== 'object' || node === null) return null;
  const n = node as Record<string, unknown>;
  if (n['kind'] === 'leaf') {
    return typeof n['slotId'] === 'string' && known.has(n['slotId']) ? leaf(n['slotId']) : null;
  }
  if (n['kind'] === 'split' && (n['dir'] === 'columns' || n['dir'] === 'rows')) {
    const a = sanitizeLayout(n['a'], known);
    const b = sanitizeLayout(n['b'], known);
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

/** Load persisted desktops, pruning vanished canvases. Falls back to a
 *  one-time migration of the legacy single-workspace layout. */
export function loadDesktops(
  knownSlotIds: ReadonlySet<string>,
): { desktops: DesktopMeta[]; activeId: string } | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '') as {
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
          const layout = sanitizeLayout(d['layout'], knownSlotIds);
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
      knownSlotIds,
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
      STORAGE_KEY,
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
