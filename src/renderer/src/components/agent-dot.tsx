import { type ReactElement, useEffect, useRef, useState } from "react";

import { useStore } from "../lib/create-store";
import { openQuestion } from "../lib/tree";
import { type CanvasesState, canvasStore } from "../state/canvases";
import {
  activeDesktop,
  leaves,
  type WorkspaceState,
  workspaceStore,
} from "../state/workspace";

/**
 * The dot is omadia. There is always exactly one. It rests in the logo and
 * travels in straight lines to wherever omadia is working: the start of your
 * sentence while you type, the place a view is about to appear, the cell it
 * is checking, the question it is waiting on. A soft glow only while omadia
 * computes; colour only as status, and only for a moment.
 */

interface Target {
  key: string;
  glow: boolean;
  tone?: "verified" | "masked" | "blocked";
}

const FLASH_MS = 1400;

function pickTarget(c: CanvasesState, w: WorkspaceState, now: number): Target {
  if (w.overlay.kind === "command") return { key: "command", glow: false };
  const desktop = activeDesktop(w);
  const visible = new Set(leaves(desktop?.layout ?? null));
  const busy = c.order.filter(
    (k) => (c.runtime[k]?.activity ?? "idle") !== "idle",
  );
  const ranked = [
    ...busy.filter((k) => k === desktop?.focused),
    ...busy.filter((k) => k !== desktop?.focused && visible.has(k)),
    ...busy.filter((k) => !visible.has(k)),
  ];
  const flashSlot = c.order.find((k) => {
    const f = c.runtime[k]?.flash;
    return f !== undefined && now - f.at < FLASH_MS;
  });
  const tone = flashSlot ? c.runtime[flashSlot]?.flash?.tone : undefined;
  const slot = ranked[0];
  if (!slot) {
    const waiting = waitingSlot(c, desktop?.focused, visible);
    if (waiting) {
      return {
        key: visible.has(waiting)
          ? `pane:${waiting}:question`
          : `nav:${waiting}`,
        glow: false,
        ...(tone ? { tone } : {}),
      };
    }
    return { key: "logo", glow: false, ...(tone ? { tone } : {}) };
  }
  const rt = c.runtime[slot];
  const pending = rt?.canvas.turnPending ?? false;
  const withTone = tone ? { tone } : {};
  if (!visible.has(slot))
    return { key: `nav:${slot}`, glow: pending, ...withTone };
  if (rt?.activity === "working" && rt.workingOn) {
    return {
      key: `pane:${slot}:node:${rt.workingOn}`,
      glow: pending,
      ...withTone,
    };
  }
  return { key: `pane:${slot}:center`, glow: pending, ...withTone };
}

/** A canvas where omadia waits on your answer: the focused one first. */
function waitingSlot(
  c: CanvasesState,
  focused: string | undefined,
  visible: Set<string>,
): string | undefined {
  const waits = (k: string): boolean =>
    openQuestion(c.runtime[k]?.canvas.tree, c.metas[k]?.answered) !== undefined;
  const ordered = [
    ...(focused ? [focused] : []),
    ...c.order.filter((k) => k !== focused && visible.has(k)),
    ...c.order.filter((k) => !visible.has(k)),
  ];
  return ordered.find(waits);
}

function resolve(
  key: string,
): { el: Element; size: number; edge: boolean } | null {
  const node = /^pane:(.+?):node:(.+)$/.exec(key);
  if (node) {
    const el = document.querySelector(
      `[data-pane="${CSS.escape(node[1] as string)}"] [data-node-id="${CSS.escape(node[2] as string)}"]`,
    );
    if (el && (el as HTMLElement).offsetParent !== null) {
      const dense = el.closest("table, .p-list, .p-tree") !== null;
      return { el, size: dense ? 4 : 5, edge: true };
    }
    const pane = key.replace(/:node:.+$/, ":center");
    return resolve(pane);
  }
  const el = document.querySelector(`[data-dot-anchor="${CSS.escape(key)}"]`);
  if (!el || (el as HTMLElement).offsetParent === null) return null;
  const size = Number(
    (el as HTMLElement).dataset.dotSize ?? (key.endsWith(":center") ? 8 : 5),
  );
  return { el, size, edge: false };
}

interface Point {
  x: number;
  y: number;
  size: number;
}

export function AgentDot(): ReactElement {
  const canvases = useStore(canvasStore, (s) => s);
  const workspace = useStore(workspaceStore, (s) => s);
  const [now, setNow] = useState(() => Date.now());
  const target = pickTarget(canvases, workspace, now);
  const dotRef = useRef<HTMLDivElement>(null);
  const last = useRef<Point | null>(null);
  const lastKey = useRef<string>("");
  const [trail, setTrail] = useState<{
    from: Point;
    to: Point;
    id: number;
  } | null>(null);

  // Re-evaluate flashes when they expire.
  useEffect(() => {
    const t = setTimeout(
      () => setNow(Date.now()),
      target.tone ? FLASH_MS : 2000,
    );
    return () => clearTimeout(t);
  }, [target.tone, now]);

  useEffect(() => {
    let frame = 0;
    const tick = (): void => {
      frame = requestAnimationFrame(tick);
      const found = resolve(target.key) ?? resolve("logo");
      const dot = dotRef.current;
      if (!found || !dot) return;
      const r = found.el.getBoundingClientRect();
      const point: Point = found.edge
        ? {
            x: r.left - 9,
            y: r.top + Math.min(r.height / 2, 22),
            size: found.size,
          }
        : {
            x: r.left + r.width / 2,
            y: r.top + r.height / 2,
            size: found.size,
          };
      const prev = last.current;
      if (
        prev &&
        Math.abs(prev.x - point.x) < 0.5 &&
        Math.abs(prev.y - point.y) < 0.5 &&
        prev.size === point.size
      ) {
        return;
      }
      const moved = lastKey.current !== target.key;
      if (
        moved &&
        prev &&
        Math.hypot(prev.x - point.x, prev.y - point.y) > 24
      ) {
        setTrail({ from: prev, to: point, id: Date.now() });
      }
      lastKey.current = target.key;
      last.current = point;
      dot.style.setProperty("--dot-size", `${point.size}px`);
      dot.style.transform = `translate(${point.x - point.size / 2}px, ${point.y - point.size / 2}px)`;
      // The first placement and re-measurements jump; only a change of place travels.
      dot.classList.toggle("instant", !moved || prev === null);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target.key]);

  return (
    <>
      {trail ? <Trail key={trail.id} from={trail.from} to={trail.to} /> : null}
      <div
        ref={dotRef}
        className={`agent-dot${target.glow ? " glow" : ""}${target.tone ? ` tone-${target.tone}` : ""}`}
        aria-hidden="true"
      />
    </>
  );
}

/** The trail only ever shows what is done: it fades once the move ends. */
function Trail({ from, to }: { from: Point; to: Point }): ReactElement {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  return (
    <div
      className="agent-trail"
      aria-hidden="true"
      style={{
        width: length,
        transform: `translate(${from.x}px, ${from.y - 0.75}px) rotate(${angle}deg)`,
      }}
    />
  );
}
