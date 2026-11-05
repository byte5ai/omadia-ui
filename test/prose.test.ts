import { describe, expect, it } from "vitest";

import { cleanProse, isQuestion } from "../src/renderer/src/lib/prose";

describe("cleanProse", () => {
  it("drops tool calls a provider echoed into the text", () => {
    const raw =
      '```json\n{"tool": "canvas_publish_rows", "input": {"containerId": "t"}}\n```\n\nHier ist die Tabelle.';
    expect(cleanProse(raw)).toBe("Hier ist die Tabelle.");
  });

  it("drops xml tool markup, also while it is still streaming", () => {
    expect(
      cleanProse('Vorab.\n<tool_call>{"name":"x"}</tool_call>\nFertig.'),
    ).toBe("Vorab.\n\nFertig.");
    expect(cleanProse("Moment.\n<function_calls>\n<invoke name=")).toBe(
      "Moment.",
    );
  });

  it("keeps ordinary prose and strips bold markers", () => {
    expect(cleanProse("Drei Personen liegen **unter** Budget.")).toBe(
      "Drei Personen liegen unter Budget.",
    );
  });
});

describe("isQuestion", () => {
  it("treats a trailing question mark as a question", () => {
    expect(isQuestion("Soll ich umverteilen?")).toBe(true);
    expect(isQuestion("Erledigt.")).toBe(false);
  });
});
