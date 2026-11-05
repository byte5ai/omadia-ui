import { type ReactElement, useState } from "react";

import { useStore } from "../lib/create-store";
import {
  canvasStore,
  createCanvas,
  deleteCanvas,
  isBlank,
} from "../state/canvases";
import { closeOverlay, forgetCanvas, showCanvas } from "../state/workspace";
import { relative } from "./canvas-pane";
import { Icon } from "./icons";

/** Every canvas you have, newest first. Opening puts it in the light. */
export function LibraryView(): ReactElement {
  const order = useStore(canvasStore, (s) => s.order);
  const metas = useStore(canvasStore, (s) => s.metas);
  const runtime = useStore(canvasStore, (s) => s.runtime);
  const [query, setQuery] = useState("");
  const [confirm, setConfirm] = useState<string | null>(null);
  const shown = order
    .filter((k) => metas[k] && !isBlank(canvasStore.get(), k))
    .filter(
      (k) =>
        !query || metas[k]?.title.toLowerCase().includes(query.toLowerCase()),
    )
    .sort((a, b) => (metas[b]?.updatedAt ?? 0) - (metas[a]?.updatedAt ?? 0));

  const open = (k: string): void => {
    closeOverlay();
    showCanvas(k);
  };

  return (
    <div className="overlay-scrim" onMouseDown={closeOverlay}>
      <section
        className="library panel"
        role="dialog"
        aria-label="Bibliothek"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="library-head">
          <h2 className="t-title">Bibliothek</h2>
          <span className="grow" />
          <label className="library-search">
            <Icon name="search" />
            <span className="sr-only">Canvases durchsuchen</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Suchen"
              autoFocus
            />
          </label>
          <button
            type="button"
            className="btn primary sm"
            onClick={() => open(createCanvas())}
          >
            <Icon name="plus" />
            Canvas anlegen
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="Schließen"
            onClick={closeOverlay}
          >
            <Icon name="close" />
          </button>
        </header>
        <div className="library-grid">
          {shown.map((k) => {
            const meta = metas[k];
            const rt = runtime[k];
            const running = rt?.canvas.turnPending ?? false;
            return (
              <div key={k} className="library-card">
                <button
                  type="button"
                  className="library-open"
                  onClick={() => open(k)}
                >
                  <Thumb tree={rt?.canvas.tree} />
                  <span className="library-meta">
                    <span className="library-title">{meta?.title}</span>
                    {running ? (
                      <span className="status info">läuft</span>
                    ) : (
                      <span className="t-small">
                        {relative(meta?.updatedAt ?? 0)}
                      </span>
                    )}
                  </span>
                </button>
                {confirm === k ? (
                  <div className="library-confirm">
                    <button
                      type="button"
                      className="btn danger sm"
                      onClick={() => {
                        forgetCanvas(k);
                        deleteCanvas(k);
                        setConfirm(null);
                      }}
                    >
                      Canvas löschen
                    </button>
                    <button
                      type="button"
                      className="btn ghost sm"
                      onClick={() => setConfirm(null)}
                    >
                      Abbrechen
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="icon-btn library-del"
                    aria-label={`${meta?.title} löschen`}
                    onClick={() => setConfirm(k)}
                  >
                    <Icon name="trash" />
                  </button>
                )}
              </div>
            );
          })}
          {shown.length === 0 ? (
            <p className="p-empty">Keine Canvases gefunden.</p>
          ) : null}
        </div>
      </section>
    </div>
  );
}

/** A quiet sketch of the canvas: bars stand for whatever it holds. */
function Thumb({ tree }: { tree: unknown }): ReactElement {
  const has = tree !== null && tree !== undefined;
  return (
    <span className={`library-thumb${has ? "" : " empty"}`} aria-hidden="true">
      {has ? (
        <>
          <span style={{ width: "46%" }} />
          <span style={{ width: "82%" }} />
          <span style={{ width: "64%" }} />
          <span style={{ width: "72%" }} />
        </>
      ) : null}
    </span>
  );
}
