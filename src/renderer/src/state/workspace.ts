import { createStore } from "../lib/create-store";

/**
 * Desktops hold a tiling layout of canvas panes. Leaves point at local slot
 * keys; on the wire they are mapped to canvas session ids so they travel
 * between installs.
 */

export type Layout =
  | { kind: "leaf"; slotKey: string }
  | {
      kind: "split";
      dir: "columns" | "rows";
      ratio: number;
      a: Layout;
      b: Layout;
    };

export interface Desktop {
  desktopId: string;
  name: string;
  color: number;
  updatedAt: number;
  layout: Layout | null;
  focused?: string;
  /** created on a cold start before the server's desktops arrived */
  provisional?: boolean;
}

export type Overlay =
  | { kind: "none" }
  | { kind: "command"; slotKey?: string }
  | { kind: "library" }
  | { kind: "settings" }
  | { kind: "bell" }
  | {
      kind: "action-panel";
      slotKey: string;
      containerId: string;
      rowKey: string;
      x: number;
      y: number;
    };

export interface WorkspaceState {
  desktops: Desktop[];
  activeDesktopId: string | null;
  overlay: Overlay;
  sidebar: boolean;
  /** desktop ids deleted this run: a late server list must not resurrect them */
  tombstones: string[];
}

export const workspaceStore = createStore<WorkspaceState>({
  desktops: [],
  activeDesktopId: null,
  overlay: { kind: "none" },
  sidebar: true,
  tombstones: [],
});

/** Muted desktop tints, used only as small swatches. Values live in tokens.css per mode. */
export const DESKTOP_TINTS = [
  "var(--tint-0)",
  "var(--tint-1)",
  "var(--tint-2)",
  "var(--tint-3)",
  "var(--tint-4)",
  "var(--tint-5)",
] as const;

const newId = (): string =>
  `d-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

export const activeDesktop = (
  s: WorkspaceState = workspaceStore.get(),
): Desktop | undefined =>
  s.desktops.find((d) => d.desktopId === s.activeDesktopId);

export function leaves(layout: Layout | null): string[] {
  if (!layout) return [];
  if (layout.kind === "leaf") return [layout.slotKey];
  return [...leaves(layout.a), ...leaves(layout.b)];
}

function mapLayout(
  layout: Layout | null,
  fn: (leaf: Extract<Layout, { kind: "leaf" }>) => Layout | null,
): Layout | null {
  if (!layout) return null;
  if (layout.kind === "leaf") return fn(layout);
  const a = mapLayout(layout.a, fn);
  const b = mapLayout(layout.b, fn);
  if (!a) return b;
  if (!b) return a;
  return { ...layout, a, b };
}

function updateDesktop(desktopId: string, fn: (d: Desktop) => Desktop): void {
  workspaceStore.set((s) => ({
    ...s,
    desktops: s.desktops.map((d) => {
      if (d.desktopId !== desktopId) return d;
      // Once you work on it, it is yours and never replaced by the server's.
      const { provisional: _p, ...rest } = fn(d);
      return { ...rest, updatedAt: Date.now() };
    }),
  }));
}

export function createDesktop(
  name?: string,
  slotKey?: string,
  provisional = false,
): string {
  const s = workspaceStore.get();
  const desktopId = newId();
  const desktop: Desktop = {
    desktopId,
    name: name ?? `Desktop ${s.desktops.length + 1}`,
    color: s.desktops.length % DESKTOP_TINTS.length,
    updatedAt: Date.now(),
    layout: slotKey ? { kind: "leaf", slotKey } : null,
    ...(slotKey ? { focused: slotKey } : {}),
    ...(provisional ? { provisional } : {}),
  };
  workspaceStore.set({
    ...s,
    desktops: [...s.desktops, desktop],
    activeDesktopId: desktopId,
  });
  return desktopId;
}

export function deleteDesktop(desktopId: string): void {
  workspaceStore.set((s) => {
    const desktops = s.desktops.filter((d) => d.desktopId !== desktopId);
    return {
      ...s,
      desktops,
      tombstones: [...s.tombstones, desktopId],
      activeDesktopId:
        s.activeDesktopId === desktopId
          ? (desktops[0]?.desktopId ?? null)
          : s.activeDesktopId,
    };
  });
}

export function renameDesktop(desktopId: string, name: string): void {
  updateDesktop(desktopId, (d) => ({ ...d, name: name.slice(0, 48) }));
}

export function switchDesktop(desktopId: string): void {
  workspaceStore.set((s) => ({ ...s, activeDesktopId: desktopId }));
}

export function focusPane(slotKey: string): void {
  const d = activeDesktop();
  if (!d || d.focused === slotKey) return;
  workspaceStore.set((s) => ({
    ...s,
    desktops: s.desktops.map((x) =>
      x.desktopId === d.desktopId ? { ...x, focused: slotKey } : x,
    ),
  }));
}

/** Show a canvas on the active desktop: focus it if it is there, else
 *  replace the focused pane (or fill an empty desktop). */
export function showCanvas(slotKey: string): void {
  let d = activeDesktop();
  if (!d) {
    createDesktop("Desktop 1", slotKey);
    return;
  }
  if (leaves(d.layout).includes(slotKey)) {
    focusPane(slotKey);
    return;
  }
  // A focus left on a pane that has since gone falls back to the first one.
  const open = leaves(d.layout);
  const target = d.focused && open.includes(d.focused) ? d.focused : open[0];
  updateDesktop(d.desktopId, (x) => ({
    ...x,
    focused: slotKey,
    layout: target
      ? mapLayout(x.layout, (leaf) =>
          leaf.slotKey === target ? { kind: "leaf", slotKey } : leaf,
        )
      : { kind: "leaf", slotKey },
  }));
  d = activeDesktop();
}

export function splitPane(
  slotKey: string,
  dir: "columns" | "rows",
  newSlotKey: string,
): void {
  const d = activeDesktop();
  if (!d) return;
  updateDesktop(d.desktopId, (x) => ({
    ...x,
    focused: newSlotKey,
    layout: mapLayout(x.layout, (leaf) =>
      leaf.slotKey === slotKey
        ? {
            kind: "split",
            dir,
            ratio: 0.5,
            a: leaf,
            b: { kind: "leaf", slotKey: newSlotKey },
          }
        : leaf,
    ),
  }));
}

/** Remove a pane from the desktop. The canvas itself stays in the library. */
export function closePane(slotKey: string): void {
  const d = activeDesktop();
  if (!d) return;
  updateDesktop(d.desktopId, (x) => {
    const layout = mapLayout(x.layout, (leaf) =>
      leaf.slotKey === slotKey ? null : leaf,
    );
    const rest = leaves(layout);
    return {
      ...x,
      layout,
      ...(x.focused === slotKey ? { focused: rest[0] } : {}),
    };
  });
}

/** A canvas deleted for good disappears from every desktop. */
export function forgetCanvas(slotKey: string): void {
  workspaceStore.set((s) => ({
    ...s,
    desktops: s.desktops.map((d) => {
      if (!leaves(d.layout).includes(slotKey)) return d;
      const layout = mapLayout(d.layout, (leaf) =>
        leaf.slotKey === slotKey ? null : leaf,
      );
      return {
        ...d,
        layout,
        updatedAt: Date.now(),
        ...(d.focused === slotKey ? { focused: leaves(layout)[0] } : {}),
      };
    }),
  }));
}

export function setRatio(path: string, ratio: number): void {
  const d = activeDesktop();
  if (!d) return;
  const clamp = Math.min(0.85, Math.max(0.15, ratio));
  const apply = (layout: Layout, rest: string): Layout => {
    if (layout.kind === "leaf") return layout;
    if (rest === "") return { ...layout, ratio: clamp };
    const [head, ...tail] = rest.split(".");
    return head === "a"
      ? { ...layout, a: apply(layout.a, tail.join(".")) }
      : { ...layout, b: apply(layout.b, tail.join(".")) };
  };
  updateDesktop(d.desktopId, (x) => ({
    ...x,
    layout: x.layout ? apply(x.layout, path) : null,
  }));
}

export function openOverlay(overlay: Overlay): void {
  workspaceStore.set((s) => ({ ...s, overlay }));
}

export function closeOverlay(): void {
  workspaceStore.set((s) => ({ ...s, overlay: { kind: "none" } }));
}

export function toggleSidebar(): void {
  workspaceStore.set((s) => ({ ...s, sidebar: !s.sidebar }));
}

export function resetWorkspace(): void {
  workspaceStore.set({
    desktops: [],
    activeDesktopId: null,
    overlay: { kind: "none" },
    sidebar: true,
    tombstones: [],
  });
}
