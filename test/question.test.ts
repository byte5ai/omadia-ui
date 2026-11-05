import { describe, expect, it } from "vitest";

import {
  isQuestion,
  openQuestion,
  withoutQuestions,
} from "../src/renderer/src/lib/tree";

const question = {
  type: "choice",
  id: "choice_3f9a01bc",
  label: "Welchem Team bist du zugeordnet?",
  variant: "radio",
  options: [
    { value: "t3", label: "T3 – Team JS" },
    { value: "g3", label: "G3 – Finanzen" },
  ],
};

const tree = {
  type: "container",
  id: "root",
  children: [
    { type: "heading", id: "h", content: "Stunden je Mitarbeiter" },
    { type: "choice", id: "filter", options: [] },
    {
      type: "pane",
      id: "p",
      container: { type: "container", id: "c", children: [question] },
    },
  ],
};

describe("omadia's questions back", () => {
  it("tells a question from a form choice", () => {
    expect(isQuestion(question)).toBe(true);
    expect(isQuestion({ type: "choice", id: "filter" })).toBe(false);
    expect(isQuestion({ type: "button", id: "choice_3f9a01bc" })).toBe(false);
  });

  it("finds the open question until it is answered", () => {
    expect(openQuestion(tree)?.id).toBe("choice_3f9a01bc");
    expect(openQuestion(tree, ["choice_3f9a01bc"])).toBeUndefined();
  });

  it("takes questions out of the canvas, keeps everything else", () => {
    const shown = withoutQuestions(tree) as typeof tree;
    expect(shown.children.map((c) => c.id)).toEqual(["h", "filter", "p"]);
    const pane = shown.children[2] as { container: { children: unknown[] } };
    expect(pane.container.children).toEqual([]);
  });

  it("keeps the same tree when there is nothing to take out", () => {
    const plain = { type: "container", id: "root", children: [] };
    expect(withoutQuestions(plain)).toBe(plain);
  });
});
