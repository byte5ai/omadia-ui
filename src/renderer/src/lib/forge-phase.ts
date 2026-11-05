import type { GlyphName } from "./forge-glyphs";

/**
 * What a build turn is doing, read from what the protocol tells us: no text
 * yet, text streaming, a skeleton standing, regions filling, all filled.
 */

export type ForgePhase = "read" | "think" | "lay" | "fill" | "check";

export interface ForgeSignal {
  hasTree: boolean;
  proseLength: number;
  /** regions in the view */
  total: number;
  /** regions still waiting for their data */
  loading: number;
}

export function phaseOf(s: ForgeSignal): ForgePhase {
  if (!s.hasTree) return s.proseLength > 0 ? "think" : "read";
  if (s.total === 0 || s.loading === 0) return "check";
  return s.loading === s.total ? "lay" : "fill";
}

export const PHASE_LABEL: Record<ForgePhase, string> = {
  read: "Anfrage",
  think: "Recherche",
  lay: "Aufbau",
  fill: "Daten",
  check: "Prüfung",
};

export const PHASE_WORDS: Record<ForgePhase, string[]> = {
  read: ["Lese", "Verstehe", "Sortiere", "Sondiere"],
  think: ["Recherchiere", "Frage Quellen an", "Verknüpfe", "Grüble", "Wäge ab"],
  lay: ["Skizziere", "Ordne an", "Setze das Raster"],
  fill: ["Fülle", "Rechne", "Zeichne", "Verdichte", "Trage ein"],
  check: ["Prüfe", "Gleiche ab", "Feile"],
};

export const PHASE_GLYPHS: Record<ForgePhase, GlyphName[]> = {
  read: ["document", "lens"],
  think: ["lens", "nodes", "sources"],
  lay: ["grid"],
  fill: ["table", "bars", "trend"],
  check: ["check"],
};

const toward = (ms: number, tau: number): number => 1 - Math.exp(-ms / tau);

/**
 * How far along the turn is. Honest where the protocol says something (the
 * share of filled regions), a slow approach where it does not, so the bar
 * never stops and never arrives before the canvas does.
 */
export function progressOf(
  s: ForgeSignal,
  phase: ForgePhase,
  /** ms since the phase began, or since the last region was filled */
  since: number,
): number {
  switch (phase) {
    case "read":
      return 0.06 * toward(since, 3000);
    case "think":
      return 0.06 + 0.3 * toward(since, 15000);
    case "lay":
      return 0.4 + 0.08 * toward(since, 6000);
    case "fill": {
      const share = 0.55 / s.total;
      const done = s.total - s.loading;
      return 0.4 + share * done + share * 0.7 * toward(since, 6000);
    }
    case "check":
      return 0.95 + 0.04 * toward(since, 5000);
  }
}

/** The newest finished sentence of omadia's voice, for the line below. */
export function latestSentence(prose: string): string {
  const text = prose
    .replace(/\{[^{}]*\}/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const parts = text.match(/[^.!?…→]+[.!?…]/g) ?? [];
  const last = parts[parts.length - 1]?.trim() ?? "";
  return last.length > 2 ? last : "";
}
