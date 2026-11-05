import { type ReactElement, useState } from "react";

import { useStore } from "../lib/create-store";
import { canvasStore, createCanvas, isBlank } from "../state/canvases";
import { notificationStore, unreadCount } from "../state/notifications";
import { sessionStore } from "../state/session";
import {
  activeDesktop,
  createDesktop,
  deleteDesktop,
  DESKTOP_TINTS,
  leaves,
  openOverlay,
  renameDesktop,
  showCanvas,
  switchDesktop,
  workspaceStore,
} from "../state/workspace";
import { Icon } from "./icons";
import { Logo } from "./logo";

export function Sidebar(): ReactElement {
  const ws = useStore(workspaceStore, (s) => s);
  const order = useStore(canvasStore, (s) => s.order);
  const metas = useStore(canvasStore, (s) => s.metas);
  const runtime = useStore(canvasStore, (s) => s.runtime);
  const notifications = useStore(notificationStore, (s) => s);
  const server = useStore(sessionStore, (s) => s.server);
  const phase = useStore(sessionStore, (s) => s.phase);
  const desktop = activeDesktop(ws);
  const onDesk = leaves(desktop?.layout ?? null);
  const unread = unreadCount(notifications);
  const [renaming, setRenaming] = useState<string | null>(null);

  // One stable order, most recently worked in first: opening a canvas does
  // not move it. The 8 most recent, plus whatever this desktop shows.
  const listed = order
    .filter(
      (k) => metas[k] && (onDesk.includes(k) || !isBlank(canvasStore.get(), k)),
    )
    .filter((k, i) => i < 8 || onDesk.includes(k));
  const anyReady = Object.values(runtime).some(
    (r) => r.status.state === "ready",
  );
  const host = server ? hostOf(server.wsUrl) : "";

  return (
    <nav className="sidebar" aria-label="Navigation">
      <div className="sidebar-head">
        <Logo size={18} anchor="logo" />
        <span className="grow" />
        <button
          type="button"
          className="bell"
          aria-label={
            unread ? `Benachrichtigungen, ${unread} neu` : "Benachrichtigungen"
          }
          onClick={() => openOverlay({ kind: "bell" })}
        >
          <Icon name="bell" />
          {unread ? (
            <span className="badge num">{unread > 9 ? "9+" : unread}</span>
          ) : null}
        </button>
      </div>

      <button
        type="button"
        className="command-btn"
        onClick={() => openOverlay({ kind: "command" })}
      >
        <Icon name="search" />
        <span className="grow">Befehl</span>
        <span className="kbd">⌘K</span>
      </button>

      <p className="side-heading">Desktops</p>
      {ws.desktops.map((d) => {
        const active = d.desktopId === ws.activeDesktopId;
        if (renaming === d.desktopId) {
          return (
            <input
              key={d.desktopId}
              className="side-rename"
              defaultValue={d.name}
              autoFocus
              aria-label="Name des Desktops"
              onBlur={(e) => {
                if (e.target.value.trim())
                  renameDesktop(d.desktopId, e.target.value.trim());
                setRenaming(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                if (e.key === "Escape") setRenaming(null);
              }}
            />
          );
        }
        return (
          <div key={d.desktopId} className="side-row-wrap">
            <button
              type="button"
              className={`side-item${active ? " active" : ""}`}
              aria-current={active ? "true" : undefined}
              onClick={() => switchDesktop(d.desktopId)}
              onDoubleClick={() => setRenaming(d.desktopId)}
            >
              <span
                className="swatch"
                style={{
                  background: DESKTOP_TINTS[d.color % DESKTOP_TINTS.length],
                }}
              />
              <span className="grow">{d.name}</span>
            </button>
            {ws.desktops.length > 1 ? (
              <button
                type="button"
                className="side-remove icon-btn"
                aria-label={`${d.name} entfernen`}
                onClick={() => deleteDesktop(d.desktopId)}
              >
                <Icon name="close" size={12} />
              </button>
            ) : null}
          </div>
        );
      })}
      <button
        type="button"
        className="side-item quiet"
        onClick={() => createDesktop(undefined, createCanvas())}
      >
        <Icon name="plus" />
        <span className="grow">Desktop anlegen</span>
      </button>

      <p className="side-heading">Canvases</p>
      {listed.map((k) => {
        const meta = metas[k];
        const active = desktop?.focused === k && onDesk.includes(k);
        const working = (runtime[k]?.activity ?? "idle") !== "idle";
        return (
          <button
            key={k}
            type="button"
            className={`side-item${active ? " active" : ""}${onDesk.includes(k) ? "" : " off-desk"}`}
            onClick={() => showCanvas(k)}
          >
            <span className="grow">{meta?.title}</span>
            {working ? (
              <span
                className="dot-anchor-inline nav-anchor"
                data-dot-anchor={`nav:${k}`}
                data-dot-size={5}
              />
            ) : null}
          </button>
        );
      })}
      <button
        type="button"
        className="side-item quiet"
        onClick={() => showCanvas(createCanvas())}
      >
        <Icon name="plus" />
        <span className="grow">Canvas anlegen</span>
      </button>
      <div style={{ height: 10 }} />
      <button
        type="button"
        className="side-item quiet"
        onClick={() => openOverlay({ kind: "library" })}
      >
        <Icon name="library" />
        <span className="grow">Bibliothek</span>
        <span className="t-small num">
          {order.filter((k) => !isBlank(canvasStore.get(), k)).length}
        </span>
      </button>

      <span className="grow" />
      <button
        type="button"
        className="server-card"
        onClick={() => openOverlay({ kind: "settings" })}
      >
        <Icon name="server" />
        <span className="server-text">
          <span className="server-host">{host}</span>
          <span
            className={`status ${anyReady ? "success" : phase === "unreachable" ? "danger" : "neutral"}`}
          >
            {anyReady
              ? "verbunden"
              : phase === "unreachable"
                ? "nicht erreichbar"
                : "bereit"}
          </span>
        </span>
        <Icon name="more" />
      </button>
    </nav>
  );
}

export function hostOf(wsUrl: string): string {
  try {
    return new URL(wsUrl).host;
  } catch {
    return wsUrl;
  }
}
