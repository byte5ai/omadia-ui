import { type ReactElement, useMemo, useRef, useState } from "react";

import { Icon } from "../components/icons";
import { parseZone, type Zone } from "../lib/time-zone";
import {
  arr,
  childrenOf,
  isNode,
  type Node,
  num,
  str,
  stripMarkdown,
} from "../lib/tree";
import { LiveClock } from "./live-clock";
import { Children, PrimitiveNode } from "./primitive-node";
import { type FormBinding, RenderContext, useRender } from "./render-context";

const LAYOUTS = new Set(["stack", "split", "grid", "flow"]);

const TIME_LIKE = /^\s*(\d{1,2}:\d{2}(:\d{2})?(\s*uhr)?)?\s*$/i;

/** A card of a zone heading and an empty or time-like value: a clock. */
function clockCard(children: unknown[]): { zone: Zone; label: string } | null {
  const nodes = children.filter(isNode);
  if (nodes.length < 1 || nodes.length > 3) return null;
  const heading = nodes.find((n) => n.type === "heading");
  const label = str(heading?.content);
  const zone = parseZone(label?.replace(/\s*\(.*\)$/, ""));
  if (!heading || !label || !zone) return null;
  const rest = nodes.filter((n) => n !== heading);
  const slots = rest.every(
    (n) =>
      (n.type === "text" &&
        (TIME_LIKE.test(str(n.content) ?? "") ||
          parseZone(n.content) !== null)) ||
      (n.type === "status" && TIME_LIKE.test(str(n.text) ?? "")),
  );
  return slots ? { zone, label } : null;
}

/** Containers order, they do not decorate. As the root they are frameless. */
export function ContainerNode({ node }: { node: Node }): ReactElement {
  const ctx = useRender();
  const layout = LAYOUTS.has(str(node.layout) ?? "")
    ? (node.layout as string)
    : "stack";
  const isRoot = ctx.depth === 0;
  // The root toolbar lives in the pane menu, not inline.
  const children = arr(node.children).filter(
    (c) => !(isRoot && isNode(c) && c.type === "toolbar"),
  );
  const title = str(node.title);
  const clockZone = clockCard(children);
  if (clockZone) {
    return (
      <div className="p-clock-card">
        <span className="p-clock-zone">{clockZone.label}</span>
        <LiveClock zone={clockZone.zone} label={clockZone.label} size="large" />
      </div>
    );
  }
  const framed = !isRoot && title !== undefined;
  const inner = (
    <RenderContext.Provider value={{ ...ctx, depth: ctx.depth + 1 }}>
      <div className={`p-layout l-${layout}`}>
        <Children nodes={children} />
      </div>
    </RenderContext.Provider>
  );
  if (node.kind === "modal") {
    return (
      <div className="p-modal-scrim">
        <section
          className="p-modal panel"
          role="dialog"
          aria-label={title ?? "Dialog"}
        >
          {title ? (
            <h3 className="p-group-title">{stripMarkdown(title)}</h3>
          ) : null}
          {inner}
        </section>
      </div>
    );
  }
  if (!framed)
    return <div className={`p-container${isRoot ? " root" : ""}`}>{inner}</div>;
  return (
    <section className="p-container framed">
      <h3 className="p-group-title">{stripMarkdown(title)}</h3>
      {inner}
    </section>
  );
}

export function PaneNode({ node }: { node: Node }): ReactElement {
  const ctx = useRender();
  const tone = str(node.tone);
  const title = str(node.title);
  const content = [
    ...(isNode(node.container) ? [node.container] : []),
    ...arr(node.children),
  ];
  const body = (
    <RenderContext.Provider value={{ ...ctx, depth: ctx.depth + 1 }}>
      <div className="p-layout l-stack">
        <Children nodes={content} />
      </div>
    </RenderContext.Provider>
  );
  const pane = (
    <section
      className={`p-pane panel${tone && tone !== "neutral" ? ` tone-${tone}` : ""}`}
      {...(node.kind === "modal" ? { role: "dialog" } : {})}
      aria-label={title}
    >
      {title ? (
        <h3
          className={`p-pane-title${tone && tone !== "neutral" ? ` status ${tone}` : ""}`}
        >
          {stripMarkdown(title)}
        </h3>
      ) : null}
      {body}
    </section>
  );
  return node.kind === "modal" ? (
    <div className="p-modal-scrim">{pane}</div>
  ) : (
    pane
  );
}

export function TabsNode({ node }: { node: Node }): ReactElement {
  const ctx = useRender();
  const tabs = arr(node.tabs) as Array<{
    label: string;
    done?: boolean;
    child: unknown;
  }>;
  const serverStep = num(node.activeStep);
  const wizard =
    tabs.some((t) => t.done !== undefined) || serverStep !== undefined;
  const [local, setLocal] = useState(serverStep ?? 0);
  const active = Math.min(
    wizard && serverStep !== undefined ? serverStep : local,
    tabs.length - 1,
  );
  const current = tabs[active];

  return (
    <div className="p-tabs">
      {wizard ? (
        <ol className="p-wizard" aria-label="Schritte">
          {tabs.map((t, i) => (
            <li
              key={i}
              className={t.done ? "done" : i === active ? "current" : ""}
              aria-current={i === active ? "step" : undefined}
            >
              <button
                type="button"
                onClick={() => setLocal(i)}
                disabled={serverStep !== undefined}
              >
                <span className="p-wizard-mark">
                  {t.done ? <Icon name="check" size={12} /> : i + 1}
                </span>
                {t.label}
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <div role="tablist" className="segmented">
          {tabs.map((t, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={i === active}
              onClick={() => setLocal(i)}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}
      <div role="tabpanel" className="p-tab-panel">
        <RenderContext.Provider value={{ ...ctx, depth: ctx.depth + 1 }}>
          {current && isNode(current.child) ? (
            <PrimitiveNode node={current.child} />
          ) : null}
        </RenderContext.Provider>
      </div>
    </div>
  );
}

export function ToolbarNode({ node }: { node: Node }): ReactElement {
  const ctx = useRender();
  return (
    <div role="toolbar" className="p-toolbar">
      <RenderContext.Provider value={{ ...ctx, depth: ctx.depth + 1 }}>
        <Children nodes={arr(node.children)} />
      </RenderContext.Provider>
    </div>
  );
}

interface MenuItem {
  id?: string;
  label?: string;
  action?: { type: string; payload?: unknown };
  items?: MenuItem[];
  shortcut?: string;
  checked?: boolean;
}

export function MenubarNode({ node }: { node: Node }): ReactElement {
  const ctx = useRender();
  const items = arr(node.items) as MenuItem[];
  const [open, setOpen] = useState<number | null>(null);
  const run = (item: MenuItem): void => {
    setOpen(null);
    ctx.action(
      item.action ?? {
        type: "menu_select",
        payload: { id: item.id, label: item.label },
      },
      item.id,
    );
  };
  return (
    <nav
      className="p-menubar"
      aria-label="Menü"
      onMouseLeave={() => setOpen(null)}
    >
      {items.map((item, i) => (
        <div key={item.id ?? i} className="p-menubar-entry">
          <button
            type="button"
            className={`p-menubar-top${open === i ? " open" : ""}`}
            aria-expanded={item.items ? open === i : undefined}
            onClick={() =>
              item.items ? setOpen(open === i ? null : i) : run(item)
            }
          >
            {item.label}
          </button>
          {open === i && item.items ? (
            <div className="p-menubar-drop panel" role="menu">
              {item.items.map((sub, j) => (
                <button
                  key={sub.id ?? j}
                  type="button"
                  role="menuitem"
                  className="menu-item"
                  onClick={() => run(sub)}
                >
                  <span className="grow">{sub.label}</span>
                  {sub.shortcut ? (
                    <span className="kbd">{sub.shortcut}</span>
                  ) : null}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ))}
    </nav>
  );
}

/** A form collects its controls' values; only its button sends. A bound
 *  form points with a beam at the object it edits. */
export function FormNode({ node }: { node: Node }): ReactElement {
  const ctx = useRender();
  const values = useRef<Record<string, unknown>>({});
  const binding = useMemo<FormBinding>(
    () => ({
      set: (id, value) => {
        values.current = { ...values.current, [id]: value };
      },
      values: () => values.current,
    }),
    [],
  );
  const title = str(node.title);
  const bound = node.contextBinding as
    | { kind?: string; itemKey?: string; rowKey?: string; elementId?: string }
    | undefined;
  const boundLabel = bound?.rowKey ?? bound?.itemKey ?? bound?.elementId;
  const hasButton = childrenOf(node).some(
    (c) => c.type === "button" || c.type === "toolbar",
  );

  return (
    <form
      className="p-form panel"
      onSubmit={(e) => {
        e.preventDefault();
        ctx.action(
          { type: "form_submit", payload: { fields: binding.values() } },
          str(node.id),
        );
      }}
    >
      {title ? <h3 className="p-group-title">{stripMarkdown(title)}</h3> : null}
      {boundLabel ? (
        <p className="p-form-bound">
          <span className="beam" aria-hidden="true" />
          Bearbeitet: {boundLabel}
        </p>
      ) : null}
      <RenderContext.Provider
        value={{ ...ctx, form: binding, depth: ctx.depth + 1 }}
      >
        <div className="p-layout l-stack">
          <Children nodes={arr(node.children)} />
        </div>
      </RenderContext.Provider>
      {hasButton ? null : (
        <div className="p-form-actions">
          <button type="submit" className="btn primary sm">
            Übernehmen
          </button>
        </div>
      )}
    </form>
  );
}
