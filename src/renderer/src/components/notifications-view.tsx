import type { ReactElement } from "react";

import { useStore } from "../lib/create-store";
import { canvasStore, sendAction } from "../state/canvases";
import {
  type AppNotification,
  dismiss,
  markAllRead,
  notificationStore,
  relativeTime,
} from "../state/notifications";
import {
  activeDesktop,
  closeOverlay,
  workspaceStore,
} from "../state/workspace";
import { Icon } from "./icons";

const toneOf = (n: AppNotification): string =>
  n.severity === "error"
    ? "danger"
    : n.severity === "warning"
      ? "warning"
      : n.severity === "success"
        ? "success"
        : "info";

function runAction(n: AppNotification): void {
  if (!n.action) return;
  const desktop = activeDesktop(workspaceStore.get());
  const slot =
    (n.scope && canvasStore.get().metas[n.scope] ? n.scope : undefined) ??
    desktop?.focused;
  if (slot)
    void sendAction(slot, { type: n.action.type, payload: n.action.payload });
  dismiss(n.id);
}

/** Warning and error stay as a banner until you act. */
export function Banners(): ReactElement | null {
  const list = useStore(notificationStore, (s) => s);
  const banners = list
    .filter(
      (n) => n.visible && (n.severity === "warning" || n.severity === "error"),
    )
    .slice(0, 3);
  if (!banners.length) return null;
  return (
    <div className="banners">
      {banners.map((n) => (
        <div
          key={n.id}
          className="banner panel"
          role={n.severity === "error" ? "alert" : "status"}
        >
          <span className={`status ${toneOf(n)}`}>{n.title}</span>
          {n.body ? <span className="banner-body">{n.body}</span> : null}
          <span className="grow" />
          {n.action ? (
            <button
              type="button"
              className="btn sm"
              onClick={() => runAction(n)}
            >
              {n.action.label ?? "Erneut versuchen"}
            </button>
          ) : null}
          <button
            type="button"
            className="icon-btn"
            aria-label="Schließen"
            onClick={() => dismiss(n.id)}
          >
            <Icon name="close" />
          </button>
        </div>
      ))}
    </div>
  );
}

/** Info and success appear briefly bottom left. */
export function Toasts(): ReactElement | null {
  const list = useStore(notificationStore, (s) => s);
  const toasts = list
    .filter(
      (n) => n.visible && (n.severity === "info" || n.severity === "success"),
    )
    .slice(0, 3);
  if (!toasts.length) return null;
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((n) => (
        <div key={n.id} className="toast panel lit">
          <span className={`status ${toneOf(n)}`}>{n.title}</span>
          {n.action ? (
            <button
              type="button"
              className="btn ghost sm"
              onClick={() => runAction(n)}
            >
              {n.action.label ?? "Öffnen"}
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}

/** The bell: history, newest first, at most 100. */
export function BellPanel(): ReactElement {
  const list = useStore(notificationStore, (s) => s);
  const metas = useStore(canvasStore, (s) => s.metas);
  const unread = list.filter((n) => !n.read).length;
  return (
    <div className="overlay-scrim clear" onMouseDown={closeOverlay}>
      <section
        className="bell-panel panel lit"
        aria-label="Benachrichtigungen"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="bell-head">
          <h2 className="t-section">Benachrichtigungen</h2>
          {unread ? (
            <span className="badge num">{unread > 9 ? "9+" : unread}</span>
          ) : null}
          <span className="grow" />
          <button
            type="button"
            className="btn ghost sm"
            onClick={markAllRead}
            disabled={!unread}
          >
            Alle gelesen
          </button>
        </header>
        <div className="bell-list">
          {list.length === 0 ? (
            <p className="p-empty">Noch nichts passiert.</p>
          ) : null}
          {list.map((n) => (
            <div key={n.id} className={`bell-item${n.read ? " read" : ""}`}>
              <span className={`status ${toneOf(n)}`}>{n.title}</span>
              <span className="t-small">
                {relativeTime(n.at)}
                {n.scope && metas[n.scope]
                  ? `, ${metas[n.scope]?.title}`
                  : n.source
                    ? `, ${n.source}`
                    : ""}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
