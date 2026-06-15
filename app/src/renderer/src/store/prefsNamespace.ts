/** Per-instance localStorage namespacing (bottom-left instance switcher).
 *
 *  Local prefs (canvas slots, desktops, notification history) belong to ONE
 *  omadia instance — switching servers must not leak another instance's
 *  registry into the UI. The active instance id is mirrored into
 *  localStorage so the store modules can resolve their keys SYNCHRONOUSLY
 *  at first render, before the async settings IPC resolves.
 *
 *  Migration: the first run after the multi-instance update finds data on
 *  the legacy un-namespaced keys — `adoptNamespace` copies it onto the
 *  active instance's keys once, so existing workspaces survive. */

export const ACTIVE_INSTANCE_KEY = 'omadia.ui-prefs.active-instance';

/** Base keys that carry per-instance state and take part in adoption. */
export const NAMESPACED_BASE_KEYS = [
  'omadia.ui-prefs.canvases',
  'omadia.ui-prefs.desktops',
  'omadia.ui-prefs.board',
  'omadia.ui-prefs.notifications',
] as const;

export function activeNamespace(): string | null {
  try {
    return localStorage.getItem(ACTIVE_INSTANCE_KEY);
  } catch {
    return null;
  }
}

/** Resolve a base key to the active instance's key. Without a recorded
 *  namespace (pre-update data, fresh install) the legacy key is used. */
export function prefsKey(base: string): string {
  const ns = activeNamespace();
  return ns ? `${base}.${ns}` : base;
}

/** One-time adoption + switch marker. Copies legacy un-namespaced data onto
 *  the instance's keys when no namespace was recorded yet, then records the
 *  instance id. Returns true when the recorded namespace CHANGED (the caller
 *  reloads the renderer so every store re-reads under the new keys). */
export function syncNamespace(instanceId: string): boolean {
  let recorded: string | null = null;
  try {
    recorded = localStorage.getItem(ACTIVE_INSTANCE_KEY);
    if (recorded === instanceId) return false;
    if (recorded === null) {
      // first run after the update — the legacy data belongs to the
      // (migrated) active instance
      for (const base of NAMESPACED_BASE_KEYS) {
        const legacy = localStorage.getItem(base);
        if (legacy !== null && localStorage.getItem(`${base}.${instanceId}`) === null) {
          localStorage.setItem(`${base}.${instanceId}`, legacy);
        }
      }
    }
    localStorage.setItem(ACTIVE_INSTANCE_KEY, instanceId);
    return true;
  } catch {
    return false;
  }
}
