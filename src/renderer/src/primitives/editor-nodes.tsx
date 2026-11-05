import type { ReactElement } from "react";

import { Icon } from "../components/icons";
import { arr, type Node, num, str } from "../lib/tree";

/** Editor surfaces: here the light stops at the edge. Hard corners, opaque
 *  surfaces, nothing that competes with the work. */

const clock = (ms: number): string => {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h ? `${String(h).padStart(2, "0")}:${mm}:${ss}` : `${mm}:${ss}`;
};

export function MediaNode({ node }: { node: Node }): ReactElement {
  const duration = num(node.duration) ?? 0;
  const video = node.mediaType === "video";
  return (
    <div className={`p-editor p-media ${video ? "video" : "audio"}`}>
      {video ? (
        <div className="p-media-frame" aria-hidden="true" />
      ) : (
        <Waveform />
      )}
      <div className="p-media-bar">
        <button
          type="button"
          className="icon-btn"
          aria-label="Abspielen"
          disabled
        >
          <Icon name="play" />
        </button>
        <span className="mono">00:00 / {clock(duration)}</span>
        {num(node.frameRate) ? (
          <span className="mono meta">{num(node.frameRate)} fps</span>
        ) : null}
        {num(node.sampleRate) ? (
          <span className="mono meta">
            {(num(node.sampleRate) as number) / 1000} kHz
          </span>
        ) : null}
      </div>
    </div>
  );
}

function Waveform(): ReactElement {
  const bars = Array.from(
    { length: 64 },
    (_, i) => 0.25 + Math.abs(Math.sin(i * 0.7) * Math.cos(i * 0.23)) * 0.75,
  );
  return (
    <div className="p-wave" aria-hidden="true">
      {bars.map((b, i) => (
        <span key={i} style={{ height: `${b * 100}%` }} />
      ))}
    </div>
  );
}

export function CanvasRegionNode({ node }: { node: Node }): ReactElement {
  const w = num(node.width) ?? 1;
  const h = num(node.height) ?? 1;
  return (
    <div className="p-editor p-region">
      <div className="p-region-tools" role="toolbar" aria-label="Werkzeuge">
        {(["brush", "crop", "wand"] as const).map((t, i) => (
          <button
            key={t}
            type="button"
            className={`icon-btn${i === 0 ? " active" : ""}`}
            aria-label={t}
            disabled
          >
            <Icon name={t} />
          </button>
        ))}
      </div>
      <div
        className="p-region-surface"
        style={{ aspectRatio: `${w} / ${h}` }}
      />
      <p className="p-region-meta mono">
        {w} × {h} {str(node.pixelFormat)} {str(node.colorSpace) ?? ""}{" "}
        {num(node.dpi) ? `${num(node.dpi)} dpi` : ""}
      </p>
    </div>
  );
}

export function TimelineNode({ node }: { node: Node }): ReactElement {
  const tracks = arr(node.tracks) as Array<{ id: string; kind: string }>;
  const duration = num(node.duration) ?? 30_000;
  const playhead = num(node.playhead) ?? 0;
  const timebase = node.timebase as
    { frameRate?: number; sampleRate?: number } | undefined;
  const ticks = [0, 0.33, 0.66, 1];
  const label: Record<string, string> = {
    video: "Video",
    audio: "Audio",
    marker: "Marker",
  };
  return (
    <div className="p-editor p-timeline">
      <div className="p-timeline-ruler mono">
        {ticks.map((t) => (
          <span key={t} style={{ left: `${t * 100}%` }}>
            {clock(duration * t)}
          </span>
        ))}
      </div>
      {tracks.map((t) => (
        <div key={t.id} className={`p-track ${t.kind}`}>
          <span className="p-track-label">{label[t.kind] ?? t.kind}</span>
          <span className="p-track-lane">
            <span className="p-clip" />
          </span>
        </div>
      ))}
      <span
        className="p-playhead"
        style={{
          left: `calc(88px + (100% - 88px) * ${Math.min(1, playhead / duration)})`,
        }}
      />
      <p className="p-region-meta mono">
        {timebase?.frameRate ? `${timebase.frameRate} fps` : ""}{" "}
        {timebase?.sampleRate ? `${timebase.sampleRate / 1000} kHz` : ""}
      </p>
    </div>
  );
}

export function VectorPathNode({ node }: { node: Node }): ReactElement {
  const pts = arr(node.points) as Array<{ x: number; y: number }>;
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const minX = Math.min(...xs, 0);
  const minY = Math.min(...ys, 0);
  const w = Math.max(...xs, 1) - minX || 1;
  const h = Math.max(...ys, 1) - minY || 1;
  const d =
    pts.map((p, i) => `${i ? "L" : "M"}${p.x - minX} ${p.y - minY}`).join(" ") +
    (node.closed ? " Z" : "");
  return (
    <div className="p-editor p-vector">
      <svg
        viewBox={`-8 -8 ${w + 16} ${h + 16}`}
        role="img"
        aria-label="Vektorpfad"
      >
        <path d={d} className="path" vectorEffect="non-scaling-stroke" />
        {pts.map((p, i) => (
          <rect
            key={i}
            x={p.x - minX - 3}
            y={p.y - minY - 3}
            width={6}
            height={6}
            className="handle"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
    </div>
  );
}
