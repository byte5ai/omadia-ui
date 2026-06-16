/**
 * omadia-canvas-protocol/1.1 — scene draw-list rasteriser (lumens-spec.md §3).
 *
 * Walks the closed shape vocabulary and issues canvas2d ops. No agent-supplied
 * 2d/webgl script is ever executed (§0.1) — only this shipped interpreter walks
 * the validated draw-list. Colours resolve through the Lume token resolver
 * (tokens.ts), so a scene is always on-theme. Coordinates are buffer-native; the
 * scene camera maps buffer → screen here, the inverse of clientToBuffer.
 */
import { REGISTER_TO_CSSVAR } from './tokenMap.js';
import type { TokenResolver } from './tokens.js';
import type { Scene, SceneNode, SceneTransform } from './types.js';

/** The canvas2d subset the rasteriser uses — kept minimal so tests can pass a
 *  recording mock (jsdom has no real 2d context). */
export interface Ctx2D {
  save(): void;
  restore(): void;
  translate(x: number, y: number): void;
  scale(x: number, y: number): void;
  rotate(angle: number): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  closePath(): void;
  arc(x: number, y: number, r: number, start: number, end: number): void;
  rect(x: number, y: number, w: number, h: number): void;
  roundRect?(x: number, y: number, w: number, h: number, r: number | DOMPointInit | (number | DOMPointInit)[]): void;
  fill(): void;
  stroke(): void;
  fillText(text: string, x: number, y: number): void;
  drawImage(image: CanvasImageSource, dx: number, dy: number, dw: number, dh: number): void;
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  font: string;
}

export interface RasterizeOptions {
  /** content-addressed sprite images, keyed by DataRef id; missing ⇒ placeholder. */
  images?: Map<string, CanvasImageSource>;
  /** resolves a text register to a font-family value (defaults to Lume vars). */
  fontFamily?: (register: string | undefined) => string;
  /** device pixel ratio already applied to the context, if any (default 1). */
}

function applyTransform(ctx: Ctx2D, t: SceneTransform | undefined): void {
  if (!t) return;
  if (t.x || t.y) ctx.translate(t.x ?? 0, t.y ?? 0);
  if (t.rotate) ctx.rotate((t.rotate * Math.PI) / 180);
  if (t.scale && t.scale !== 1) ctx.scale(t.scale, t.scale);
}

function pathRoundRect(ctx: Ctx2D, x: number, y: number, w: number, h: number, r: number): void {
  if (typeof ctx.roundRect === 'function') {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    return;
  }
  const rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.arc(x + w - rr, y + rr, rr, -Math.PI / 2, 0);
  ctx.lineTo(x + w, y + h - rr);
  ctx.arc(x + w - rr, y + h - rr, rr, 0, Math.PI / 2);
  ctx.lineTo(x + rr, y + h);
  ctx.arc(x + rr, y + h - rr, rr, Math.PI / 2, Math.PI);
  ctx.lineTo(x, y + rr);
  ctx.arc(x + rr, y + rr, rr, Math.PI, (3 * Math.PI) / 2);
  ctx.closePath();
}

function fillStroke(ctx: Ctx2D, resolve: TokenResolver, fill?: string, stroke?: string, strokeW?: number): void {
  if (fill) {
    const c = resolve(fill);
    if (c !== 'transparent') {
      ctx.fillStyle = c;
      ctx.fill();
    }
  }
  if (stroke) {
    const c = resolve(stroke);
    if (c !== 'transparent') {
      ctx.strokeStyle = c;
      ctx.lineWidth = strokeW ?? 1;
      ctx.stroke();
    }
  }
}

function drawNode(ctx: Ctx2D, node: SceneNode, resolve: TokenResolver, opts: RasterizeOptions): void {
  switch (node.kind) {
    case 'rect': {
      if (node.r && node.r > 0) pathRoundRect(ctx, node.x, node.y, node.w, node.h, node.r);
      else {
        ctx.beginPath();
        ctx.rect(node.x, node.y, node.w, node.h);
      }
      fillStroke(ctx, resolve, node.fill, node.stroke, node.strokeW);
      break;
    }
    case 'circle': {
      ctx.beginPath();
      ctx.arc(node.cx, node.cy, node.r, 0, Math.PI * 2);
      fillStroke(ctx, resolve, node.fill, node.stroke, node.strokeW);
      break;
    }
    case 'line': {
      ctx.beginPath();
      ctx.moveTo(node.x1, node.y1);
      ctx.lineTo(node.x2, node.y2);
      const c = resolve(node.stroke);
      if (c !== 'transparent') {
        ctx.strokeStyle = c;
        ctx.lineWidth = node.strokeW ?? 1;
        ctx.stroke();
      }
      break;
    }
    case 'path': {
      if (node.points.length === 0) break;
      ctx.beginPath();
      ctx.moveTo(node.points[0]![0], node.points[0]![1]);
      for (let i = 1; i < node.points.length; i++) ctx.lineTo(node.points[i]![0], node.points[i]![1]);
      if (node.closed) ctx.closePath();
      fillStroke(ctx, resolve, node.fill, node.stroke, node.strokeW);
      break;
    }
    case 'sprite': {
      const img = opts.images?.get(node.dataRef.id);
      if (img) {
        ctx.drawImage(img, node.x, node.y, node.w, node.h);
      } else {
        // asset not yet resolved (transport is L5) — draw an on-theme placeholder.
        ctx.beginPath();
        ctx.rect(node.x, node.y, node.w, node.h);
        fillStroke(ctx, resolve, 'surface-sunken', 'text-faint', 1);
      }
      break;
    }
    case 'text': {
      const size = node.size ?? 14;
      const family = (opts.fontFamily ?? defaultFontFamily)(node.register);
      ctx.font = `${node.weight ?? 400} ${size}px ${family}`;
      const c = resolve(node.fill ?? 'text');
      ctx.fillStyle = c === 'transparent' ? resolve('text') : c;
      ctx.fillText(node.text, node.x, node.y);
      break;
    }
    case 'group': {
      ctx.save();
      applyTransform(ctx, node.transform);
      for (const child of node.children) drawNode(ctx, child, resolve, opts);
      ctx.restore();
      break;
    }
  }
}

function defaultFontFamily(register: string | undefined): string {
  const cssVar = REGISTER_TO_CSSVAR[register ?? 'prose'] ?? '--lume-font-prose';
  return `var(${cssVar}, sans-serif)`;
}

/** Rasterise a whole scene into the 2d context. Applies the camera, then the
 *  draw-list in paint order. */
export function rasterizeScene(ctx: Ctx2D, scene: Scene, resolve: TokenResolver, opts: RasterizeOptions = {}): void {
  ctx.save();
  const cam = scene.camera;
  if (cam) {
    const zoom = cam.zoom ?? 1;
    if (zoom !== 1) ctx.scale(zoom, zoom);
    if (cam.x || cam.y) ctx.translate(-(cam.x ?? 0), -(cam.y ?? 0));
  }
  for (const node of scene.draw) drawNode(ctx, node, resolve, opts);
  ctx.restore();
}
