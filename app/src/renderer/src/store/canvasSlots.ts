/** Multi-canvas sidebar metadata (Warp-style). Slot METADATA (id, title,
 *  color, server session id) persists in localStorage; the canvas TREES live
 *  in memory only — a restarted app re-snapshots on the next turn against the
 *  same server-side canvasSessionId. */

import { prefsKey } from './prefsNamespace.js';

export interface CanvasSlotMeta {
  /** client-local slot identity (stable across renames/reconnects) */
  slotId: string;
  /** auto-derived from the canvas content; falls back to "Canvas N" */
  title: string;
  /** index into the fixed sidebar color cycle */
  color: number;
  /** server-acked canvasSessionId — absent until the slot first connected */
  sessionId?: string;
}

const STORAGE_KEY = 'omadia.ui-prefs.canvases';
export const SLOT_COLORS = 6;

export function newSlot(index: number): CanvasSlotMeta {
  return {
    slotId: crypto.randomUUID(),
    title: `Canvas ${index + 1}`,
    color: index % SLOT_COLORS,
  };
}

export function loadSlots(): { slots: CanvasSlotMeta[]; activeId: string } | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(prefsKey(STORAGE_KEY)) ?? '') as {
      slots?: CanvasSlotMeta[];
      activeId?: string;
    };
    if (!Array.isArray(parsed.slots) || parsed.slots.length === 0) return null;
    const slots = parsed.slots.filter(
      (s): s is CanvasSlotMeta => typeof s === 'object' && s !== null && typeof s.slotId === 'string',
    );
    if (slots.length === 0) return null;
    const activeId = slots.some((s) => s.slotId === parsed.activeId)
      ? (parsed.activeId as string)
      : (slots[0] as CanvasSlotMeta).slotId;
    return { slots, activeId };
  } catch {
    return null;
  }
}

export function saveSlots(slots: CanvasSlotMeta[], activeId: string): void {
  try {
    localStorage.setItem(prefsKey(STORAGE_KEY), JSON.stringify({ slots, activeId }));
  } catch {
    // quota/private-mode — sidebar still works for this session
  }
}

/** First heading/container title in the tree — the canvas names itself. */
export function autoTitle(tree: unknown): string | null {
  if (typeof tree !== 'object' || tree === null) return null;
  const node = tree as Record<string, unknown>;
  if (node['type'] === 'heading' && typeof node['content'] === 'string' && node['content'].trim()) {
    return (node['content'] as string).trim().slice(0, 48);
  }
  if (typeof node['title'] === 'string' && node['title'].trim()) {
    return (node['title'] as string).trim().slice(0, 48);
  }
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) {
      for (const child of value) {
        const t = autoTitle(child);
        if (t) return t;
      }
    } else if (typeof value === 'object' && value !== null) {
      const t = autoTitle(value);
      if (t) return t;
    }
  }
  return null;
}
