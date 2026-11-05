import { type ReactElement, useState } from "react";

import { Icon } from "../components/icons";
import { useStore } from "../lib/create-store";
import {
  isTimeColumn,
  parseZone,
  type Zone,
  zoneColumn,
} from "../lib/time-zone";
import { arr, type Node, num, str } from "../lib/tree";
import { LiveClock } from "./live-clock";
import { select, selectionStore, useRender } from "./render-context";

const NUMBER = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 });

export function cellText(v: unknown): string {
  if (v === null || v === undefined || v === "") return "–";
  if (typeof v === "number") return NUMBER.format(v);
  if (typeof v === "boolean") return v ? "Ja" : "Nein";
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if ("value" in o) return cellText(o.value);
    if ("label" in o) return cellText(o.label);
    return JSON.stringify(v);
  }
  return String(v).replace(/\*\*|__|`/g, "");
}

const isNumeric = (v: unknown): boolean => {
  const raw =
    typeof v === "object" && v !== null && "value" in v
      ? (v as { value: unknown }).value
      : v;
  return (
    typeof raw === "number" ||
    (typeof raw === "string" &&
      /^[-+]?[\d.,]+\s?(h|%|€|k|m)?$/i.test(raw.trim()))
  );
};

const TONE_WORDS: Array<[RegExp, string]> = [
  [/(blockiert|fehler|failed|error|abgelehnt|überfällig|kritisch)/i, "danger"],
  [/(achtung|warn|maskiert|unter budget|risiko|offen)/i, "warning"],
  [
    /(geprüft|verifiziert|erledigt|abgeschlossen|done|ok|bestätigt)/i,
    "success",
  ],
];

/** Status-like columns read as a dot with text; colour only as status. */
function statusTone(text: string): string | undefined {
  return TONE_WORDS.find(([re]) => re.test(text))?.[1];
}

/** The display types the server sets on a column (`columns[].type`). */
const DISPLAY_TYPES = new Set([
  "text",
  "number",
  "monetary",
  "date",
  "datetime",
  "boolean",
  "enum",
  "relation",
]);

const DATE = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

/**
 * A cell of a typed column (`columns[].type`, set by the server from the
 * source's field metadata). Undefined when the type says nothing about this
 * value — the cell then shows as before.
 */
function typedCell(
  type: string | undefined,
  v: unknown,
): { text: string; tone?: string } | undefined {
  switch (type) {
    case "boolean":
      return typeof v === "boolean"
        ? { text: v ? "Ja" : "Nein", tone: v ? "success" : "neutral" }
        : undefined;
    case "enum": {
      // a state reads as a chip; an empty one stays a dash
      const text = cellText(v);
      return text === "–"
        ? { text }
        : { text, tone: statusTone(text) ?? "neutral" };
    }
    case "date":
      return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)
        ? { text: DATE.format(new Date(`${v}T00:00:00`)) }
        : undefined;
    default:
      return undefined;
  }
}

interface Column {
  fieldKey: string;
  label: string;
  type?: string;
  privacy?: string;
}

interface Row {
  rowKey: string;
  cells: Record<string, unknown>;
}

function SkeletonRows({
  cols,
  rows = 3,
}: {
  cols: number;
  rows?: number;
}): ReactElement {
  return (
    <>
      {Array.from({ length: rows }, (_, i) => (
        <tr key={i} className="skeleton-row">
          {Array.from({ length: Math.max(1, cols) }, (_, j) => (
            <td key={j}>
              <div
                className="skeleton"
                style={{ width: `${60 + ((i + j) % 3) * 12}%` }}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export function TableNode({ node }: { node: Node }): ReactElement {
  const ctx = useRender();
  const id = str(node.id) ?? "table";
  const columns = arr(node.columns) as Column[];
  const rows = arr(node.rows) as Row[];
  const loading = node.loading === "skeleton" || node.loading === "spinner";
  const multi = node.selectable === "multi";
  const selection = useStore(selectionStore, (s) => s[ctx.slotKey]);
  const selected = selection?.containerId === id ? selection.keys : [];
  // The first column names the row (a year, a person), it never aligns as a number.
  const numeric = columns.map(
    (c, i) =>
      i > 0 &&
      (c.type === "number" ||
        (rows.length > 0 &&
          rows.every(
            (r) =>
              isNumeric(r.cells[c.fieldKey]) || r.cells[c.fieldKey] == null,
          ))),
  );
  // Zones without a live time column get one: a clock is what was asked for.
  const zonesIn = zoneColumn(columns, rows);
  const clockFrom =
    zonesIn &&
    !columns.some(
      (c) =>
        isTimeColumn(`${c.label} ${c.fieldKey}`) &&
        zoneColumn([c], rows) !== undefined,
    )
      ? zonesIn
      : undefined;
  // guessed only where no display type says how the column shows
  const statusCol = columns.findIndex(
    (c) =>
      !DISPLAY_TYPES.has(c.type ?? "") &&
      /status|zustand|state/i.test(c.fieldKey + c.label),
  );
  return (
    <div className="p-table-area">
      <div className="p-table-frame panel">
        <table className="p-table">
          <thead>
            <tr>
              {columns.map((c, i) => (
                <th
                  key={c.fieldKey}
                  scope="col"
                  className={numeric[i] ? "num-col" : undefined}
                >
                  {c.privacy === "guard-protected" ? (
                    <span
                      className="masked-head"
                      title="Maskiert: das Modell hat diese Werte nie gesehen"
                    >
                      <Icon name="lock" size={12} />
                      {c.label}
                    </span>
                  ) : (
                    c.label
                  )}
                </th>
              ))}
              {clockFrom ? <th scope="col">Uhrzeit</th> : null}
              <th className="row-more-col" aria-hidden="true" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const isSelected = selected.includes(r.rowKey);
              return (
                <tr
                  key={r.rowKey}
                  data-node-id={`${id}:${r.rowKey}`}
                  className={isSelected ? "selected" : undefined}
                  aria-selected={isSelected}
                  tabIndex={0}
                  onClick={(e) =>
                    select(
                      ctx.slotKey,
                      id,
                      r.rowKey,
                      multi && (e.metaKey || e.shiftKey || multi),
                    )
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      select(ctx.slotKey, id, r.rowKey, multi);
                    }
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    if (!isSelected) select(ctx.slotKey, id, r.rowKey, false);
                    ctx.openRowPanel(id, r.rowKey, e.clientX, e.clientY);
                  }}
                >
                  {columns.map((c, ci) => {
                    const typed = typedCell(c.type, r.cells[c.fieldKey]);
                    const text = typed?.text ?? cellText(r.cells[c.fieldKey]);
                    const zone = isTimeColumn(`${c.label} ${c.fieldKey}`)
                      ? parseZone(r.cells[c.fieldKey])
                      : null;
                    if (zone) {
                      return (
                        <td key={c.fieldKey}>
                          <LiveClock zone={zone} label={text} />
                        </td>
                      );
                    }
                    const tone =
                      typed !== undefined
                        ? typed.tone
                        : ci === statusCol
                          ? statusTone(text)
                          : undefined;
                    const masked = c.privacy === "guard-protected";
                    return (
                      <td
                        key={c.fieldKey}
                        className={numeric[ci] ? "num-col num" : undefined}
                        title={text.length > 40 ? text : undefined}
                      >
                        {ci === 0 ? (
                          <span className="first-cell">{text}</span>
                        ) : tone ? (
                          <span className={`status ${tone}`}>{text}</span>
                        ) : masked ? (
                          <span className="masked-cell">{text}</span>
                        ) : (
                          text
                        )}
                      </td>
                    );
                  })}
                  {clockFrom ? (
                    <td>
                      {parseZone(r.cells[clockFrom]) ? (
                        <LiveClock
                          zone={parseZone(r.cells[clockFrom]) as Zone}
                          label={cellText(r.cells[clockFrom])}
                        />
                      ) : (
                        "–"
                      )}
                    </td>
                  ) : null}
                  <td className="row-more">
                    {/* details, omadia's suggestions and a question for
                        this row — the same panel as a right click */}
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label="Aktionen für diese Zeile"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!isSelected)
                          select(ctx.slotKey, id, r.rowKey, false);
                        const box = e.currentTarget.getBoundingClientRect();
                        ctx.openRowPanel(
                          id,
                          r.rowKey,
                          box.left,
                          box.bottom + 4,
                        );
                      }}
                    >
                      <Icon name="more" size={14} />
                    </button>
                  </td>
                </tr>
              );
            })}
            {loading ? (
              <SkeletonRows
                cols={columns.length + 1}
                rows={rows.length ? 1 : 3}
              />
            ) : null}
          </tbody>
        </table>
        {!loading && rows.length === 0 ? (
          <p className="p-empty">Noch keine Einträge.</p>
        ) : null}
      </div>
    </div>
  );
}

interface ListItem {
  itemKey: string;
  label?: string;
  tone?: string;
  value?: unknown;
  status?: string;
  description?: string;
  detail?: string;
  meta?: string;
}

export function ListNode({ node }: { node: Node }): ReactElement {
  const ctx = useRender();
  const id = str(node.id) ?? "list";
  const items = arr(node.items) as ListItem[];
  const loading = node.loading === "skeleton" || node.loading === "spinner";
  const selection = useStore(selectionStore, (s) => s[ctx.slotKey]);
  const selected = selection?.containerId === id ? selection.keys : [];
  const action = node.action as { type: string; payload?: unknown } | undefined;

  return (
    <ul className="p-list">
      {items.map((item) => {
        const tone =
          item.tone && item.tone !== "neutral" ? item.tone : undefined;
        const secondary = item.description ?? item.detail ?? item.meta;
        const isSelected = selected.includes(item.itemKey);
        return (
          <li key={item.itemKey} data-node-id={`${id}:${item.itemKey}`}>
            <button
              type="button"
              className={`p-list-row${isSelected ? " selected" : ""}`}
              aria-pressed={isSelected}
              onClick={() => {
                select(
                  ctx.slotKey,
                  id,
                  item.itemKey,
                  node.selectable === "multi",
                );
                if (action) {
                  const payload = {
                    ...(typeof action.payload === "object"
                      ? (action.payload as object)
                      : {}),
                    itemKey: item.itemKey,
                  };
                  ctx.action(
                    { type: action.type, payload },
                    `${id}:${item.itemKey}`,
                  );
                }
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                ctx.openRowPanel(id, item.itemKey, e.clientX, e.clientY);
              }}
            >
              <span className="p-list-main">
                {tone ? (
                  <span className={`status ${tone}`}>
                    {item.label ?? item.itemKey}
                  </span>
                ) : (
                  <span className="p-list-label">
                    {item.label ?? item.itemKey}
                  </span>
                )}
                {secondary ? (
                  <span className="p-list-secondary">{secondary}</span>
                ) : null}
              </span>
              {item.value !== undefined ? (
                <span className="p-list-value num">{cellText(item.value)}</span>
              ) : null}
              {item.status ? (
                <span
                  className={`status ${statusTone(item.status) ?? "neutral"}`}
                >
                  {item.status}
                </span>
              ) : null}
            </button>
          </li>
        );
      })}
      {loading
        ? [0, 1, 2].map((i) => (
            <li key={`sk-${i}`} className="p-list-row skeleton-row">
              <div className="skeleton" style={{ width: `${70 - i * 12}%` }} />
            </li>
          ))
        : null}
      {!loading && items.length === 0 ? (
        <li className="p-empty">Noch keine Einträge.</li>
      ) : null}
    </ul>
  );
}

interface TreeItem {
  itemKey: string;
  label?: string;
  children?: TreeItem[];
  layer?: { opacity?: number; visible?: boolean; locked?: boolean };
}

export function TreeNode({ node }: { node: Node }): ReactElement {
  const ctx = useRender();
  const id = str(node.id) ?? "tree";
  const nodes = arr(node.nodes) as TreeItem[];
  const selection = useStore(selectionStore, (s) => s[ctx.slotKey]);
  const selected = selection?.containerId === id ? selection.keys : [];
  return (
    <ul className="p-tree" role="tree">
      {nodes.map((n) => (
        <TreeBranch
          key={n.itemKey}
          item={n}
          depth={0}
          treeId={id}
          selected={selected}
        />
      ))}
    </ul>
  );
}

function TreeBranch({
  item,
  depth,
  treeId,
  selected,
}: {
  item: TreeItem;
  depth: number;
  treeId: string;
  selected: string[];
}): ReactElement {
  const ctx = useRender();
  const [open, setOpen] = useState(depth < 2);
  const kids = item.children ?? [];
  const isSelected = selected.includes(item.itemKey);
  const opacity = num(item.layer?.opacity);
  return (
    <li
      role="treeitem"
      aria-expanded={kids.length ? open : undefined}
      aria-selected={isSelected}
    >
      <div
        className={`p-tree-row${isSelected ? " selected" : ""}`}
        style={{ paddingLeft: 8 + depth * 18 }}
        data-node-id={`${treeId}:${item.itemKey}`}
      >
        {kids.length ? (
          <button
            type="button"
            className="p-tree-toggle"
            aria-label={open ? "Zuklappen" : "Aufklappen"}
            onClick={() => setOpen(!open)}
          >
            <Icon name={open ? "chevronDown" : "chevronRight"} size={12} />
          </button>
        ) : (
          <span className="p-tree-toggle" />
        )}
        <button
          type="button"
          className="p-tree-label"
          onClick={() => select(ctx.slotKey, treeId, item.itemKey, false)}
        >
          {item.label ?? item.itemKey}
        </button>
        {opacity !== undefined ? (
          <span className="p-tree-meta num">
            {Math.round(opacity <= 1 ? opacity * 100 : opacity)} %
          </span>
        ) : null}
      </div>
      {open && kids.length ? (
        <ul role="group">
          {kids.map((k) => (
            <TreeBranch
              key={k.itemKey}
              item={k}
              depth={depth + 1}
              treeId={treeId}
              selected={selected}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

// ── charts: no palette, light levels; the most important series is brightest ──

interface Point {
  pointKey: string;
  label: string;
  value: number;
}

const LIGHT_LEVELS = [1, 0.72, 0.52, 0.38, 0.27, 0.19];

function points(node: Node): Point[] {
  return (arr(node.points) as Array<Record<string, unknown>>).map((p) => ({
    pointKey: String(p.pointKey),
    label: String(p.label ?? p.x ?? p.name ?? p.pointKey),
    value: num(p.value) ?? num(p.y) ?? Number(p.value ?? p.y ?? 0),
  }));
}

export function ChartNode({ node }: { node: Node }): ReactElement {
  const id = str(node.id) ?? "chart";
  const data = points(node);
  const loading = node.loading === "skeleton" || node.loading === "spinner";
  if (loading && data.length === 0) {
    return (
      <div className="p-chart p-chart-bar">
        {[82, 64, 48].map((w, i) => (
          <div key={i} className="p-bar-row skeleton-row">
            <div className="skeleton" style={{ width: 70 }} />
            <div
              className="skeleton"
              style={{ width: `${w}%`, borderRadius: 3 }}
            />
          </div>
        ))}
      </div>
    );
  }
  if (data.length === 0)
    return <p className="p-empty">Keine Datenpunkte für diesen Zeitraum</p>;
  if (node.variant === "spark") return <Spark data={data} />;
  if (node.chartType === "line") return <LineChart data={data} id={id} />;
  if (node.chartType === "pie") return <PieChart data={data} />;
  return <BarChart data={data} id={id} />;
}

function BarChart({ data, id }: { data: Point[]; id: string }): ReactElement {
  const max = Math.max(...data.map((d) => d.value), 0) || 1;
  const leader = data.reduce(
    (a, b) => (b.value > a.value ? b : a),
    data[0] as Point,
  );
  return (
    <div
      className="p-chart p-chart-bar"
      role="img"
      aria-label={data
        .map((d) => `${d.label} ${NUMBER.format(d.value)}`)
        .join(", ")}
    >
      {data.map((d) => (
        <div
          key={d.pointKey}
          className="p-bar-row"
          data-node-id={`${id}:${d.pointKey}`}
        >
          <span className="p-bar-label">{d.label}</span>
          <span className="p-bar-track">
            <span
              className={`p-bar-fill${d === leader ? " lead" : ""}`}
              style={{ width: `${Math.max(1.5, (d.value / max) * 100)}%` }}
            />
          </span>
          <span className="p-bar-value num">{NUMBER.format(d.value)}</span>
        </div>
      ))}
    </div>
  );
}

function LineChart({ data, id }: { data: Point[]; id: string }): ReactElement {
  const w = 560;
  const h = 180;
  const pad = 8;
  const values = data.map((d) => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const xy = data.map((d, i) => [
    pad + (i / Math.max(1, data.length - 1)) * (w - pad * 2),
    h - pad - ((d.value - min) / span) * (h - pad * 2),
  ]);
  const path = xy
    .map(([x, y], i) => `${i ? "L" : "M"}${x?.toFixed(1)} ${y?.toFixed(1)}`)
    .join(" ");
  const last = xy.at(-1) ?? [0, 0];
  return (
    <figure className="p-chart p-chart-line">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        role="img"
        aria-label={data
          .map((d) => `${d.label} ${NUMBER.format(d.value)}`)
          .join(", ")}
        preserveAspectRatio="none"
      >
        {[0.25, 0.5, 0.75].map((t) => (
          <line key={t} x1={0} x2={w} y1={h * t} y2={h * t} className="grid" />
        ))}
        <path d={`${path} L${w - pad} ${h} L${pad} ${h} Z`} className="area" />
        <path d={path} className="line" vectorEffect="non-scaling-stroke" />
        <circle
          cx={last[0]}
          cy={last[1]}
          r={3.5}
          className="end"
          data-node-id={`${id}:${data.at(-1)?.pointKey}`}
        />
      </svg>
      <figcaption className="p-chart-axis">
        <span>{data[0]?.label}</span>
        <span>{data.at(-1)?.label}</span>
      </figcaption>
    </figure>
  );
}

function PieChart({ data }: { data: Point[] }): ReactElement {
  const sorted = [...data].sort((a, b) => b.value - a.value);
  const total = sorted.reduce((s, d) => s + Math.max(0, d.value), 0) || 1;
  let acc = 0;
  const r = 52;
  const c = 2 * Math.PI * r;
  return (
    <div className="p-chart p-chart-pie">
      <svg
        viewBox="0 0 140 140"
        width="140"
        height="140"
        role="img"
        aria-label={sorted
          .map((d) => `${d.label} ${Math.round((d.value / total) * 100)} %`)
          .join(", ")}
      >
        {sorted.map((d, i) => {
          const len = (Math.max(0, d.value) / total) * c;
          const el = (
            <circle
              key={d.pointKey}
              cx="70"
              cy="70"
              r={r}
              fill="none"
              strokeWidth="22"
              className="slice"
              style={{
                opacity: LIGHT_LEVELS[Math.min(i, LIGHT_LEVELS.length - 1)],
              }}
              strokeDasharray={`${Math.max(0, len - 1.5)} ${c}`}
              strokeDashoffset={-acc}
              transform="rotate(-90 70 70)"
            />
          );
          acc += len;
          return el;
        })}
      </svg>
      <ul className="p-legend">
        {sorted.map((d, i) => (
          <li key={d.pointKey}>
            <span
              className="swatch"
              style={{
                opacity: LIGHT_LEVELS[Math.min(i, LIGHT_LEVELS.length - 1)],
              }}
            />
            <span className="grow">{d.label}</span>
            <span className="num">{Math.round((d.value / total) * 100)} %</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Spark({ data }: { data: Point[] }): ReactElement {
  const values = data.map((d) => d.value);
  const min = Math.min(...values);
  const span = Math.max(...values) - min || 1;
  const path = values
    .map(
      (v, i) =>
        `${i ? "L" : "M"}${((i / Math.max(1, values.length - 1)) * 96).toFixed(1)} ${(22 - ((v - min) / span) * 20).toFixed(1)}`,
    )
    .join(" ");
  const last = data.at(-1) as Point;
  return (
    <div className="p-spark">
      <span className="p-spark-value num">{NUMBER.format(last.value)}</span>
      <svg viewBox="0 0 100 24" width="100" height="24" aria-hidden="true">
        <path d={path} className="line" />
      </svg>
      <span className="p-spark-label">{last.label}</span>
    </div>
  );
}
