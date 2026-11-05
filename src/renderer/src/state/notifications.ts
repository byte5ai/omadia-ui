import { createStore } from "../lib/create-store";

/**
 * Notifications from the server (and a few local ones). Info and success
 * appear briefly bottom left and leave after six seconds; warning and error
 * stay as a banner until you act. Everything lands in the bell history.
 */

export type Severity = "info" | "success" | "warning" | "error";

export interface AppNotification {
  id: string;
  severity: Severity;
  title: string;
  body?: string;
  source?: string;
  scope?: string;
  action?: { type: string; payload?: unknown; label?: string };
  dedupeKey?: string;
  at: number;
  read: boolean;
  /** still on screen as toast or banner */
  visible: boolean;
}

const HISTORY_MAX = 100;
const TOAST_MS = 6000;
const STORAGE_KEY = "omadia.ui2.notifications";

function loadHistory(): AppNotification[] {
  try {
    const raw = JSON.parse(
      localStorage.getItem(STORAGE_KEY) ?? "[]",
    ) as unknown;
    return Array.isArray(raw)
      ? (raw as AppNotification[]).map((n) => ({ ...n, visible: false }))
      : [];
  } catch {
    return [];
  }
}

export const notificationStore = createStore<AppNotification[]>(loadHistory());

notificationStore.subscribe(() => {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(notificationStore.get().slice(0, HISTORY_MAX)),
    );
  } catch {
    /* storage full or blocked: history stays in memory */
  }
});

const isTransient = (s: Severity): boolean => s === "info" || s === "success";

export function notify(
  input: Omit<AppNotification, "at" | "read" | "visible" | "id"> & {
    id?: string;
    ttlMs?: number;
  },
): string {
  const id =
    input.id ?? `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const list = notificationStore.get();
  if (list.some((n) => n.id === id)) return id;
  const entry: AppNotification = {
    id,
    severity: input.severity,
    title: input.title,
    ...(input.body ? { body: input.body } : {}),
    ...(input.source ? { source: input.source } : {}),
    ...(input.scope ? { scope: input.scope } : {}),
    ...(input.action ? { action: input.action } : {}),
    ...(input.dedupeKey ? { dedupeKey: input.dedupeKey } : {}),
    at: Date.now(),
    read: false,
    visible: true,
  };
  const rest = input.dedupeKey
    ? list.filter((n) => !(n.dedupeKey === input.dedupeKey && n.visible))
    : list;
  notificationStore.set([entry, ...rest].slice(0, HISTORY_MAX));
  if (isTransient(entry.severity)) {
    setTimeout(() => dismiss(id), input.ttlMs ?? TOAST_MS);
  }
  return id;
}

export function dismiss(id: string): void {
  notificationStore.set((list) =>
    list.map((n) => (n.id === id ? { ...n, visible: false } : n)),
  );
}

export function markAllRead(): void {
  notificationStore.set((list) => list.map((n) => ({ ...n, read: true })));
}

export const unreadCount = (list: AppNotification[]): number =>
  list.reduce((sum, n) => sum + (n.read ? 0 : 1), 0);

export function relativeTime(at: number, now = Date.now()): string {
  const min = Math.round((now - at) / 60_000);
  if (min < 1) return "gerade eben";
  if (min < 60) return `vor ${min} Minute${min === 1 ? "" : "n"}`;
  const h = Math.round(min / 60);
  if (h < 24) return `vor ${h} Stunde${h === 1 ? "" : "n"}`;
  const d = Math.round(h / 24);
  if (d === 1) return "gestern";
  return new Date(at).toLocaleDateString("de-DE", {
    day: "numeric",
    month: "short",
  });
}
