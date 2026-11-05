import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  initialState,
  LumenNode,
  SceneNode,
} from "../src/renderer/src/primitives/lumen-nodes";
import {
  applyServerMessage,
  initialCanvasState,
  runTransition,
  type ServerMessage,
} from "../src/shared/canvas-core";

/** A tappable list as the server builds it for a dataset (datasetLumen.ts):
 *  a scene of text rows, the tapped row's id selects it. */
const listLumen = {
  type: "lumen",
  id: "dataset-lumen",
  state: {
    rows: {
      type: "list",
      of: {
        type: "record",
        fields: {
          label: { type: "string", maxLength: 64, init: "" },
          value: { type: "number", init: 0 },
        },
        init: {},
      },
      maxLen: 64,
      init: [
        { label: "Januar", value: 310 },
        { label: "Februar", value: 280 },
      ],
    },
    sel: { type: "string", maxLength: 8, init: "" },
  },
  transitions: { select: { set: { sel: { event: "id" } } } },
  view: {
    record: {
      type: { lit: "scene" },
      width: { lit: 360 },
      height: { lit: 80 },
      draw: {
        call: "map",
        args: [
          { state: "rows" },
          {
            record: {
              kind: { lit: "text" },
              x: { lit: 14 },
              y: { "+": [{ lit: 28 }, { "*": [{ var: "idx" }, { lit: 24 }] }] },
              text: { get: { var: "it" }, key: { lit: "label" } },
              fill: {
                if: {
                  "==": [
                    { call: "fmt", args: [{ var: "idx" }] },
                    { state: "sel" },
                  ],
                },
                then: { lit: "success" },
                else: { lit: "text" },
              },
              id: { call: "fmt", args: [{ var: "idx" }] },
            },
          },
        ],
      },
    },
  },
  events: [{ on: "tap", run: "select" }],
  cadence: "reactive",
};

describe("Lumen rendering (protocol 1.1)", () => {
  it("renders the view of a dataset Lumen as a scene", () => {
    const html = renderToStaticMarkup(
      createElement(LumenNode, { node: listLumen }),
    );
    expect(html).toContain("<svg");
    expect(html).toContain("Januar");
    expect(html).toContain('data-hit-id="1"');
  });

  it("a tap's id selects the row (the transition the tap runs)", () => {
    const next = runTransition(listLumen.transitions.select as never, {
      state: initialState(listLumen.state),
      event: { hitId: "1", id: "1" },
    });
    expect(next.sel).toBe("1");
  });

  it("an invalid Lumen shows why instead of rendering", () => {
    const html = renderToStaticMarkup(
      createElement(LumenNode, {
        node: { ...listLumen, events: [{ on: "tap", run: "missing" }] },
      }),
    );
    expect(html).toContain("Lumen ungültig");
  });

  it("scene shapes map theme tokens to this client's colours", () => {
    const html = renderToStaticMarkup(
      createElement(SceneNode, {
        node: {
          type: "scene",
          width: 100,
          height: 40,
          draw: [
            {
              kind: "rect",
              x: 0,
              y: 0,
              w: 10,
              h: 10,
              fill: "success",
              id: "a",
            },
            {
              kind: "path",
              points: [
                [0, 0],
                [10, 10],
              ],
              closed: true,
              stroke: "danger",
            },
          ],
        },
      }),
    );
    expect(html).toContain('fill="var(--verified)"');
    expect(html).toContain('d="M0 0 L10 10 Z"');
  });
});

describe("Lumen state", () => {
  it("initialises every leaf from init, or from its shape", () => {
    expect(
      initialState({
        n: { type: "int", init: 3 },
        on: { type: "bool", init: true },
        board: { type: "grid", w: 2, h: 2, of: { type: "int", init: 0 } },
        who: {
          type: "record",
          fields: { name: { type: "string", maxLength: 8, init: "x" } },
        },
      }),
    ).toEqual({
      n: 3,
      on: true,
      board: [
        [0, 0],
        [0, 0],
      ],
      who: { name: "x" },
    });
  });
});

describe("canvas store — this client accepts 1.1 trees", () => {
  it("applies a snapshot that carries a Lumen", () => {
    const tree = {
      type: "container",
      id: "root",
      layout: "stack",
      children: [listLumen],
    };
    const msg = {
      type: "surface_snapshot",
      canvasSessionId: "c",
      surfaceSeq: 0,
      producesRevision: "1",
      tree,
      protocolVersion: "1.0",
      opsCatalogVersion: "1.0",
    } as unknown as ServerMessage;
    const r = applyServerMessage(initialCanvasState, msg, 0, { lumens: true });
    expect(r.state.revision).toBe("1");
  });
});
