// Validators are pre-compiled at build time (npm run gen:validator): Ajv's
// runtime new Function() compilation violates the packaged renderer's CSP
// (default-src 'self', no unsafe-eval) and would blank the app on launch.
// Single source of truth stays docs/protocol/schema/*.json.
import {
  validateSurfaceEvent as surfaceValidate,
  validateTree as treeValidate,
  validateLumen as lumenValidate,
  validateScene as sceneValidate,
  validateLxNode as lxNodeValidate,
  type StandaloneValidate,
} from './validators.generated.mjs';

export interface ValidationResult {
  ok: boolean;
  /** human-readable Ajv error summary; null when ok */
  errors: string | null;
}

function run(validate: StandaloneValidate, value: unknown): ValidationResult {
  const ok = validate(value);
  return {
    ok,
    errors: ok ? null : (validate.errors ?? []).map((e) => `${e.instancePath} ${e.message}`).join('; '),
  };
}

/** The whitelist parser — unknown primitive type or prop is rejected hard. */
export function validateTree(tree: unknown): ValidationResult {
  return run(treeValidate, tree);
}

export function validateSurfaceEvent(event: unknown): ValidationResult {
  return run(surfaceValidate, event);
}

// ── omadia-canvas-protocol/1.1 — Lumens (Live Interactivity) ──
/** Structural whitelist parser for a full Lumen (state/transitions/view/…). */
export function validateLumen(lumen: unknown): ValidationResult {
  return run(lumenValidate, lumen);
}
/** Structural whitelist parser for a `scene` primitive (draw-list). */
export function validateScene(scene: unknown): ValidationResult {
  return run(sceneValidate, scene);
}
/** Structural whitelist parser for a single LX AST node. */
export function validateLxNode(node: unknown): ValidationResult {
  return run(lxNodeValidate, node);
}
