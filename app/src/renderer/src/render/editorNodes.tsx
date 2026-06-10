import type { ReactNode } from 'react';
import type { PrimitiveJson } from './PrimitiveNode.js';

/** Editor-group primitives (media, canvas-region, timeline, vector-path).
 *  WT1–4 render them as honest shells: correct geometry and metadata, no
 *  playback/paint engine yet — that arrives with the editor walkthroughs. */

const fmtDuration = (ms: number): string => `${(ms / 1000).toFixed(1)}s`;

export function MediaNode({ node }: { node: PrimitiveJson }): ReactNode {
  const mediaType = (node['mediaType'] as string) ?? 'media';
  const duration = Number(node['duration'] ?? 0);
  return (
    <div className="lume-media" data-id={node['id'] as string}>
      <span className="lume-media-kind">{mediaType}</span>
      <span className="lume-media-meta">{fmtDuration(duration)}</span>
    </div>
  );
}

export function CanvasRegionNode({ node }: { node: PrimitiveJson }): ReactNode {
  const width = Number(node['width'] ?? 1);
  const height = Number(node['height'] ?? 1);
  return (
    <canvas
      className="lume-canvas-region"
      data-id={node['id'] as string}
      width={width}
      height={height}
      aria-label={`canvas region ${width}×${height}`}
    />
  );
}

export function TimelineNode({ node }: { node: PrimitiveJson }): ReactNode {
  const tracks = (node['tracks'] as Array<{ id: string; kind: string }>) ?? [];
  const duration = Number(node['duration'] ?? 0);
  const playhead = Number(node['playhead'] ?? 0);
  const playheadPct = duration > 0 ? Math.min(Math.max(playhead / duration, 0), 1) * 100 : 0;
  return (
    <div className="lume-timeline" data-id={node['id'] as string}>
      {tracks.map((t) => (
        <div key={t.id} className="lume-timeline-track" data-track-id={t.id}>
          <span className={`lume-timeline-kind lume-timeline-kind-${t.kind}`}>{t.kind}</span>
          <span className="lume-timeline-lane">
            {duration > 0 && (
              <span className="lume-timeline-playhead" style={{ left: `${playheadPct}%` }} />
            )}
          </span>
        </div>
      ))}
    </div>
  );
}

export function VectorPathNode({ node }: { node: PrimitiveJson }): ReactNode {
  const points = (node['points'] as Array<{ x: number; y: number }>) ?? [];
  if (points.length === 0) return null;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const w = Math.max(Math.max(...xs) - minX, 1);
  const h = Math.max(Math.max(...ys) - minY, 1);
  const pad = Math.max(w, h) * 0.05;
  const d =
    points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') +
    (node['closed'] === true ? ' Z' : '');
  return (
    <svg
      className="lume-vector-path"
      data-id={node['id'] as string}
      viewBox={`${minX - pad} ${minY - pad} ${w + pad * 2} ${h + pad * 2}`}
      role="img"
    >
      <path d={d} />
    </svg>
  );
}
