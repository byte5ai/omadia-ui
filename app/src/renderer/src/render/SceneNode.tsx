import { useEffect, useRef, type ReactNode } from 'react';
import type { PrimitiveAction } from './PrimitiveNode.js';
import { rasterizeScene } from './scene/rasterize.js';
import { makeTokenResolver } from './scene/tokens.js';
import { clientToBuffer, hitTestScene } from './scene/hitTest.js';
import type { Scene } from './scene/types.js';

/**
 * omadia-canvas-protocol/1.1 — the `scene` primitive renderer (lumens-spec.md §3).
 *
 * Rasterises the validated draw-list onto a real canvas (Class A — local, up to
 * 60 fps, no per-frame server contact) and turns a pointer-down into a
 * `scene-hit` action carrying the topmost node id (a TargetRef). The event →
 * LX-transition wiring (running the interpreter on the hit) is layered on in
 * L3/L4; this component is the seam.
 */
interface SceneProps {
  node: { type: string; [key: string]: unknown };
  onAction: (action: PrimitiveAction) => void;
}

export function SceneNode({ node, onAction }: SceneProps): ReactNode {
  const scene = node as unknown as Scene;
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(scene.width * dpr));
    canvas.height = Math.max(1, Math.round(scene.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, scene.width, scene.height);
    rasterizeScene(ctx, scene, makeTokenResolver(canvas));
  }, [node]);

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const buf = clientToBuffer(scene, { x: e.clientX, y: e.clientY }, rect);
    const nodeId = hitTestScene(scene, buf.x, buf.y);
    if (nodeId === null) return;
    onAction({
      type: 'scene-hit',
      payload: { sceneId: scene.id, nodeId, x: buf.x, y: buf.y },
      sourceId: typeof scene.id === 'string' ? scene.id : undefined,
    });
  };

  return (
    <canvas
      ref={canvasRef}
      className="lume-scene"
      style={{ width: scene.width, height: scene.height, maxWidth: '100%', touchAction: 'none' }}
      onPointerDown={handlePointerDown}
      role="img"
      aria-label="interactive scene"
    />
  );
}
