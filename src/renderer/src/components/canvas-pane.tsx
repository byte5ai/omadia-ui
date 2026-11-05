import {
  type ReactElement,
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";

import { useStore } from "../lib/create-store";
import {
  arr,
  collectSuggestions,
  findNode,
  isNode,
  type Node,
  openQuestion,
  withoutQuestions,
} from "../lib/tree";
import { cellText } from "../primitives/data-nodes";
import {
  Children,
  PrimitiveNode,
  Skeleton,
} from "../primitives/primitive-node";
import {
  RenderContext,
  type RenderContextValue,
  selectionStore,
} from "../primitives/render-context";
import {
  abort,
  type ActionInput,
  back,
  canvasStore,
  createCanvas,
  patchMeta,
  refresh,
  sendAction,
  sendPrompt,
} from "../state/canvases";
import { forgeStyleStore } from "../state/forge-style";
import {
  closePane,
  focusPane,
  openOverlay,
  showCanvas,
  splitPane,
} from "../state/workspace";
import { CanvasFocus } from "./canvas-focus";
import { CanvasForge } from "./canvas-forge";
import { Icon } from "./icons";
import { OmadiaMark } from "./logo";
import { QuestionModal } from "./question-modal";

interface PaneProps {
  slotKey: string;
  focused: boolean;
  single: boolean;
}

export function CanvasPane({
  slotKey,
  focused,
  single,
}: PaneProps): ReactElement | null {
  const meta = useStore(canvasStore, (s) => s.metas[slotKey]);
  const rt = useStore(canvasStore, (s) => s.runtime[slotKey]);
  const [editingTitle, setEditingTitle] = useState(false);

  const changed = useMemo(
    () =>
      new Set(
        rt?.canvas.lastApply?.kind === "patch" && !rt.canvas.lastApply.rapid
          ? rt.canvas.lastApply.changedIds
          : [],
      ),
    [rt?.canvas.lastApply],
  );
  const sent = useMemo(() => new Set(rt?.sent ?? []), [rt?.sent]);
  const busy = rt?.canvas.turnPending ?? false;

  const action = useCallback(
    (a: ActionInput, sourceId?: string) =>
      void sendAction(slotKey, a, sourceId),
    [slotKey],
  );
  const openRowPanel = useCallback(
    (containerId: string, rowKey: string, x: number, y: number) =>
      openOverlay({ kind: "action-panel", slotKey, containerId, rowKey, x, y }),
    [slotKey],
  );
  const ctx: RenderContextValue = useMemo(
    () => ({ slotKey, changed, sent, busy, depth: 0, action, openRowPanel }),
    [slotKey, changed, sent, busy, action, openRowPanel],
  );
  const rawTree = rt?.canvas.tree ?? null;
  const tree = useMemo(() => withoutQuestions(rawTree), [rawTree]);
  const answered = meta?.answered;
  const question = useMemo(
    () => (busy ? undefined : openQuestion(rawTree, answered)),
    [rawTree, answered, busy],
  );
  // A canvas built from nothing has no panel while it is built; once the
  // turn ends the panel arrives out of the light.
  const forging = busy && (rt?.forging ?? false);
  const [wasForging, setWasForging] = useState(forging);
  const [arrived, setArrived] = useState(false);
  const forgeStyle = useStore(forgeStyleStore, (s) => s);
  if (wasForging !== forging) {
    setWasForging(forging);
    if (!forging) setArrived(true);
  }
  if (!meta || !rt) return null;
  if (forging) {
    // Keyed: another canvas in this pane starts its own clock and progress.
    return forgeStyle === "focus" ? (
      <CanvasFocus key={slotKey} slotKey={slotKey} />
    ) : (
      <CanvasForge key={slotKey} slotKey={slotKey} />
    );
  }
  const hasTree = isNode(tree);
  const offline =
    rt.status.state !== "ready" &&
    rt.connected &&
    rt.status.state !== "connecting";

  const split = (dir: "columns" | "rows"): void => {
    const next = createCanvas();
    splitPane(slotKey, dir, next);
  };

  return (
    <section
      className={`pane${focused && !single ? " focused" : ""}${arrived ? " arrived" : ""}`}
      data-pane={slotKey}
      aria-label={meta.title}
      onMouseDown={() => focusPane(slotKey)}
    >
      <header className="pane-bar">
        {editingTitle ? (
          <input
            className="pane-title-input"
            defaultValue={meta.title}
            autoFocus
            aria-label="Name des Canvas"
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v)
                patchMeta(slotKey, {
                  title: v.slice(0, 64),
                  titleLocked: true,
                });
              setEditingTitle(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") setEditingTitle(false);
            }}
          />
        ) : (
          <h2
            className="pane-title"
            onDoubleClick={() => setEditingTitle(true)}
            title="Doppelklick zum Umbenennen"
          >
            {meta.title}
          </h2>
        )}
        {busy ? (
          <button
            type="button"
            className="btn ghost sm"
            onClick={() => abort(slotKey)}
          >
            Abbrechen
          </button>
        ) : null}
        {offline ? (
          <span className="status warning pane-state">
            {socketLabel(rt.status.state)}
          </span>
        ) : null}
        <span className="grow" />
        <button
          type="button"
          className="icon-btn"
          aria-label="Zurück"
          title="Zurück"
          disabled={rt.canvas.history.length === 0}
          onClick={() => back(slotKey)}
        >
          <Icon name="back" />
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label="Aktualisieren"
          title="Aktualisieren"
          disabled={!hasTree || rt.canvas.revision === null || busy}
          onClick={() => void refresh(slotKey)}
        >
          <Icon name="refresh" />
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label="Neue Spalte"
          title="Neue Spalte"
          onClick={() => split("columns")}
        >
          <Icon name="splitColumns" />
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label="Neue Zeile"
          title="Neue Zeile"
          onClick={() => split("rows")}
        >
          <Icon name="splitRows" />
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label="Schließen"
          title="Schließen"
          onClick={() => closePane(slotKey)}
        >
          <Icon name="close" />
        </button>
      </header>

      {rt.menu && rt.menu.length ? (
        <RenderContext.Provider value={{ ...ctx, depth: 1 }}>
          <div role="toolbar" aria-label="Pane-Menü" className="pane-menu">
            <Children nodes={rt.menu} />
          </div>
        </RenderContext.Provider>
      ) : null}

      <div className="pane-stage">
        <div className="pane-body" inert={question ? true : undefined}>
          {!hasTree && !busy ? (
            <ColdStart slotKey={slotKey} />
          ) : (
            <div className="canvas-flow">
              {rt.prompt ? (
                <div className="you-line">
                  <span className="you-chip">Du</span>
                  <p>{rt.prompt}</p>
                </div>
              ) : null}
              <span
                className="dot-anchor-inline"
                data-dot-anchor={`pane:${slotKey}:center`}
                data-dot-size={hasTree ? 5 : 8}
              />
              <RenderContext.Provider value={ctx}>
                <div
                  className="canvas-tree"
                  key={rt.canvas.snapshotRevision ?? "local"}
                >
                  {hasTree ? (
                    <PrimitiveNode node={tree as Node} />
                  ) : (
                    <Skeleton lines={4} />
                  )}
                </div>
              </RenderContext.Provider>
              <span className="grow" />
              <Voice slotKey={slotKey} tree={tree} />
            </div>
          )}
        </div>
        {question ? (
          <QuestionModal
            slotKey={slotKey}
            question={question}
            focused={focused || single}
          />
        ) : null}
      </div>
      {hasTree || busy ? <AskBar slotKey={slotKey} busy={busy} /> : null}
    </section>
  );
}

function socketLabel(state: string): string {
  switch (state) {
    case "failed":
      return "Verbindung unterbrochen";
    case "unauthenticated":
      return "Anmeldung abgelaufen";
    case "forbidden":
      return "Kein Zugriff";
    default:
      return "Getrennt";
  }
}

/** omadia's voice below the canvas: errors, and its suggestions. */
function Voice({
  slotKey,
  tree,
}: {
  slotKey: string;
  tree: unknown;
}): ReactElement | null {
  const rt = useStore(canvasStore, (s) => s.runtime[slotKey]);
  const suggestions = useMemo(
    () => collectSuggestions(tree).slice(0, 2),
    [tree],
  );
  const error = rt?.canvas.turnError;
  if (!rt) return null;
  if (error && error !== "aborted") {
    return (
      <div className="voice panel" role="alert">
        <span className="status danger">{errorText(error)}</span>
        <span className="grow" />
        {rt.prompt ? (
          <button
            type="button"
            className="btn sm"
            onClick={() => void sendPrompt(slotKey, rt.prompt as string)}
          >
            Erneut senden
          </button>
        ) : null}
      </div>
    );
  }
  // The canvas is the answer. omadia only speaks in text when something
  // failed; its suggestions stay, as actions without commentary.
  if (suggestions.length === 0) return null;
  return (
    <div className="voice panel">
      <span
        className="voice-mark"
        data-dot-anchor={`pane:${slotKey}:voice`}
        data-dot-size={5}
      >
        <OmadiaMark size={16} />
      </span>
      <p className="voice-text dim">Vorschläge von omadia</p>
      {suggestions.length ? (
        <div className="voice-actions">
          {suggestions.map((s, i) => (
            <button
              key={s.id}
              type="button"
              className={`btn${i === 0 ? " primary" : ""}`}
              onClick={() =>
                s.prompt
                  ? void sendPrompt(slotKey, s.prompt, { target: s.target })
                  : void sendAction(
                      slotKey,
                      {
                        type: "suggested_action",
                        payload: { id: s.id, label: s.label },
                      },
                      s.containerId,
                    )
              }
            >
              {s.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function errorText(message: string): string {
  if (/orchestrator unavailable|503/i.test(message))
    return "omadia ist gerade nicht erreichbar: kein Sprachmodell verbunden";
  if (/rate-limited/i.test(message))
    return "Zu schnell hintereinander. Gleich noch einmal.";
  if (/session check unavailable/i.test(message))
    return "Anmeldung wird gerade geprüft. Bitte erneut senden.";
  return message;
}

/** Follow-up questions to the canvas. Only sending starts a request. */
function AskBar({
  slotKey,
  busy,
}: {
  slotKey: string;
  busy: boolean;
}): ReactElement {
  const [text, setText] = useState("");
  const selection = useStore(selectionStore, (s) => s[slotKey]);
  const ref = useRef<HTMLInputElement>(null);
  const submit = (): void => {
    const t = text.trim();
    if (!t || busy) return;
    setText("");
    if (!selection) {
      void sendPrompt(slotKey, t);
      return;
    }
    // The orchestrator is stateless across turns: spell out what is selected.
    const tree = canvasStore.get().runtime[slotKey]?.canvas.tree;
    const context = describeSelection(
      tree,
      selection.containerId,
      selection.keys,
    );
    void sendPrompt(slotKey, context ? `${t} (Auswahl: ${context})` : t, {
      viewState: { selection },
      target: { kind: "container", containerId: selection.containerId },
    });
  };
  return (
    <form
      className="ask-bar"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <label className="beam-field">
        <span className="beam" aria-hidden="true" />
        <span className="sr-only">Frag omadia zu diesem Canvas</span>
        <input
          ref={ref}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={
            selection
              ? `Frag omadia zu ${selection.keys.length === 1 ? "dieser Auswahl" : `${selection.keys.length} Zeilen`}`
              : "Frag omadia zu diesem Canvas"
          }
          disabled={busy}
        />
        <button
          type="submit"
          className="send-btn"
          aria-label="Senden"
          disabled={!text.trim() || busy}
        >
          <Icon name="send" />
        </button>
      </label>
    </form>
  );
}

function describeSelection(
  tree: unknown,
  containerId: string,
  keys: string[],
): string {
  const container = findNode(tree, (n) => n.id === containerId);
  if (!container) return keys.join(", ");
  const rows = [...arr(container.rows), ...arr(container.items)] as Array<{
    rowKey?: string;
    itemKey?: string;
    label?: string;
    cells?: Record<string, unknown>;
  }>;
  return rows
    .filter((r) => keys.includes(r.rowKey ?? r.itemKey ?? ""))
    .map((r) =>
      r.cells
        ? Object.entries(r.cells)
            .map(([k, v]) => `${k}: ${cellText(v)}`)
            .join(", ")
        : (r.label ?? r.itemKey ?? ""),
    )
    .join("; ");
}

/** An empty canvas: describe the view, omadia builds it from your data. */
function ColdStart({ slotKey }: { slotKey: string }): ReactElement {
  const [text, setText] = useState("");
  const recent = useStore(canvasStore, (s) => s.order);
  const metas = useStore(canvasStore, (s) => s.metas);
  const others = recent
    .filter(
      (k) => k !== slotKey && metas[k] && metas[k]?.title !== "Neuer Canvas",
    )
    .slice(0, 3);
  return (
    <div className="cold-start">
      <div className="cold-inner">
        <h1 className="t-display">Was brauchst du?</h1>
        <p className="cold-lead">
          Beschreib die Ansicht. omadia baut sie aus deinen Daten und zeigt dir,
          woher jede Zahl kommt.
        </p>
        <form
          className="cold-input"
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim()) void sendPrompt(slotKey, text);
          }}
        >
          <label htmlFor={`cold-${slotKey}`} className="sr-only">
            Anfrage an omadia
          </label>
          <span
            className="dot-anchor-inline"
            data-dot-anchor={`pane:${slotKey}:center`}
            data-dot-size={8}
          />
          <input
            id={`cold-${slotKey}`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Zum Beispiel: Offene Tickets nach Owner, mit Restbudget"
            autoFocus
          />
          <span className="kbd">↵</span>
        </form>
        {others.length ? (
          <div className="cold-list panel">
            <p className="menu-heading">Zuletzt</p>
            {others.map((k) => (
              <button
                key={k}
                type="button"
                className="menu-item"
                onClick={() => showCanvas(k)}
              >
                <span className="grow">{metas[k]?.title}</span>
                <span className="t-small">
                  {relative(metas[k]?.updatedAt ?? 0)}
                </span>
              </button>
            ))}
          </div>
        ) : null}
        <p className="cold-foot">
          <span className="kbd">⌘K</span> öffnet den Befehl überall.
        </p>
      </div>
    </div>
  );
}

export function relative(at: number): string {
  const diff = Date.now() - at;
  const day = 86_400_000;
  if (diff < 60_000) return "gerade eben";
  if (diff < 3_600_000) return `vor ${Math.round(diff / 60_000)} Min.`;
  if (new Date(at).toDateString() === new Date().toDateString()) return "heute";
  if (diff < 2 * day) return "gestern";
  if (diff < 6 * day)
    return new Date(at).toLocaleDateString("de-DE", { weekday: "short" });
  return new Date(at).toLocaleDateString("de-DE", {
    day: "numeric",
    month: "short",
  });
}
