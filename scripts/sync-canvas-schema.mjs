// Sync the canonical canvas protocol schemas from @omadia/canvas-core into this
// repo's docs/protocol/schema. No vendored/committed schema copy => no drift:
// the schemas are fetched from the single source of truth at gen/build time.
//
// Source: the omadia monorepo's canvas-core package. Override the repo path
// with OMADIA_REPO (default: ../omadia sibling checkout — the expected layout
// when omadia-ui and omadia are cloned side by side).
//
// The pre-compiled renderer validator (app/src/renderer/src/validate/
// validators.generated.mjs) is committed and is what runs at runtime; these
// schemas are only needed to re-generate it (npm run gen:validator).
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const omadiaRepo = resolve(repoRoot, process.env.OMADIA_REPO ?? '../omadia');
const srcDir = join(omadiaRepo, 'middleware/packages/canvas-core/schema');
const destDir = join(repoRoot, 'docs/protocol/schema');

const SCHEMAS = [
  'data-ref',
  'target-ref',
  'canvas-tree',
  'handshake',
  'sentinels',
  'surface-events',
];

if (!existsSync(srcDir)) {
  console.error(
    `sync-canvas-schema: canonical schemas not found at ${srcDir}\n` +
      'Clone https://github.com/byte5ai/omadia as a sibling checkout, or set OMADIA_REPO.',
  );
  process.exit(1);
}

mkdirSync(destDir, { recursive: true });
for (const name of SCHEMAS) {
  copyFileSync(join(srcDir, `${name}.schema.json`), join(destDir, `${name}.schema.json`));
}
console.log(`sync-canvas-schema: synced ${SCHEMAS.length} schemas from ${srcDir}`);
