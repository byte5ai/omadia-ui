/** Fluid-board model (Miro idiom): the whole workspace is one infinite,
 *  pannable, zoomable surface. Each former "canvas" (slot) becomes an APP —
 *  a free-floating frame placed at board-space geometry `{x,y,w,h}`. The
 *  board itself is PURE Tier-1 client view-state (CONCEPT Authority Model):
 *  pan, zoom and per-app geometry never produce a server turn and never touch
 *  the primitive tree. Geometry + viewport persist client-side, namespaced per
 *  instance like the slot metadata. App identity stays `slotId` — the wire
 *  protocol (canvasSessionId) is untouched; "app" is the surface concept. */

import { prefsKey } from './prefsNamespace.js';

/** One app's placement in board space (board pixels, independent of zoom/pan). */
export interface AppGeom {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface BoardViewport {
  /** board-space pixel that sits at the screen origin, before zoom */
  pan: { x: number; y: number };
  zoom: number;
}

export interface BoardState extends BoardViewport {
  /** per-app geometry, keyed by slotId */
  apps: Record<string, AppGeom>;
}

const STORAGE_KEY = 'omadia.ui-prefs.board';

export const MIN_ZOOM = 0.2;
export const MAX_ZOOM = 3.0;

/** Default frame size when an app first lands on the board. */
export const DEFAULT_APP_W = 560;
export const DEFAULT_APP_H = 440;
const MIN_APP_W = 280;
const MIN_APP_H = 200;
/** Cascade offset so a run of new apps never lands exactly on top of itself. */
const CASCADE = 48;

export const initialBoardState: BoardState = { pan: { x: 0, y: 0 }, zoom: 1, apps: {} };

export const clampZoom = (z: number): number => Math.min(Math.max(z, MIN_ZOOM), MAX_ZOOM);

/** A non-overlapping default slot for the Nth app (simple cascade). When a
 *  board-space anchor is given (double-click point) the app is centred there. */
export function placeApp(
  apps: Record<string, AppGeom>,
  anchor?: { x: number; y: number },
): AppGeom {
  if (anchor) {
    return { x: anchor.x - DEFAULT_APP_W / 2, y: anchor.y - DEFAULT_APP_H / 2, w: DEFAULT_APP_W, h: DEFAULT_APP_H };
  }
  const n = Object.keys(apps).length;
  return {
    x: 80 + (n % 6) * CASCADE,
    y: 80 + (n % 6) * CASCADE,
    w: DEFAULT_APP_W,
    h: DEFAULT_APP_H,
  };
}

/** Ensure every slotId has geometry; new ones get a cascaded default. Pure. */
export function reconcileApps(state: BoardState, slotIds: readonly string[]): BoardState {
  const known = new Set(slotIds);
  let apps = state.apps;
  let changed = false;
  // add geometry for apps that don't have it yet
  for (const id of slotIds) {
    if (!apps[id]) {
      if (!changed) {
        apps = { ...apps };
        changed = true;
      }
      apps[id] = placeApp(apps);
    }
  }
  // drop geometry for apps that no longer exist
  for (const id of Object.keys(apps)) {
    if (!known.has(id)) {
      if (!changed) {
        apps = { ...apps };
        changed = true;
      }
      delete apps[id];
    }
  }
  return changed ? { ...state, apps } : state;
}

/** Move an app by a board-space delta. Pure. */
export function moveApp(state: BoardState, slotId: string, dx: number, dy: number): BoardState {
  const g = state.apps[slotId];
  if (!g) return state;
  return { ...state, apps: { ...state.apps, [slotId]: { ...g, x: g.x + dx, y: g.y + dy } } };
}

/** Set an app's absolute geometry (clamped to a minimum size). Pure. */
export function setAppGeom(state: BoardState, slotId: string, geom: Partial<AppGeom>): BoardState {
  const g = state.apps[slotId];
  if (!g) return state;
  const next: AppGeom = {
    x: geom.x ?? g.x,
    y: geom.y ?? g.y,
    w: Math.max(geom.w ?? g.w, MIN_APP_W),
    h: Math.max(geom.h ?? g.h, MIN_APP_H),
  };
  return { ...state, apps: { ...state.apps, [slotId]: next } };
}

/** Resize an app by a board-space delta on its bottom-right corner. Pure. */
export function resizeApp(state: BoardState, slotId: string, dw: number, dh: number): BoardState {
  const g = state.apps[slotId];
  if (!g) return state;
  return setAppGeom(state, slotId, { w: g.w + dw, h: g.h + dh });
}

/** Zoom toward a screen point (so the cursor stays anchored). Pure.
 *  `screen` is the pointer position relative to the board element. */
export function zoomAt(state: BoardState, factor: number, screen: { x: number; y: number }): BoardState {
  const zoom = clampZoom(state.zoom * factor);
  if (zoom === state.zoom) return state;
  // board-space point under the cursor must map to the same screen point.
  // screen = (board - pan) * zoom  =>  board = screen/zoom + pan
  const boardX = screen.x / state.zoom + state.pan.x;
  const boardY = screen.y / state.zoom + state.pan.y;
  return {
    ...state,
    zoom,
    pan: { x: boardX - screen.x / zoom, y: boardY - screen.y / zoom },
  };
}

/** Pan by a screen-space delta. Pure. */
export function panBy(state: BoardState, dxScreen: number, dyScreen: number): BoardState {
  return {
    ...state,
    pan: { x: state.pan.x - dxScreen / state.zoom, y: state.pan.y - dyScreen / state.zoom },
  };
}

function sanitizeGeom(v: unknown): AppGeom | null {
  if (typeof v !== 'object' || v === null) return null;
  const g = v as Record<string, unknown>;
  const nums = ['x', 'y', 'w', 'h'].every((k) => typeof g[k] === 'number' && Number.isFinite(g[k]));
  if (!nums) return null;
  return {
    x: g['x'] as number,
    y: g['y'] as number,
    w: Math.max(g['w'] as number, MIN_APP_W),
    h: Math.max(g['h'] as number, MIN_APP_H),
  };
}

export function loadBoard(): BoardState | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(prefsKey(STORAGE_KEY)) ?? '') as Record<string, unknown>;
    const rawApps = parsed['apps'];
    if (typeof rawApps !== 'object' || rawApps === null) return null;
    const apps: Record<string, AppGeom> = {};
    for (const [id, g] of Object.entries(rawApps as Record<string, unknown>)) {
      const geom = sanitizeGeom(g);
      if (geom) apps[id] = geom;
    }
    const pan = parsed['pan'] as { x?: unknown; y?: unknown } | undefined;
    return {
      pan: {
        x: typeof pan?.x === 'number' ? pan.x : 0,
        y: typeof pan?.y === 'number' ? pan.y : 0,
      },
      zoom: typeof parsed['zoom'] === 'number' ? clampZoom(parsed['zoom']) : 1,
      apps,
    };
  } catch {
    return null;
  }
}

export function saveBoard(state: BoardState): void {
  try {
    localStorage.setItem(prefsKey(STORAGE_KEY), JSON.stringify(state));
  } catch {
    /* quota / private-mode — board degrades to session-only */
  }
}
