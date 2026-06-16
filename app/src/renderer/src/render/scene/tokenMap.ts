/**
 * omadia-canvas-protocol/1.1 — scene colour/font token → Lume CSS variable maps.
 * Pure constants (no DOM) so they can be parity-checked against the schema in a
 * node-env test. The DOM resolver lives in tokens.ts.
 */

/** scene colorToken → Lume CSS custom property (theme/lume.css). */
export const TOKEN_TO_CSSVAR: Record<string, string> = {
  accent: '--lume-accent',
  'accent.glow': '--lume-accent-glow',
  'accent.glow-soft': '--lume-accent-subtle',
  'accent.glow-core': '--lume-accent-glow-core',
  surface: '--lume-surface',
  'surface-raised': '--lume-surface-raised',
  'surface-sunken': '--lume-sunken-top',
  text: '--lume-text',
  'text-muted': '--lume-text-secondary',
  'text-faint': '--lume-text-tertiary',
  neutral: '--lume-border',
  info: '--lume-accent',
  success: '--lume-success-fg',
  warning: '--lume-warning-fg',
  danger: '--lume-error-fg',
};

/** scene text register → Lume font CSS variable (visual-spec.md §2.7). */
export const REGISTER_TO_CSSVAR: Record<string, string> = {
  display: '--lume-font-structural',
  prose: '--lume-font-prose',
  mono: '--lume-font-mono',
};
