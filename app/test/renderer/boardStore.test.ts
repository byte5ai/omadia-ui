import { describe, expect, it, beforeEach } from 'vitest';
import {
  clampZoom,
  initialBoardState,
  loadBoard,
  moveApp,
  panBy,
  placeApp,
  reconcileApps,
  resizeApp,
  saveBoard,
  setAppGeom,
  zoomAt,
  MIN_ZOOM,
  MAX_ZOOM,
  type BoardState,
} from '../../src/renderer/src/store/boardStore.js';

describe('boardStore — fluid board geometry (pure reducers)', () => {
  it('clampZoom bounds to [MIN_ZOOM, MAX_ZOOM]', () => {
    expect(clampZoom(0.01)).toBe(MIN_ZOOM);
    expect(clampZoom(99)).toBe(MAX_ZOOM);
    expect(clampZoom(1)).toBe(1);
  });

  it('placeApp cascades for successive apps and centres on an anchor', () => {
    const a = placeApp({});
    const b = placeApp({ one: a });
    expect(b.x).toBeGreaterThan(a.x); // cascade offset, never on top
    const anchored = placeApp({}, { x: 1000, y: 600 });
    expect(anchored.x).toBe(1000 - anchored.w / 2);
    expect(anchored.y).toBe(600 - anchored.h / 2);
  });

  it('moveApp shifts only the target app by a board-space delta', () => {
    const s: BoardState = { pan: { x: 0, y: 0 }, zoom: 1, apps: { a: { x: 10, y: 20, w: 300, h: 200 } } };
    const moved = moveApp(s, 'a', 5, -7);
    expect(moved.apps['a']).toMatchObject({ x: 15, y: 13, w: 300, h: 200 });
    expect(moveApp(s, 'missing', 5, 5)).toBe(s); // no-op on unknown app
  });

  it('resizeApp grows the frame and clamps to a minimum size', () => {
    const s: BoardState = { pan: { x: 0, y: 0 }, zoom: 1, apps: { a: { x: 0, y: 0, w: 300, h: 200 } } };
    expect(resizeApp(s, 'a', 100, 50).apps['a']).toMatchObject({ w: 400, h: 250 });
    // shrinking below the floor clamps, never goes negative
    expect(resizeApp(s, 'a', -9999, -9999).apps['a']!.w).toBeGreaterThan(0);
  });

  it('setAppGeom merges partial geometry', () => {
    const s: BoardState = { pan: { x: 0, y: 0 }, zoom: 1, apps: { a: { x: 0, y: 0, w: 300, h: 200 } } };
    expect(setAppGeom(s, 'a', { x: 50 }).apps['a']).toMatchObject({ x: 50, y: 0, w: 300, h: 200 });
  });

  it('zoomAt keeps the board point under the cursor anchored', () => {
    const s: BoardState = { pan: { x: 0, y: 0 }, zoom: 1, apps: {} };
    const screen = { x: 200, y: 100 };
    const before = { x: screen.x / s.zoom + s.pan.x, y: screen.y / s.zoom + s.pan.y };
    const z = zoomAt(s, 2, screen);
    const after = { x: screen.x / z.zoom + z.pan.x, y: screen.y / z.zoom + z.pan.y };
    expect(after.x).toBeCloseTo(before.x, 5);
    expect(after.y).toBeCloseTo(before.y, 5);
    expect(z.zoom).toBe(2);
  });

  it('panBy moves the viewport by a zoom-corrected screen delta', () => {
    const s: BoardState = { pan: { x: 0, y: 0 }, zoom: 2, apps: {} };
    // dragging right by 100 screen px reveals content to the left → pan decreases
    expect(panBy(s, 100, 0).pan.x).toBe(-50);
  });

  it('reconcileApps adds geometry for new apps and drops vanished ones (ref-stable)', () => {
    const s: BoardState = { pan: { x: 0, y: 0 }, zoom: 1, apps: { a: { x: 0, y: 0, w: 300, h: 200 } } };
    const withB = reconcileApps(s, ['a', 'b']);
    expect(Object.keys(withB.apps).sort()).toEqual(['a', 'b']);
    const dropA = reconcileApps(withB, ['b']);
    expect(Object.keys(dropA.apps)).toEqual(['b']);
    // unchanged input returns the SAME reference (React bail-out, no render loop)
    expect(reconcileApps(dropA, ['b'])).toBe(dropA);
  });

  describe('persistence round-trip', () => {
    beforeEach(() => {
      const store = new Map<string, string>();
      // minimal localStorage shim for the node test environment
      globalThis.localStorage = {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
        removeItem: (k: string) => void store.delete(k),
        clear: () => store.clear(),
        key: () => null,
        length: 0,
      } as Storage;
    });

    it('saveBoard then loadBoard restores pan, zoom and app geometry', () => {
      const s: BoardState = { pan: { x: 40, y: -20 }, zoom: 1.5, apps: { a: { x: 10, y: 10, w: 320, h: 240 } } };
      saveBoard(s);
      const loaded = loadBoard();
      expect(loaded).toEqual(s);
    });

    it('loadBoard returns null when nothing is stored, initial state is empty', () => {
      expect(loadBoard()).toBeNull();
      expect(initialBoardState.apps).toEqual({});
    });

    it('loadBoard rejects malformed geometry and clamps zoom', () => {
      globalThis.localStorage.setItem(
        'omadia.ui-prefs.board',
        JSON.stringify({ pan: { x: 0, y: 0 }, zoom: 99, apps: { good: { x: 1, y: 2, w: 300, h: 200 }, bad: { x: 'no' } } }),
      );
      const loaded = loadBoard();
      expect(loaded?.zoom).toBe(MAX_ZOOM);
      expect(Object.keys(loaded?.apps ?? {})).toEqual(['good']);
    });
  });
});
