import {
  type ReactElement,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { useStore } from "../lib/create-store";
import { arr, collectSuggestions, findNode } from "../lib/tree";
import { cellText } from "../primitives/data-nodes";
import {
  canvasStore,
  refresh,
  sendAction,
  sendPrompt,
} from "../state/canvases";
import { closeOverlay } from "../state/workspace";
import { Icon } from "./icons";
import { OmadiaMark } from "./logo";

interface Props {
  slotKey: string;
  containerId: string;
  rowKey: string;
  x: number;
  y: number;
}

/** Right click on a row: direct actions, omadia's suggestions, and a beam
 *  field. Opening is instant; a request only starts when you send. */
export function ActionPanel({
  slotKey,
  containerId,
  rowKey,
  x,
  y,
}: Props): ReactElement | null {
  const tree = useStore(canvasStore, (s) => s.runtime[slotKey]?.canvas.tree);
  const refreshable = useStore(
    canvasStore,
    (s) => s.runtime[slotKey]?.refreshable ?? [],
  );
  const [text, setText] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });

  const container = findNode(tree, (n) => n.id === containerId);
  const rows = container
    ? arr(container.rows).length
      ? arr(container.rows)
      : arr(container.items)
    : [];
  const index = rows.findIndex(
    (r) =>
      (r as { rowKey?: string; itemKey?: string }).rowKey === rowKey ||
      (r as { itemKey?: string }).itemKey === rowKey,
  );
  const row = rows[index] as
    { cells?: Record<string, unknown>; label?: string } | undefined;
  const firstCol = (
    arr(container?.columns)[0] as { fieldKey?: string } | undefined
  )?.fieldKey;
  const title =
    row?.cells && firstCol
      ? cellText(row.cells[firstCol])
      : (row?.label ?? rowKey);
  const suggestions = container
    ? collectSuggestions(container).slice(0, 4)
    : [];
  const describe = row?.cells
    ? Object.entries(row.cells)
        .map(([k, v]) => `${k}: ${cellText(v)}`)
        .join(", ")
    : title;
  const target = { kind: "item", containerId, itemKey: rowKey };

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({
      left: Math.min(x, window.innerWidth - r.width - 12),
      top: Math.min(y, window.innerHeight - r.height - 12),
    });
  }, [x, y]);

  useEffect(() => {
    const key = (e: KeyboardEvent): void => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key.toLowerCase() === "r" && refreshable.includes(containerId)) {
        closeOverlay();
        void refresh(slotKey, containerId);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [slotKey, containerId, refreshable]);

  const ask = (prompt: string): void => {
    closeOverlay();
    void sendPrompt(slotKey, `${prompt} (${describe}; rowKey ${rowKey})`, {
      target,
    });
  };

  return (
    <div className="overlay-scrim clear" onMouseDown={closeOverlay}>
      <div
        ref={ref}
        className="action-panel panel lit"
        role="menu"
        aria-label={`Aktionen für ${title}`}
        style={pos}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="ap-head">
          <p className="ap-title">{title}</p>
          {index >= 0 ? (
            <p className="t-small">
              Zeile {index + 1} von {rows.length}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          role="menuitem"
          className="menu-item"
          onClick={() => {
            // the structured action: the server answers it from the table's
            // own query where it can (no model), else the agent takes it
            closeOverlay();
            void sendAction(
              slotKey,
              {
                type: "row_details",
                payload: { containerId, rowKey, locale: "de-DE" },
              },
              containerId,
            );
          }}
        >
          <span className="grow">Details anzeigen</span>
        </button>
        {refreshable.includes(containerId) ? (
          <button
            type="button"
            role="menuitem"
            className="menu-item"
            onClick={() => {
              closeOverlay();
              void refresh(slotKey, containerId);
            }}
          >
            <span className="grow">Tabelle aktualisieren</span>
            <span className="kbd">R</span>
          </button>
        ) : null}
        {suggestions.length ? (
          <>
            <div className="menu-sep" />
            <p className="menu-heading">Vorschläge von omadia</p>
            {suggestions.map((s) => (
              <button
                key={s.id}
                type="button"
                role="menuitem"
                className="menu-item"
                onClick={() => {
                  closeOverlay();
                  if (s.prompt) void sendPrompt(slotKey, s.prompt, { target });
                  else
                    void sendAction(
                      slotKey,
                      {
                        type: "suggested_action",
                        payload: { id: s.id, label: s.label, rowKey },
                      },
                      containerId,
                    );
                }}
              >
                <OmadiaMark size={14} />
                <span className="grow">{s.label}</span>
              </button>
            ))}
          </>
        ) : null}
        <div className="menu-sep" />
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim()) ask(text.trim());
          }}
        >
          <label className="beam-field">
            <span className="beam" aria-hidden="true" />
            <span className="sr-only">Frag omadia zu dieser Zeile</span>
            <input
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Frag omadia zu dieser Zeile"
              onKeyDown={(e) => e.key === "Escape" && closeOverlay()}
            />
            <button
              type="submit"
              className="send-btn"
              aria-label="Senden"
              disabled={!text.trim()}
            >
              <Icon name="send" />
            </button>
          </label>
        </form>
        <p className="ap-foot t-small">
          Öffnet sofort. Eine Anfrage entsteht erst beim Absenden.
        </p>
      </div>
    </div>
  );
}
