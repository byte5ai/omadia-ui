import { type ReactElement, useSyncExternalStore } from "react";

import type { Zone } from "../lib/time-zone";

/**
 * Time-zone values become live clocks: a table asked for "clocks" can only
 * carry text, so a cell that names a zone in a time column keeps ticking.
 * One shared one-second tick drives every clock on screen.
 */

let now = Date.now();
let timer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!timer) {
    timer = setInterval(() => {
      now = Date.now();
      listeners.forEach((l) => l());
    }, 1000);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

function partsIn(zone: Zone, at: number): { h: number; m: number; s: number } {
  if (zone.kind === "offset") {
    const d = new Date(at + zone.minutes * 60_000);
    return { h: d.getUTCHours(), m: d.getUTCMinutes(), s: d.getUTCSeconds() };
  }
  const parts = new Intl.DateTimeFormat("de-DE", {
    timeZone: zone.name,
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hourCycle: "h23",
  }).formatToParts(at);
  const get = (t: string): number =>
    Number(parts.find((p) => p.type === t)?.value ?? 0);
  return { h: get("hour"), m: get("minute"), s: get("second") };
}

const pad = (n: number): string => String(n).padStart(2, "0");

export function LiveClock({
  zone,
  label,
  size = "small",
}: {
  zone: Zone;
  label?: string;
  size?: "small" | "large";
}): ReactElement {
  const at = useSyncExternalStore(subscribe, () => now);
  const { h, m, s } = partsIn(zone, at);
  const hourAngle = ((h % 12) + m / 60) * 30;
  const minuteAngle = (m + s / 60) * 6;
  const night = h < 6 || h >= 20;
  const text = `${pad(h)}:${pad(m)}:${pad(s)}`;
  return (
    <span
      className={`live-clock ${size}${night ? " night" : ""}`}
      title={label}
    >
      <svg
        viewBox="0 0 20 20"
        width={size === "large" ? 56 : 18}
        height={size === "large" ? 56 : 18}
        role="img"
        aria-label={`${text}${label ? `, ${label}` : ""}`}
      >
        <circle cx="10" cy="10" r="8.5" className="face" />
        <line
          x1="10"
          y1="10"
          x2={10 + 4.2 * Math.sin((hourAngle * Math.PI) / 180)}
          y2={10 - 4.2 * Math.cos((hourAngle * Math.PI) / 180)}
          className="hand hour"
        />
        <line
          x1="10"
          y1="10"
          x2={10 + 6.4 * Math.sin((minuteAngle * Math.PI) / 180)}
          y2={10 - 6.4 * Math.cos((minuteAngle * Math.PI) / 180)}
          className="hand minute"
        />
      </svg>
      <span className="num">{text}</span>
    </span>
  );
}
