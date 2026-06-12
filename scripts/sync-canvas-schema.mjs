// Sync the canonical canvas protocol contract from @omadia/canvas-core into
// this repo: the 6 JSON schemas (docs/protocol/schema) and the canonical
// primitive fixtures (docs/protocol/fixtures). No vendored/committed copy =>
// no drift: both are fetched from the single source of truth at gen/test time.
//
// Source: the omadia monorepo's canvas-core package, located robustly below.
// Set OMADIA_REPO to override.
//
// The pre-compiled renderer validator (app/src/renderer/src/validate/
// validators.generated.mjs) is committed and is what runs at runtime; the
// schemas are only needed to re-generate it (npm run gen:validator). The
// fixtures feed the parity contract test (app/test/node/fixtures.test.ts).
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { execSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');

// Locate the omadia monorepo (which holds @omadia/canvas-core) robustly. The
// plain `../omadia` sibling breaks when omadia-ui runs from a LINKED GIT
// WORKTREE: repoRoot is then .../omadia-ui/.claude/worktrees/<name>, so
// `../omadia` resolves inside the worktree tree and nothing is found. Try, in
// order: an explicit OMADIA_REPO; the plain sibling; the sibling of the MAIN
// checkout (resolved via git, so any worktree depth works); the conventional
// ~/sources/omadia. The first candidate that actually contains canvas-core wins.
const mainCheckout = (() => {
  try {
    const common = execSync('git rev-parse --path-format=absolute --git-common-dir', {
      cwd: repoRoot,
    })
      .toString()
      .trim();
    return common ? dirname(common) : null;
  } catch {
    return null;
  }
})();
const candidateRoots = [
  process.env.OMADIA_REPO && resolve(repoRoot, process.env.OMADIA_REPO),
  resolve(repoRoot, '../omadia'),
  mainCheckout && resolve(mainCheckout, '../omadia'),
  resolve(homedir(), 'sources/omadia'),
].filter(Boolean);
const omadiaRepo =
  candidateRoots.find((r) => existsSync(join(r, 'middleware/packages/canvas-core/schema'))) ??
  candidateRoots[0];
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
  if (process.env.OMADIA_SCHEMA_OPTIONAL === '1') {
    console.warn(
      'sync-canvas-schema: schema sync skipped — building against the committed validator',
    );
    process.exit(0);
  }
  console.error(
    'sync-canvas-schema: @omadia/canvas-core not found. Tried:\n' +
      candidateRoots.map((r) => `  - ${join(r, 'middleware/packages/canvas-core')}`).join('\n') +
      '\nClone https://github.com/byte5ai/omadia next to omadia-ui, or set OMADIA_REPO.',
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
