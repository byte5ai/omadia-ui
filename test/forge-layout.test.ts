import { describe, expect, it } from "vitest";

import {
  blueprintOf,
  guessLayout,
  touchedBlocks,
} from "../src/renderer/src/lib/forge-layout";

const tree = {
  type: "container",
  id: "root",
  children: [
    { type: "toolbar", id: "menu", children: [] },
    { type: "heading", id: "title", content: "Team", level: 1 },
    { type: "table", id: "t", loading: "skeleton", columns: [], rows: [] },
    {
      type: "container",
      id: "charts",
      layout: "split",
      children: [
        { type: "chart", id: "a", chartType: "bar", points: [] },
        { type: "chart", id: "b", chartType: "pie", points: [] },
      ],
    },
  ],
};

describe("forge layout", () => {
  it("draws the tree's regions, without the pane menu", () => {
    const blocks = blueprintOf(tree);
    expect(blocks.map((b) => [b.id, b.kind, b.loading])).toEqual([
      ["title", "title", false],
      ["t", "table", true],
      ["a", "chart", false],
      ["b", "chart", false],
    ]);
  });

  it("puts a split side by side and keeps everything in the unit box", () => {
    const blocks = blueprintOf(tree);
    const [a, b] = blocks.slice(2);
    expect(a?.y).toBe(b?.y);
    expect((a?.x ?? 0) < (b?.x ?? 0)).toBe(true);
    for (const r of [...blocks, ...guessLayout(7)]) {
      expect(r.x + r.w).toBeLessThanOrEqual(1.0001);
      expect(r.y + r.h).toBeLessThanOrEqual(1.0001);
    }
  });

  it("maps a patch to the regions it touched", () => {
    const blocks = blueprintOf(tree);
    expect(touchedBlocks(tree, blocks, ["t"])).toEqual(["t"]);
    expect(touchedBlocks(tree, blocks, ["charts"]).sort()).toEqual(["a", "b"]);
  });
});
