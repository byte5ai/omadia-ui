import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { startForge } from "../src/renderer/src/lib/forge-engine";
import { blueprintOf } from "../src/renderer/src/lib/forge-layout";

// A drawing context that accepts everything and draws nothing.
const noop = (): unknown =>
  new Proxy(() => undefined, {
    get: (_t, key) =>
      key === "createRadialGradient" ? () => ({ addColorStop() {} }) : noop(),
    set: () => true,
  });

let frames: Array<(t: number) => void> = [];
let now = 0;

function run(ms: number): void {
  const end = now + ms;
  while (now < end) {
    now += 16;
    const due = frames;
    frames = [];
    for (const f of due) f(now);
  }
}

beforeEach(() => {
  frames = [];
  now = 0;
  vi.stubGlobal("performance", { now: () => now });
  vi.stubGlobal("requestAnimationFrame", (f: (t: number) => void) => {
    frames.push(f);
    return frames.length;
  });
  vi.stubGlobal("cancelAnimationFrame", () => (frames = []));
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe(): void {}
      disconnect(): void {}
    },
  );
  vi.stubGlobal("getComputedStyle", () => ({ getPropertyValue: () => "" }));
  vi.stubGlobal("document", { documentElement: {} });
  vi.stubGlobal("window", { devicePixelRatio: 1 });
});

afterEach(() => vi.unstubAllGlobals());

const stage = (): HTMLCanvasElement =>
  ({
    getContext: () => noop(),
    getBoundingClientRect: () => ({ width: 1200, height: 800 }),
  }) as unknown as HTMLCanvasElement;

/** Where the pen was every second, as the anchor saw it. */
function track(seconds: number, setup?: (feed: (b: unknown) => void) => void) {
  const anchor = { style: { transform: "" } } as unknown as HTMLElement;
  const forge = startForge(stage(), anchor, { reduced: false });
  setup?.((tree) =>
    forge.feed({ blocks: blueprintOf(tree), changed: [], changedAt: 0 }),
  );
  const seen: string[] = [];
  for (let s = 0; s < seconds; s++) {
    run(1000);
    seen.push(anchor.style.transform);
  }
  forge.destroy();
  return seen;
}

const stillFor = (seen: string[]): number => {
  let longest = 0;
  let run = 0;
  for (let i = 1; i < seen.length; i++) {
    run = seen[i] === seen[i - 1] ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  return longest;
};

describe("forge engine", () => {
  it("keeps the dot moving while omadia thinks without a snapshot", () => {
    const seen = track(40);
    expect(new Set(seen).size).toBeGreaterThan(20);
    expect(stillFor(seen)).toBeLessThan(2);
  });

  it("keeps the dot moving while the real layout is still loading", () => {
    const tree = {
      type: "container",
      id: "root",
      children: [
        { type: "heading", id: "h", content: "Team", level: 1 },
        { type: "table", id: "t", loading: "skeleton", columns: [], rows: [] },
      ],
    };
    const seen = track(30, (feed) => feed(tree));
    expect(stillFor(seen)).toBeLessThan(2);
  });
});
