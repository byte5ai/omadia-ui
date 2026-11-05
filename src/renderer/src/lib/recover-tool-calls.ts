import { validateTree11 } from "../../../shared/canvas-core";
import { arr, isNode, type Node } from "./tree";

/**
 * Workaround for omadia-core's claude-cli provider: it spawns the CLI with
 * `--tools ''`, which also switches off ToolSearch, so the omadia MCP tools
 * (still "pending" at start) never reach the model. The model then writes
 * the canvas_publish_rows call it meant to make into its text. Until the core
 * is fixed we read those calls back and put the rows where they were meant
 * to go. A recovered tree must still pass the schema, else nothing changes.
 */

export interface PublishCall {
  containerId: string;
  rows?: Array<Record<string, unknown>>;
  fields?: Record<string, unknown>;
}

const PUBLISH = /canvas_publish_rows/;

const parseJson = (raw: string): unknown => {
  try {
    return JSON.parse(raw.trim());
  } catch {
    return undefined;
  }
};

function toCall(args: unknown): PublishCall | null {
  if (typeof args !== "object" || args === null) return null;
  const o = args as Record<string, unknown>;
  if (typeof o.containerId !== "string") return null;
  const rows = typeof o.rows === "string" ? parseJson(o.rows) : o.rows;
  const fields = typeof o.fields === "string" ? parseJson(o.fields) : o.fields;
  return {
    containerId: o.containerId,
    ...(Array.isArray(rows)
      ? {
          rows: rows.filter(
            (r): r is Record<string, unknown> =>
              typeof r === "object" && r !== null,
          ),
        }
      : {}),
    ...(fields && typeof fields === "object"
      ? { fields: fields as Record<string, unknown> }
      : {}),
  };
}

/** Every publish call the text contains, in the formats models fall back to. */
export function extractPublishCalls(text: string): PublishCall[] {
  const calls: PublishCall[] = [];

  // <invoke name="…canvas_publish_rows"><parameter name="x">…</parameter>
  const invoke = /<invoke name="([^"]+)">([\s\S]*?)(<\/invoke>|$)/g;
  for (const m of text.matchAll(invoke)) {
    if (!PUBLISH.test(m[1] ?? "")) continue;
    const args: Record<string, unknown> = {};
    const param = /<parameter name="([^"]+)">([\s\S]*?)<\/parameter>/g;
    for (const p of (m[2] ?? "").matchAll(param)) {
      args[p[1] as string] = p[2];
    }
    const call = toCall(args);
    if (call) calls.push(call);
  }

  // ```json {"tool": "…", "input": {…}} ``` and <tool_call>{"name", "parameters"}
  const blocks = [
    ...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/g),
    ...text.matchAll(/<tool_call>([\s\S]*?)<\/tool_call>/g),
  ];
  for (const b of blocks) {
    const obj = parseJson(b[1] ?? "") as Record<string, unknown> | undefined;
    if (!obj || typeof obj !== "object") continue;
    const name = String(obj.tool ?? obj.name ?? "");
    if (!PUBLISH.test(name)) continue;
    const call = toCall(obj.input ?? obj.parameters ?? obj.arguments);
    if (call) calls.push(call);
  }
  return calls;
}

function fillNode(node: Node, call: PublishCall): Node {
  const rows = call.rows ?? (call.fields ? [call.fields] : []);
  if (node.type === "table") {
    const keys = arr(node.columns).map(
      (c) => (c as { fieldKey: string }).fieldKey,
    );
    const existing = arr(node.rows).length;
    return {
      ...node,
      loading: "none",
      rows: [
        ...arr(node.rows),
        ...rows.map((r, i) => ({
          rowKey: String(r.rowKey ?? r.id ?? `r${existing + i}`),
          cells: Object.fromEntries(keys.map((k) => [k, r[k] ?? null])),
        })),
      ],
    };
  }
  if (node.type === "list") {
    const existing = arr(node.items).length;
    return {
      ...node,
      loading: "none",
      items: [
        ...arr(node.items),
        ...rows.map((r, i) => {
          const values = Object.values(r).map(String);
          return {
            ...r,
            itemKey: String(r.itemKey ?? r.id ?? `i${existing + i}`),
            label: String(r.label ?? r.name ?? r.title ?? values[0] ?? ""),
          };
        }),
      ],
    };
  }
  if (node.type === "chart") {
    return {
      ...node,
      loading: "none",
      points: rows.map((r, i) => {
        const value = Object.values(r).find((v) => typeof v === "number");
        return {
          ...r,
          pointKey: String(r.pointKey ?? r.id ?? `p${i}`),
          label: String(r.label ?? r.name ?? Object.values(r)[0] ?? i),
          value: typeof r.value === "number" ? r.value : (value ?? 0),
        };
      }),
    };
  }
  return node;
}

function applyCall(tree: unknown, call: PublishCall): unknown {
  if (Array.isArray(tree)) return tree.map((t) => applyCall(t, call));
  if (!isNode(tree)) return tree;
  const node: Node = tree.id === call.containerId ? fillNode(tree, call) : tree;
  const out: Record<string, unknown> = { ...node };
  for (const key of ["children", "tabs", "container"]) {
    if (key in node) out[key] = applyCall(node[key], call);
  }
  if (node.type === "tabs") {
    out.tabs = arr(node.tabs).map((t) => ({
      ...(t as object),
      child: applyCall((t as { child?: unknown }).child, call),
    }));
  }
  return out;
}

/** Scalar/KPI fill, as the server does it: each value goes into the leaf
 *  whose id is exactly `${containerId}.${fieldKey}`. */
function applyFields(tree: unknown, call: PublishCall): unknown {
  if (!call.fields) return tree;
  const fields = call.fields;
  const visit = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(visit);
    if (typeof v !== "object" || v === null) return v;
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v)) out[k] = visit(val);
    if (!isNode(out)) return out;
    if (out.id === call.containerId && out.loading === "skeleton")
      out.loading = "none";
    const prefix = `${call.containerId}.`;
    if (typeof out.id === "string" && out.id.startsWith(prefix)) {
      const value = fields[out.id.slice(prefix.length)];
      const prop =
        out.type === "status"
          ? "text"
          : out.type === "text" || out.type === "heading"
            ? "content"
            : null;
      if (prop && value !== undefined && typeof value !== "object") {
        out[prop] = String(value);
        if (out.loading === "skeleton") out.loading = "none";
      }
    }
    return out;
  };
  return visit(tree);
}

/** The tree with the text's publish calls applied, or null if none fit. */
export function recoverPublishedRows(tree: unknown, text: string): unknown {
  const calls = extractPublishCalls(text);
  if (!calls.length || !isNode(tree)) return null;
  const next = calls.reduce<unknown>(
    (t, c) => (c.fields && !c.rows ? applyFields(t, c) : applyCall(t, c)),
    tree,
  );
  return validateTree11(next).ok ? next : null;
}
