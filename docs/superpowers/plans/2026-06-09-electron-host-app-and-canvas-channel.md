# Electron Host App + Canvas Channel Plugin — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Tier-1 Electron Canvas Host App (greenfield, this repo) that speaks `omadia-canvas-protocol/1.0` end-to-end against a stub server and against the real `omadia-ui-channel`, and close the two remaining gaps in that channel plugin in `byte5ai/omadia`.

**Architecture:** Three-process Electron app (main = window mgmt + auth + WebSocket client; preload = `contextBridge`; renderer = React + Ajv-2020 whitelist validator + revision-disciplined canvas store + primitive renderer for the Walkthrough-1 subset). The server side largely **already exists** in `odoo-bot` main: PR-11 `registerWebSocket` (merged), `omadia-ui-channel` with handshake/turn/fan-out (#173/#209), `omadia-ui-orchestrator` skeleton + inert surface synthesis (#171/#235). Part B therefore only threads two missing client-context fields through the existing channel.

**Tech Stack:** Electron + electron-vite + React 18 + TypeScript (strict) + Ajv 2020 + `ws` + vitest (this repo); Node 22 + `node:test` via tsx (odoo-bot middleware, existing convention).

---

## Context — verified current state (2026-06-09)

| Piece | State | Where |
|---|---|---|
| Protocol spec + 6 JSON Schemas (draft-2020-12) | ✅ done | `docs/protocol/1.0.md`, `docs/protocol/schema/` |
| SDK surface (`surface_*` events, `TargetRef`, `IncomingTurn.target/viewState`, `registerWebSocket`) | ✅ merged | odoo-bot #167–#170, PR-11 |
| `omadia-ui-channel` (discovery route `/omadia-ui/info`, WS `/omadia-ui/canvas`, handshake offer→select→ack, turn serialisation, `surface_*` 1:1 fan-out, `agent_text_delta`/`turn_complete`/`turn_error`, subject-namespaced `conversationId`) | ✅ merged | odoo-bot #173 + #209, `middleware/packages/omadia-ui-channel/` |
| `omadia-ui-orchestrator` (`canvasChatAgent`, surface synthesis from `_pendingCanvasTree`) | ✅ merged but **inert** — `authorizedToolNames` is empty until a producer tool ships (PR-9b-2) | odoo-bot #171 + #235 |
| **Electron Host App** | ❌ zero code — this repo is docs-only | this plan, Part A |
| Channel gaps: `handshake_select.localOperations` is parsed but **dropped**; client `turn` cannot carry an **action** (Walkthrough 1 step 15) | ❌ | this plan, Part B |

**Tier-2 composition (Part C, the PR-9b-2 slice):** today the orchestrator delegates 1:1 and the surface synthesiser is inert (empty allow-set, no LLM call, no skeleton). Part C adds the **Haiku step**: (1) skeleton-first `surface_snapshot` composed by the configured fast model (`ui_orchestrator_model`, default Haiku-class) within ~500ms, (2) a structured **data-requirements handoff** to the delegated main turn so Tier-3 returns payloads matching exactly the skeleton's fields, (3) `_pendingStructuredPayload` → `surface_patch` composition onto the skeleton. Sequencing per implementation-plan.md: the full PR-9b build is gated on the Phase-1 spike — run Part A first, then C; the channel work (Part B) is independent.

**Out of scope:** Spike M2 (editor primitives, WASM ops), electron-builder **signing** (references/apple_dev.md), per-`canvasSessionId` mutex + cross-turn `surfaceSeq` continuity + canvas-state persistence (PR-9b-3), CCM continuity.

**Wire decisions this plan pins (record as protocol feedback in Task A13):**
1. `surface_patch.patches` op grammar = RFC-6902 subset `{op: add|replace|remove, path, value?}` against the tree JSON. Positional array paths are safe **inside** a patch because `basedOnRevision` equality pins the tree shape; the stable-ID rule governs cross-turn references, not intra-patch addressing.
2. Snapshot re-request (on `surfaceSeq` gap / revision mismatch) = close + reconnect + re-`handshake_select` with the same `canvasSessionId`. No new wire message in v1.
3. Row-highlight has no schema-valid wire shape (`tableRow` is closed) — feedback item, not worked around silently.
4. Client `turn.action` (Part B2) rides `IncomingTurn.metadata.action` until the SDK grows a typed field.

## File structure

```
omadia-ui/
  app/                                   # NEW — the Electron Host App package
    package.json, electron.vite.config.ts, vitest.config.ts,
    tsconfig.json, tsconfig.node.json, tsconfig.web.json, eslint.config.mjs
    src/
      shared/protocol.ts                 # wire types + parseServerMessage (client mirror)
      shared/treePatch.ts                # RFC-6902 subset applier
      shared/ipc.ts                      # IPC contract types
      main/index.ts                      # app lifecycle, BrowserWindow, IPC wiring
      main/handshake.ts                  # pure client handshake state machine
      main/canvasSocket.ts               # ws client + reconnect + session persistence
      main/auth.ts                       # login-window omadia_session cookie capture
      preload/index.ts                   # contextBridge bridge
      renderer/
        index.html
        src/main.tsx, src/App.tsx, src/api.d.ts
        src/validate/validator.ts        # Ajv 2020 over docs/protocol/schema (@schema alias)
        src/store/canvasStore.ts         # revision discipline reducer + tiny store
        src/render/PrimitiveNode.tsx     # WT1 primitive subset renderer
        src/theme/lume.css
    test/node/*.test.ts                  # handshake, treePatch, protocol, canvasSocket, stubServer
    test/renderer/*.test.ts(x)           # validator, canvasStore, render smoke
    tools/stub-server/stubServer.ts
    tools/stub-server/recordings/wt1.json
odoo-bot (worktree)                      # Part B — two additive channel edits
  middleware/packages/omadia-ui-channel/src/{protocol.ts, canvasConnection.ts}
  middleware/test/uiChannelWebSocket.test.ts
```

---

# Part A — Electron Host App (repo: `omadia-ui`)

### Task A1: Scaffold the `app/` package

**Files:**
- Create: `app/package.json`, `app/tsconfig.json`, `app/tsconfig.node.json`, `app/tsconfig.web.json`, `app/electron.vite.config.ts`, `app/vitest.config.ts`, `app/eslint.config.mjs`, `app/.gitignore`

- [ ] **Step 1: Create the package and install dependencies**

```bash
mkdir -p app/src/{shared,main,preload,renderer/src/{validate,store,render,theme}} app/test/{node,renderer} app/tools/stub-server/recordings
cd app && npm init -y
npm i react react-dom
npm i -D electron electron-vite @vitejs/plugin-react typescript vitest ws ajv tsx \
  @types/node @types/react @types/react-dom @types/ws \
  eslint @eslint/js typescript-eslint electron-builder
```

- [ ] **Step 2: Write `app/package.json` scripts block** (merge into the generated file; keep the npm-resolved dependency versions)

```json
{
  "name": "@omadia/ui-host-app",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "out/main/index.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "stub-server": "tsx tools/stub-server/stubServer.ts",
    "test": "vitest run",
    "typecheck": "tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.web.json",
    "lint": "eslint src test tools",
    "lint:fix": "eslint src test tools --fix",
    "dist": "electron-vite build && electron-builder --mac dmg zip"
  }
}
```

- [ ] **Step 3: Write `app/tsconfig.node.json`** (main + preload + shared + tools + node tests)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "resolveJsonModule": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["src/shared/**/*", "src/main/**/*", "src/preload/**/*", "tools/**/*", "test/node/**/*"]
}
```

- [ ] **Step 4: Write `app/tsconfig.web.json`** (renderer + renderer tests)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "resolveJsonModule": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noEmit": true,
    "paths": { "@schema/*": ["../docs/protocol/schema/*"] }
  },
  "include": ["src/shared/**/*", "src/renderer/src/**/*", "test/renderer/**/*"]
}
```

- [ ] **Step 5: Write `app/tsconfig.json`** (solution stub so editors resolve)

```json
{ "files": [], "references": [{ "path": "./tsconfig.node.json" }, { "path": "./tsconfig.web.json" }] }
```

- [ ] **Step 6: Write `app/electron.vite.config.ts`**

```ts
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const schemaDir = fileURLToPath(new URL('../docs/protocol/schema', import.meta.url));

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    plugins: [react()],
    resolve: { alias: { '@schema': schemaDir } },
    server: { fs: { allow: [here, schemaDir] } },
  },
});
```

- [ ] **Step 7: Write `app/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@schema': fileURLToPath(new URL('../docs/protocol/schema', import.meta.url)),
    },
  },
  test: { include: ['test/**/*.test.ts', 'test/**/*.test.tsx'], environment: 'node' },
});
```

- [ ] **Step 8: Write `app/eslint.config.mjs`**

```js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { ignores: ['out/**', 'dist/**', 'node_modules/**'] },
  { rules: { '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }] } },
);
```

- [ ] **Step 9: Write `app/.gitignore`**

```
node_modules/
out/
dist/
*.tsbuildinfo
```

- [ ] **Step 10: Verify the toolchain runs (no sources yet — expect clean no-op)**

Run: `cd app && npm run typecheck && npm run lint`
Expected: both exit 0 (empty include sets are fine; if `tsc` complains about no inputs, that resolves with Task A2's first file — note it and continue).

- [ ] **Step 11: Commit**

```bash
git add app && git commit -m "feat(app): scaffold Electron host-app package (electron-vite, vitest, eslint)"
```

---

### Task A2: Shared wire protocol module

**Files:**
- Create: `app/src/shared/protocol.ts`
- Test: `app/test/node/protocol.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// app/test/node/protocol.test.ts
import { describe, expect, it } from 'vitest';
import { parseServerMessage, SURFACE_EVENT_TYPES } from '../../src/shared/protocol.js';

describe('parseServerMessage', () => {
  it('parses a handshake_offer', () => {
    const msg = parseServerMessage(
      JSON.stringify({ type: 'handshake_offer', handshakeId: 'h1', protocolVersions: ['1.0'], opsCatalogVersions: ['1.0'] }),
    );
    expect(msg).not.toBeNull();
    expect(msg?.type).toBe('handshake_offer');
  });

  it('parses every surface_* type', () => {
    for (const type of SURFACE_EVENT_TYPES) {
      const msg = parseServerMessage(JSON.stringify({ type, canvasSessionId: 'c1', surfaceSeq: 0 }));
      expect(msg?.type).toBe(type);
    }
  });

  it('rejects non-JSON, non-object, and unknown types', () => {
    expect(parseServerMessage('not json')).toBeNull();
    expect(parseServerMessage('42')).toBeNull();
    expect(parseServerMessage(JSON.stringify({ type: 'iteration_start' }))).toBeNull();
  });
});
```

- [ ] **Step 2: Run it — expect FAIL** (`cd app && npx vitest run test/node/protocol.test.ts` → cannot resolve `../../src/shared/protocol.js`)

- [ ] **Step 3: Write `app/src/shared/protocol.ts`**

```ts
/**
 * omadia-canvas-protocol/1.0 — client-side wire types.
 * Server counterpart: byte5ai/omadia middleware/packages/omadia-ui-channel/src/protocol.ts.
 * Where this file and docs/protocol/schema/ disagree, the schema wins.
 */

// ── server → client ──
export interface HandshakeOffer {
  type: 'handshake_offer';
  handshakeId: string;
  protocolVersions: string[];
  opsCatalogVersions: string[];
  serverFeatures?: string[];
}

export interface HandshakeErrorMsg {
  type: 'handshake_error';
  handshakeId: string;
  reason: 'protocol-version-unsupported' | 'ops-catalog-version-unsupported' | 'local-ops-incomplete';
  supported: { protocolVersions: string[]; opsCatalogVersions: string[] };
}

export interface HandshakeAck {
  type: 'handshake_ack';
  handshakeId: string;
  canvasSessionId: string;
}

export interface AgentTextDelta { type: 'agent_text_delta'; forTurn: string; text: string }
export interface TurnComplete { type: 'turn_complete'; forTurn: string }
export interface TurnError { type: 'turn_error'; forTurn?: string; message: string }

export type SurfaceEventType =
  | 'surface_snapshot'
  | 'surface_patch'
  | 'surface_data_ref_created'
  | 'surface_data_ref_invalidated'
  | 'surface_action_result'
  | 'surface_local_action'
  | 'surface_error'
  | 'surface_mutation_resolved';

export const SURFACE_EVENT_TYPES: ReadonlySet<string> = new Set<SurfaceEventType>([
  'surface_snapshot',
  'surface_patch',
  'surface_data_ref_created',
  'surface_data_ref_invalidated',
  'surface_action_result',
  'surface_local_action',
  'surface_error',
  'surface_mutation_resolved',
]);

/** Envelope-typed surface event; full shape is enforced by the Ajv validator, not TS. */
export interface SurfaceEvent {
  type: SurfaceEventType;
  canvasSessionId: string;
  surfaceSeq: number;
  [key: string]: unknown;
}

export type ServerMessage =
  | HandshakeOffer
  | HandshakeErrorMsg
  | HandshakeAck
  | AgentTextDelta
  | TurnComplete
  | TurnError
  | SurfaceEvent;

// ── client → server ──
export interface HandshakeSelect {
  type: 'handshake_select';
  handshakeId: string;
  protocolVersion: string;
  opsCatalogVersion: string;
  clientFeatures?: string[];
  localOperations?: string[];
  canvasSessionId?: string;
}

export interface ClientTurn {
  type: 'turn';
  turnId?: string;
  text?: string;
  /** structured UI action (button click, row-click). Carried to Tier 2 via
   *  IncomingTurn.metadata.action — lands server-side with Part B Task B2. */
  action?: { type: string; payload?: unknown };
  target?: unknown;
  viewState?: unknown;
  viewStateTruncated?: boolean;
}

export type ClientMessage = HandshakeSelect | ClientTurn;

const NON_SURFACE_SERVER_TYPES: ReadonlySet<string> = new Set([
  'handshake_offer',
  'handshake_error',
  'handshake_ack',
  'agent_text_delta',
  'turn_complete',
  'turn_error',
]);

/** Tolerant parse of a raw server frame; null for non-JSON / unknown type. */
export function parseServerMessage(raw: string): ServerMessage | null {
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return null;
  const type = (obj as { type?: unknown }).type;
  if (typeof type !== 'string') return null;
  if (NON_SURFACE_SERVER_TYPES.has(type) || SURFACE_EVENT_TYPES.has(type)) {
    return obj as ServerMessage;
  }
  return null;
}
```

- [ ] **Step 4: Run tests — expect PASS** (`npx vitest run test/node/protocol.test.ts`)
- [ ] **Step 5: Lint + commit**

```bash
npm run lint:fix && git add -A && git commit -m "feat(app): client wire-protocol types + tolerant server-frame parser"
```

---

### Task A3: Client handshake state machine

**Files:**
- Create: `app/src/main/handshake.ts`
- Test: `app/test/node/handshake.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// app/test/node/handshake.test.ts
import { describe, expect, it } from 'vitest';
import { createHandshake } from '../../src/main/handshake.js';
import type { HandshakeOffer, HandshakeErrorMsg, HandshakeAck } from '../../src/shared/protocol.js';

const OFFER: HandshakeOffer = {
  type: 'handshake_offer', handshakeId: 'h1', protocolVersions: ['1.0'], opsCatalogVersions: ['1.0'],
};
const CONFIG = { protocolVersions: ['1.0'], opsCatalogVersions: ['1.0'], localOperations: ['noop'] };

describe('createHandshake', () => {
  it('selects a mutual version and becomes ready on ack', () => {
    const hs = createHandshake({ ...CONFIG, canvasSessionId: 'stored-1' });
    const a1 = hs.onMessage(OFFER);
    expect(a1).toMatchObject({
      kind: 'send',
      message: {
        type: 'handshake_select', handshakeId: 'h1', protocolVersion: '1.0',
        opsCatalogVersion: '1.0', localOperations: ['noop'], canvasSessionId: 'stored-1',
      },
    });
    const ack: HandshakeAck = { type: 'handshake_ack', handshakeId: 'h1', canvasSessionId: 'c-9' };
    expect(hs.onMessage(ack)).toEqual({ kind: 'ready', canvasSessionId: 'c-9' });
  });

  it('fails when there is no mutual protocol version', () => {
    const hs = createHandshake(CONFIG);
    const a = hs.onMessage({ ...OFFER, protocolVersions: ['2.0'] });
    expect(a).toMatchObject({ kind: 'fail' });
  });

  it('retries once on handshake_error, then fails on a second error', () => {
    const hs = createHandshake({ ...CONFIG, protocolVersions: ['1.1', '1.0'] });
    hs.onMessage({ ...OFFER, protocolVersions: ['1.1', '1.0'] }); // selects 1.1
    const err: HandshakeErrorMsg = {
      type: 'handshake_error', handshakeId: 'h1', reason: 'protocol-version-unsupported',
      supported: { protocolVersions: ['1.0'], opsCatalogVersions: ['1.0'] },
    };
    const retry = hs.onMessage(err);
    expect(retry).toMatchObject({ kind: 'send', message: { protocolVersion: '1.0' } });
    expect(hs.onMessage(err)).toMatchObject({ kind: 'fail' });
  });

  it('ignores frames after settling', () => {
    const hs = createHandshake(CONFIG);
    hs.onMessage(OFFER);
    hs.onMessage({ type: 'handshake_ack', handshakeId: 'h1', canvasSessionId: 'c' });
    expect(hs.onMessage(OFFER)).toBeNull();
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (module missing)
- [ ] **Step 3: Write `app/src/main/handshake.ts`**

```ts
import type { HandshakeSelect, ServerMessage } from '../shared/protocol.js';

export interface HandshakeConfig {
  /** preference-ordered versions this client implements */
  protocolVersions: string[];
  opsCatalogVersions: string[];
  /** the ops-catalog subset this build actually implements (Class-B routing truth) */
  localOperations: string[];
  /** persisted across reconnects to resume a canvas */
  canvasSessionId?: string;
}

export type HandshakeAction =
  | { kind: 'send'; message: HandshakeSelect }
  | { kind: 'ready'; canvasSessionId: string }
  | { kind: 'fail'; reason: string };

/**
 * Pure client half of the omadia-canvas-protocol/1.0 boot handshake
 * (offer → select → ack, one downgrade retry on handshake_error).
 * Transport-agnostic: feed it parsed server messages, act on the returned action.
 */
export function createHandshake(config: HandshakeConfig): {
  onMessage(msg: ServerMessage): HandshakeAction | null;
} {
  let handshakeId: string | null = null;
  let selectsSent = 0;
  let settled = false;

  const pick = (offeredProto: string[], offeredOps: string[]): HandshakeSelect | null => {
    const protocolVersion = config.protocolVersions.find((v) => offeredProto.includes(v));
    const opsCatalogVersion = config.opsCatalogVersions.find((v) => offeredOps.includes(v));
    if (!protocolVersion || !opsCatalogVersion || handshakeId === null) return null;
    return {
      type: 'handshake_select',
      handshakeId,
      protocolVersion,
      opsCatalogVersion,
      localOperations: config.localOperations,
      ...(config.canvasSessionId ? { canvasSessionId: config.canvasSessionId } : {}),
    };
  };

  return {
    onMessage(msg: ServerMessage): HandshakeAction | null {
      if (settled) return null;

      if (msg.type === 'handshake_offer') {
        handshakeId = msg.handshakeId;
        const select = pick(msg.protocolVersions, msg.opsCatalogVersions);
        if (!select) {
          settled = true;
          return { kind: 'fail', reason: 'no mutual protocol/ops-catalog version' };
        }
        selectsSent += 1;
        return { kind: 'send', message: select };
      }

      if (msg.type === 'handshake_error') {
        if (selectsSent >= 2) {
          settled = true;
          return { kind: 'fail', reason: `handshake rejected twice (${msg.reason})` };
        }
        const select = pick(msg.supported.protocolVersions, msg.supported.opsCatalogVersions);
        if (!select) {
          settled = true;
          return { kind: 'fail', reason: `no downgrade path (${msg.reason})` };
        }
        selectsSent += 1;
        return { kind: 'send', message: select };
      }

      if (msg.type === 'handshake_ack') {
        settled = true;
        return { kind: 'ready', canvasSessionId: msg.canvasSessionId };
      }

      return null; // pre-handshake surface/turn frames: ignore
    },
  };
}
```

- [ ] **Step 4: Run — expect PASS** (`npx vitest run test/node/handshake.test.ts`)
- [ ] **Step 5: Lint + commit** — `npm run lint:fix && git add -A && git commit -m "feat(app): pure client handshake state machine with single downgrade retry"`

---

### Task A4: Tree patch applier (RFC-6902 subset)

**Files:**
- Create: `app/src/shared/treePatch.ts`
- Test: `app/test/node/treePatch.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// app/test/node/treePatch.test.ts
import { describe, expect, it } from 'vitest';
import { applyTreePatches } from '../../src/shared/treePatch.js';

const tree = () => ({
  type: 'container',
  children: [
    { type: 'table', rows: [{ rowKey: 'a', cells: { owner: 'Anna' } }] },
    { type: 'status', text: 'loading' },
  ],
});

describe('applyTreePatches', () => {
  it('appends to an array with "-"', () => {
    const out = applyTreePatches(tree(), [
      { op: 'add', path: '/children/0/rows/-', value: { rowKey: 'b', cells: { owner: 'Bernd' } } },
    ]) as ReturnType<typeof tree>;
    expect(out.children[0]).toMatchObject({ rows: [{ rowKey: 'a' }, { rowKey: 'b' }] });
  });

  it('replaces a nested value and adds an object key', () => {
    const out = applyTreePatches(tree(), [
      { op: 'replace', path: '/children/1/text', value: 'done' },
      { op: 'add', path: '/children/0/rows/0/cells/vacation', value: 'Out' },
    ]) as ReturnType<typeof tree>;
    expect(out.children[1]).toMatchObject({ text: 'done' });
    expect((out.children[0] as { rows: Array<{ cells: Record<string, unknown> }> }).rows[0]?.cells['vacation']).toBe('Out');
  });

  it('removes array entries and object keys', () => {
    const out = applyTreePatches(tree(), [{ op: 'remove', path: '/children/1' }]) as ReturnType<typeof tree>;
    expect(out.children).toHaveLength(1);
  });

  it('does not mutate the input tree', () => {
    const input = tree();
    applyTreePatches(input, [{ op: 'replace', path: '/children/1/text', value: 'x' }]);
    expect(input.children[1]).toMatchObject({ text: 'loading' });
  });

  it('throws on replace of a missing path, malformed ops, and unescapes ~0/~1', () => {
    expect(() => applyTreePatches(tree(), [{ op: 'replace', path: '/nope/x', value: 1 }])).toThrow();
    expect(() => applyTreePatches(tree(), [{ op: 'move', path: '/a' } as never])).toThrow();
    const out = applyTreePatches({ 'a/b': 1, 'c~d': 2 }, [{ op: 'replace', path: '/a~1b', value: 9 }]) as Record<string, number>;
    expect(out['a/b']).toBe(9);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**
- [ ] **Step 3: Write `app/src/shared/treePatch.ts`**

```ts
/**
 * surface_patch op grammar — RFC-6902 subset {add, replace, remove}.
 * The schema leaves `patches` items open ("op/path/value" hint); this module is
 * the spike-pinned concrete grammar, recorded as protocol feedback (1.0.md §5).
 * Positional array indices are safe here because basedOnRevision equality pins
 * the tree shape the path was authored against.
 */

export interface TreePatchOp {
  op: 'add' | 'replace' | 'remove';
  path: string;
  value?: unknown;
}

function isTreePatchOp(p: unknown): p is TreePatchOp {
  if (typeof p !== 'object' || p === null) return false;
  const { op, path } = p as { op?: unknown; path?: unknown };
  return (op === 'add' || op === 'replace' || op === 'remove') && typeof path === 'string' && path.startsWith('/');
}

function parsePointer(path: string): string[] {
  return path
    .split('/')
    .slice(1)
    .map((seg) => seg.replace(/~1/g, '/').replace(/~0/g, '~'));
}

function navigate(root: unknown, segments: string[]): unknown {
  let node: unknown = root;
  for (const seg of segments) {
    if (Array.isArray(node)) {
      const idx = Number(seg);
      if (!Number.isInteger(idx) || idx < 0 || idx >= node.length) {
        throw new Error(`patch path segment out of range: ${seg}`);
      }
      node = node[idx];
    } else if (typeof node === 'object' && node !== null) {
      if (!(seg in (node as Record<string, unknown>))) {
        throw new Error(`patch path segment not found: ${seg}`);
      }
      node = (node as Record<string, unknown>)[seg];
    } else {
      throw new Error(`patch path traverses a non-container at: ${seg}`);
    }
  }
  return node;
}

/** Apply patches immutably; throws on any malformed/unresolvable op. */
export function applyTreePatches(tree: unknown, patches: unknown[]): unknown {
  const root = structuredClone(tree);
  for (const p of patches) {
    if (!isTreePatchOp(p)) throw new Error('malformed patch op');
    const segments = parsePointer(p.path);
    if (segments.length === 0) throw new Error('whole-document patches are not allowed');
    const last = segments[segments.length - 1] as string;
    const parent = navigate(root, segments.slice(0, -1));

    if (Array.isArray(parent)) {
      if (p.op === 'add' && last === '-') {
        parent.push(p.value);
        continue;
      }
      const idx = Number(last);
      if (!Number.isInteger(idx) || idx < 0) throw new Error(`bad array index: ${last}`);
      if (p.op === 'add') {
        if (idx > parent.length) throw new Error(`add index out of range: ${idx}`);
        parent.splice(idx, 0, p.value);
      } else if (p.op === 'replace') {
        if (idx >= parent.length) throw new Error(`replace index out of range: ${idx}`);
        parent[idx] = p.value;
      } else {
        if (idx >= parent.length) throw new Error(`remove index out of range: ${idx}`);
        parent.splice(idx, 1);
      }
    } else if (typeof parent === 'object' && parent !== null) {
      const obj = parent as Record<string, unknown>;
      if (p.op === 'add') {
        obj[last] = p.value;
      } else if (p.op === 'replace') {
        if (!(last in obj)) throw new Error(`replace target missing: ${last}`);
        obj[last] = p.value;
      } else {
        if (!(last in obj)) throw new Error(`remove target missing: ${last}`);
        delete obj[last];
      }
    } else {
      throw new Error('patch parent is not a container');
    }
  }
  return root;
}
```

- [ ] **Step 4: Run — expect PASS**
- [ ] **Step 5: Lint + commit** — `npm run lint:fix && git add -A && git commit -m "feat(app): RFC-6902-subset tree patch applier (pinned surface_patch grammar)"`

---

### Task A5: Schema validator (Ajv 2020 over `docs/protocol/schema/`)

**Files:**
- Create: `app/src/renderer/src/validate/validator.ts`
- Test: `app/test/renderer/validator.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// app/test/renderer/validator.test.ts
import { describe, expect, it } from 'vitest';
import { validateSurfaceEvent, validateTree } from '../../src/renderer/src/validate/validator.js';

const VALID_TREE = {
  type: 'container', id: 'root', layout: 'stack',
  children: [
    { type: 'heading', id: 'h', content: 'Hello', level: 2 },
    {
      type: 'table', id: 't',
      columns: [{ fieldKey: 'owner', label: 'Owner' }],
      rows: [{ rowKey: 'a', cells: { owner: 'Anna' } }],
    },
  ],
};

describe('validateTree (whitelist parser)', () => {
  it('accepts a conforming tree', () => {
    expect(validateTree(VALID_TREE)).toMatchObject({ ok: true });
  });
  it('rejects an unknown primitive type', () => {
    expect(validateTree({ type: 'iframe', src: 'https://evil' }).ok).toBe(false);
  });
  it('rejects an unknown prop on a known primitive (unevaluatedProperties)', () => {
    expect(validateTree({ type: 'divider', onClick: 'javascript:alert(1)' }).ok).toBe(false);
  });
  it('rejects a table row without rowKey', () => {
    expect(
      validateTree({ type: 'table', columns: [{ fieldKey: 'x', label: 'X' }], rows: [{ cells: { x: 1 } }] }).ok,
    ).toBe(false);
  });
});

describe('validateSurfaceEvent', () => {
  it('accepts a surface_snapshot', () => {
    expect(
      validateSurfaceEvent({
        type: 'surface_snapshot', canvasSessionId: 'c', surfaceSeq: 0,
        producesRevision: '0', tree: VALID_TREE, protocolVersion: '1.0', opsCatalogVersion: '1.0',
      }),
    ).toMatchObject({ ok: true });
  });
  it('rejects a snapshot missing the envelope', () => {
    expect(
      validateSurfaceEvent({ type: 'surface_snapshot', producesRevision: '0', tree: VALID_TREE }).ok,
    ).toBe(false);
  });
  it('rejects an unknown event type', () => {
    expect(validateSurfaceEvent({ type: 'surface_eval', canvasSessionId: 'c', surfaceSeq: 1 }).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**
- [ ] **Step 3: Write `app/src/renderer/src/validate/validator.ts`**

```ts
import Ajv2020Import from 'ajv/dist/2020.js';
import canvasTree from '@schema/canvas-tree.schema.json';
import dataRef from '@schema/data-ref.schema.json';
import handshake from '@schema/handshake.schema.json';
import sentinels from '@schema/sentinels.schema.json';
import surfaceEvents from '@schema/surface-events.schema.json';
import targetRef from '@schema/target-ref.schema.json';

// ajv ships CJS; normalise the constructor across ESM interop shapes.
const Ajv2020 =
  (Ajv2020Import as unknown as { default?: typeof Ajv2020Import }).default ?? Ajv2020Import;

const ajv = new Ajv2020({ allErrors: true, strict: false });
for (const schema of [dataRef, targetRef, canvasTree, handshake, sentinels, surfaceEvents]) {
  ajv.addSchema(schema);
}

const treeValidate = ajv.getSchema('https://omadia.ai/protocol/1.0/canvas-tree.schema.json');
const surfaceValidate = ajv.getSchema('https://omadia.ai/protocol/1.0/surface-events.schema.json');
if (!treeValidate || !surfaceValidate) {
  throw new Error('protocol schemas failed to compile — check docs/protocol/schema/*.json $id values');
}

export interface ValidationResult {
  ok: boolean;
  /** human-readable Ajv error summary; null when ok */
  errors: string | null;
}

function run(validate: NonNullable<typeof treeValidate>, value: unknown): ValidationResult {
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
```

- [ ] **Step 4: Run — expect PASS** (`npx vitest run test/renderer/validator.test.ts`)
- [ ] **Step 5: Run full checks + commit**

```bash
npm run typecheck && npm run lint:fix && npm test
git add -A && git commit -m "feat(app): Ajv-2020 whitelist validator over the protocol schemas"
```

---

### Task A6: Canvas store — revision + surfaceSeq discipline

**Files:**
- Create: `app/src/renderer/src/store/canvasStore.ts`
- Test: `app/test/renderer/canvasStore.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// app/test/renderer/canvasStore.test.ts
import { describe, expect, it } from 'vitest';
import { applyServerMessage, initialCanvasState } from '../../src/renderer/src/store/canvasStore.js';
import type { ServerMessage } from '../../src/shared/protocol.js';

const TREE = { type: 'container', id: 'root', children: [{ type: 'status', id: 's', text: 'hi' }] };
const snapshot = (seq: number, rev: string): ServerMessage => ({
  type: 'surface_snapshot', canvasSessionId: 'c', surfaceSeq: seq,
  producesRevision: rev, tree: TREE, protocolVersion: '1.0', opsCatalogVersion: '1.0',
});
const patch = (seq: number, base: string, prod: string, patches: unknown[]): ServerMessage => ({
  type: 'surface_patch', canvasSessionId: 'c', surfaceSeq: seq,
  basedOnRevision: base, producesRevision: prod, patches,
});

describe('applyServerMessage', () => {
  it('applies snapshot then a matching patch', () => {
    let r = applyServerMessage(initialCanvasState, snapshot(0, '0'));
    expect(r.resync).toBe(false);
    expect(r.state.revision).toBe('0');
    r = applyServerMessage(r.state, patch(1, '0', '1', [{ op: 'replace', path: '/children/0/text', value: 'done' }]));
    expect(r.resync).toBe(false);
    expect(r.state.revision).toBe('1');
    expect(JSON.stringify(r.state.tree)).toContain('"done"');
  });

  it('requests resync on basedOnRevision mismatch (equality-only)', () => {
    const s = applyServerMessage(initialCanvasState, snapshot(0, '0')).state;
    const r = applyServerMessage(s, patch(1, '7', '8', []));
    expect(r.resync).toBe(true);
    expect(r.state.revision).toBe('0'); // unchanged
  });

  it('requests resync on a surfaceSeq gap', () => {
    const s = applyServerMessage(initialCanvasState, snapshot(0, '0')).state;
    const r = applyServerMessage(s, patch(5, '0', '1', []));
    expect(r.resync).toBe(true);
  });

  it('rejects an invalid snapshot tree hard, keeping prior state', () => {
    const s = applyServerMessage(initialCanvasState, snapshot(0, '0')).state;
    const bad = { ...snapshot(1, '1'), tree: { type: 'iframe' } } as ServerMessage;
    const r = applyServerMessage(s, bad);
    expect(r.resync).toBe(false);
    expect(r.state.revision).toBe('0');
    expect(r.state.notices.some((n) => n.includes('rejected'))).toBe(true);
  });

  it('accumulates prose and settles the turn', () => {
    let r = applyServerMessage(initialCanvasState, { type: 'agent_text_delta', forTurn: 't1', text: 'Three ' });
    r = applyServerMessage(r.state, { type: 'agent_text_delta', forTurn: 't1', text: 'people' });
    expect(r.state.prose).toBe('Three people');
    r = applyServerMessage(r.state, { type: 'turn_complete', forTurn: 't1' });
    expect(r.state.turnPending).toBe(false);
  });

  it('surfaces turn_error as a notice', () => {
    const r = applyServerMessage(initialCanvasState, { type: 'turn_error', forTurn: 't1', message: 'boom' });
    expect(r.state.notices.some((n) => n.includes('boom'))).toBe(true);
    expect(r.state.turnPending).toBe(false);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**
- [ ] **Step 3: Write `app/src/renderer/src/store/canvasStore.ts`**

```ts
import { SURFACE_EVENT_TYPES, type ServerMessage, type SurfaceEvent } from '../../../shared/protocol.js';
import { applyTreePatches } from '../../../shared/treePatch.js';
import { validateSurfaceEvent, validateTree } from '../validate/validator.js';

export interface CanvasState {
  tree: unknown | null;
  /** opaque RevisionId — equality-only comparisons (protocol §0) */
  revision: string | null;
  lastSurfaceSeq: number | null;
  prose: string;
  turnPending: boolean;
  connection: 'disconnected' | 'connecting' | 'ready' | 'failed';
  /** debug/UX strip: errors, rejections, not-yet-rendered event kinds */
  notices: string[];
}

export const initialCanvasState: CanvasState = {
  tree: null,
  revision: null,
  lastSurfaceSeq: null,
  prose: '',
  turnPending: false,
  connection: 'disconnected',
  notices: [],
};

export interface ApplyResult {
  state: CanvasState;
  /** true → the host must reconnect + re-handshake with the same canvasSessionId */
  resync: boolean;
}

const noticed = (state: CanvasState, notice: string): CanvasState => ({
  ...state,
  notices: [...state.notices.slice(-19), notice],
});

function applySurfaceEvent(state: CanvasState, ev: SurfaceEvent): ApplyResult {
  const valid = validateSurfaceEvent(ev);
  if (!valid.ok) {
    return { state: noticed(state, `surface event rejected: ${valid.errors}`), resync: false };
  }
  // surfaceSeq is the transport tie-breaker — a gap means we missed frames.
  if (state.lastSurfaceSeq !== null && ev.surfaceSeq !== state.lastSurfaceSeq + 1) {
    return { state: noticed(state, `surfaceSeq gap (${state.lastSurfaceSeq} → ${ev.surfaceSeq})`), resync: true };
  }
  const seen = { ...state, lastSurfaceSeq: ev.surfaceSeq };

  switch (ev.type) {
    case 'surface_snapshot': {
      const tree = ev['tree'];
      const treeValid = validateTree(tree);
      if (!treeValid.ok) {
        return { state: noticed(seen, `snapshot tree rejected: ${treeValid.errors}`), resync: false };
      }
      return {
        state: { ...seen, tree, revision: String(ev['producesRevision']) },
        resync: false,
      };
    }
    case 'surface_patch': {
      if (state.revision === null || String(ev['basedOnRevision']) !== state.revision) {
        return { state: noticed(seen, 'patch basedOnRevision mismatch'), resync: true };
      }
      try {
        const next = applyTreePatches(state.tree, ev['patches'] as unknown[]);
        const treeValid = validateTree(next);
        if (!treeValid.ok) {
          return { state: noticed(seen, `post-patch tree invalid: ${treeValid.errors}`), resync: true };
        }
        return { state: { ...seen, tree: next, revision: String(ev['producesRevision']) }, resync: false };
      } catch (err) {
        return {
          state: noticed(seen, `patch failed: ${err instanceof Error ? err.message : String(err)}`),
          resync: true,
        };
      }
    }
    case 'surface_error':
      return { state: noticed(seen, `surface_error: ${String(ev['message'])}`), resync: false };
    default:
      // data_ref_* / action_result / local_action / mutation_resolved:
      // not rendered in the M1 slice — record so nothing fails silently.
      return { state: noticed(seen, `unhandled ${ev.type}`), resync: false };
  }
}

export function applyServerMessage(state: CanvasState, msg: ServerMessage): ApplyResult {
  if (SURFACE_EVENT_TYPES.has(msg.type)) {
    return applySurfaceEvent(state, msg as SurfaceEvent);
  }
  switch (msg.type) {
    case 'agent_text_delta':
      return { state: { ...state, prose: state.prose + msg.text }, resync: false };
    case 'turn_complete':
      return { state: { ...state, turnPending: false }, resync: false };
    case 'turn_error':
      return { state: { ...noticed(state, `turn_error: ${msg.message}`), turnPending: false }, resync: false };
    default:
      return { state, resync: false }; // handshake frames are the socket layer's business
  }
}
```

- [ ] **Step 4: Run — expect PASS**
- [ ] **Step 5: Lint + commit** — `npm run lint:fix && git add -A && git commit -m "feat(app): canvas store with revision-equality + surfaceSeq discipline"`

---

### Task A7: WT1 stub recording + stub server

**Files:**
- Create: `app/tools/stub-server/recordings/wt1.json`, `app/tools/stub-server/stubServer.ts`
- Test: `app/test/node/stubServer.test.ts`

- [ ] **Step 1: Write `app/tools/stub-server/recordings/wt1.json`** (every frame must pass `validateSurfaceEvent` — the test in step 3 enforces it)

```json
{
  "frames": [
    { "delayMs": 80, "message": { "type": "agent_text_delta", "forTurn": "$TURN", "text": "Pulling tickets and budgets… " } },
    { "delayMs": 400, "message": {
      "type": "surface_snapshot", "canvasSessionId": "$CANVAS", "surfaceSeq": 0,
      "producesRevision": "0", "protocolVersion": "1.0", "opsCatalogVersion": "1.0",
      "tree": {
        "type": "container", "id": "root", "title": "Team tickets · ERP budgets", "layout": "stack",
        "children": [
          { "type": "heading", "id": "h1", "content": "Open tickets by owner", "level": 2 },
          { "type": "table", "id": "tickets", "loading": "skeleton",
            "columns": [
              { "fieldKey": "owner", "label": "Owner" },
              { "fieldKey": "openTickets", "label": "Open tickets" },
              { "fieldKey": "hoursLeft", "label": "ERP budget left (h)" }
            ],
            "rows": [] },
          { "type": "divider", "id": "d1" },
          { "type": "toolbar", "id": "tb", "children": [
            { "type": "button", "id": "b-refresh", "label": "Refresh",
              "action": { "type": "refresh", "effect": "internal" } }
          ] },
          { "type": "status", "id": "st", "text": "Querying Jira and ERP…" }
        ]
      }
    } },
    { "delayMs": 900, "message": {
      "type": "surface_patch", "canvasSessionId": "$CANVAS", "surfaceSeq": 1,
      "basedOnRevision": "0", "producesRevision": "1",
      "patches": [
        { "op": "replace", "path": "/children/1/loading", "value": "none" },
        { "op": "add", "path": "/children/1/rows/-", "value": { "rowKey": "anna",   "cells": { "owner": "Anna Becker",  "openTickets": 4, "hoursLeft": 5 } } },
        { "op": "add", "path": "/children/1/rows/-", "value": { "rowKey": "bernd",  "cells": { "owner": "Bernd Roth",   "openTickets": 3, "hoursLeft": 7 } } },
        { "op": "add", "path": "/children/1/rows/-", "value": { "rowKey": "cara",   "cells": { "owner": "Cara Liem",    "openTickets": 2, "hoursLeft": 6 } } },
        { "op": "add", "path": "/children/1/rows/-", "value": { "rowKey": "daniel", "cells": { "owner": "Daniel Voss",  "openTickets": 3, "hoursLeft": 14 } } },
        { "op": "replace", "path": "/children/4/text", "value": "12 open tickets · budgets loaded" }
      ]
    } },
    { "delayMs": 350, "message": { "type": "agent_text_delta", "forTurn": "$TURN", "text": "Three people are under budget — Anna, Bernd, Cara. " } },
    { "delayMs": 500, "message": {
      "type": "surface_patch", "canvasSessionId": "$CANVAS", "surfaceSeq": 2,
      "basedOnRevision": "1", "producesRevision": "2",
      "patches": [
        { "op": "add", "path": "/children/1/columns/-", "value": { "fieldKey": "vacation", "label": "Out" } },
        { "op": "add", "path": "/children/1/rows/0/cells/vacation", "value": "Mo–We" },
        { "op": "add", "path": "/children/1/rows/1/cells/vacation", "value": "–" },
        { "op": "add", "path": "/children/1/rows/2/cells/vacation", "value": "–" },
        { "op": "add", "path": "/children/1/rows/3/cells/vacation", "value": "–" },
        { "op": "replace", "path": "/children/4/text", "value": "Vacation overlay added" }
      ]
    } },
    { "delayMs": 100, "message": { "type": "turn_complete", "forTurn": "$TURN" } }
  ]
}
```

- [ ] **Step 2: Write `app/tools/stub-server/stubServer.ts`**

```ts
/**
 * Dev/test stand-in for omadia-ui-channel: serves the canvas WebSocket at
 * /omadia-ui/canvas, runs the offer→select→ack handshake, and replays the
 * Walkthrough-1 recording once per incoming `turn`. No auth — local dev only.
 */
import { readFileSync } from 'node:fs';
import { WebSocketServer, type WebSocket } from 'ws';

interface RecordedFrame { delayMs: number; message: Record<string, unknown> }

const recording: { frames: RecordedFrame[] } = JSON.parse(
  readFileSync(new URL('./recordings/wt1.json', import.meta.url), 'utf8'),
) as { frames: RecordedFrame[] };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function stamp(message: Record<string, unknown>, turnId: string, canvasSessionId: string): string {
  return JSON.stringify(message)
    .replaceAll('"$TURN"', JSON.stringify(turnId))
    .replaceAll('"$CANVAS"', JSON.stringify(canvasSessionId));
}

export function startStubServer(port = 0): Promise<{ port: number; close: () => Promise<void> }> {
  const wss = new WebSocketServer({ port, path: '/omadia-ui/canvas' });

  wss.on('connection', (ws: WebSocket) => {
    const handshakeId = `hs-${Math.random().toString(36).slice(2)}`;
    let canvasSessionId = '';
    let ready = false;
    let replay: Promise<void> = Promise.resolve();

    ws.send(JSON.stringify({
      type: 'handshake_offer', handshakeId, protocolVersions: ['1.0'], opsCatalogVersions: ['1.0'],
    }));

    ws.on('message', (raw) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(String(raw)) as Record<string, unknown>;
      } catch {
        return;
      }
      if (!ready && msg['type'] === 'handshake_select' && msg['handshakeId'] === handshakeId) {
        if (msg['protocolVersion'] !== '1.0' || msg['opsCatalogVersion'] !== '1.0') {
          ws.send(JSON.stringify({
            type: 'handshake_error', handshakeId, reason: 'protocol-version-unsupported',
            supported: { protocolVersions: ['1.0'], opsCatalogVersions: ['1.0'] },
          }));
          return;
        }
        canvasSessionId =
          typeof msg['canvasSessionId'] === 'string' && msg['canvasSessionId'].length > 0
            ? msg['canvasSessionId']
            : 'stub-canvas';
        ws.send(JSON.stringify({ type: 'handshake_ack', handshakeId, canvasSessionId }));
        ready = true;
        return;
      }
      if (ready && msg['type'] === 'turn') {
        const turnId = typeof msg['turnId'] === 'string' && msg['turnId'] ? msg['turnId'] : 'stub-turn';
        replay = replay.then(async () => {
          for (const frame of recording.frames) {
            await sleep(frame.delayMs);
            if (ws.readyState !== ws.OPEN) return;
            ws.send(stamp(frame.message, turnId, canvasSessionId));
          }
        });
      }
    });
  });

  return new Promise((resolve) => {
    wss.on('listening', () => {
      const addr = wss.address();
      resolve({
        port: typeof addr === 'object' && addr !== null ? addr.port : port,
        close: () => new Promise<void>((r) => wss.close(() => r())),
      });
    });
  });
}

// CLI entry: `npm run stub-server`
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop() ?? '')) {
  void startStubServer(8181).then(({ port }) =>
    console.log(`omadia-ui stub server: ws://127.0.0.1:${port}/omadia-ui/canvas`),
  );
}
```

- [ ] **Step 3: Write the test** — full client round-trip; doubles as schema validation of the recording

```ts
// app/test/node/stubServer.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { startStubServer } from '../../tools/stub-server/stubServer.js';
import { parseServerMessage, SURFACE_EVENT_TYPES, type ServerMessage } from '../../src/shared/protocol.js';
import { validateSurfaceEvent } from '../../src/renderer/src/validate/validator.js';

let server: Awaited<ReturnType<typeof startStubServer>>;
beforeAll(async () => { server = await startStubServer(0); });
afterAll(async () => { await server.close(); });

describe('stub server (WT1 replay)', () => {
  it('handshakes and replays a schema-valid WT1 sequence', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}/omadia-ui/canvas`);
    const received: ServerMessage[] = [];

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timed out')), 15_000);
      ws.on('message', (raw) => {
        const msg = parseServerMessage(String(raw));
        if (!msg) return;
        received.push(msg);
        if (msg.type === 'handshake_offer') {
          ws.send(JSON.stringify({
            type: 'handshake_select', handshakeId: msg.handshakeId,
            protocolVersion: '1.0', opsCatalogVersion: '1.0', localOperations: [],
          }));
        } else if (msg.type === 'handshake_ack') {
          ws.send(JSON.stringify({ type: 'turn', turnId: 't1', text: 'show my team' }));
        } else if (msg.type === 'turn_complete') {
          clearTimeout(timer);
          ws.close();
          resolve();
        }
      });
      ws.on('error', reject);
    });

    const surface = received.filter((m) => SURFACE_EVENT_TYPES.has(m.type));
    expect(surface.length).toBeGreaterThanOrEqual(3); // snapshot + 2 patches
    for (const ev of surface) {
      const valid = validateSurfaceEvent(ev);
      expect(valid.errors).toBeNull();
    }
    expect(surface[0]?.type).toBe('surface_snapshot');
  }, 20_000);
});
```

- [ ] **Step 4: Run — expect PASS** (`npx vitest run test/node/stubServer.test.ts`). If a recording frame fails validation, fix the **recording** to satisfy the schema — never loosen the validator.
- [ ] **Step 5: Lint + commit** — `npm run lint:fix && git add -A && git commit -m "feat(app): WT1 stub server replaying a schema-valid recording"`

---

### Task A8: Primitive renderer (WT1 subset) + Lume baseline theme

**Files:**
- Create: `app/src/renderer/src/render/PrimitiveNode.tsx`, `app/src/renderer/src/theme/lume.css`
- Test: `app/test/renderer/render.test.tsx`

- [ ] **Step 1: Write the failing test** (renderToStaticMarkup — no extra deps)

```tsx
// app/test/renderer/render.test.tsx
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { PrimitiveNode } from '../../src/renderer/src/render/PrimitiveNode.js';

const TREE = {
  type: 'container', id: 'root', title: 'T', layout: 'stack',
  children: [
    { type: 'heading', id: 'h', content: 'Open tickets', level: 2 },
    { type: 'text', id: 'p', content: 'narration', style: ['prose'] },
    { type: 'table', id: 't',
      columns: [{ fieldKey: 'owner', label: 'Owner' }],
      rows: [{ rowKey: 'a', cells: { owner: 'Anna' } }] },
    { type: 'list', id: 'l', items: [{ itemKey: 'i1', label: 'first' }] },
    { type: 'toolbar', id: 'tb', children: [{ type: 'button', id: 'b', label: 'Go' }] },
    { type: 'status', id: 's', text: 'ready' },
    { type: 'divider', id: 'd' },
  ],
};

describe('PrimitiveNode', () => {
  it('renders the WT1 primitive subset', () => {
    const html = renderToStaticMarkup(<PrimitiveNode node={TREE} onAction={() => {}} />);
    expect(html).toContain('Open tickets');
    expect(html).toContain('Anna');
    expect(html).toContain('lume-table');
    expect(html).toContain('lume-prose');
    expect(html).toContain('ready');
  });

  it('renders skeleton state for loading tables', () => {
    const html = renderToStaticMarkup(
      <PrimitiveNode node={{ type: 'table', id: 't', loading: 'skeleton', columns: [], rows: [] }} onAction={() => {}} />,
    );
    expect(html).toContain('lume-skeleton');
  });

  it('renders a defensive error box for an unknown type (validator is the real gate)', () => {
    const html = renderToStaticMarkup(<PrimitiveNode node={{ type: 'iframe' }} onAction={() => {}} />);
    expect(html).toContain('lume-unknown');
  });
});
```

- [ ] **Step 2: Run — expect FAIL**
- [ ] **Step 3: Write `app/src/renderer/src/render/PrimitiveNode.tsx`**

```tsx
import type { ReactNode } from 'react';

/** A validated primitive-tree node. The Ajv whitelist runs BEFORE render;
 *  this component trusts the shape but still fails soft on the unexpected. */
export type PrimitiveJson = { type: string; [key: string]: unknown };

export interface PrimitiveAction { type: string; payload?: unknown; sourceId?: string }

interface Props {
  node: PrimitiveJson;
  onAction: (action: PrimitiveAction) => void;
}

const styleClasses = (node: PrimitiveJson): string => {
  const style = Array.isArray(node['style']) ? (node['style'] as string[]) : [];
  return [
    style.includes('prose') ? 'lume-prose' : '',
    style.includes('mono') ? 'lume-mono' : '',
    style.includes('accent') ? 'lume-accent' : '',
    style.includes('compact') ? 'lume-compact' : '',
  ].filter(Boolean).join(' ');
};

const children = (node: PrimitiveJson, onAction: Props['onAction']): ReactNode =>
  Array.isArray(node['children'])
    ? (node['children'] as PrimitiveJson[]).map((c, i) => (
        <PrimitiveNode key={(c['id'] as string) ?? i} node={c} onAction={onAction} />
      ))
    : null;

export function PrimitiveNode({ node, onAction }: Props): ReactNode {
  switch (node.type) {
    case 'container':
      return (
        <section className={`lume-container ${styleClasses(node)}`} data-id={node['id'] as string}>
          {typeof node['title'] === 'string' && <div className="lume-container-title">{node['title']}</div>}
          <div className={`lume-layout-${(node['layout'] as string) ?? 'stack'}`}>{children(node, onAction)}</div>
        </section>
      );

    case 'heading': {
      const level = Math.min(Math.max(Number(node['level'] ?? 2), 1), 6);
      const Tag = `h${level}` as keyof JSX.IntrinsicElements;
      return <Tag className="lume-heading">{node['content'] as string}</Tag>;
    }

    case 'text':
      return <p className={`lume-text ${styleClasses(node)}`}>{(node['content'] as string) ?? ''}</p>;

    case 'table': {
      const cols = (node['columns'] as Array<{ fieldKey: string; label: string }>) ?? [];
      const rows = (node['rows'] as Array<{ rowKey: string; cells: Record<string, unknown> }>) ?? [];
      const skeleton = node['loading'] === 'skeleton';
      return (
        <table className={`lume-table ${skeleton ? 'lume-skeleton' : ''}`} data-id={node['id'] as string}>
          <thead>
            <tr>{cols.map((c) => <th key={c.fieldKey}>{c.label}</th>)}</tr>
          </thead>
          <tbody>
            {skeleton && rows.length === 0
              ? [0, 1, 2].map((i) => (
                  <tr key={i}>{cols.map((c) => <td key={c.fieldKey}><span className="lume-skeleton-cell" /></td>)}</tr>
                ))
              : rows.map((r) => (
                  <tr key={r.rowKey} data-row-key={r.rowKey}>
                    {cols.map((c) => <td key={c.fieldKey}>{String(r.cells[c.fieldKey] ?? '')}</td>)}
                  </tr>
                ))}
          </tbody>
        </table>
      );
    }

    case 'list': {
      const items = (node['items'] as Array<{ itemKey: string; label?: string }>) ?? [];
      return (
        <ul className="lume-list" data-id={node['id'] as string}>
          {items.map((i) => <li key={i.itemKey} data-item-key={i.itemKey}>{i.label ?? i.itemKey}</li>)}
        </ul>
      );
    }

    case 'toolbar':
      return <div className="lume-toolbar" data-id={node['id'] as string}>{children(node, onAction)}</div>;

    case 'button': {
      const action = node['action'] as { type?: string; payload?: unknown } | undefined;
      return (
        <button
          type="button"
          className={`lume-button ${styleClasses(node)}`}
          onClick={() =>
            action?.type && onAction({ type: action.type, payload: action.payload, sourceId: node['id'] as string })
          }
        >
          {node['label'] as string}
        </button>
      );
    }

    case 'status':
      return <div className="lume-status" data-id={node['id'] as string}>{(node['text'] as string) ?? ''}</div>;

    case 'divider':
      return <hr className="lume-divider" />;

    default:
      // Unreachable for validated trees — defensive, never throws mid-render.
      return <div className="lume-unknown">unsupported primitive: {node.type}</div>;
  }
}
```

- [ ] **Step 4: Write `app/src/renderer/src/theme/lume.css`** (baseline tokens; final values come from `docs/visual-spec.md` v0.3 in the GA polish phase — these are real, shippable defaults, not stubs)

```css
:root {
  --lume-bg: #101417;
  --lume-surface: #1a2126;
  --lume-surface-raised: #222b31;
  --lume-text: #e8edef;
  --lume-text-dim: #9fb0b5;
  --lume-accent: #3aa6b9;            /* Lagoon — default palette */
  --lume-border: #2c373e;
  --lume-radius: 10px;
  --lume-font-structural: 'Geist', system-ui, sans-serif;
  --lume-font-prose: 'Source Serif 4', Georgia, serif;
  --lume-font-mono: 'Geist Mono', ui-monospace, monospace;
}
html, body, #root { height: 100%; margin: 0; }
body { background: var(--lume-bg); color: var(--lume-text); font-family: var(--lume-font-structural); }
.lume-prose { font-family: var(--lume-font-prose); line-height: 1.55; }
.lume-mono { font-family: var(--lume-font-mono); }
.lume-container { background: var(--lume-surface); border: 1px solid var(--lume-border); border-radius: var(--lume-radius); padding: 16px; margin: 12px; }
.lume-container-title { color: var(--lume-text-dim); font-size: 12px; text-transform: uppercase; letter-spacing: .08em; margin-bottom: 8px; }
.lume-layout-stack > * + * { margin-top: 10px; }
.lume-heading { margin: 0; font-weight: 600; }
.lume-table { width: 100%; border-collapse: collapse; }
.lume-table th, .lume-table td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--lume-border); }
.lume-table th { color: var(--lume-text-dim); font-weight: 500; font-size: 13px; }
.lume-skeleton-cell { display: inline-block; width: 70%; height: 12px; border-radius: 6px; background: var(--lume-surface-raised); animation: lume-pulse 1.2s ease-in-out infinite; }
@keyframes lume-pulse { 50% { opacity: .45; } }
.lume-toolbar { display: flex; gap: 8px; }
.lume-button { background: var(--lume-surface-raised); color: var(--lume-text); border: 1px solid var(--lume-border); border-radius: 8px; padding: 6px 14px; cursor: pointer; }
.lume-button:hover { border-color: var(--lume-accent); }
.lume-status { color: var(--lume-text-dim); font-size: 13px; }
.lume-divider { border: none; border-top: 1px solid var(--lume-border); }
.lume-list { margin: 0; padding-left: 20px; }
.lume-unknown { border: 1px dashed #b34a4a; color: #d98c8c; padding: 8px; border-radius: 8px; }
.lume-notices { position: fixed; bottom: 8px; right: 8px; max-width: 360px; font-size: 11px; color: var(--lume-text-dim); font-family: var(--lume-font-mono); }
.lume-coldstart { display: flex; height: 100%; align-items: center; justify-content: center; }
.lume-coldstart input { width: min(560px, 70vw); padding: 14px 18px; font-size: 16px; border-radius: 12px; border: 1px solid var(--lume-border); background: var(--lume-surface); color: var(--lume-text); outline: none; }
.lume-coldstart input:focus { border-color: var(--lume-accent); }
.lume-prose-strip { padding: 10px 16px; border-top: 1px solid var(--lume-border); }
```

- [ ] **Step 5: Run — expect PASS** (`npx vitest run test/renderer/render.test.tsx`)
- [ ] **Step 6: Lint + commit** — `npm run lint:fix && git add -A && git commit -m "feat(app): WT1 primitive renderer + Lume baseline theme"`

---

### Task A9: IPC contract + preload bridge

**Files:**
- Create: `app/src/shared/ipc.ts`, `app/src/preload/index.ts`, `app/src/renderer/src/api.d.ts`

- [ ] **Step 1: Write `app/src/shared/ipc.ts`**

```ts
import type { ClientTurn, ServerMessage } from './protocol.js';

export interface ConnectOptions {
  /** ws(s)://host/omadia-ui/canvas */
  url: string;
  /** true → run the login-window cookie flow before connecting */
  useAuth: boolean;
}

export interface ConnectionStatus {
  state: 'disconnected' | 'connecting' | 'ready' | 'failed';
  canvasSessionId?: string;
  detail?: string;
}

export interface OmadiaCanvasApi {
  connect(opts: ConnectOptions): Promise<void>;
  sendTurn(turn: ClientTurn): void;
  requestResync(): void;
  onServerMessage(cb: (msg: ServerMessage) => void): () => void;
  onStatus(cb: (status: ConnectionStatus) => void): () => void;
}

export const IPC = {
  connect: 'canvas:connect',
  turn: 'canvas:turn',
  resync: 'canvas:resync',
  serverMessage: 'canvas:server-message',
  status: 'canvas:status',
} as const;
```

- [ ] **Step 2: Write `app/src/preload/index.ts`**

```ts
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { IPC, type ConnectOptions, type ConnectionStatus, type OmadiaCanvasApi } from '../shared/ipc.js';
import type { ClientTurn, ServerMessage } from '../shared/protocol.js';

const subscribe = <T>(channel: string, cb: (payload: T) => void): (() => void) => {
  const listener = (_e: IpcRendererEvent, payload: T) => cb(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};

const api: OmadiaCanvasApi = {
  connect: (opts: ConnectOptions) => ipcRenderer.invoke(IPC.connect, opts),
  sendTurn: (turn: ClientTurn) => ipcRenderer.send(IPC.turn, turn),
  requestResync: () => ipcRenderer.send(IPC.resync),
  onServerMessage: (cb: (msg: ServerMessage) => void) => subscribe(IPC.serverMessage, cb),
  onStatus: (cb: (status: ConnectionStatus) => void) => subscribe(IPC.status, cb),
};

contextBridge.exposeInMainWorld('omadiaCanvas', api);
```

- [ ] **Step 3: Write `app/src/renderer/src/api.d.ts`**

```ts
import type { OmadiaCanvasApi } from '../../shared/ipc.js';

declare global {
  interface Window { omadiaCanvas: OmadiaCanvasApi }
}
export {};
```

- [ ] **Step 4: Typecheck + commit** — `npm run typecheck && git add -A && git commit -m "feat(app): typed IPC contract + contextBridge preload"`

---

### Task A10: Canvas socket (main process)

**Files:**
- Create: `app/src/main/canvasSocket.ts`
- Test: `app/test/node/canvasSocket.test.ts`

- [ ] **Step 1: Write the failing test** (runs against the in-process stub server)

```ts
// app/test/node/canvasSocket.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startStubServer } from '../../tools/stub-server/stubServer.js';
import { CanvasSocket } from '../../src/main/canvasSocket.js';
import type { ServerMessage } from '../../src/shared/protocol.js';
import type { ConnectionStatus } from '../../src/shared/ipc.js';

let server: Awaited<ReturnType<typeof startStubServer>>;
beforeAll(async () => { server = await startStubServer(0); });
afterAll(async () => { await server.close(); });

describe('CanvasSocket', () => {
  it('connects, handshakes, persists the session id, and streams a turn', async () => {
    const messages: ServerMessage[] = [];
    const statuses: ConnectionStatus[] = [];
    let persisted: string | undefined;

    const socket = new CanvasSocket({
      url: `ws://127.0.0.1:${server.port}/omadia-ui/canvas`,
      localOperations: [],
      session: { load: () => persisted, save: (id) => { persisted = id; } },
      onMessage: (m) => messages.push(m),
      onStatus: (s) => statuses.push(s),
    });
    socket.connect();

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('never ready')), 5000);
      const poll = setInterval(() => {
        if (statuses.some((s) => s.state === 'ready')) { clearTimeout(timer); clearInterval(poll); resolve(); }
      }, 20);
    });
    expect(persisted).toBe('stub-canvas');

    socket.sendTurn({ type: 'turn', turnId: 't1', text: 'hello' });
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('no turn_complete')), 15_000);
      const poll = setInterval(() => {
        if (messages.some((m) => m.type === 'turn_complete')) { clearTimeout(timer); clearInterval(poll); resolve(); }
      }, 50);
    });
    expect(messages.some((m) => m.type === 'surface_snapshot')).toBe(true);
    socket.close();
  }, 25_000);
});
```

- [ ] **Step 2: Run — expect FAIL**
- [ ] **Step 3: Write `app/src/main/canvasSocket.ts`**

```ts
import WebSocket from 'ws';
import type { ConnectionStatus } from '../shared/ipc.js';
import { parseServerMessage, type ClientTurn, type ServerMessage } from '../shared/protocol.js';
import { createHandshake } from './handshake.js';

export interface SessionPersistence {
  load(): string | undefined;
  save(canvasSessionId: string): void;
}

export interface CanvasSocketOptions {
  url: string;
  /** `omadia_session=…` header value; omit for the stub server */
  cookie?: string;
  localOperations: string[];
  session: SessionPersistence;
  onMessage: (msg: ServerMessage) => void;
  onStatus: (status: ConnectionStatus) => void;
}

const BACKOFF_MS = [1000, 2000, 5000, 10_000, 30_000] as const;

/**
 * Owns the WebSocket to omadia-ui-channel: handshake on every (re)connect,
 * exponential-backoff reconnect, canvasSessionId persistence across sessions.
 * Resync (surfaceSeq gap / revision mismatch) = reconnect + re-select with the
 * same canvasSessionId — the v1 snapshot-re-request mechanism.
 */
export class CanvasSocket {
  private ws: WebSocket | null = null;
  private ready = false;
  private closedByUser = false;
  private attempt = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;

  constructor(private readonly opts: CanvasSocketOptions) {}

  connect(): void {
    this.closedByUser = false;
    this.open();
  }

  sendTurn(turn: ClientTurn): void {
    if (this.ready && this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(turn));
    } else {
      this.opts.onStatus({ state: 'failed', detail: 'turn dropped: socket not ready' });
    }
  }

  /** Tear down and re-handshake with the persisted canvasSessionId. */
  resync(): void {
    this.ws?.close(4000, 'client resync');
  }

  close(): void {
    this.closedByUser = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close(1000, 'client shutdown');
  }

  private open(): void {
    this.ready = false;
    this.opts.onStatus({ state: 'connecting' });
    const headers = this.opts.cookie ? { Cookie: this.opts.cookie } : undefined;
    const ws = new WebSocket(this.opts.url, { headers });
    this.ws = ws;

    const handshake = createHandshake({
      protocolVersions: ['1.0'],
      opsCatalogVersions: ['1.0'],
      localOperations: this.opts.localOperations,
      canvasSessionId: this.opts.session.load(),
    });

    ws.on('message', (raw) => {
      const msg = parseServerMessage(String(raw));
      if (!msg) return;

      if (!this.ready) {
        const action = handshake.onMessage(msg);
        if (!action) return;
        if (action.kind === 'send') {
          ws.send(JSON.stringify(action.message));
        } else if (action.kind === 'ready') {
          this.ready = true;
          this.attempt = 0;
          this.opts.session.save(action.canvasSessionId);
          this.opts.onStatus({ state: 'ready', canvasSessionId: action.canvasSessionId });
        } else {
          this.opts.onStatus({ state: 'failed', detail: action.reason });
          this.closedByUser = true; // version failure is terminal, not retryable
          ws.close(1002, action.reason);
        }
        return;
      }
      this.opts.onMessage(msg);
    });

    ws.on('close', () => {
      this.ready = false;
      if (this.closedByUser) {
        this.opts.onStatus({ state: 'disconnected' });
        return;
      }
      const delay = BACKOFF_MS[Math.min(this.attempt, BACKOFF_MS.length - 1)] as number;
      this.attempt += 1;
      this.opts.onStatus({ state: 'connecting', detail: `reconnecting in ${delay}ms` });
      this.reconnectTimer = setTimeout(() => this.open(), delay);
    });

    ws.on('error', (err) => {
      this.opts.onStatus({ state: 'failed', detail: err.message });
      // 'close' follows and drives the backoff.
    });
  }
}
```

- [ ] **Step 4: Run — expect PASS** (`npx vitest run test/node/canvasSocket.test.ts`)
- [ ] **Step 5: Lint + commit** — `npm run lint:fix && git add -A && git commit -m "feat(app): reconnecting canvas WebSocket client with session resume"`

---

### Task A11: Electron main process + auth

**Files:**
- Create: `app/src/main/index.ts`, `app/src/main/auth.ts`, `app/src/main/sessionStore.ts`

- [ ] **Step 1: Write `app/src/main/sessionStore.ts`**

```ts
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { SessionPersistence } from './canvasSocket.js';

/** canvasSessionId persistence in userData — survives app restarts (WT5 later). */
export function createFileSessionStore(userDataDir: string): SessionPersistence {
  const file = join(userDataDir, 'canvas-session.json');
  return {
    load(): string | undefined {
      try {
        const parsed = JSON.parse(readFileSync(file, 'utf8')) as { canvasSessionId?: string };
        return typeof parsed.canvasSessionId === 'string' ? parsed.canvasSessionId : undefined;
      } catch {
        return undefined;
      }
    },
    save(canvasSessionId: string): void {
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, JSON.stringify({ canvasSessionId }), 'utf8');
    },
  };
}
```

- [ ] **Step 2: Write `app/src/main/auth.ts`**

```ts
import { BrowserWindow } from 'electron';

/**
 * Acquire the kernel session: open the omadia login page in a window and poll
 * its partition for the `omadia_session` cookie the WebSocketRegistry verifies
 * pre-upgrade (PR-11: verifySession + Entra whitelist, 401/403 before the 101).
 * Works for both local-credential and OIDC logins — we only need the cookie.
 */
export async function acquireSessionCookie(httpOrigin: string): Promise<string> {
  const win = new BrowserWindow({
    width: 480,
    height: 680,
    title: 'Sign in to Omadia',
    webPreferences: { partition: 'persist:omadia-auth', contextIsolation: true, nodeIntegration: false },
  });
  await win.loadURL(httpOrigin);

  return new Promise<string>((resolve, reject) => {
    const ses = win.webContents.session;
    const poll = setInterval(() => {
      void ses.cookies.get({ name: 'omadia_session' }).then((cookies) => {
        const c = cookies[0];
        if (c) {
          clearInterval(poll);
          win.close();
          resolve(`omadia_session=${c.value}`);
        }
      });
    }, 500);
    win.on('closed', () => {
      clearInterval(poll);
      reject(new Error('login window closed before a session was established'));
    });
  });
}
```

- [ ] **Step 3: Write `app/src/main/index.ts`**

```ts
import { app, BrowserWindow, ipcMain, Menu } from 'electron';
import { join } from 'node:path';
import { IPC, type ConnectOptions } from '../shared/ipc.js';
import type { ClientTurn } from '../shared/protocol.js';
import { acquireSessionCookie } from './auth.js';
import { CanvasSocket } from './canvasSocket.js';
import { createFileSessionStore } from './sessionStore.js';

/** the ops-catalog subset this build implements. M1 ships none; M2 adds
 *  brush/blur/select-magic-wand — extend here AND in the catalog handler. */
const LOCAL_OPERATIONS: string[] = [];

let win: BrowserWindow | null = null;
let socket: CanvasSocket | null = null;

function createWindow(): void {
  win = new BrowserWindow({
    width: 1440,
    height: 920,
    backgroundColor: '#101417',
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const menu = Menu.buildFromTemplate([
    { role: 'appMenu' },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { role: 'togglefullscreen' }, // fullscreen-overlay vs windowed (concept Req 4)
        { role: 'toggleDevTools' },
        // ⌘1–3 canvas hotkeys are reserved; single canvas until WT5.
        ...[1, 2, 3].map((n) => ({
          label: `Canvas ${n}`,
          accelerator: `CommandOrControl+${n}`,
          click: () => win?.webContents.send(IPC.status, { state: 'ready', detail: `canvas ${n} (single-canvas M1)` }),
        })),
      ],
    },
  ]);
  Menu.setApplicationMenu(menu);

  if (process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL']); // electron-vite dev
  } else {
    void win.loadFile(join(import.meta.dirname, '../renderer/index.html'));
  }
}

ipcMain.handle(IPC.connect, async (_e, opts: ConnectOptions) => {
  socket?.close();
  let cookie: string | undefined;
  if (opts.useAuth) {
    const httpOrigin = opts.url.replace(/^ws/, 'http').replace(/\/omadia-ui\/canvas$/, '');
    cookie = await acquireSessionCookie(httpOrigin);
  }
  socket = new CanvasSocket({
    url: opts.url,
    cookie,
    localOperations: LOCAL_OPERATIONS,
    session: createFileSessionStore(app.getPath('userData')),
    onMessage: (msg) => win?.webContents.send(IPC.serverMessage, msg),
    onStatus: (status) => win?.webContents.send(IPC.status, status),
  });
  socket.connect();
});

ipcMain.on(IPC.turn, (_e, turn: ClientTurn) => socket?.sendTurn(turn));
ipcMain.on(IPC.resync, () => socket?.resync());

void app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  socket?.close();
  if (process.platform !== 'darwin') app.quit();
});
```

- [ ] **Step 4: Typecheck + lint + commit**

```bash
npm run typecheck && npm run lint:fix
git add -A && git commit -m "feat(app): Electron main process — window, menu hotkeys, auth cookie flow, IPC"
```

---

### Task A12: Renderer app shell — cold-start prompt + canvas view

**Files:**
- Create: `app/src/renderer/index.html`, `app/src/renderer/src/main.tsx`, `app/src/renderer/src/App.tsx`

- [ ] **Step 1: Write `app/src/renderer/index.html`**

```html
<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; style-src 'self' 'unsafe-inline'" />
    <title>Omadia UI</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: Write `app/src/renderer/src/main.tsx`**

```tsx
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import './theme/lume.css';

createRoot(document.getElementById('root') as HTMLElement).render(<App />);
```

- [ ] **Step 3: Write `app/src/renderer/src/App.tsx`**

```tsx
import { useEffect, useRef, useState } from 'react';
import type { ConnectionStatus } from '../../shared/ipc.js';
import { applyServerMessage, initialCanvasState, type CanvasState } from './store/canvasStore.js';
import { PrimitiveNode, type PrimitiveAction, type PrimitiveJson } from './render/PrimitiveNode.js';

const WS_URL = import.meta.env.VITE_OMADIA_WS_URL ?? 'ws://127.0.0.1:8181/omadia-ui/canvas';
const USE_AUTH = import.meta.env.VITE_OMADIA_USE_AUTH === '1' || WS_URL.startsWith('wss');

export function App() {
  const [canvas, setCanvas] = useState<CanvasState>(initialCanvasState);
  const [status, setStatus] = useState<ConnectionStatus>({ state: 'disconnected' });
  const [draft, setDraft] = useState('');
  const stateRef = useRef(canvas);
  stateRef.current = canvas;

  useEffect(() => {
    const offMsg = window.omadiaCanvas.onServerMessage((msg) => {
      const { state, resync } = applyServerMessage(stateRef.current, msg);
      setCanvas(state);
      if (resync) window.omadiaCanvas.requestResync();
    });
    const offStatus = window.omadiaCanvas.onStatus(setStatus);
    void window.omadiaCanvas.connect({ url: WS_URL, useAuth: USE_AUTH });
    return () => {
      offMsg();
      offStatus();
    };
  }, []);

  const submitPrompt = () => {
    const text = draft.trim();
    if (!text) return;
    window.omadiaCanvas.sendTurn({ type: 'turn', turnId: crypto.randomUUID(), text });
    setCanvas((c) => ({ ...c, turnPending: true, prose: '' }));
    setDraft('');
  };

  const onAction = (action: PrimitiveAction) => {
    window.omadiaCanvas.sendTurn({
      type: 'turn',
      turnId: crypto.randomUUID(),
      action: { type: action.type, payload: action.payload },
      ...(action.sourceId ? { target: { kind: 'element', elementId: action.sourceId } } : {}),
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ flex: 1, overflow: 'auto' }}>
        {canvas.tree ? (
          <PrimitiveNode node={canvas.tree as PrimitiveJson} onAction={onAction} />
        ) : (
          // Cold-start: a canvas is never empty (concept §Interaction Model).
          <div className="lume-coldstart">
            <input
              autoFocus
              placeholder={status.state === 'ready' ? 'Ask omadia…' : `(${status.state}${status.detail ? `: ${status.detail}` : ''})`}
              disabled={status.state !== 'ready'}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submitPrompt()}
            />
          </div>
        )}
      </div>
      {canvas.prose && <div className="lume-prose-strip lume-prose">{canvas.prose}</div>}
      {canvas.tree && (
        <div className="lume-prose-strip">
          <input
            style={{ width: '100%', background: 'transparent', border: 'none', color: 'inherit', outline: 'none' }}
            placeholder={canvas.turnPending ? 'working…' : '⌘K — ask omadia…'}
            disabled={canvas.turnPending || status.state !== 'ready'}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submitPrompt()}
          />
        </div>
      )}
      {import.meta.env.DEV && canvas.notices.length > 0 && (
        <div className="lume-notices">{canvas.notices.slice(-5).map((n, i) => <div key={i}>{n}</div>)}</div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Manual end-to-end gate against the stub** — two terminals:

```bash
cd app && npm run stub-server        # terminal 1
cd app && npm run dev                # terminal 2
```

Expected: Electron window opens with the centred cold-start prompt → type anything + Enter → skeleton table renders within ~500ms → rows fill in → "Out" column appears → prose strip shows "Three people are under budget — Anna, Bernd, Cara.". The dev notices strip stays empty (no rejected events).

- [ ] **Step 5: Run the full suite + commit**

```bash
npm test && npm run typecheck && npm run lint:fix
git add -A && git commit -m "feat(app): renderer shell — cold-start prompt, canvas view, prose strip"
```

---

### Task A13: Record the pinned wire decisions in the protocol doc

**Files:**
- Modify: `docs/protocol/1.0.md` (§5, after the client-rules paragraph)

- [ ] **Step 1: Append a `### 5.1 Patch op grammar (pinned in the spike)` subsection** to `docs/protocol/1.0.md` directly after the "Client rules." paragraph in §5:

```markdown
### 5.1 Patch op grammar (pinned in the spike)

`surface_patch.patches` items are an RFC-6902 subset:
`{ "op": "add" | "replace" | "remove", "path": <JSON-Pointer>, "value"? }`.
`add` supports the `-` append index. Positional array segments are valid
*inside* a patch because `basedOnRevision` equality pins the tree shape the
path was authored against; the stable-ID rule governs cross-turn references,
not intra-patch addressing. Reference implementation:
`app/src/shared/treePatch.ts` (Host App) — Tier 2 must emit only this subset.

**Snapshot re-request.** v1 defines no dedicated wire message: on a
`surfaceSeq` gap or `basedOnRevision` mismatch the client closes the socket
and reconnects, re-`handshake_select`ing with its persisted
`canvasSessionId`; the server answers the next turn (or, once Tier-2 canvas
state persistence lands, the re-handshake itself) with a fresh
`surface_snapshot`.

**Open feedback (v1.1 candidates):** (a) `tableRow` is closed
(`additionalProperties: false`), so a row-highlight patch (Walkthrough 1
step 13) has no schema-valid wire shape yet; (b) the client `turn` message
carries `action` (button/row clicks) which rides
`IncomingTurn.metadata.action` until the SDK grows a typed field.
```

- [ ] **Step 2: Commit** — `git add docs/protocol/1.0.md && git commit -m "docs(protocol): pin patch-op grammar, snapshot re-request, v1.1 feedback items"`

---

### Task A14: Unsigned distribution build

**Files:**
- Create: `app/electron-builder.yml`

- [ ] **Step 1: Write `app/electron-builder.yml`**

```yaml
appId: ai.omadia.ui
productName: Omadia UI
directories:
  output: dist
files:
  - out/**
mac:
  target: [dmg, zip]
  category: public.app-category.productivity
  # Signing/notarization (high5 Developer ID, notarytool) lands with the GA
  # release pipeline — implementation-plan.md §7 / references/apple_dev.md.
  identity: null
```

- [ ] **Step 2: Build and launch the artifact**

Run: `cd app && npm run dist`
Expected: `dist/Omadia UI-0.1.0-arm64.dmg` + `.zip` produced; mounting the dmg and launching the app shows the cold-start prompt (stub not running → status `connecting`/`failed` in the placeholder — correct behavior).

- [ ] **Step 3: Commit** — `git add -A && git commit -m "build(app): unsigned electron-builder dmg/zip target"`

---

### Task A15: Manual gate against the real omadia server

No file changes — verification only (requires a running odoo-bot deployment).

- [ ] **Step 1: Start omadia core locally** (from `/Users/marcelwege/sources/odoo-bot/middleware`, per that repo's README/AGENTS.md run instructions; canvas channel + orchestrator activate automatically — both are auto-discovered plugins).
- [ ] **Step 2: Verify discovery**: `curl -s http://localhost:<PORT>/omadia-ui/info` → JSON advertising `protocolVersions: ["1.0"]` and the canvas capability.
- [ ] **Step 3: Run the app against it**:

```bash
cd app && VITE_OMADIA_WS_URL=ws://localhost:<PORT>/omadia-ui/canvas VITE_OMADIA_USE_AUTH=1 npm run dev
```

Expected: login window opens → sign in → window closes → status `ready` → submit a prompt → **prose streams into the prose strip** (`agent_text_delta`), `turn_complete` settles the turn. **No canvas tree renders yet** — expected: the orchestrator's `authorizedToolNames` allow-set is empty until PR-9b-2 ships a `canvas-output` producer tool. Auth failure (401/403 before the WS 101) must surface as status `failed`, not a crash.
- [ ] **Step 4: Record the outcome** in `docs/spike-report.md` under "M1 — real-server connectivity" (create the file with just that section if it does not exist yet; the full spike report grows in later phases).

```bash
git add docs/spike-report.md && git commit -m "docs(spike): record M1 real-server connectivity result"
```

---

# Part B — Channel plugin gaps (repo: `byte5ai/omadia` via odoo-bot worktree)

> Process constraints (AGENTS.md, hook-enforced): work in a **worktree**, one logical change per PR, `<70`-char conventional title, docs in the same PR, four Required checks green, **no Co-Authored-By trailers**. Pre-flight from `middleware/`: `npm ci --include=optional && npm run build && npm run lint && npm run typecheck && npm test`.

### Task B1: Thread `localOperations` + client `action` into `IncomingTurn.metadata`

One logical change: complete the client-context passthrough the canvas wire already defines (`handshake_select.localOperations` is currently parsed but dropped; a `turn` cannot carry a structured action — Walkthrough 1 step 15).

**Files:**
- Modify: `middleware/packages/omadia-ui-channel/src/protocol.ts` (add `action` to `ClientTurn`)
- Modify: `middleware/packages/omadia-ui-channel/src/canvasConnection.ts`
- Test: `middleware/test/uiChannelWebSocket.test.ts` (extend)

- [ ] **Step 1: Create the worktree + branch**

```bash
cd /Users/marcelwege/sources/odoo-bot
git worktree add ../odoo-bot-ui-channel-ctx -b feat/ui-channel-client-context origin/main
cd ../odoo-bot-ui-channel-ctx/middleware && npm ci --include=optional && npm run build
```

- [ ] **Step 2: Write the failing test** — append to `middleware/test/uiChannelWebSocket.test.ts`, using a self-contained fake socket (mirror the file's existing style if a helper already exists there — prefer the existing helper):

```ts
test('threads localOperations and turn action into IncomingTurn.metadata', async () => {
  const sent: string[] = [];
  let onMessage: (raw: string) => void = () => {};
  const socket = {
    send: (d: string) => sent.push(d),
    onMessage: (cb: (d: string) => void) => { onMessage = cb; },
    onClose: () => {},
    close: () => {},
    request: { url: '/omadia-ui/canvas', headers: {} },
  };
  const turns: IncomingTurn[] = [];
  handleCanvasSocket(socket, { subject: 'u1', provider: 'local' } as ChannelSessionClaims, {
    channelId: 'ui-channel',
    protocolVersions: ['1.0'],
    opsCatalogVersions: ['1.0'],
    mintId: () => 'fixed-id',
    handleTurnStream: async function* (turn) { turns.push(turn); },
  });

  const offer = JSON.parse(sent[0]!) as { handshakeId: string };
  onMessage(JSON.stringify({
    type: 'handshake_select', handshakeId: offer.handshakeId,
    protocolVersion: '1.0', opsCatalogVersion: '1.0',
    localOperations: ['brush', 'blur'],
  }));
  onMessage(JSON.stringify({
    type: 'turn', turnId: 't1', text: '',
    action: { type: 'row-click', payload: { rowKey: 'anna' } },
  }));
  await new Promise((r) => setTimeout(r, 0));

  assert.equal(turns.length, 1);
  assert.deepEqual(turns[0]!.metadata?.localOperations, ['brush', 'blur']);
  assert.deepEqual(turns[0]!.metadata?.action, { type: 'row-click', payload: { rowKey: 'anna' } });
});
```

- [ ] **Step 3: Run — expect FAIL** (`npm test -- --test-name-pattern "threads localOperations"` from `middleware/`)
- [ ] **Step 4: Implement.** In `protocol.ts`, extend `ClientTurn` (after the `text?` field):

```ts
  /** structured UI action (button click, row-click); validated for shape by the
   *  channel, semantically by Tier 2. Rides IncomingTurn.metadata.action. */
  action?: unknown;
```

In `canvasConnection.ts`:
(a) add connection state next to `canvasSessionId`:

```ts
  /** the catalog ops the client declared at handshake — Tier-2 Class-B routing truth. */
  let localOperations: string[] = [];
```

(b) in the `awaiting_select` branch, after the version checks pass (before minting `canvasSessionId`):

```ts
      localOperations = Array.isArray(msg.localOperations)
        ? msg.localOperations.filter((op): op is string => typeof op === 'string')
        : [];
```

(c) in `validateTurnInput`, add:

```ts
    if (
      msg.action !== undefined &&
      !(isPlainObject(msg.action) && typeof msg.action['type'] === 'string')
    ) {
      return 'invalid action: expected an object with a string `type`';
    }
```

(d) in `formIncomingTurn`, extend the `metadata` object literal:

```ts
        ...(localOperations.length > 0 ? { localOperations } : {}),
        ...(msg.action !== undefined ? { action: msg.action } : {}),
```

- [ ] **Step 5: Run — expect PASS**, then the full pre-flight: `npm run build && npm run lint && npm run typecheck && npm test`
- [ ] **Step 6: Docs in the same PR** — update `docs/middleware-agent-handoff.md` §8 (channel notes): one paragraph stating `IncomingTurn.metadata.localOperations` (handshake-declared catalog subset) and `metadata.action` (structured client action) are now populated by the canvas channel for Tier-2 consumption.
- [ ] **Step 7: Commit + PR**

```bash
git add -A
git commit -m "feat(ui-channel): thread client localOperations + turn action into metadata"
gh pr create --title "feat(ui-channel): thread client localOperations + turn action into metadata" \
  --body "## What
The canvas handshake's localOperations declaration was parsed but dropped, and a client turn could not carry a structured UI action (Walkthrough 1 step 15). Both now ride IncomingTurn.metadata (additive; typed SDK fields are a v1.1 protocol-feedback item).
## Test plan
middleware test: handshake with localOperations + turn with action asserts both land on metadata; full middleware suite green.
## Intentionally unchanged
No SDK type changes; classic channels untouched; no new wire message types."
```

Expected: four Required checks green (`middleware`, `web-ui`, `schema`, `audit`).

---

# Part C — Tier-2 Haiku composition (repo: `byte5ai/omadia`, PR-9b-2 slice)

> Same AGENTS.md process constraints as Part B. Run **after** Part A (the spike's tree-validity probe — ≥50 composition prompts, ≥95% first-attempt schema-valid with one bounded repair retry — is the gate that keeps `ui_orchestrator_model` on Haiku; below the gate, pin it to Sonnet per implementation-plan §8).
>
> **Current state being extended** (`middleware/packages/omadia-ui-orchestrator/`): `plugin.ts` publishes `canvasChatAgent` as a lazy 1:1 delegate to `chatAgent`; `surfaceSynthesis.ts` only converts `_pendingCanvasTree` → `surface_snapshot`, gated on the hardcoded-empty `CANVAS_OUTPUT_TOOLS`. No LLM call, no skeleton, no requirement handoff exists.

### Task C1: Composition module — Haiku skeleton + data requirements (validator-gated)

**Files:**
- Create: `middleware/packages/omadia-ui-orchestrator/src/composition.ts`
- Create: `middleware/packages/omadia-ui-orchestrator/schema/` (vendored copy of `omadia-ui/docs/protocol/schema/*.json` — the 1.0 spec is frozen/versioned, so the copy is pinned, with a header comment naming the source)
- Create: `middleware/packages/omadia-ui-orchestrator/src/treeValidator.ts` (Ajv-2020 wrapper, same shape as Part A Task A5 — add `ajv` to this package's dependencies)
- Test: `middleware/test/uiOrchestratorComposition.test.ts`

- [ ] **Step 1: Verify the LLM client surface before writing code** (do not guess the API):

```bash
grep -rn "anthropicClient" middleware/packages/harness-orchestrator/src/ middleware/src/ | head -20
```

Record the service key and the minimal call signature actually used. The composition module does **not** consume it directly — it takes an injected narrow port (next step) so tests never need the real client; only Task C2's wiring touches the verified service.

- [ ] **Step 2: Write the failing test**

```ts
// middleware/test/uiOrchestratorComposition.test.ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { composeSkeleton, FALLBACK_SKELETON } from '@omadia/ui-orchestrator/dist/composition.js';

const VALID = JSON.stringify({
  tree: {
    type: 'container', id: 'root', layout: 'stack',
    children: [
      { type: 'heading', id: 'h', content: 'Tickets by owner', level: 2 },
      { type: 'table', id: 'tickets', loading: 'skeleton',
        columns: [{ fieldKey: 'owner', label: 'Owner' }, { fieldKey: 'hoursLeft', label: 'Budget left (h)' }],
        rows: [] },
      { type: 'status', id: 'st', text: 'Querying…' },
    ],
  },
  dataRequirements: [{
    containerId: 'tickets',
    description: 'open Jira tickets grouped by owner with remaining ERP hour budget',
    fields: [{ fieldKey: 'owner', label: 'Owner' }, { fieldKey: 'hoursLeft', label: 'Budget left (h)', type: 'number' }],
  }],
});

test('composeSkeleton returns a schema-valid skeleton + requirements', async () => {
  const result = await composeSkeleton({
    llm: { complete: async () => VALID },
    model: 'claude-haiku-4-5',
    userText: 'show open tickets with budgets',
  });
  assert.equal(result.source, 'model');
  assert.equal((result.tree as { type: string }).type, 'container');
  assert.equal(result.dataRequirements[0]?.containerId, 'tickets');
});

test('composeSkeleton retries once with validator errors, then falls back deterministically', async () => {
  const calls: string[] = [];
  const result = await composeSkeleton({
    llm: { complete: async ({ user }) => { calls.push(user); return '{"tree":{"type":"iframe"}}'; } },
    model: 'claude-haiku-4-5',
    userText: 'whatever',
  });
  assert.equal(calls.length, 2);                       // one bounded repair retry
  assert.match(calls[1] ?? '', /schema|invalid/i);     // retry prompt carries the validator errors
  assert.equal(result.source, 'fallback');
  assert.deepEqual(result.tree, FALLBACK_SKELETON);    // never blocks the turn
  assert.equal(result.dataRequirements.length, 1);     // generic whole-turn requirement
});

test('composeSkeleton falls back on non-JSON output', async () => {
  const result = await composeSkeleton({
    llm: { complete: async () => 'Sure! Here is your UI: …' },
    model: 'claude-haiku-4-5',
    userText: 'x',
  });
  assert.equal(result.source, 'fallback');
});
```

- [ ] **Step 3: Run — expect FAIL** (from `middleware/`: `npm run build && npm test -- --test-name-pattern composeSkeleton`)
- [ ] **Step 4: Write `src/composition.ts`**

```ts
import { validateTree } from './treeValidator.js';

/** Narrow LLM port — wired to the kernel's Anthropic client in plugin.ts (C2);
 *  injected so composition is testable without network or SDK coupling. */
export interface CompositionLlm {
  complete(opts: { model: string; system: string; user: string; maxTokens: number }): Promise<string>;
}

/** What the skeleton promised the user — handed to the delegated main turn so
 *  Tier-3 sub-agents return data matching EXACTLY these fields (the
 *  requirement-handoff contract; consumed as the [canvas-context] block). */
export interface DataRequirement {
  containerId: string;
  description: string;
  dataClass?: string;
  fields: Array<{ fieldKey: string; label: string; type?: string }>;
}

export interface SkeletonResult {
  tree: unknown;
  dataRequirements: DataRequirement[];
  source: 'model' | 'fallback';
}

export const FALLBACK_SKELETON = {
  type: 'container', id: 'root', layout: 'stack',
  children: [{ type: 'status', id: 'st', text: 'Working on it…', loading: 'spinner' }],
} as const;

const SYSTEM_PROMPT = `You are the Omadia UI Tier-2 composer. Given a user request, emit ONLY a JSON object:
{ "tree": <primitive tree>, "dataRequirements": [{ "containerId", "description", "dataClass"?, "fields": [{ "fieldKey", "label", "type"? }] }] }
The tree is a SKELETON for data still being fetched: data-carrying primitives use loading:"skeleton" and empty rows/items. Use only these primitives: container, heading, text, table, list, tree, button, input, choice, toggle, image, chart, form, toolbar, menubar, tabs, pane, status, progress, divider. Every container needs a stable "id"; table columns need fieldKey+label. dataRequirements must name, per data-carrying container, exactly the fields the content agents must deliver. No prose, no markdown fences — raw JSON only.`;

function parseResult(raw: string): { tree: unknown; dataRequirements: DataRequirement[] } | null {
  let obj: unknown;
  try {
    obj = JSON.parse(raw.trim());
  } catch {
    return null;
  }
  if (typeof obj !== 'object' || obj === null) return null;
  const { tree, dataRequirements } = obj as { tree?: unknown; dataRequirements?: unknown };
  if (tree === undefined) return null;
  const reqs = Array.isArray(dataRequirements)
    ? dataRequirements.filter(
        (r): r is DataRequirement =>
          typeof r === 'object' && r !== null &&
          typeof (r as DataRequirement).containerId === 'string' &&
          Array.isArray((r as DataRequirement).fields),
      )
    : [];
  return { tree, dataRequirements: reqs };
}

/** Compose the skeleton-first tree. One bounded repair retry on schema failure;
 *  deterministic fallback after that — composition must NEVER block the turn. */
export async function composeSkeleton(opts: {
  llm: CompositionLlm;
  model: string;
  userText: string;
}): Promise<SkeletonResult> {
  const fallback: SkeletonResult = {
    tree: structuredClone(FALLBACK_SKELETON),
    dataRequirements: [{
      containerId: 'root',
      description: opts.userText,
      fields: [],
    }],
    source: 'fallback',
  };

  let user = `User request: ${opts.userText}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    let raw: string;
    try {
      raw = await opts.llm.complete({ model: opts.model, system: SYSTEM_PROMPT, user, maxTokens: 2048 });
    } catch {
      return fallback;
    }
    const parsed = parseResult(raw);
    if (!parsed) {
      user = `User request: ${opts.userText}\nYour previous output was not valid raw JSON. Emit ONLY the JSON object.`;
      continue;
    }
    const valid = validateTree(parsed.tree);
    if (valid.ok) {
      return { ...parsed, source: 'model' };
    }
    user = `User request: ${opts.userText}\nYour previous tree was schema-invalid: ${valid.errors}. Emit a corrected JSON object.`;
  }
  return fallback;
}
```

`src/treeValidator.ts` mirrors Part A Task A5's validator verbatim (Ajv 2020, `addSchema` over the vendored `schema/*.json`, export `validateTree`) — same code, Node import paths.

- [ ] **Step 5: Run — expect PASS**, then full pre-flight (`npm run build && npm run lint && npm run typecheck && npm test`). Append the package to the lint glob / typecheck `-w` chain **if `ajv`/new files change the package shape** (P12 — new dirs escape the hard-coded gate quietly).
- [ ] **Step 6: Commit** — `feat(ui-orchestrator): validator-gated Haiku skeleton composition module`

---

### Task C2: Skeleton-first emission + requirement handoff to the main turn

**Files:**
- Modify: `middleware/packages/omadia-ui-orchestrator/src/plugin.ts`
- Modify: `middleware/packages/omadia-ui-orchestrator/src/surfaceSynthesis.ts` (accept an injected initial snapshot / starting `surfaceSeq` + revision)
- Modify: `middleware/packages/omadia-ui-orchestrator/manifest.yaml` (setup fields)
- Test: extend `middleware/test/uiOrchestratorComposition.test.ts`

- [ ] **Step 1: Verify the delegated-input shape** (do not guess — the handoff augments the turn text):

```bash
grep -n "interface ChatTurnInput\|text" middleware/packages/harness-channel-sdk/src/chatAgent.ts | head
```

Use the actual user-text field name found there everywhere `input.text` appears below.

- [ ] **Step 2: Write the failing test** — a canvas turn through the published `canvasChatAgent` with a fake base agent + fake LLM must (a) yield `surface_snapshot` as the **first** stream event with `producesRevision` `"0"` and the composed skeleton, (b) call the base agent with the turn text **augmented by the `[canvas-context]` block** containing the `dataRequirements` JSON, (c) pass non-canvas turns through byte-for-byte (no LLM call, no snapshot — assert the fake LLM was never invoked).
- [ ] **Step 3: Implement in `plugin.ts`** — inside `chatStream` for canvas turns (`input.canvasSessionId` present), replacing the bare `synthesizeSurfaceEvents(stream, …)` wrap:

```ts
    chatStream(input, observer) {
      const base = resolveBase();
      if (!base) return errorStream();
      if (!input.canvasSessionId) return base.chatStream(input, observer);
      return canvasTurnStream(input, observer, base);
    },
```

with the new generator (same file):

```ts
  async function* canvasTurnStream(
    input: ChatTurnInput,
    observer: Parameters<ChatAgent['chatStream']>[1],
    base: ChatAgent,
  ): AsyncGenerator<ChatStreamEvent> {
    // 1. Haiku skeleton-first — emitted BEFORE the (slow) main turn starts.
    const skeleton = await composeSkeleton({
      llm: compositionLlm,                       // wired from the verified kernel client; absent → forced fallback
      model: config.uiOrchestratorModel,         // setup field, default 'claude-haiku-4-5'
      userText: input.text,
    });
    let surfaceSeq = 0;
    const initialRevision = '0' as RevisionId;
    yield {
      type: 'surface_snapshot',
      canvasSessionId: input.canvasSessionId!,
      surfaceSeq: surfaceSeq++,
      producesRevision: initialRevision,
      tree: skeleton.tree,
      protocolVersion: CANVAS_PROTOCOL_VERSION,
      opsCatalogVersion: OPS_CATALOG_VERSION,
    };

    // 2. Requirement handoff — the main turn carries what the skeleton promised,
    //    so Tier-3 returns _pendingStructuredPayload matching those exact fields.
    const augmented: ChatTurnInput = {
      ...input,
      text:
        input.text +
        '\n\n[canvas-context]\n' +
        JSON.stringify({
          canvasSkeleton: { revision: initialRevision, source: skeleton.source },
          dataRequirements: skeleton.dataRequirements,
          instruction:
            'A canvas skeleton with the above data requirements is already rendered. ' +
            'Fetch and return the data matching exactly these containerIds and fieldKeys.',
        }),
    };

    // 3. Delegate + canvas-aware synthesis continuing seq/revision after the skeleton.
    yield* synthesizeSurfaceEvents(base.chatStream(augmented, observer), {
      canvasSessionId: input.canvasSessionId!,
      authorizedToolNames: canvasOutputTools,
      protocolVersion: CANVAS_PROTOCOL_VERSION,
      opsCatalogVersion: OPS_CATALOG_VERSION,
      startSurfaceSeq: surfaceSeq,
      baseTree: skeleton.tree,
      baseRevision: initialRevision,
    });
  }
```

`surfaceSynthesis.ts` gains the three optional config fields (`startSurfaceSeq`, `baseTree`, `baseRevision`) so its counters continue instead of restarting at 0 (C3 consumes `baseTree`). `compositionLlm` is built in `activate()` from the service verified in C1 Step 1, behind the narrow `CompositionLlm` port; when that service is absent, pass a port whose `complete` rejects → `composeSkeleton` degrades to the deterministic fallback and the turn still runs.
- [ ] **Step 4: Manifest setup fields** (additive):

```yaml
setup:
  fields:
    - key: "ui_orchestrator_model"
      type: "string"
      required: false
      default: "claude-haiku-4-5"
      label: { en: "Composition model (fast tier; pin to Sonnet if the spike validity gate fails)" }
    - key: "canvas_output_tools"
      type: "string"
      required: false
      default: ""
      label: { en: "Comma-separated tool names authorised to emit canvas sentinels (interim allow-set until the boot-computed canvas-output capability wiring lands)" }
```

`activate()` parses `canvas_output_tools` into `canvasOutputTools` (replacing the hardcoded empty set — deny-by-default is preserved when unset).
- [ ] **Step 5: Run tests + full pre-flight; docs in the same PR** (handoff §8: the `[canvas-context]` block contract + the two setup fields).
- [ ] **Step 6: Commit + PR** — `feat(ui-orchestrator): Haiku skeleton-first composition + requirement handoff` with `## Intentionally unchanged: non-canvas turns are byte-for-byte passthrough (asserted by test)`.

---

### Task C3: `_pendingStructuredPayload` → `surface_patch` composition

**Files:**
- Modify: `middleware/packages/omadia-ui-orchestrator/src/surfaceSynthesis.ts`
- Create: `middleware/packages/omadia-ui-orchestrator/src/patchComposition.ts`
- Test: extend `middleware/test/uiOrchestratorComposition.test.ts`

- [ ] **Step 1: Write the failing test** — feed the synthesiser a fake base stream where an authorised tool returns a `_pendingStructuredPayload` whose `data.rows` match a `dataRequirements` entry; expect a `surface_patch` with `basedOnRevision` = the skeleton revision, RFC-6902-subset ops appending rows by `rowKey` (the Part A13 pinned grammar), and a post-patch tree that passes `validateTree`. A payload that matches **no** requirement (unknown containerId) must yield a full recomposition `surface_snapshot` instead, never a malformed patch.
- [ ] **Step 2: Implement `patchComposition.ts`** — deterministic (no LLM call on this path): map `payload.data.rows[]` onto the target table's `columns[].fieldKey`s, generating `{op:'add', path:'/…/rows/-', value:{rowKey, cells}}` ops + a `loading:"none"` replace; resolve the container path by walking `baseTree` for the matching `id`. Validate the post-patch tree; on any failure fall back to `surface_snapshot` of the recomposed tree. Wire into `surfaceSynthesis.ts` next to the existing `_pendingCanvasTree` branch, using `parseToolEmittedStructuredPayload` (shipped in #169) under the same authorised-tools gate; bump `revision`/`surfaceSeq` per emit.
- [ ] **Step 3: Run + pre-flight + docs; commit + PR** — `feat(ui-orchestrator): structured-payload patch composition onto the skeleton`.

**Explicitly deferred from Part C** (later 9b slices, unchanged from the repo's implementation-plan): per-`canvasSessionId` write mutex, cross-turn `surfaceSeq`/state persistence (re-handshake snapshot replay), `surface_data_ref_created` + DataRef HMAC signing, `writeCapabilities`-derived mutability flags, the boot-computed `canvas-output` allow-set (PR-7b wiring).

---

## Self-review checklist (run after writing, before execution)

- Spec coverage: A1–A15 cover implementation-plan Phase 1 M1 (shell ✓, handshake ✓, validator ✓, WT1 renderer ✓, snapshot/patch revision discipline ✓, stub replay ✓) plus real-server connectivity; Part B covers the only two channel gaps found against live code; Part C covers the PR-9b-2 slice (Haiku skeleton-first composition ✓, `[canvas-context]` requirement handoff to the main turn ✓, structured-payload→patch composition ✓, config-driven allow-set ✓). M2 (editor/WASM), PR-9b-3 (mutex/persistence/DataRef signing), and signing are explicitly out of scope and stated as such.
- Type consistency: `ServerMessage`/`ClientTurn` defined once in A2 and consumed by A3/A6/A7/A9/A10/A12; `SessionPersistence` defined in A10, implemented in A11; `PrimitiveAction.sourceId` flows into `target: {kind:'element'}` per `TargetRef`.
- Placeholder scan: no TBDs; Lume CSS values are concrete defaults flagged for later visual-spec alignment; B1 Step 2 names the one allowed adaptation (reuse the existing fake-socket helper if present).
