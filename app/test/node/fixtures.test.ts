import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { validateTree } from '../../src/renderer/src/validate/validator.js';

// Parity anchor: every canonical primitive fixture (synced from
// @omadia/canvas-core via scripts/sync-canvas-schema.mjs) must validate against
// this renderer's pre-compiled validator. It is the same fixture set the mobile
// renderer runs, so a primitive shape the desktop validator would reject — i.e.
// schema drift between the two renderers — fails here.
const fixturesDir = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../docs/protocol/fixtures',
);
const readFixtureFiles = (): string[] =>
  readdirSync(fixturesDir).filter((f: string) => f.endsWith('.json'));
const schemaOptional = process.env.OMADIA_SCHEMA_OPTIONAL === '1';
const files: string[] = (() => {
  if (!schemaOptional) {
    return readFixtureFiles();
  }
  try {
    return readFixtureFiles();
  } catch {
    return [];
  }
})();
const skipReason: string | null =
  schemaOptional && files.length === 0
    ? 'skipped: OMADIA_SCHEMA_OPTIONAL=1 and docs/protocol/fixtures is missing or empty'
    : null;
const describeFixtures = skipReason ? describe.skip : describe;

describeFixtures(
  skipReason
    ? `canonical fixtures validate against the desktop validator - ${skipReason}`
    : 'canonical fixtures validate against the desktop validator',
  () => {
    it('covers all 24 primitives + the gallery', () => {
      expect(files.length).toBe(25);
    });

    for (const file of files) {
      it(`${file} is a valid canvas tree`, () => {
        const node: unknown = JSON.parse(readFileSync(join(fixturesDir, file), 'utf8'));
        const result = validateTree(node);
        expect(result.errors).toBeNull();
        expect(result.ok).toBe(true);
      });
    }
  },
);
