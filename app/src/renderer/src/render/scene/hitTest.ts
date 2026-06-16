/**
 * omadia-canvas-protocol/1.1 — buffer-native scene hit-testing (lumens-spec.md §3, §4).
 *
 * Maps a buffer-native point → the stable `id` of the topmost drawn node that
 * contains it. That id is a TargetRef (`{kind:'element', elementId}`) for beams,
 * events (§4) and wires (§7). Pure geometry — no DOM — so it is unit-testable
 * and identical on every renderer. Interactive nodes inherit a ≥44pt hit area
 * regardless of drawn glyph size (Apple HIG, §4).
 */
import { MIN_HIT_TARGET, type Scene, type SceneNode, type SceneTransform } from './types.js';

interface Pt {
  x: number;
  y: number;
}

/** Inverse-map a parent-space point into a group's local space. The group
 *  transform applies translate → scale → rotate to children; we undo in
 *  reverse: untranslate, unrotate, unscale. */
function toLocal(p: Pt, t: SceneTransform | undefined): Pt {
  if (!t) return p;
  let { x, y } = { x: p.x - (t.x ?? 0), y: p.y - (t.y ?? 0) };
  const rot = t.rotate ?? 0;
  if (rot) {
    const rad = (-rot * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    [x, y] = [x * cos - y * sin, x * sin + y * cos];
  }
  const s = t.scale ?? 1;
  if (s !== 1 && s !== 0) {
    x /= s;
    y /= s;
  }
  return { x, y };
}

function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

/** Distance from point to segment [a,b]. */
function distToSegment(p: Pt, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return dist(p.x, p.y, ax, ay);
  let t = ((p.x - ax) * dx + (p.y - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return dist(p.x, p.y, ax + t * dx, ay + t * dy);
}

/** Inflate a bbox so its smaller side reaches MIN_HIT_TARGET (centred). */
function withMinTarget(min: Pt, max: Pt): { min: Pt; max: Pt } {
  const grow = (lo: number, hi: number) => {
    const need = MIN_HIT_TARGET - (hi - lo);
    if (need <= 0) return [lo, hi] as const;
    const h = need / 2;
    return [lo - h, hi + h] as const;
  };
  const [x0, x1] = grow(min.x, max.x);
  const [y0, y1] = grow(min.y, max.y);
  return { min: { x: x0, y: y0 }, max: { x: x1, y: y1 } };
}

function pointInBox(p: Pt, min: Pt, max: Pt): boolean {
  return p.x >= min.x && p.x <= max.x && p.y >= min.y && p.y <= max.y;
}

/** Does the (interactive) node contain the local-space point? */
function nodeHit(node: SceneNode, p: Pt): boolean {
  const pad = node.hitPadding ?? 0;
  switch (node.kind) {
    case 'rect':
    case 'sprite': {
      const box = withMinTarget({ x: node.x - pad, y: node.y - pad }, { x: node.x + node.w + pad, y: node.y + node.h + pad });
      return pointInBox(p, box.min, box.max);
    }
    case 'circle': {
      if (dist(p.x, p.y, node.cx, node.cy) <= node.r + pad) return true;
      const box = withMinTarget({ x: node.cx - node.r, y: node.cy - node.r }, { x: node.cx + node.r, y: node.cy + node.r });
      return pointInBox(p, box.min, box.max);
    }
    case 'line':
      // a thin line gets a modest pick slop (not the full 44pt band, which
      // would swallow neighbouring targets); the agent can widen via hitPadding.
      return distToSegment(p, node.x1, node.y1, node.x2, node.y2) <= Math.max(pad, (node.strokeW ?? 1) / 2 + 6);
    case 'path': {
      if (node.points.length === 0) return false;
      const xs = node.points.map((q) => q[0]);
      const ys = node.points.map((q) => q[1]);
      const box = withMinTarget({ x: Math.min(...xs) - pad, y: Math.min(...ys) - pad }, { x: Math.max(...xs) + pad, y: Math.max(...ys) + pad });
      return pointInBox(p, box.min, box.max);
    }
    case 'text': {
      const size = node.size ?? 14;
      const w = node.text.length * size * 0.6;
      const box = withMinTarget({ x: node.x - pad, y: node.y - size - pad }, { x: node.x + w + pad, y: node.y + pad });
      return pointInBox(p, box.min, box.max);
    }
    case 'group':
      return false; // groups are containers, not targets
  }
}

/** Walk nodes in REVERSE paint order (topmost first); return the first
 *  id-bearing node that contains the point, descending into groups. */
function walk(nodes: SceneNode[], p: Pt): string | null {
  for (let i = nodes.length - 1; i >= 0; i--) {
    const node = nodes[i]!;
    if (node.kind === 'group') {
      const childHit = walk(node.children, toLocal(p, node.transform));
      if (childHit !== null) return childHit;
      continue;
    }
    if (node.id !== undefined && nodeHit(node, p)) return node.id;
  }
  return null;
}

/** Map a buffer-native point to the topmost hit node id (or null). */
export function hitTestScene(scene: Scene, bufferX: number, bufferY: number): string | null {
  return walk(scene.draw, { x: bufferX, y: bufferY });
}

/** Convert a pointer position within the canvas element to buffer-native
 *  coordinates, undoing element-fit scaling and the scene camera. */
export function clientToBuffer(
  scene: Scene,
  pointer: Pt,
  rect: { left: number; top: number; width: number; height: number },
): Pt {
  const fitX = rect.width === 0 ? 1 : scene.width / rect.width;
  const fitY = rect.height === 0 ? 1 : scene.height / rect.height;
  let bx = (pointer.x - rect.left) * fitX;
  let by = (pointer.y - rect.top) * fitY;
  const cam = scene.camera;
  if (cam) {
    const zoom = cam.zoom ?? 1;
    bx = bx / (zoom || 1) + (cam.x ?? 0);
    by = by / (zoom || 1) + (cam.y ?? 0);
  }
  return { x: bx, y: by };
}
