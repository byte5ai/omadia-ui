import { describe, expect, it } from 'vitest';
import { hitTestScene, clientToBuffer } from '../../src/renderer/src/render/scene/hitTest.js';
import { rasterizeScene, type Ctx2D } from '../../src/renderer/src/render/scene/rasterize.js';
import type { Scene } from '../../src/renderer/src/render/scene/types.js';

describe('scene hit-testing (buffer-native → TargetRef)', () => {
  const scene: Scene = {
    type: 'scene',
    width: 200,
    height: 200,
    draw: [
      { kind: 'rect', x: 0, y: 0, w: 100, h: 100, fill: 'surface', id: 'bg' },
      { kind: 'circle', cx: 50, cy: 50, r: 10, fill: 'accent', id: 'dot' },
      { kind: 'rect', x: 0, y: 0, w: 100, h: 100, fill: 'transparent' }, // no id ⇒ not a target
    ],
  };

  it('returns the topmost id-bearing node containing the point', () => {
    expect(hitTestScene(scene, 50, 50)).toBe('dot'); // circle painted above bg
  });
  it('falls through to a lower node when the top one misses', () => {
    expect(hitTestScene(scene, 90, 90)).toBe('bg');
  });
  it('returns null when nothing is hit', () => {
    expect(hitTestScene(scene, 150, 150)).toBeNull();
  });
  it('a tiny node still gets a ≥44pt hit area', () => {
    const tiny: Scene = { type: 'scene', width: 100, height: 100, draw: [{ kind: 'circle', cx: 50, cy: 50, r: 1, fill: 'accent', id: 'pip' }] };
    expect(hitTestScene(tiny, 65, 50)).toBe('pip'); // 15px away — inside the 44pt box
    expect(hitTestScene(tiny, 90, 90)).toBeNull();
  });
  it('descends into a translated group (local-space geometry)', () => {
    const grouped: Scene = {
      type: 'scene', width: 200, height: 200,
      draw: [{ kind: 'group', transform: { x: 100, y: 100 }, children: [{ kind: 'rect', x: 0, y: 0, w: 20, h: 20, fill: 'accent', id: 'inner' }] }],
    };
    expect(hitTestScene(grouped, 110, 110)).toBe('inner'); // world (110,110) → local (10,10)
    expect(hitTestScene(grouped, 10, 10)).toBeNull();
  });
});

describe('clientToBuffer (pointer → buffer coords)', () => {
  it('undoes element-fit scaling', () => {
    const scene: Scene = { type: 'scene', width: 100, height: 100, draw: [] };
    const buf = clientToBuffer(scene, { x: 100, y: 50 }, { left: 0, top: 0, width: 200, height: 100 });
    expect(buf).toEqual({ x: 50, y: 50 }); // canvas shown 2× wide
  });
  it('undoes the scene camera (zoom + pan)', () => {
    const scene: Scene = { type: 'scene', width: 100, height: 100, camera: { x: 10, y: 0, zoom: 2 }, draw: [] };
    const buf = clientToBuffer(scene, { x: 20, y: 0 }, { left: 0, top: 0, width: 100, height: 100 });
    expect(buf.x).toBeCloseTo(20); // 20 / 2 + 10
  });
});

describe('scene rasteriser (mock ctx, no DOM)', () => {
  function mockCtx() {
    const calls: string[] = [];
    const ctx: Ctx2D = {
      save: () => calls.push('save'),
      restore: () => calls.push('restore'),
      translate: (x, y) => calls.push(`translate(${x},${y})`),
      scale: (x, y) => calls.push(`scale(${x},${y})`),
      rotate: (a) => calls.push(`rotate(${a.toFixed(3)})`),
      beginPath: () => calls.push('beginPath'),
      moveTo: (x, y) => calls.push(`moveTo(${x},${y})`),
      lineTo: (x, y) => calls.push(`lineTo(${x},${y})`),
      closePath: () => calls.push('closePath'),
      arc: (x, y, r) => calls.push(`arc(${x},${y},${r})`),
      rect: (x, y, w, h) => calls.push(`rect(${x},${y},${w},${h})`),
      fill: () => calls.push(`fill:${ctx.fillStyle as string}`),
      stroke: () => calls.push(`stroke:${ctx.strokeStyle as string}@${ctx.lineWidth}`),
      fillText: (t, x, y) => calls.push(`text:${t}@${x},${y}:${ctx.fillStyle as string}`),
      drawImage: () => calls.push('drawImage'),
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      font: '',
    };
    return { ctx, calls };
  }
  const resolve = (t: string | undefined) => (t === undefined || t === 'transparent' ? 'transparent' : `c:${t}`);

  it('draws a filled+stroked rect with resolved theme tokens', () => {
    const { ctx, calls } = mockCtx();
    const scene: Scene = { type: 'scene', width: 50, height: 50, draw: [{ kind: 'rect', x: 1, y: 2, w: 3, h: 4, fill: 'accent', stroke: 'text', strokeW: 2 }] };
    rasterizeScene(ctx, scene, resolve);
    expect(calls).toContain('rect(1,2,3,4)');
    expect(calls).toContain('fill:c:accent');
    expect(calls).toContain('stroke:c:text@2');
  });
  it('applies the camera (scale + translate) around the draw-list', () => {
    const { ctx, calls } = mockCtx();
    const scene: Scene = { type: 'scene', width: 50, height: 50, camera: { x: 5, y: 6, zoom: 2 }, draw: [{ kind: 'circle', cx: 0, cy: 0, r: 1, fill: 'accent' }] };
    rasterizeScene(ctx, scene, resolve);
    expect(calls[0]).toBe('save');
    expect(calls).toContain('scale(2,2)');
    expect(calls).toContain('translate(-5,-6)');
    expect(calls[calls.length - 1]).toBe('restore');
  });
  it('a transparent fill issues no fill op', () => {
    const { ctx, calls } = mockCtx();
    const scene: Scene = { type: 'scene', width: 9, height: 9, draw: [{ kind: 'rect', x: 0, y: 0, w: 1, h: 1, fill: 'transparent' }] };
    rasterizeScene(ctx, scene, resolve);
    expect(calls.some((c) => c.startsWith('fill:'))).toBe(false);
  });
  it('a sprite with no resolved image draws an on-theme placeholder', () => {
    const { ctx, calls } = mockCtx();
    const scene: Scene = { type: 'scene', width: 9, height: 9, draw: [{ kind: 'sprite', x: 0, y: 0, w: 4, h: 4, dataRef: { id: 'pixel-deadbeefdeadbeef' } }] };
    rasterizeScene(ctx, scene, resolve);
    expect(calls).toContain('rect(0,0,4,4)');
    expect(calls.some((c) => c === 'drawImage')).toBe(false);
  });
});
