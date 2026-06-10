/** Palette binding per visual-spec §2.5.4 — user-bound, never agent-bound.
 *  Three curated palettes share the single accent slot; Lagoon is the default.
 *
 *  The durable home for this preference is Tier-2 `ui-prefs` (set
 *  conversationally, per contextKey — CONCEPT.md palette-binding-protocol).
 *  Protocol 1.0 has no prefs transport yet, so until that lands the binding
 *  lives client-local (localStorage), bound via the ⌥⌘P quick-picker —
 *  keyboard-first per §0, a transient command-palette moment, explicitly
 *  NOT a Settings screen (§7.6). */

export type LumePalette = 'lagoon' | 'petrol' | 'atelier';

export const LUME_PALETTES: readonly LumePalette[] = ['lagoon', 'petrol', 'atelier'];

/** §2.5 palette stories + a scheme-independent swatch hue for the picker */
export const PALETTE_META: Record<LumePalette, { name: string; story: string; swatch: string }> = {
  lagoon: { name: 'Lagoon', story: 'Lit water · Standard', swatch: '#6fc8d6' },
  petrol: { name: 'Petrol', story: 'Computational ambient', swatch: '#52b0e2' },
  atelier: { name: 'Atelier', story: 'Studio warmth', swatch: '#e0a26b' },
};

const STORAGE_KEY = 'omadia.ui-prefs.palette';

const isPalette = (v: unknown): v is LumePalette => LUME_PALETTES.includes(v as LumePalette);

export function currentPalette(): LumePalette {
  const set = document.documentElement.dataset['palette'];
  return isPalette(set) ? set : 'lagoon';
}

/** Bind a palette to the accent slot. §6.6: only color values cross-fade
 *  (200ms / motion.smooth); tree structure is untouched. Reduced-motion:
 *  instant token swap, no transition. `persist: false` = live preview only
 *  (picker arrow keys) — nothing written until the user confirms. */
export function applyPalette(
  palette: LumePalette,
  opts?: { transition?: boolean; persist?: boolean },
): void {
  const root = document.documentElement;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (opts?.transition !== false && !reduced) {
    root.classList.add('lume-palette-switching');
    window.setTimeout(() => root.classList.remove('lume-palette-switching'), 250);
  }
  if (palette === 'lagoon') {
    delete root.dataset['palette']; // Lagoon is the :root default
  } else {
    root.dataset['palette'] = palette;
  }
  if (opts?.persist === false) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, palette);
  } catch {
    // storage may be unavailable (private mode) — binding stays session-local
  }
}

/** Restore the persisted binding at boot — no transition on first paint. */
export function initPalette(): void {
  let saved: string | null = null;
  try {
    saved = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    saved = null;
  }
  if (isPalette(saved) && saved !== 'lagoon') {
    applyPalette(saved, { transition: false });
  }
}
