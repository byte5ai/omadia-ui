import { describe, expect, it } from "vitest";

import {
  deriveTitle,
  firstLoadingId,
  rootToolbar,
  settleLoading,
} from "../src/renderer/src/lib/tree";

const tree = {
  type: "container",
  id: "root",
  children: [
    {
      type: "toolbar",
      id: "menu",
      children: [{ type: "button", label: "Exportieren" }],
    },
    { type: "heading", content: "**Team**-Auslastung", level: 1 },
    { type: "table", id: "t", loading: "skeleton", columns: [], rows: [] },
  ],
};

describe("tree helpers", () => {
  it("derives the title from the first heading", () => {
    expect(deriveTitle(tree)).toBe("Team-Auslastung");
  });

  it("finds where omadia works next", () => {
    expect(firstLoadingId(tree)).toBe("t");
  });

  it("settles every skeleton once a turn ends", () => {
    expect(firstLoadingId(settleLoading(tree))).toBeUndefined();
  });

  it("hoists the root toolbar into the pane menu", () => {
    expect(rootToolbar(tree)?.id).toBe("menu");
  });
});
