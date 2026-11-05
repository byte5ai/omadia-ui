import { describe, expect, it, vi } from "vitest";

vi.mock("../src/shared/canvas-core", () => ({
  validateTree11: () => ({ ok: true, errors: null }),
}));

const { extractPublishCalls, recoverPublishedRows } =
  await import("../src/renderer/src/lib/recover-tool-calls");
const { parseZone, zoneColumn } =
  await import("../src/renderer/src/lib/time-zone");

const skeleton = {
  type: "container",
  id: "root",
  children: [
    {
      type: "table",
      id: "tz",
      loading: "skeleton",
      columns: [
        { fieldKey: "offset", label: "UTC Offset" },
        { fieldKey: "currentTime", label: "Aktuelle Zeit" },
      ],
      rows: [],
    },
  ],
};

describe("recovering text tool calls", () => {
  it("reads the <invoke> form", () => {
    const text =
      '<function_calls>\n<invoke name="mcp__omadia__canvas_publish_rows">\n<parameter name="containerId">tz</parameter>\n<parameter name="rows">[{"offset":"UTC+1","currentTime":"UTC+1"}]</parameter>\n</invoke>\n</function_calls>';
    expect(extractPublishCalls(text)).toEqual([
      { containerId: "tz", rows: [{ offset: "UTC+1", currentTime: "UTC+1" }] },
    ]);
  });

  it("reads json fences and <tool_call>", () => {
    const fence =
      '```json\n{"tool":"mcpomadiacanvas_publish_rows","input":{"containerId":"tz","rows":[{"offset":"UTC-3"}]}}\n```';
    const xml =
      '<tool_call>{"name":"canvas_publish_rows","parameters":{"containerId":"tz","rows":[{"offset":"UTC+2"}]}}</tool_call>';
    expect(
      extractPublishCalls(fence + xml).map((c) => c.rows?.[0]?.offset),
    ).toEqual(["UTC-3", "UTC+2"]);
  });

  it("fills the table the skeleton promised", () => {
    const next = recoverPublishedRows(
      skeleton,
      '<tool_call>{"name":"canvas_publish_rows","parameters":{"containerId":"tz","rows":[{"offset":"UTC+9:30","currentTime":"UTC+9:30","extra":1}]}}</tool_call>',
    ) as typeof skeleton;
    const table = next.children[0] as {
      rows: Array<{ rowKey: string; cells: object }>;
      loading: string;
    };
    expect(table.loading).toBe("none");
    expect(table.rows).toEqual([
      { rowKey: "r0", cells: { offset: "UTC+9:30", currentTime: "UTC+9:30" } },
    ]);
  });

  it("leaves the tree alone without calls", () => {
    expect(recoverPublishedRows(skeleton, "Fertig.")).toBeNull();
  });
});

describe("time zones", () => {
  it("parses offsets and IANA names", () => {
    expect(parseZone("UTC+9:30")).toEqual({ kind: "offset", minutes: 570 });
    expect(parseZone("UTC−5")).toEqual({ kind: "offset", minutes: -300 });
    expect(parseZone("GMT")).toEqual({ kind: "offset", minutes: 0 });
    expect(parseZone("Europe/Berlin")).toEqual({
      kind: "iana",
      name: "Europe/Berlin",
    });
    expect(parseZone("Berlin")).toBeNull();
    expect(parseZone("7,5 h")).toBeNull();
  });

  it("finds the zone column", () => {
    const rows = [
      { cells: { a: "x", b: "UTC+1" } },
      { cells: { a: "y", b: "UTC+2" } },
    ];
    expect(zoneColumn([{ fieldKey: "a" }, { fieldKey: "b" }], rows)).toBe("b");
  });
});

describe("KPI fields", () => {
  it("fills value leaves by containerId.fieldKey, like the server", () => {
    const tree = {
      type: "container",
      id: "tz",
      loading: "skeleton",
      children: [
        { type: "heading", content: "UTC-3", level: 4 },
        { type: "text", id: "tz.utc_minus_3", content: "" },
        { type: "status", id: "tz.state", text: "" },
      ],
    };
    const next = recoverPublishedRows(
      tree,
      '<tool_call>{"name":"canvas_publish_rows","parameters":{"containerId":"tz","fields":{"utc_minus_3":"11:32","state":"live"}}}</tool_call>',
    ) as typeof tree;
    expect(next.loading).toBe("none");
    expect(next.children[1]).toMatchObject({ content: "11:32" });
    expect(next.children[2]).toMatchObject({ text: "live" });
  });
});
