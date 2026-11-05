import { describe, expect, it } from "vitest";

import {
  glyph,
  GLYPH_POINTS,
  type GlyphName,
  morph,
} from "../src/renderer/src/lib/forge-glyphs";
import {
  type ForgeSignal,
  latestSentence,
  PHASE_GLYPHS,
  phaseOf,
  progressOf,
} from "../src/renderer/src/lib/forge-phase";

const signal = (s: Partial<ForgeSignal>): ForgeSignal => ({
  hasTree: false,
  proseLength: 0,
  total: 0,
  loading: 0,
  ...s,
});

describe("forge phase", () => {
  it("reads the phase from what the protocol has sent", () => {
    expect(phaseOf(signal({}))).toBe("read");
    expect(phaseOf(signal({ proseLength: 40 }))).toBe("think");
    expect(phaseOf(signal({ hasTree: true, total: 4, loading: 4 }))).toBe(
      "lay",
    );
    expect(phaseOf(signal({ hasTree: true, total: 4, loading: 1 }))).toBe(
      "fill",
    );
    expect(phaseOf(signal({ hasTree: true, total: 4, loading: 0 }))).toBe(
      "check",
    );
  });

  it("moves forward and never arrives before the canvas does", () => {
    const steps: Array<[ForgeSignal, number]> = [
      [signal({}), 2000],
      [signal({ proseLength: 9 }), 60_000],
      [signal({ hasTree: true, total: 4, loading: 4 }), 3000],
      [signal({ hasTree: true, total: 4, loading: 3 }), 0],
      [signal({ hasTree: true, total: 4, loading: 1 }), 60_000],
      [signal({ hasTree: true, total: 4, loading: 0 }), 60_000],
    ];
    let last = 0;
    for (const [s, since] of steps) {
      const p = progressOf(s, phaseOf(s), since);
      expect(p).toBeGreaterThanOrEqual(last);
      expect(p).toBeLessThan(1);
      last = p;
    }
  });

  it("takes the newest whole sentence, without tool-call json", () => {
    expect(
      latestSentence('Lese die Anfrage. {"tool":"jira_search"} Prüfe die'),
    ).toBe("Lese die Anfrage.");
  });
});

describe("forge glyphs", () => {
  const names = [...new Set(Object.values(PHASE_GLYPHS).flat())];

  it("draws every glyph with the same number of points, inside its box", () => {
    for (const name of names) {
      const g = glyph(name);
      expect(g).toHaveLength(GLYPH_POINTS);
      expect(g.filter((p) => p.v === 1).length).toBeGreaterThan(100);
      for (const p of g) {
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThanOrEqual(48);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeLessThanOrEqual(48);
      }
    }
  });

  it("starts as one glyph and ends as the next", () => {
    const [a, b]: GlyphName[] = ["table", "bars"];
    expect(morph(glyph(a), glyph(b), 0)).toEqual(glyph(a));
    expect(morph(glyph(a), glyph(b), 1)).toEqual(glyph(b));
  });
});
