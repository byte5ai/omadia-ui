import { Ajv2020, type ValidateFunction } from 'ajv/dist/2020.js';
// Single source of truth: the versioned protocol schemas in this repo's docs/.
import canvasTree from '../../../../../docs/protocol/schema/canvas-tree.schema.json' with { type: 'json' };
import dataRef from '../../../../../docs/protocol/schema/data-ref.schema.json' with { type: 'json' };
import handshake from '../../../../../docs/protocol/schema/handshake.schema.json' with { type: 'json' };
import sentinels from '../../../../../docs/protocol/schema/sentinels.schema.json' with { type: 'json' };
import surfaceEvents from '../../../../../docs/protocol/schema/surface-events.schema.json' with { type: 'json' };
import targetRef from '../../../../../docs/protocol/schema/target-ref.schema.json' with { type: 'json' };

const ajv = new Ajv2020({ allErrors: true, strict: false });
for (const schema of [dataRef, targetRef, canvasTree, handshake, sentinels, surfaceEvents]) {
  ajv.addSchema(schema);
}

function mustGetSchema(id: string): ValidateFunction {
  const validate = ajv.getSchema(id);
  if (!validate) {
    throw new Error(`protocol schema failed to compile: ${id} — check docs/protocol/schema/*.json $id values`);
  }
  return validate as ValidateFunction;
}

const treeValidate = mustGetSchema('https://omadia.ai/protocol/1.0/canvas-tree.schema.json');
const surfaceValidate = mustGetSchema('https://omadia.ai/protocol/1.0/surface-events.schema.json');

export interface ValidationResult {
  ok: boolean;
  /** human-readable Ajv error summary; null when ok */
  errors: string | null;
}

function run(validate: ValidateFunction, value: unknown): ValidationResult {
  const ok = validate(value) as boolean;
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
