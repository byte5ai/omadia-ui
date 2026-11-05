import { createStore } from "../lib/create-store";

/**
 * Experiment: two ways to show a canvas being built. "focus" keeps the middle
 * of the tile (glyph, words, progress), "bench" draws the view's outline.
 * Per device, so it stays out of the synced settings.
 */

export type ForgeStyle = "focus" | "bench";

const STORAGE_KEY = "omadia.forge-style";

function load(): ForgeStyle {
  try {
    return localStorage.getItem(STORAGE_KEY) === "bench" ? "bench" : "focus";
  } catch {
    return "focus";
  }
}

export const forgeStyleStore = createStore<ForgeStyle>(load());

export function toggleForgeStyle(): void {
  const next: ForgeStyle =
    forgeStyleStore.get() === "focus" ? "bench" : "focus";
  forgeStyleStore.set(next);
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // private storage off: the choice lasts this session
  }
}
