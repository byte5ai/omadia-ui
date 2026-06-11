// Sync the canonical canvas protocol contract from @omadia/canvas-core into
// this repo: the 6 JSON schemas (docs/protocol/schema) and the canonical
// primitive fixtures (docs/protocol/fixtures). No vendored/committed copy =>
// no drift: both are fetched from the single source of truth at gen/test time.
//
// Source: the omadia monorepo's canvas-core package. Override the repo path
// with OMADIA_REPO (default: ../omadia sibling checkout — the expected layout
// when omadia-ui and omadia are cloned side by side).
//
// The pre-compiled renderer validator (app/src/renderer/src/validate/
// validators.generated.mjs) is committed and is what runs at runtime; the
// schemas are only needed to re-generate it (npm run gen:validator). The
// fixtures feed the parity contract test (app/test/node/fixtures.test.ts).
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const omadiaRepo = resolve(repoRoot, process.env.OMADIA_REPO ?? '../omadia');
const coreDir = join(omadiaRepo, 'middleware/packages/canvas-core');
const schemaSrc = join(coreDir, 'schema');
const fixturesSrc = join(coreDir, 'fixtures');
const schemaDest = join(repoRoot, 'docs/protocol/schema');
const fixturesDest = join(repoRoot, 'docs/protocol/fixtures');

const SCHEMAS = [
  'data-ref',
  'target-ref',
  'canvas-tree',
  'handshake',
  'sentinels',
  'surface-events',
];

if (!existsSync(schemaSrc)) {
  console.error(
    `sync-canvas-schema: canonical canvas-core not found at ${coreDir}\n` +
      'Clone https://github.com/byte5ai/omadia as a sibling checkout, or set OMADIA_REPO.',
  );
  process.exit(1);
}

mkdirSync(schemaDest, { recursive: true });
for (const name of SCHEMAS) {
  copyFileSync(join(schemaSrc, `${name}.schema.json`), join(schemaDest, `${name}.schema.json`));
}

// Mirror the fixtures dir exactly (replace local copy) so a primitive removed
// upstream also disappears from the parity test here.
rmSync(fixturesDest, { recursive: true, force: true });
mkdirSync(fixturesDest, { recursive: true });
let fixtureCount = 0;
for (const entry of readdirSync(fixturesSrc, { withFileTypes: true })) {
  if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
  copyFileSync(join(fixturesSrc, entry.name), join(fixturesDest, entry.name));
  fixtureCount += 1;
}

console.log(
  `sync-canvas-schema: synced ${SCHEMAS.length} schemas + ${fixtureCount} fixtures from ${coreDir}`,
);
