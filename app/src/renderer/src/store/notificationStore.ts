import type { NotificationMsg } from '../../../shared/protocol.js';
import { prefsKey } from './prefsNamespace.js';

/** Notification history (issue #15): every notification lands here (the
 *  "bell"); persisted client-side so it survives restarts. Severity → UI
 *  element is a FIXED mapping — info/success toast (auto-dismiss),
 *  warning/error banner (persists until dismissed). */
export interface UiNotification extends NotificationMsg {
  /** which slot's socket delivered it (the ack goes back the same way) */
  slotKey: string;
  receivedAt: number;
  read: boolean;
  dismissed: boolean;
}

const STORAGE_KEY = 'omadia.ui-prefs.notifications';
const MAX_HISTORY = 100;
/** default toast lifetime when the server sent none */
export const DEFAULT_TOAST_TTL_MS = 6000;

export const isToast = (n: UiNotification): boolean =>
  n.severity === 'info' || n.severity === 'success';

export function loadNotifications(): UiNotification[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(prefsKey(STORAGE_KEY)) ?? '') as UiNotification[];
    if (!Array.isArray(parsed)) return [];
    // toasts never survive a restart un-dismissed; banners do
    return parsed
      .filter((n) => typeof n === 'object' && n !== null && typeof n.id === 'string')
      .map((n) => (isToast(n) ? { ...n, dismissed: true } : n))
      .slice(0, MAX_HISTORY);
  } catch {
    return [];
  }
}

export function persistNotifications(list: UiNotification[]): void {
  try {
    localStorage.setItem(prefsKey(STORAGE_KEY), JSON.stringify(list.slice(0, MAX_HISTORY)));
  } catch {
    /* quota — history degrades to session-only */
  }
}

/** Prepend + dedupe: a notification with the same dedupeKey REPLACES an
 *  undismissed older one (coalescing — one toast, not one per tool call). */
export function addNotification(
  list: UiNotification[],
  msg: NotificationMsg,
  slotKey: string,
  now: number,
): UiNotification[] {
  const entry: UiNotification = {
    ...msg,
    slotKey,
    receivedAt: now,
    read: false,
    dismissed: false,
  };
  if (list.some((n) => n.id === msg.id)) return list; // exact replay → ignore
  const rest = msg.dedupeKey
    ? list.filter((n) => n.dismissed || n.dedupeKey !== msg.dedupeKey)
    : list;
  return [entry, ...rest].slice(0, MAX_HISTORY);
}

export function dismissNotification(list: UiNotification[], id: string): UiNotification[] {
  return list.map((n) => (n.id === id ? { ...n, dismissed: true, read: true } : n));
}

export function markAllRead(list: UiNotification[]): UiNotification[] {
  return list.map((n) => (n.read ? n : { ...n, read: true }));
}

export const unreadCount = (list: UiNotification[]): number =>
  list.filter((n) => !n.read).length;
