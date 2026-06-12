/** Root-toolbar hoisting storage/extraction for the sticky per-canvas menu
 *  described in visual-spec §2.15. */

/** minimal structural node type — no import from PrimitiveNode (avoid a cycle) */
export type MenuNode = { type: string; [key: string]: unknown };

const STORAGE_PREFIX = 'omadia.ui-menu.';

const keyFor = (sessionId: string): string => `${STORAGE_PREFIX}${sessionId}`;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isMenuNode = (value: unknown): value is MenuNode =>
  isRecord(value) && typeof value.type === 'string';

export function extractRootMenu(tree: unknown): MenuNode | null {
  if (!isRecord(tree) || tree.type !== 'container') return null;
  const children = tree.children;
  if (!Array.isArray(children)) return null;
  for (const child of children) {
    if (isMenuNode(child) && child.type === 'toolbar') return child;
  }
  return null;
}

export function loadStoredMenu(sessionId: string): MenuNode | null {
  const key = keyFor(sessionId);
  try {
    const raw = globalThis.localStorage?.getItem(key);
    if (raw === null || raw === undefined) return null;
    const parsed: unknown = JSON.parse(raw);
    if (isMenuNode(parsed)) return parsed;
    try {
      globalThis.localStorage?.removeItem(key);
    } catch {
      // best-effort cleanup only
    }
    return null;
  } catch {
    try {
      globalThis.localStorage?.removeItem(key);
    } catch {
      // best-effort cleanup only
    }
    return null;
  }
}

export function storeMenu(sessionId: string, menu: MenuNode | null): void {
  const key = keyFor(sessionId);
  try {
    if (menu === null) {
      globalThis.localStorage?.removeItem(key);
      return;
    }
    globalThis.localStorage?.setItem(key, JSON.stringify(menu));
  } catch {
    // quota/private-mode/absent storage — menu stays in memory only
  }
}
