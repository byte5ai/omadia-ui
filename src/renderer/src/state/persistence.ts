import { treeSize } from "../lib/tree";
import {
  type CanvasMeta,
  canvasStore,
  createCanvas,
  isBlank,
  materialize,
  MAX_TREE_CHARS,
  onCanvasesChanged,
  onRawMessage,
  onSocketStatus,
  restoreVoice,
  runtimeOf,
} from "./canvases";
import { type Desktop, type Layout, leaves, workspaceStore } from "./workspace";

/**
 * Two layers keep the workspace: localStorage per server for an instant
 * start, and the server's per-user registries (canvas_list, desktop_list) so
 * canvases and desktops follow you to other installs.
 */

interface LocalCanvas extends CanvasMeta {
  tree?: unknown;
  revision?: string;
  prompt?: string;
  prose?: string;
}

interface LocalSnapshot {
  canvases: LocalCanvas[];
  desktops: Desktop[];
  activeDesktopId: string | null;
}

type WireLayout =
  | { kind: "leaf"; sessionId: string }
  | {
      kind: "split";
      dir: "columns" | "rows";
      ratio: number;
      a: WireLayout;
      b: WireLayout;
    };

interface WireDesktop {
  desktopId: string;
  name: string;
  color: number;
  updatedAt: number;
  layout: WireLayout;
}

interface WireCanvas {
  sessionId: string;
  title: string;
  color: number;
  tree?: unknown;
  revision?: string;
}

let serverId: string | null = null;
let serverListSeen = false;
let desktopListSeen = false;
let pushTimer: ReturnType<typeof setTimeout> | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
const unsubscribers: Array<() => void> = [];

const storageKey = (id: string): string => `omadia.ui2.${id}.workspace`;

// ── local ──

export function loadLocal(id: string): boolean {
  serverId = id;
  serverListSeen = false;
  desktopListSeen = false;
  let snap: LocalSnapshot | null = null;
  try {
    snap = JSON.parse(
      localStorage.getItem(storageKey(id)) ?? "null",
    ) as LocalSnapshot | null;
  } catch {
    snap = null;
  }
  if (!snap) return false;
  for (const c of [...snap.canvases].reverse()) {
    const { tree, revision, prompt, prose, ...meta } = c;
    createCanvas(meta);
    if (tree) materialize(meta.slotKey, tree, revision);
    restoreVoice(meta.slotKey, prompt, prose);
  }
  const known = new Set(Object.keys(canvasStore.get().metas));
  const desktops = snap.desktops.map((d) => ({
    ...d,
    layout: pruneLayout(d.layout, (k) => known.has(k)),
  }));
  workspaceStore.set((s) => ({
    ...s,
    desktops,
    activeDesktopId:
      desktops.find((d) => d.desktopId === snap?.activeDesktopId)?.desktopId ??
      desktops[0]?.desktopId ??
      null,
  }));
  return true;
}

function saveLocal(): void {
  if (!serverId) return;
  const s = canvasStore.get();
  const ws = workspaceStore.get();
  const onDesk = new Set(ws.desktops.flatMap((d) => leaves(d.layout)));
  const canvases: LocalCanvas[] = s.order.flatMap((k) => {
    const meta = s.metas[k];
    if (!meta || (isBlank(s, k) && !onDesk.has(k))) return [];
    const rt = runtimeOf(k);
    // Locally we also keep trees without a server revision (dev demos).
    const keepTree =
      rt.canvas.tree !== null && treeSize(rt.canvas.tree) <= MAX_TREE_CHARS;
    return [
      {
        ...meta,
        ...(keepTree ? { tree: rt.canvas.tree } : {}),
        ...(keepTree && rt.canvas.revision !== null
          ? { revision: rt.canvas.revision }
          : {}),
        ...(rt.prompt ? { prompt: rt.prompt } : {}),
        ...(rt.canvas.prose && !rt.canvas.turnPending
          ? { prose: rt.canvas.prose }
          : {}),
      },
    ];
  });
  const snap: LocalSnapshot = {
    canvases,
    desktops: ws.desktops,
    activeDesktopId: ws.activeDesktopId,
  };
  try {
    localStorage.setItem(storageKey(serverId), JSON.stringify(snap));
  } catch {
    /* quota: the server registry still has it */
  }
}

function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(saveLocal, 400);
}

// ── layout mapping ──

function pruneLayout(
  layout: Layout | null,
  keep: (k: string) => boolean,
): Layout | null {
  if (!layout) return null;
  if (layout.kind === "leaf") return keep(layout.slotKey) ? layout : null;
  const a = pruneLayout(layout.a, keep);
  const b = pruneLayout(layout.b, keep);
  if (!a) return b;
  if (!b) return a;
  return { ...layout, a, b };
}

function toWire(
  layout: Layout | null,
  sessionOf: (k: string) => string | undefined,
): WireLayout | null {
  if (!layout) return null;
  if (layout.kind === "leaf") {
    const sessionId = sessionOf(layout.slotKey);
    return sessionId ? { kind: "leaf", sessionId } : null;
  }
  const a = toWire(layout.a, sessionOf);
  const b = toWire(layout.b, sessionOf);
  if (!a) return b;
  if (!b) return a;
  return { kind: "split", dir: layout.dir, ratio: layout.ratio, a, b };
}

function fromWire(
  layout: WireLayout,
  slotOf: (s: string) => string | undefined,
): Layout | null {
  if (layout.kind === "leaf") {
    const slotKey = slotOf(layout.sessionId);
    return slotKey ? { kind: "leaf", slotKey } : null;
  }
  const a = fromWire(layout.a, slotOf);
  const b = fromWire(layout.b, slotOf);
  if (!a) return b;
  if (!b) return a;
  return { kind: "split", dir: layout.dir, ratio: layout.ratio, a, b };
}

// ── server registry ──

function readySlot(): string | undefined {
  const { runtime } = canvasStore.get();
  return Object.keys(runtime).find((k) => runtime[k]?.status.state === "ready");
}

function pushToServer(): void {
  const slot = readySlot();
  if (!slot || !serverListSeen) return;
  const s = canvasStore.get();
  const canvases: WireCanvas[] = s.order.flatMap((k) => {
    const meta = s.metas[k];
    if (!meta?.sessionId || isBlank(s, k)) return [];
    const rt = runtimeOf(k);
    const withTree =
      rt.canvas.tree !== null &&
      rt.canvas.revision !== null &&
      treeSize(rt.canvas.tree) <= MAX_TREE_CHARS;
    return [
      {
        sessionId: meta.sessionId,
        title: meta.title.slice(0, 64),
        color: meta.color % 6,
        ...(withTree
          ? { tree: rt.canvas.tree, revision: rt.canvas.revision as string }
          : {}),
      },
    ];
  });
  window.omadia.send(slot, {
    type: "canvas_list_put",
    canvases: canvases.slice(0, 50),
  });
  if (!desktopListSeen) return;
  // Blank canvases are not in the registry, so desktops must not point at them.
  const sessionOf = (k: string): string | undefined =>
    isBlank(s, k) ? undefined : s.metas[k]?.sessionId;
  const desktops = workspaceStore
    .get()
    .desktops.flatMap((d): WireDesktop[] => {
      const layout = toWire(d.layout, sessionOf);
      return layout
        ? [
            {
              desktopId: d.desktopId,
              name: d.name.slice(0, 48),
              color: d.color % 6,
              updatedAt: d.updatedAt,
              layout,
            },
          ]
        : [];
    })
    .slice(0, 24);
  window.omadia.send(slot, { type: "desktop_list_put", desktops });
}

function schedulePush(urgent: boolean): void {
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(pushToServer, urgent ? 0 : 800);
}

function mergeCanvasList(entries: WireCanvas[]): void {
  const bySession = new Map<string, string>();
  const { metas } = canvasStore.get();
  for (const m of Object.values(metas))
    if (m.sessionId) bySession.set(m.sessionId, m.slotKey);
  for (const e of [...entries].reverse()) {
    if (typeof e.sessionId !== "string") continue;
    const existing = bySession.get(e.sessionId);
    if (existing) {
      if (runtimeOf(existing).canvas.tree === null && e.tree) {
        materialize(existing, e.tree, e.revision);
      }
      continue;
    }
    const slotKey = createCanvas({
      sessionId: e.sessionId,
      title: e.title || "Canvas",
      color: e.color ?? 0,
    });
    if (e.tree) materialize(slotKey, e.tree, e.revision);
  }
}

function mergeDesktopList(entries: WireDesktop[]): void {
  const { metas } = canvasStore.get();
  const slotOf = (sessionId: string): string | undefined =>
    Object.values(metas).find((m) => m.sessionId === sessionId)?.slotKey;
  workspaceStore.set((s) => {
    // A cold-start desktop gives way to the ones the server knows about.
    const keep = entries.length
      ? s.desktops.filter((d) => !d.provisional)
      : s.desktops;
    const byId = new Map(keep.map((d) => [d.desktopId, d]));
    for (const e of entries) {
      if (s.tombstones.includes(e.desktopId)) continue;
      const local = byId.get(e.desktopId);
      if (local && local.updatedAt >= e.updatedAt) continue;
      const layout = fromWire(e.layout, slotOf);
      // A layout that only partly maps never overwrites a working local one.
      if (local && leaves(layout).length < leaves(local.layout).length)
        continue;
      byId.set(e.desktopId, {
        desktopId: e.desktopId,
        name: e.name,
        color: e.color,
        updatedAt: e.updatedAt,
        layout,
        ...(local?.focused ? { focused: local.focused } : {}),
      });
    }
    const desktops = [...byId.values()];
    const active = desktops.some((d) => d.desktopId === s.activeDesktopId)
      ? s.activeDesktopId
      : (desktops[0]?.desktopId ?? null);
    return { ...s, desktops, activeDesktopId: active };
  });
}

export function startPersistence(): void {
  stopPersistence();
  unsubscribers.push(
    canvasStore.subscribe(scheduleSave),
    workspaceStore.subscribe(scheduleSave),
    workspaceStore.subscribe(() => schedulePush(false)),
    onCanvasesChanged((urgent) => schedulePush(urgent)),
    onSocketStatus((slotKey, next) => {
      if (next.state === "ready" && !serverListSeen) {
        window.omadia.send(slotKey, { type: "canvas_list_get" });
      }
    }),
    onRawMessage((slotKey, msg) => {
      if (msg.type === "canvas_list" && Array.isArray(msg.canvases)) {
        mergeCanvasList(msg.canvases as WireCanvas[]);
        serverListSeen = true;
        window.omadia.send(slotKey, { type: "desktop_list_get" });
      }
      if (msg.type === "desktop_list" && Array.isArray(msg.desktops)) {
        mergeDesktopList(msg.desktops as WireDesktop[]);
        desktopListSeen = true;
        schedulePush(false);
      }
    }),
  );
}

export function stopPersistence(): void {
  while (unsubscribers.length) unsubscribers.pop()?.();
  if (pushTimer) clearTimeout(pushTimer);
  if (saveTimer) clearTimeout(saveTimer);
}

export function flushLocal(): void {
  saveLocal();
}
