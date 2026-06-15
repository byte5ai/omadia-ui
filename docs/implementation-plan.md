# Implementation Plan — Omadia UI

> Bridge from `CONCEPT.md` v0.15 (sign-off-complete, four Codex rounds) to a
> working v1. Phases, PR sequencing against `byte5ai/omadia`, the
> spike→production gate, cross-stream waitpoints, release stages, distribution.
> Same discipline as [`docs/tech-stack.md`](tech-stack.md): strict reasoning,
> explicit risks, falsification criteria. This document plans the work; it does
> **not** build it and does **not** rewrite the concept — where the concept is
> wrong against live code, the divergence is recorded in §1 as a feed-back item.

**Status of inputs:** Concept `CONCEPT.md` v0.15 (implementation-ready). Tech
stack decided — **Electron**, validated by a two-milestone spike
([`docs/tech-stack.md`](tech-stack.md)). Visual system `docs/visual-spec.md`
v0.3 (Lume, three palettes, five composition idioms). Five end-to-end
walkthroughs (`docs/walkthroughs.md`) used here as release gates.

**Method note.** §1 was produced by checking out `byte5ai/omadia` `origin/main`
at commit `83ef79b` (PR #166) into a read-only worktree and verifying every
concept assumption the plan depends on, with `file:line` evidence. The concept
was written against a much earlier state (the last concept-era reference points
to ~PR #98); main has moved by ~70 merged PRs. The plan below is built on what
is true at `83ef79b`, not on what the concept assumed.

---

## 1. Pre-conditions verified against live omadia main

### 1.1 What was checked, and how

`origin/main` @ `83ef79b` was fetched and checked out detached at
`/Users/customer/Projekte/omadia-mainverify` (read-only; the shared main tree
was never disturbed — see AGENTS.md worktree discipline in §1.5). Fifteen
assumptions were verified independently against the actual code. The
package-path reality is settled first because every later reference depends on
it.

**Path reality.** The concept's `harness-*` packages are real and live under
`middleware/packages/harness-*` (npm workspaces). The concept is internally
inconsistent about this: its **Critical files** section already uses the correct
`middleware/packages/harness-channel-sdk/src/…` prefix, while its **SDK changes**
table uses the bare `harness-channel-sdk/src/…` form. Both point at the same
files; the plan uses the full prefix throughout. All concept-referenced packages
exist (`harness-channel-sdk`, `harness-orchestrator`, `harness-memory`,
`harness-knowledge-graph-{inmemory,neon}`, `harness-verifier`,
`harness-plugin-privacy-guard`, `harness-embeddings`, `plugin-api`), plus newer
ones the concept predates (`harness-plugin-office`, `harness-plugin-web-search`,
`harness-plugin-quality-guard`, `harness-orchestrator-extras`,
`harness-ui-helpers`, `harness-diagrams`) and a plugin-store/registry MVP
(PRs #162/#163) with a top-level `specs/` directory.

### 1.2 Verification results

Legend — **holds**: true as written · **additive-confirmed**: the concept's
proposed extension still lands purely additively · **shifted-minor**: true but a
name/path/detail moved · **shifted-major**: semantics differ from the concept's
assumption · **new-surface-exists**: main already shipped something the concept
proposes or overlaps.

| # | Assumption | Verdict | What shifted | Plan / PR impact |
|---|---|---|---|---|
| P1 | Plugin kinds = `agent`/`integration`/`channel`/`tool`/`extension` | **holds** | Single source of truth `middleware/src/api/admin-v1.ts:114-125`; registry MVP reused it | Five-kind set is safe verbatim. See §1.3 on the stale `extension` doc-comment (resolved). |
| P2 | Capabilities incl. `embeddings@1` | **shifted-minor** | Real name is `embeddingClient@1` (`harness-embeddings/manifest.yaml:103`). `embeddings@1` exists only as a test fixture | Concept never actually requires embeddings; if Omadia UI ever does, use `embeddingClient@1`. Treat conditionally-published caps as legitimately `undefined`. |
| P3 | `IncomingTurn` extendable with `tenantId?`/`target?`/`viewState?` | **additive-confirmed** | Defined once, `harness-channel-sdk/src/incoming.ts:6-20`; nothing collides | Additive, edits land only in `incoming.ts`. `TargetRef` must be introduced first (own slice) before `target?` compiles. |
| P4 | `SemanticAnswer` + `surface?`; "interactive max 1"; 4 `OutgoingInteractive` variants | **additive-confirmed** | All correct. The max-1 cap is type-shape only (single optional field), **no runtime guard**. `OutgoingTopicAsk` is declared+exported but has **no producer** | `surface?` lands as the 10th optional field (`outgoing.ts:25-90`); the package's stated stability contract blesses additive optionals. |
| P5 | `ChatStreamEvent` extendable with `surface_*` + `RevisionId` | **additive-confirmed** | 15 arms today, none `surface_*`; **no existing `revision`/`RevisionId` field to migrate** (`chatAgent.ts:411-541`) | Pure-additive. Drop any "migrate existing revision refs" step — `RevisionId` is greenfield. Budget exhaustiveness-switch updates in consumers (`orchestrator.ts`). |
| P6 | Sentinels = `_pendingUserChoice`/`_pendingSlotCard`/`_pendingRoutineList` | **shifted-minor** | Only **two** JSON wire sentinels: `_pendingUserChoice`, `_pendingRoutineList`. `_pendingSlotCard` is a kernel tool-instance buffer (`findFreeSlotsTool.takePendingCard`/`drainPendingSlotCard`), **not** a wire sentinel | Plugins have no kernel tool to buffer on, so the three new keys **must** use the JSON-sentinel pattern; anchor on `parseToolEmittedChoice`/`RoutineList` (`orchestrator.ts:640-755`, `1176-1239`). All three proposed keys are free. |
| P7 | Single boot dispatcher; add `dispatchService?` | **new-surface-exists** | Single-dispatcher baseline holds, but line refs stale (`~2342-2370`, not `1700-1716`); #165 made the dispatcher real (was a stub); **main already shipped per-channel routing** — `OrchestratorRegistry` + `ChannelResolver` (`channelResolver@1`, DB-gated) | `dispatchService?` can still land additively, but it is now an **architecture decision** (§3, PR-6), not a mechanical add. `createCoreApi` is called once globally → resolve per-turn, do not swap a boot constant. |
| P8 | Channel-manifest `capabilities` enum; add `canvas` | **additive-confirmed** | Enum is exactly six members (`admin-v1.ts:129-135`) | Two-line edit across **two** files that must stay in sync: union `admin-v1.ts:135` + `CHANNEL_CAPABILITIES` set `manifestLoader.ts:436-443`. Unknown values are silently dropped — miss either site and it fails quietly. |
| P9 | `ctx.services` provide/get/replace **with version-stripping** | **shifted-major** | provide/get/has/replace are all real, but there is **no version-stripping** — exact-string `Map` keys (`serviceRegistry.ts:45,92`). `get('chatAgent')` resolves `'chatAgent@1'` only because both sides use the bare key by convention | Register/resolve under **bare** keys (`'canvasChatAgent'`, never `'canvasChatAgent@1'`). `@N` lives only in `manifest.yaml`. `replace('chatAgent',…)` swaps **globally** for all consumers — use a separate bare key, do not `replace` the shared one. Re-`provide` of the same key **throws**. Concept feed-back. |
| P10 | `memoryStore@1`, filesystem-backed, no CAS, external mutex needed | **holds** | All four sub-claims intact; `sessionLogger.ts:85-89` is a live unguarded read-modify-write race that proves the platform has not solved this | Code against verbatim. Any shared-state writes (`canvasOwnership`, `treeRevision`) must self-serialise; multi-instance CAS is net-new work, as the concept already says. |
| P11 | Tool output `Promise<string>` + sentinel; add `structured?` + `writeCapabilities` | **new-surface-exists** | Main already shipped a structured **sub-agent** result union — `LocalSubAgentToolResult = {output, postcondition?}` (#130/#157). Native handler is still `Promise<string>`-only (the native extension `469ccd4` was dropped in the single-repo migration). `writeCapabilities` = zero hits | Align `structured?` with the existing `LocalSubAgentToolResult` shape rather than forking a parallel envelope. Native tools keep the `_pendingX` string idiom. `writeCapabilities` is genuinely new on `NativeToolSpec`. Concept feed-back. |
| P12 | `lint`/`typecheck`/`test` exist and gate PRs | **holds** | Confirmed, richer: `node:test` via `tsx` (not vitest/jest); `npm run build` runs **before** the checks in CI; lint/typecheck use **hard-coded package lists**; Node pinned `22.x` | Pre-flight from `middleware/`: `npm ci --include=optional` → `npm run build` → `lint` → `typecheck` → `test`. A new package/dir must be appended to the lint glob **and** the typecheck `-w` chain or it escapes the gate. |
| P13 | Conventional Commits + PR style | **holds** | `(#NNN)` is auto-appended by squash-merge (30/30); PR body `## What` / `## Test plan` / `## Intentionally unchanged` | `type(scope): subject`, lowercase imperative; scopes `(channels)`, `(orchestrator)`, etc. Do **not** hand-append `(#NNN)`. Verify commit-author email per `references/github_auth.md`. |
| P14 | `AGENTS.md` governs process | **holds** | Real and hook-enforced: docs-in-the-same-PR mandatory; mandatory entry reading order; worktree-only; four Required checks | Hard constraints on every SDK PR (§1.5). **Critical conflict resolved there**: AGENTS.md forbids `Co-Authored-By` AI trailers in omadia core. |
| P15 | `crossChannelConversationMemory@1` is a hard requireable dep | **shifted-minor** | PR #100 is **merged** (2026-05-18) but **docs-only** — `docs/cross-channel-memory.md`, `Status: Proposed`, **zero code**, no provider plugins. The in-code `PlatformIdentity` is the pre-existing v1 passthrough, not the RFC capability | **Not a hard blocker.** Do not hard-`require` it (boot capability-resolution would fail). Omit from `requires`; late-resolve via `ctx.services.get` + InMemory fallback; cross-channel continuity is deferred/behind-flag. See §5. |

### 1.3 Where a verification caveat was itself wrong — the `extension` kind

The P1 check surfaced a doc-comment in `admin-v1.ts:123-124`: *"`extension` …
Reserved for Phase 4 (Verifier + KG). No runtime support yet."* Taken
literally, that would block the concept outright, because the Tier-2
`omadia-ui-orchestrator` is `kind: extension`. Cross-checking against actual
manifests refutes the doc-comment: `harness-orchestrator`, `harness-memory`,
`harness-verifier`, `harness-knowledge-graph-inmemory`, `harness-embeddings`,
and `harness-orchestrator-extras` are **all** `kind: extension` and all run in
production — and `harness-orchestrator` (kind `extension`) is exactly the plugin
that **provides `chatAgent@1`**. The concept's `omadia-ui-orchestrator`
(`kind: extension`, provides `canvasChatAgent@1`) is therefore a direct,
proven mirror of `harness-orchestrator`, not unsupported surface. The stale
doc-comment is a minor omadia-core hygiene nit, recorded in §1.4, not a blocker.

### 1.4 Concept feed-back items (to feed back to `CONCEPT.md`, not silently patched here)

These are places the concept is wrong or stale against `83ef79b`. They do **not**
change the architecture; they change wording. They are listed so a later
concept revision can close them.

1. **Service-registry version-stripping (P9).** §"Service Naming Convention"
   claims *"Boot wiring strips the `@N` suffix when populating the runtime
   service map"* and cites `pluginContext.ts:213-216`/`plugin.ts:114`. There is
   no stripping; the registry is an exact-string `Map`. The `@N` lives only in
   `manifest.yaml` provides/requires (boot-ordering/activation), a separate
   subsystem. Runtime keys are bare **by convention**. This is the single most
   important correction, because the canvas plan publishes `canvasChatAgent@1`
   (manifest) / `'canvasChatAgent'` (runtime key). It also means the concept's
   *"Same convention applies to `channel.dispatchService`"* must be read as
   "`dispatchService` carries the **bare** key" — there is no boot step that
   would strip an `@N` from it (§3 PR-6, PR-10).
2. **Sentinel baseline (P6).** §"Tier 3" lists `_pendingSlotCard` among the
   JSON sentinels. It is a kernel tool-buffer (`PendingSlotCard` /
   `takePendingCard`), not a wire sentinel. The real JSON sentinel set is two:
   `_pendingUserChoice`, `_pendingRoutineList`.
3. **Dispatcher landscape (P7).** §"Channel ↔ Tier-2 Routing" assumes
   per-channel orchestrator selection does not exist. Main shipped
   `OrchestratorRegistry` + `ChannelResolver` (`channelResolver@1`). The cited
   boot line `index.ts:1700-1716` is stale (`~2342-2370`).
4. **Structured tool output (P11).** §"Tier 3" frames `structured?` as
   greenfield. A structured sub-agent result union (`LocalSubAgentToolResult`)
   already exists; the concept should align rather than invent.
5. **CCM hard-require (P15).** The Tier-2 manifest sketch has
   `requires: ["…","crossChannelConversationMemory@1"]`. No provider exists;
   hard-requiring it holds the plugin back from activation. Must be **omitted
   from `requires` and late-resolved** via `ctx.services.get` with an in-memory
   fallback — there is no "soft requires" mechanism in the manifest.
6. **`embeddings@1` (P2).** Not referenced in the concept's manifests, but the
   correct name is `embeddingClient@1` should it ever appear.
6b. **`writeCapabilities` is not a `NativeToolSpec` field (found building #170).**
   The concept's SDK-changes table puts `writeCapabilities` on `NativeToolSpec`,
   but the whole spec is sent verbatim into the Anthropic tools list
   (`buildToolsList` → `tools.push(entry.spec)`) and Anthropic rejects unknown
   fields — the same reason `piiFields` lives on the `LocalSubAgentTool` wrapper,
   not its spec. `writeCapabilities` must attach to a non-model-facing carrier
   (manifest annotation / registration metadata), wired in PR-9.
6c. **The WebSocket transport is missing from the SDK-changes list (found
   building #173).** The concept's Tier-1 channel "hosts the WebSocket endpoint
   the Host App connects to", but the `CoreApi` handed to a channel plugin
   exposes only `handleTurnStream` + Express `registerRoute` / `registerRouter`
   — **no WebSocket / `upgrade` registration**. A channel cannot host a
   WebSocket today. The concept's "SDK changes" table and "Critical files" both
   omit the CoreApi extension that makes the canvas WebSocket possible. It is a
   first-class additive SDK change — see the new **PR-11** in §3 and its design
   in §3.2. Until it lands, `omadia-ui-channel` can only advertise itself over
   an HTTP discovery route (#173).
7. **Internal inconsistencies, cheap to close:** `TargetRef` is "ten variants"
   in the body but "eight variants" in the SDK-changes table (line ~1116);
   `README.md` / `tech-stack.md` still cite concept "v0.7" while the document is
   v0.15; the stale `extension` doc-comment in omadia core (§1.3); the
   bare-vs-prefixed package paths in the SDK-changes table.

### 1.5 Process constraints discovered (binding on every omadia-core PR)

`AGENTS.md` in omadia core is real and hook-enforced (`.hooks/pre-commit`,
`.hooks/pre-push`, server-side branch protection). The plan inherits these as
hard gates, not preferences:

- **Docs-in-the-same-PR.** A PR adding a tool/route/sub-agent must update
  `docs/middleware-agent-handoff.md` §3/§8 in the *same* PR; a new ENV/secret
  must touch `middleware/.env.example` + handoff §10; a SQL migration needs a
  CHANGELOG entry. "Done" is not done until docs land.
- **One logical change per PR**, `<70`-char conventional title, body explains
  the *why*. No "while I'm at it" stacking.
- **Worktree-only**, feature-branch → PR. Never commit to the main clone or push
  to `main`.
- **Four Required status checks** must be green before merge: `middleware`,
  `web-ui`, `schema`, `audit`.
- **No `Co-Authored-By` AI trailers** (`AGENTS.md:86`) — explicitly forbidden,
  including in templates. This **overrides** the host's global instruction to
  append a Claude trailer **for omadia-core commits**. (This `omadia-ui` repo
  has no such rule; its concept history already carries trailers, so the plan
  document itself may keep one — but the SDK PRs must not.)
- **Commit author** for `byte5ai/*`: `Christian Wendler <cwendler@byte5.de>`
  (`references/github_auth.md`). Recent core commits show `mwege@byte5.de` — a
  different human, not a licence to drift; verify per the reference before each
  first commit in a new tree.

---

## 2. Phases

Seven phases. Phases 1 (client spike) and 2 (server SDK PRs) are **parallel**
work-streams — the spike runs against a stub server, the SDK PRs are additive
omadia-core changes; neither blocks the other. They converge at Phase 4 (alpha).
Durations are bands for a small team (1–2 engineers per stream), not commitments.

### Phase 0 — Groundwork & protocol skeleton

- **Goal.** Make both streams startable: pin the wire contract and the repo
  shape, stand up CI for `omadia-ui`.
- **Deliverables.**
  - `docs/protocol/1.0.md` first draft: the boot handshake, the `surface_*`
    event envelope, the 24 primitives + traits, the local-ops catalog baseline,
    the sentinel envelope — drafted from the concept, marked "spike-mutable".
  - JSON Schemas for the primitive whitelist + surface-event envelope (the
    Tier-1 validator's source of truth) — enough for Walkthrough 1's primitives.
  - Repo-shape decision recorded: sibling `byte5ai/omadia-ui` importing
    `@omadia/channel-sdk` as a versioned dep (default) vs. eventual
    `middleware/packages/omadia-ui-host-app/` workspace package — per
    `tech-stack.md` §"Repo-shape implication".
  - `omadia-ui` CI scaffold (lint/typecheck/test + Electron build matrix), since
    the repo has none today.
- **Dependencies.** None (concept is signed off).
- **Falsification.** If the 24 primitives cannot be expressed as a closed JSON
  Schema without `additionalProperties` escape hatches, the "whitelist parser,
  no eval" security claim (Security Surface) is weaker than assumed → revisit
  before the spike hardens the validator.
- **Duration.** ~1–2 weeks.

### Phase 1 — Spike (client stream): Electron empirical gate

- **Goal.** Prove the riskiest concept claim — editor-class Class-A latency in
  Electron — before committing the chassis. This is `tech-stack.md` Spike
  Milestones 1 + 2, run against a **stub** server.
- **Deliverables.**
  - **M1:** Electron shell (single `BrowserWindow`, fullscreen/windowed toggle,
    ⌘1/⌘2/⌘3 hotkeys), WebSocket handshake against a stub that replays a
    pre-recorded Walkthrough 1 sequence, schema validator, render of WT1's
    primitive subset, `surface_snapshot` + `surface_patch` with `treeRevision`
    discipline.
  - **M2:** `canvas-region` (RGBA8; RGBA16 stretch) up to 4K; off-main-thread
    brush (OffscreenCanvas + Worker); `brush` / `blur`(+`preview-blur`) /
    `select-magic-wand` local ops; `media` audio playback + scrub; WebCodecs
    1080p frame-precise scrub with a documented fallback; DataRef SHA-256
    off-thread.
  - **Tree-validity probe (M1):** run the configured fast model
    (`ui_orchestrator_model` default `claude-haiku-4-5`) over a fixed corpus of
    ≥50 composition prompts spanning the WT1–WT5 idioms; record the
    first-attempt JSON-Schema-valid rate against the Phase-0 validator (one
    bounded auto-repair retry permitted). **Gate: <95% first-attempt valid →
    fail → pin `ui_orchestrator_model` to Sonnet and re-measure.** This is the
    early, real-model read on concept Risk #1 (not deferred to alpha); see §8.
  - `docs/spike-report.md` with the measurements `tech-stack.md` enumerates
    (brush p95 frame time, magic-wand wall-clock on 4K, hashing wall-clock,
    bundle size, cold start, memory baseline), the tree-validity rate, and a
    **go/no-go on Electron**.
- **Dependencies.** Phase 0 (protocol draft + schemas).
- **Falsification (the hard gate).** Brush-stroke p95 frame time on macOS does
  not clear `<16ms`, **or** magic-wand on a 4K image does not complete
  sub-second. Either fails Electron for editor-class work → the report carries
  the falsifying evidence and the alternative (native Node-addon / WebGPU path,
  or rescope the editor catalog, or Tauri with a hard per-OS-validation
  commitment). See §4 and §8.
- **Duration.** ~2 weeks (the `tech-stack.md` band).

### Phase 2 — omadia-core SDK extension PRs (server stream)

- **Goal.** Land the additive SDK surface the Tier-2/Tier-1 plugins consume,
  as a reviewable PR series against `byte5ai/omadia` main (full sequence in §3).
- **Deliverables.** PRs 1–8 of §3 merged: `canvas` capability; `TargetRef`;
  `IncomingTurn` additive fields; `surface_*` family + `RevisionId`;
  `SemanticAnswer.surface` + `ChatTurnResult.surface`; `dispatchService` + boot
  wiring; sentinel extractors + origin metadata; `structured?`/`writeCapabilities`.
  Each with co-committed docs and green Required checks.
- **Dependencies.** Concept sign-off only. Independent of the spike outcome —
  these are additive even if the client stack later changes. **Reality check:**
  reconcile each PR against what main already shipped (P7 routing, P11 structured
  result) — see §3.
- **Falsification.** A "smoke test per existing channel proves clean ignore"
  (concept §"What classic channels see") fails — i.e. an additive change is not
  actually inert for Teams/Slack/Telegram → the change is not as additive as
  claimed; stop and re-scope that PR.
- **Duration.** ~3–5 weeks (review latency dominates; one-logical-change-per-PR
  serialises some of it).

### Phase 3 — Tier-2 orchestrator + Tier-1 channel plugins

- **Goal.** Stand up the two new omadia-core plugins so a real turn can flow
  client → channel → orchestrator → content agents → surface stream.
- **Deliverables.**
  - `middleware/packages/omadia-ui-orchestrator/` (`kind: extension`, manifest
    `provides: ["canvasChatAgent@1"]`; publishes at runtime under the **bare**
    key `'canvasChatAgent'`): UI Skill (composition-idiom library),
    per-`canvasSessionId` mutex, canvas cache, action routing, the Haiku-class
    composition call. **CCM is _not_ in the manifest `requires`** — a hard
    `requires` of an unprovided capability holds the plugin back from activation
    (`capabilityResolver.ts:104-132`; the kernel "boot fails … naming the missing
    provider", `plugin-api/src/pluginContext.ts:223-226`). Instead the
    orchestrator late-resolves the bare key
    `ctx.services.get('crossChannelConversationMemory')` per turn and falls back
    to in-memory conversation behaviour when it returns `undefined` (P15).
  - `middleware/packages/omadia-ui-channel/` (`kind: channel`,
    `capabilities: [text, canvas]`, `dispatch_service: canvasChatAgent` — the
    **bare** runtime service key, not `@1`, because the registry does not strip
    versions, P9; the manifest key is snake_case to match `verify_signature`): WebSocket endpoint, auth reuse, `IncomingTurn` forming,
    stream fan-out.
  - PRs 9–10 of §3 merged.
- **Dependencies.** Phase 2 (the SDK surface the plugins import).
- **Falsification.** The orchestrator cannot publish `canvasChatAgent` and have
  the canvas channel resolve it without `replace`-ing the shared `chatAgent`
  registration (P9 cross-channel-bleed risk) → the dispatch design in PR-6 (boot
  resolution) / PR-9 (service publish) is wrong and must be reworked before
  alpha. **Second falsifier:** the orchestrator fails to activate when no CCM
  provider is registered → the late-resolve-with-fallback design is wrong, not
  optional (this is the explicit boot test in PR-9).
- **Duration.** ~3–4 weeks.

### Phase 4 — Alpha: Walkthrough 1 end-to-end

- **Goal.** The data-aggregation lane works against real Tier-2/Tier-3, not a
  stub. First time the spike client chassis and the server plugins meet.
- **Deliverables.** Walkthrough 1 reproduced end-to-end with live Jira/ERP/HR
  sub-agents: skeleton within ~500ms, sentinel-origin gating, referential
  continuity ("of them"), patch composition preserving highlight+expansion,
  Class-A scroll/hover never round-trips. All four WT1 risk-points pass.
- **Dependencies.** Phase 1 go-decision (chassis) **and** Phase 3 (plugins).
- **Falsification.** Skeleton latency cannot hit ~500ms with a real Haiku-class
  Tier-2 composing a tree (concept Riskiest Assumption #1) → either
  `ui_orchestrator_model` moves to Sonnet (cost/latency trade) or the
  skeleton-first contract needs rethinking. Falsifies the "fast LLM emits valid
  primitive trees" assumption empirically.
- **Duration.** ~3–4 weeks.

### Phase 5 — Beta: Walkthroughs 2 + 4

- **Goal.** Prove the editor lane and real concurrency — the two hardest
  interaction surfaces.
- **Deliverables.**
  - **WT2 (editor):** Class-A brush, Class-B Tier-2-routed crop/blur/magic-wand
    with the durable-then-patch contract, Class-D AI lamp-post removal, canvas
    stays responsive during Tier-3 work, DataRef buffer integrity across durable
    ops.
  - **WT4 (concurrency):** three parallel Tier-3 sub-agents streaming into a
    second pane under the per-session mutex, mid-flight plan modification,
    `treeRevision` monotonicity (+1 per emit) under interleaved returns,
    selection survives unrelated patches, no Tier-3 re-call when cached.
  - Class-D mutation pipeline (`_pendingMutation` → `surface_mutation_resolved`)
    with optimistic UI and the five resolution statuses.
- **Dependencies.** Phase 4 (alpha chassis + plugins).
- **Falsification.** The Tier-1 render loop and the WebSocket handler share a
  queue, so pan/zoom stalls while a Tier-3 op runs (WT2 step 20) → the Class-A/
  Class-D async boundary (concept §"Async Architecture") is not real; re-architect
  the client event loop. Or: `treeRevision` is not strictly +1 under concurrent
  async returns → lost-update bug in the mutex discipline.
- **Duration.** ~4–6 weeks.

### Phase 6 — v1.0 GA: Walkthroughs 3 + 5 + hardening + distribution

- **Goal.** Close the remaining walkthroughs, harden the security surface, ship
  a signed, auto-updating binary.
- **Deliverables.**
  - **WT3 (wizard):** persistent form state across turns, conditional branching,
    wizard composition idiom, **external-effect confirmation modal** gate.
  - **WT5 (multi-canvas):** Spaces-style switching, per-canvas `contextKey` +
    prefs, persistence across restarts, per-session mutex independence, no
    global "current canvas" on Tier-2.
  - Security hardening: HMAC `dataRef` signing + 24h secret rotation with
    graceful overlap; action-payload whitelist; full `viewState` budget rules
    (64 KB / 100-ID caps, truncation envelope) — tuned with spike telemetry.
  - Distribution pipeline (§7): `electron-builder` + `electron-updater`,
    notarized with high5 Apple Dev assets, CI release workflow.
- **Dependencies.** Phase 5 (beta). Apple Dev high5 assets (available today, §5).
- **Falsification.** External-effect actions can fire without the confirmation
  gate (a fake `confirm-<actionType>` is accepted, or the modal is bypassable) →
  the Security Surface contract is broken; no GA. Or: notarization fails the
  signed binary on a clean Mac (Gatekeeper) → distribution gate fails (§7).
- **Duration.** ~5–7 weeks.

---

## 3. PR sequence against `byte5ai/omadia` main

The concept's §"Verification" already sketches a 9-step PR plan. The sequence
below is the same intent, **re-ordered for dependency + review tractability and
corrected against `83ef79b`** (real paths, the P7 routing reality, the P9
registry semantics, the P11 existing structured result). Each PR is one logical
change with co-committed docs (§1.5), a `<70`-char conventional title, and the
four Required checks green. The canvas-protocol document is **not** in this
series — it lives in `byte5ai/omadia-ui` (§4/§9).

Conventions used below — **Risk**: L/M/H likelihood of review friction or
rework. **Reviewer ask**: the objection to pre-empt in the PR body.

**Landed so far** (against `byte5ai/omadia`, all four Required checks green): the
additive interface foundation **PR-1..PR-5 shipped together as one cohesive
types-only PR — [#167]** (`feat(channel-sdk): additive Omadia UI canvas interface
surface`); **PR-6 — [#168]** (`feat(channels): per-channel dispatch_service
routing`); **PR-7a — [#169]** (`feat(orchestrator): canvas sentinel parsers +
canvas-output gate` — the pure parsers + deny-by-default gate, **not yet wired**;
see PR-7 row); **PR-8 — [#170]** (`feat(plugin-api): structured? output +
writeCapabilities contract` — the typed `structured?` envelope + the
`WriteCapability` contract + `deriveMutabilityCapabilities`; `writeCapabilities`
is **not** on `NativeToolSpec`, see §1.4 feed-back). **#167–#170 are merged to
`main`** (the additive SDK foundation). **PR-9a — [#171]** (`feat(ui-orchestrator):
skeleton plugin publishing canvasChatAgent@1` — the Tier-2 plugin as a delegating
skeleton; auto-discovered; composition deferred). Remaining: PR-9b+ (the real
Tier-2 build — UI Skill, surface_* synthesis, mutex, cache, + PR-7b/writeCaps/
structured wiring; gated on the Phase-1 spike), PR-10 (omadia-ui-channel).

| # | Title (conventional) | Scope (files + tests) | Depends on | Risk | Expected reviewer ask |
|---|---|---|---|---|---|
| PR-1 | `feat(channels): add 'canvas' channel-manifest capability` | `admin-v1.ts:135` (union) **and** `manifestLoader.ts:436-443` (`CHANNEL_CAPABILITIES` set) — both, or it type-checks then silently drops; `manifestLoader` test asserting `canvas` survives load | — | **L** | "Did you update both the type and the runtime Set?" — call out the silent-drop in the body. |
| PR-2 | `feat(plugin-api): add TargetRef discriminated union` | new shared type in `middleware/packages/plugin-api/src/` (ten variants per concept body — fix the concept's "eight"); unit tests for `kind`-switch resolution + unknown-`kind` rejection | — | **L** | "Why in `plugin-api` not `channel-sdk`?" — because beam/mutation/local-op/suggested-action all consume it. |
| PR-3 | `feat(channel-sdk): IncomingTurn additive fields tenantId/target/viewState` | `harness-channel-sdk/src/incoming.ts:6-20` (+ `index.ts` already re-exports); type tests proving classic-channel turns still compile with all three absent | PR-2 (`target?: TargetRef`) | **L** | "Promote to typed fields vs. carry in existing `metadata?`?" — document the choice (typed, for validator narrowing). |
| PR-4 | `feat(channel-sdk): RevisionId opaque type + surface_* event family` | `harness-channel-sdk/src/chatAgent.ts:411-541` — add `surface_snapshot/patch/data_ref_created/data_ref_invalidated/action_result/local_action/error` + `surface_mutation_resolved`; new `RevisionId` branded type (greenfield — no migration); update every exhaustive `switch` consumer (`orchestrator.ts`) | PR-2 | **M** | "Exhaustiveness — does every consumer handle the new arms or default-ignore?" Show the `default` ignore proves clean for classic channels. |
| PR-5 | `feat(channel-sdk): SemanticAnswer.surface + ChatTurnResult.surface` | `outgoing.ts:25-90` (10th optional field + `OutgoingSurface` type), `chatAgent.ts:250-326` (`ChatTurnResult.surface`), `toSemanticAnswer.ts` producer branch | PR-4 | **L** | "Does `surface` collide with the 'interactive max 1' rule?" — no; it's an independent sidecar (like `privacyReceipt`), not an `OutgoingInteractive`. |
| PR-6 ✅ **landed (#168)** | `feat(channels): per-channel dispatch_service routing (Omadia UI)` | `admin-v1.ts` + `manifestLoader.ts` (additive `channel.dispatch_service?` + `canvas_protocol_version?`, snake_case to match `verify_signature`), boot wiring `middleware/src/index.ts` (`createOrchestratorDispatcher` resolves the service **per turn keyed by `turn.channelId`** from `pluginCatalog`, default `'chatAgent'`); `coreApi.ts` threads `channelId`. **`dispatch_service` holds the bare runtime key (`canvasChatAgent`), not `@1`** (P9 — registry does not strip). Tests: dispatch routes turn → second registered bare service; classic channel still routes to `chatAgent` | PR-1 | **H** | **The architecture question (P7):** "Why a new `dispatch_service` string instead of reusing the shipped `OrchestratorRegistry`/`channelResolver@1`?" Pre-empt in the body — see §3.1. |
| PR-7 **(split)** | `feat(orchestrator): canvas-output capability + origin-gated canvas sentinel extractors` | **Split during build.** **PR-7a landed [#169]**: the pure parsers `parseToolEmitted{StructuredPayload,CanvasTree,Mutation}` + the deny-by-default `canvas-output` gate (`isCanvasOutputAuthorized`) as a self-contained `canvasSentinels.ts` module — no tool-loop wiring, zero behaviour change. **PR-7b deferred into PR-9**: wiring the gated extractors into the tool loop needs the boot-computed allow-set of `canvas-output` tools threaded into the orchestrator (cross-layer), which only has a consumer once the canvas tools exist (PR-9). Original full scope below. — **define the `canvas-output` tool capability** (the gate's vocabulary — `admin-v1.ts` permissions block + manifest validation; concept SDK-change "Document canvas-output tool capability"), since no earlier PR introduces it; then `orchestrator.ts:640-755` (new `parseToolEmitted{CanvasTree,StructuredPayload,Mutation}` mirroring the existing parsers) + `1176-1239` (per-turn `extractToolEmitted*` scans) + origin-metadata `{toolName,pluginId,declaredCapabilities}` carry-through (`~903-919`); reject sentinels whose origin lacks `canvas-output`. Tests: malformed-JSON tolerance; **positive** (declared origin accepted) **and negative** (undeclared origin rejected) origin-gating; existing `_pendingUserChoice`/`RoutineList` unchanged | PR-4 | **M** | "Does origin-gating change existing `_pendingUserChoice`/`RoutineList` behaviour?" — no; existing keys untouched. |
| PR-8 | `feat(plugin-api): structured? envelope + writeCapabilities tool annotation` | extend `LocalSubAgentToolResult` (`localSubAgentTool.ts:32-41`) with optional `structured?` (do **not** fork a parallel envelope); `writeCapabilities` optional field on `NativeToolSpec` (`pluginContext.ts:347-365`); loader + system-prompt emission; doc in handoff §8. Tests: `structured?` round-trips through `localSubAgent.ts` downcast; `writeCapabilities` parses from manifest and the P-Class-D derivation table (update→`editable`, create→`canAddItems`, …) produces the expected per-field flags; absent annotation ⇒ read-only | — | **M** | "Native tools too?" — explicitly scope native-tool `structured?` **out** (handler is `Promise<string>`-only; the earlier native extension was dropped in migration); native tools keep `_pendingX`. |
| PR-9 | `feat(orchestrator): omadia-ui-orchestrator extension plugin` | new `middleware/packages/omadia-ui-orchestrator/`; manifest `kind: extension`, `provides: ["canvasChatAgent@1"]`; **CCM omitted from `requires`** (late-resolved bare `ctx.services.get('crossChannelConversationMemory')` + in-memory fallback, P15); publish under **bare** key `'canvasChatAgent'` via a shared exported constant (mirror `CHAT_AGENT_SERVICE`); append package to lint glob + typecheck `-w` chain (P12). Tests: **plugin activates with no CCM provider registered** (boot test); `canvasChatAgent` resolves via bare `ctx.services.get` and `chatAgent` is left untouched (no `replace`) | PR-2, PR-4, PR-7, PR-8 | **M** | "Why not `replace('chatAgent')`?" — global swap / cross-channel bleed (P9); a separate bare key is correct. |
| PR-10a ✅ **landed (#173)** | `feat(ui-channel): skeleton channel plugin (canvas surface)` | new `@omadia/ui-channel` (kind: channel, `capabilities: [text, canvas]`, `dispatch_service: canvasChatAgent`); auto-discovered; `activate` registers a `GET /omadia-ui/info` discovery route. The **WebSocket** part of PR-10 is blocked on **PR-11** (see §6c / §3.2) and the Electron client — so it split out as the skeleton | PR-1, PR-6, PR-9a | **M** | landed; 0 Codex findings |
| **PR-11** (new — found building #173) | `feat(channel-sdk): WebSocket transport for channel plugins` | the CoreApi WS extension the concept omitted (§6c). channel-sdk: new `ChannelSocket` + `ChannelSocketHandler` + `CoreApi.registerWebSocket?` (additive, decoupled from `ws`). kernel: new `WebSocketRegistry` (mirrors `ExpressRouteRegistry` — per-channel scope + active-flag) hooking `server.on('upgrade')` at `index.ts:2592`; `createCoreApi` gains `webSockets`; `ws` dep added. Design in §3.2. **Built as PR #205 (CI green, unmerged).** Tests: upgrade routing by path, per-channel active-flag reject, deactivate closes sockets, no-WS-config is inert, auth-before-upgrade (401/403) | PR-3 (`IncomingTurn`) | **H** | "Does hooking `upgrade` conflict with anything? Where does session auth run — before or in the handler?" — resolved: no existing upgrade hook (single-owner); auth runs **pre-upgrade in the registry** — `verifySession` + the Entra `EmailWhitelist`, `401`/`403` before the `101` (mirrors `requireAuth`, **not** `resolveIdentity`). |
| PR-10b | `feat(ui-channel): canvas WebSocket transport` | the real channel over PR-11's `registerWebSocket`: handshake (`offer`→`select`→`ack`), `IncomingTurn` forming (incl. `tenantId`/`target`/`viewState`), `surface_*` 1:1 fan-out, session auth on upgrade. Tests: handshake state machine (incl. version-mismatch downgrade-then-close); a turn routes to `canvasChatAgent`; one existing channel byte-for-byte unaffected | PR-11, PR-10a, PR-9a | **M** | "Does it touch any existing channel?" — `## Intentionally unchanged`. |

Notes that cut across the series:

- **Two-file-sync edits fail quietly** (P8/P1): PR-1 and any future kind change
  must edit both the type and the runtime allow-list; the PR body must say so.
- **New packages escape the gate** (P12): PR-9 and PR-10 each add a package and
  must extend the hard-coded lint glob and the typecheck `-w` chain, or CI is
  green while the new code is unchecked.
- **`build` before checks** (P12): contributors' local pre-flight must
  `npm run build` first or it won't reproduce green CI.

### 3.1 The dispatch decision (PR-6) — record it, don't bury it

P7 found that main already solved "select an alternate orchestrator per channel"
via `OrchestratorRegistry` + `ChannelResolver` (`channelResolver@1`), keyed by
`(channelType, channelKey)`, DB-gated on `DATABASE_URL`, with fallback/reject and
hot-reload. The concept's `dispatchService` field does not know this exists.
Two viable paths:

| Path | What it is | For | Against |
|---|---|---|---|
| **(a) static `dispatchService` string** (concept-aligned, recommended for v1) | A manifest field; the single global `orchestratorDispatcher` resolves the service name per turn keyed by `turn.channelId` | Lightweight, no DB dependency, matches the concept, inert for classic channels (default `'chatAgent'`) | A second, parallel selection mechanism that ignores the shipped registry |
| **(b) reuse `channelResolver@1`** | Register a `canvasChatAgent` Agent in `OrchestratorRegistry`, bind the canvas channel to it | Reuses shipped, operator-managed surface; no new field | Heavier; **DB-gated on `DATABASE_URL`** (won't resolve in a filesystem-only deployment); couples the canvas channel to the routing subsystem |

**Recommendation: (a) for v1**, because the concept's self-hostable target
(`tech-stack.md` Req 7) cannot assume `DATABASE_URL`, and the canvas channel
needs to work in a minimal deployment. PR-6's body should present (b) as the
considered alternative and state the DB-gating as the deciding factor, so the
reviewer who knows about `channelResolver@1` sees it was not missed. If the team
prefers (b), Phase 3 changes but the rest of the plan is unaffected.

### 3.2 WebSocket transport for channel plugins (PR-11) — the missing SDK piece

Building the channel skeleton (#173) surfaced a gap the concept's SDK-changes
list missed (§6c): the `CoreApi` a channel plugin receives exposes only
`handleTurnStream`, `registerRoute`, `registerRouter`, `resolveIdentity`, `log`
— **no way to host a WebSocket**. The canvas channel's whole transport is a
WebSocket, so this is a hard prerequisite for PR-10b. It is cleanly additive.

**Design — mirror the existing `registerRoute` machinery, one layer up.**

1. **SDK contract** (`harness-channel-sdk`, additive, no new dep): a minimal,
   `ws`-agnostic socket abstraction so the SDK never depends on the WebSocket
   implementation —
   ```ts
   interface ChannelSocket {
     send(data: string): void;             // canvas frames are text JSON
     onMessage(cb: (data: string) => void): void;
     onClose(cb: () => void): void;
     close(code?: number, reason?: string): void;
     readonly request: { url: string; headers: Record<string, string | string[] | undefined> };
   }
   type ChannelSocketHandler = (socket: ChannelSocket, session: ChannelSessionClaims) => void;
   ```
   The handler only ever receives an **already-authenticated** socket (see Auth);
   the verified `ChannelSessionClaims` (`subject` / `email` / `displayName` /
   `provider` / `omadiaUserId?`) are handed in, so the channel never re-derives
   identity.
   and one new optional method on `CoreApi`:
   ```ts
   registerWebSocket?(channelId: string, path: string, handler: ChannelSocketHandler): void;
   ```
   Optional (`?`) so existing channels and any non-WS `createCoreApi` wiring are
   untouched.

2. **Kernel `WebSocketRegistry`** (`middleware/src/channels/webSocketRegistry.ts`,
   mirrors `ExpressRouteRegistry`): per-channel path registrations + an
   `activeByChannel` flag. `attach(server)` hooks `server.on('upgrade')`; on an
   upgrade it matches `req.url`'s path → if registered **and** the channel is
   active → **authenticates the request first** — there is no `cookie-parser` in
   front of a raw `upgrade`, so the registry parses the `omadia_session` cookie by
   hand and runs the *same* gate `requireAuth` enforces:
   `verifySession(token, sessionSigningKey)` (signature + expiry) plus the Entra
   `EmailWhitelist` check (an OIDC `entra` session whose email is no longer
   whitelisted → `403`). On success it completes the handshake via a single
   `ws.Server` in `noServer` mode (`wss.handleUpgrade(...)`), wraps the raw socket
   in a `ChannelSocket`, and calls the channel's handler **with the verified
   `ChannelSessionClaims`**. Unmatched path → `404`; inactive channel → `503`;
   **failed auth → `401` (missing/invalid cookie) or `403` (de-whitelisted Entra
   email) written raw + `socket.destroy()` before any `101`** — no WebSocket is
   ever established for an unauthenticated or unauthorized peer. Deactivate flips
   the flag (new upgrades rejected) and closes that channel's live sockets — the
   same lifecycle `registerRoute` already has.

3. **Wiring** (`index.ts`): `const wsRegistry = new WebSocketRegistry({ signingKey:
   sessionSigningKey, whitelist: emailWhitelist })` — the *same* signing key and
   Entra whitelist `requireAuth` is built with (≈ `index.ts:777`), so the WS auth
   gate is byte-for-byte the HTTP one. Pass it to `createCoreApi({ …, webSockets:
   wsRegistry })` (≈ `index.ts:2505`, alongside `routeRegistry`@`2467`) and to the
   `DefaultChannelRegistry` (its lifecycle mirror of `routes`, so channel
   deactivate closes sockets too); then after
   `const server = app.listen(config.PORT, '::')` (`index.ts:2592`) call
   `wsRegistry.attach(server)`. `createCoreApi.registerWebSocket` delegates to it;
   when no `webSockets` is supplied the method is simply absent (channels
   feature-detect).

4. **Dependency:** add `ws` + `@types/ws` to the middleware kernel (NOT to the
   SDK — the SDK stays implementation-agnostic via `ChannelSocket`).

**Why this shape.** It reuses the proven per-channel active-flag lifecycle, keeps
the SDK free of a `ws` dependency (so the kernel could swap `ws` for another
implementation), and is inert for every existing channel and for any embedder
that builds a `CoreApi` without WS. The canvas frames are text JSON, so the
narrow `send(string)`/`onMessage(string)` surface is sufficient — no binary or
backpressure API needed in v1.

**Auth — before the upgrade, not after, and identical to `requireAuth`.** The
upgrade request carries the `omadia_session` cookie in `req.headers`. The WS auth
primitive is **not** `CoreApi.resolveIdentity` — that is channel-native user
mapping (a passthrough), not session auth. The registry instead mirrors
`requireAuth` exactly, **inside the `upgrade` handler, before `wss.handleUpgrade`**:
parse the cookie by hand (no `cookie-parser` runs on a raw upgrade),
`verifySession(token, sessionSigningKey)`, then the Entra `EmailWhitelist` gate
(`provider === 'entra' && !whitelist.isAllowed(email)` → `403`). A failed check
writes a raw `401`/`403` and `socket.destroy()`s the socket, so an unauthenticated
or de-whitelisted peer never completes the handshake (no `101` is ever sent). Only
accepted upgrades become `ChannelSocket`s, with the verified `ChannelSessionClaims`
passed to the handler. (Earlier drafts said "auth in the channel handler" and "core
`resolveIdentity`" — both wrong: post-`handleUpgrade` teardown allocates a live
socket for an unauthorized peer before dropping it, and `resolveIdentity` skips the
whitelist gate, so a de-whitelisted Entra user would keep WS access while HTTP
returns `403`. Caught in PR-11 build + Codex review.)

**Risks / falsification.** (a) A second `upgrade` consumer would conflict — none
exists today (grep: no `server.on('upgrade')`), so a single registry owns it;
falsifies if another subsystem later needs raw upgrades. (b) Dual-stack `::`
binding must still accept WS — `ws` attaches to the same `http.Server`, so this
holds; falsifies if a WS client cannot connect on the bound address. (c) The
`noServer`-mode handshake must not interfere with Express routing — Express
handles `request`, `ws` handles `upgrade`; disjoint events, no overlap.

---

## 4. Spike → Production transition

The spike (Phase 1) is the empirical gate, run against a **stub** server. The
question this section answers: what spike output becomes the v1 chassis, and
what is rewritten.

**Stays (becomes v1 chassis on a go-decision).** Per `tech-stack.md`
§"Reversibility", the four load-bearing client pieces are not stub-specific:

| Spike artifact | Fate at v1 |
|---|---|
| Primitive renderer (HTML/CSS + component framework) | **Stays.** Extends from WT1's subset to all 24 primitives. |
| Schema validator (types from `@omadia/channel-sdk` + JSON Schema) | **Stays.** Grows to the full whitelist; becomes the security-critical "no eval" boundary. |
| WebSocket client + handshake state machine | **Stays.** Stub endpoint swaps for the real `omadia-ui-channel`; the handshake grammar is identical. |
| Local-ops catalog (TS + WASM hot paths) | **Stays.** M2's three ops (`brush`/`blur`/`magic-wand`) extend to the v1.0 baseline catalog. |
| Off-thread DataRef SHA-256 | **Stays.** Becomes the DataRef-lifecycle hashing. |

**Rewritten / replaced for v1.**

| Spike artifact | Replaced by |
|---|---|
| Stub server replaying a pre-recorded WT1 sequence | Real Tier-2 `omadia-ui-orchestrator` over `omadia-ui-channel` (Phase 3). |
| Hard-coded WT1 primitive subset | Full 24-primitive renderer + composition idioms from the UI Skill. |
| Ad-hoc local op params | Catalog negotiated via `handshake_select.localOperations`; Tier-2 routing + Tier-3 fallback. |
| No security surface | HMAC `dataRef` signing, secret rotation, action whitelist (Phase 6). |

**When the spike binary becomes the chassis — and when it does not.** It becomes
the v1 chassis **iff** the Phase 1 go-decision is positive: brush p95 `<16ms` on
macOS **and** magic-wand sub-second on 4K (the `tech-stack.md` falsification
gates). On a **no-go**, the spike binary is *not* promoted; the spike report's
falsifying evidence drives the alternative (native Node-addon / WebGPU for the
hot path, editor-catalog rescope, or a Tauri move with a hard per-OS-validation
commitment), and Phase 4 waits on the rebuilt chassis. The renderer / validator /
WS-client / catalog code is portable across that decision (`tech-stack.md`
§"Reversibility" puts the shell rewrite at 4–8 weeks, mostly mechanical); the
irreducible cost of a stack change is the permanent `@omadia/channel-sdk`
type-bridge, which is exactly why Electron is the default.

---

## 5. Cross-stream dependencies & waitpoints

| Dependency | State at `83ef79b` | Blocks | Proceed with | Hard waitpoint |
|---|---|---|---|---|
| **CCM** (`crossChannelConversationMemory@1`, PR #100) | Merged but **docs-only RFC**, `Status: Proposed`, zero code, no provider plugins (P15) | The cross-channel-continuity feature only ("Telegram → Omadia UI seamless") | **Stub.** Tier-2 manifest **omits CCM from `requires`** (a hard requirement of an unprovided capability blocks activation, `capabilityResolver.ts:104-132`); the orchestrator late-resolves the bare `ctx.services.get('crossChannelConversationMemory')` per turn and wires the RFC's `DurableConversationHistoryStore` → `InMemoryConversationHistoryStore` fallback when it is absent | The omadia-core CCM provider PR-sequence (platformIdentity provider → CCM provider → SDK adapter → per-channel opt-ins) must land before the continuity feature ships. **Not on the v1 critical path.** |
| **Apple Dev — high5** | Active, fully documented in `references/apple_dev.md` (Developer ID cert, `.p12`, ASC API key, Team ID — identifiers kept in the reference, not here) | Nothing — signing is available now | **high5 signing through GA.** Spike binary, alpha/beta dogfood builds, and the GA release all sign+notarize with high5 | None. high5 carries the whole v1 lifecycle. |
| **Apple Dev — byte5** | Account available since 2026-05-21 but **credentials not yet documented** (`references/apple_dev.md`) | Nothing for v1; only "byte5-branded signing" | **Defer.** Migration to byte5 is a **user decision** (brand vs. maintenance vs. trust-anchor), post-GA | If the user elects byte5 signing: a CI signing-identity swap (no codebase change), and a Gatekeeper/notarization re-quarantine caveat on the cert change. Needs the user to provide byte5 Apple ID / Team ID / cert first. |
| **Designer hand-off** | `docs/visual-spec.md` v0.3 exists (Lume tokens, three palettes, five idioms, two-stop/donut glow) | Final visual polish only | **visual-spec tokens.** The renderer consumes abstract tokens; alpha/beta run on v0.3 | GA visual polish needs designer sign-off, in parallel with Phase 6. Not an implementation blocker. |
| **Spike go-decision** | Pending (Phase 1) | Phase 4 alpha (chassis identity) | Nothing until M2 completes | Phase 4 cannot start until the go/no-go in `docs/spike-report.md` is recorded. |

---

## 6. Release stages

Gated on the five walkthroughs as concrete feature gates. Each stage is "the
prior stage plus the listed walkthroughs, fully end-to-end including their
risk-points".

| Stage | Walkthroughs that must pass | What works | Explicitly scoped out |
|---|---|---|---|
| **Alpha** | **WT1** (multi-source comparison) | Data-aggregation lane: skeleton-first composition, sentinel-origin gating, referential continuity, patch composition, Class-A view-state. Single canvas. high5-signed dogfood build | Editor lane, real concurrency, multi-canvas, wizard, external-effect actions, auto-update |
| **Beta** | + **WT2** (editor) + **WT4** (concurrency) | Editor Class A/B/D (brush, routed crop/blur/magic-wand, AI removal), async fan-out under per-session mutex, Class-D optimistic mutation, mid-flight plan modification | Wizard external-effect confirmation, multi-canvas persistence, distribution polish, security-secret rotation |
| **v1.0 GA** | + **WT3** (wizard) + **WT5** (multi-canvas) | Wizard composition + external-effect confirmation gate; Spaces-style multi-canvas with per-`contextKey` prefs and restart persistence; HMAC dataRef + secret rotation + `viewState` budget; signed/notarized `electron-builder` distribution + `electron-updater` | v2+ shared canvases; cross-channel continuity (waits on CCM, §5); byte5-branded signing (user decision, §5) |

This maps WT3 (wizard) and WT5 (multi-canvas) to GA rather than beta because both
carry **external-effect** or **persistence** surfaces whose failure modes
(sending a real email without confirmation; losing a day's canvas state across a
restart) are GA-blocking in a way the beta walkthroughs are not. WT3 could move
to beta if the wizard idiom proves cheap once WT2's external-effect modal exists;
the plan keeps it at GA as the conservative default.

---

## 7. Distribution + signing pipeline

Concrete, building on `tech-stack.md` §"Distribution maturity" and
`references/apple_dev.md`.

**Bundler / updater.**
- `electron-builder`: macOS `dmg` + `zip` (the `zip` is what `electron-updater`
  consumes on macOS), Windows `nsis` later, Linux `AppImage` best-effort.
- `electron-updater` against a static release feed (GitHub Releases or an
  S3-compatible bucket); macOS auto-update requires the build be **signed +
  notarized** or Squirrel.Mac rejects it.

**Signing + notarization (high5, available today).** Concrete identifiers (ASC
API Key ID, Issuer ID, `.p8`/`.p12` paths, Team ID, app-specific password) live
in `references/apple_dev.md` — referenced here, not duplicated, to avoid copying
credential identifiers into a repo doc.
- Identity: the high5 `Developer ID Application` certificate (per
  `apple_dev.md`); hardened runtime.
- `codesign --options runtime --timestamp --entitlements <plist>`.
  **`entitlements.plist` must contain no XML comments** — Apple's
  `AMFIUnserializeXML` rejects them while `plutil` accepts them silently
  (`apple_dev.md` gotcha).
- `xcrun notarytool submit … --wait` via the high5 **ASC API key** (key ID +
  issuer + `.p8` from `apple_dev.md`) — preferred for CI over the app-specific
  password.
- `xcrun stapler staple` the `.app`/`.dmg` (works on those; not on bare
  binaries — those resolve the ticket online via Gatekeeper).

**CI release workflow shape (GitHub Actions).**
- Trigger on tag `release/vX.Y.Z`.
- Job: checkout → `npm ci` → `electron-builder` (build + sign in one pass using
  a **temporary keychain** created from `APPLE_CERTIFICATE_P12_BASE64` /
  `APPLE_CERTIFICATE_PASSWORD`, torn down after) → notarize → staple → publish
  to the update feed.
- Secrets per `apple_dev.md` CI naming: `APPLE_CERTIFICATE_P12_BASE64`,
  `APPLE_CERTIFICATE_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` (or the
  ASC key trio), `APPLE_TEAM_ID`, `KEYCHAIN_PASSWORD` (random per run). Use the
  `_HIGH5` suffix convention now so a future `_BYTE5` set drops in cleanly.

**Swap to byte5 (post-GA, user-elected).** A signing-identity change in the CI
workflow + signing calls only — **no codebase change**. Caveat from
`apple_dev.md`: switching the Developer ID can trigger a Gatekeeper/notarization
re-quarantine prompt for existing users (new trust anchor). Requires the byte5
Apple ID / Team ID / cert to be placed and documented first. Do not migrate
without explicit user instruction.

---

## 8. Riskiest assumptions per phase

Same discipline as `CONCEPT.md` §"Riskiest Assumptions" — honest, falsifiable,
tied to the phase that exposes each one.

| Phase | Riskiest assumption | Falsifies if | Mitigation / fallback |
|---|---|---|---|
| 0 | The 24 primitives express as a closed JSON Schema with no escape hatch | The validator needs `additionalProperties: true` to render real trees | Tighten primitive defs; the "no-eval whitelist" security claim depends on this |
| 1 (M1) | A Haiku-class model emits valid primitive-tree tool-JSON reliably | Across a fixed corpus of **≥50 composition prompts** spanning the WT1–WT5 idioms, the configured fast model (`claude-haiku-4-5`, `ui_orchestrator_model` default) emits trees that pass the Phase-0 JSON-Schema validator on first attempt in **<95%** of cases (one bounded auto-repair retry permitted). Fail action: pin `ui_orchestrator_model` to Sonnet and re-measure (concept Risk #1). This is a small **real-model** probe in M1, not deferred to alpha — it de-risks the chassis decision early | `ui_orchestrator_model` is configurable; Sonnet fallback is the documented mitigation |
| 1 (M2) | Electron clears editor Class-A latency | Brush p95 ≥16ms on macOS **or** magic-wand ≥1s on 4K | Native Node-addon / WebGPU hot path; editor rescope; Tauri w/ per-OS commitment (§4) |
| 2 | Every SDK change is genuinely additive (classic channels ignore cleanly) | A per-channel smoke test shows a behaviour change for Teams/Slack/Telegram | Re-scope the offending PR; the concept's "negligible migration risk" claim is then wrong |
| 2 | `dispatchService` lands without disturbing `channelResolver@1` | The per-turn `channelId`-keyed resolution conflicts with the registry's binding resolution | Adopt path (b) in §3.1 (reuse the registry) — heavier but already shipped |
| 3 | `provide('canvasChatAgent')` + bare-key resolution avoids touching `chatAgent` | The canvas channel can only reach the orchestrator by `replace`-ing the shared `chatAgent` | Cross-channel bleed (P9) → redesign dispatch; this is the Phase-3 falsifier |
| 4 | Skeleton-first composition hits ~500ms with a real Tier-2 **and** holds the M1 tree-validity rate at production scale | p95 first-skeleton latency ≫500ms with Haiku, **or** first-attempt schema-valid rate falls below the 95% gate on the live walkthrough traffic | Move to Sonnet (cost/latency) or pre-warm/cache the skeleton scaffold |
| 4 | Per-session mutex + filesystem `memoryStore` is correct under real load | Lost updates appear (the `sessionLogger` RMW race, P10, generalises to canvas-state) | External per-key mutex in the orchestrator; single-instance constraint documented (concept Risk #4) |
| 5 | Tier-1 render loop is isolated from the WS handler | Pan/zoom stalls during Tier-3 work (WT2 step 20) | Re-architect the client event loop; OffscreenCanvas/Worker split must hold |
| 5 | `treeRevision` is strictly +1 under interleaved async returns | Concurrent sub-agent returns drop or reorder revisions (WT4) | Tighten mutex acquire/emit/release; equality-only revision discipline (concept §Forward-Compat) |
| 6 | External-effect confirmation gate is unbypassable | A fabricated `confirm-<actionType>` or a direct tool-call slips the modal | Server-side enforcement in Tier-2, not client trust; action whitelist (Security Surface) |
| 6 | high5 notarization yields a clean Gatekeeper pass | The signed binary is quarantined on a fresh Mac | Fix entitlements (no XML comments) / hardened-runtime flags; verify on a clean machine before GA |

---

## 9. What this plan does **not** cover

- **Visual final polish.** The designer phase (final Lume rendering, motion
  tuning, per-primitive visual QA) is out of scope. The plan consumes
  `visual-spec.md` v0.3 tokens; it does not produce the final visual design.
- **Marketing / brand assets.** Naming, landing pages, launch material are a
  separate work-stream.
- **omadia-core internal work.** The omadia repo's own roadmap is out of scope —
  **except** the additive SDK extension PRs of §3, which are explicitly in scope
  and land in `byte5ai/omadia`.
- **The CCM core implementation.** `crossChannelConversationMemory@1` /
  `platformIdentity@1` are an omadia-core RFC/PR-stream (PR #100, docs-only
  today). Omadia UI only *consumes* the capability via a late-resolved optional
  `ctx.services.get` with in-memory fallback (§5). Building it is not this plan.
- **v2+ shared canvases.** The v1 forward-compat hooks (opaque `canvasOwnership`,
  opaque `RevisionId`, channel-as-fan-out, reserved `presence_*`, per-session
  mutex as internal-only) are honoured by the phases above, but v2 itself —
  CRDT/OT/locking choice, awareness UX, permissions, branching — is deferred,
  per `CONCEPT.md` §"Forward Compatibility".
- **The protocol spec as a core deliverable.** `docs/protocol/1.0.md` is written
  in **this** repo during the spike (Phase 0/1), not as an omadia-core PR.

---

## 10. Lumens (Live Interactivity) extension — implementation outline

A separable, **additive** workstream on top of the v1 baseline above (it
depends on the surface event family, the validator, and the orchestrator
already landing). Concept: [`interactivity-concept.md`](interactivity-concept.md);
normative definition: [`lumens-spec.md`](lumens-spec.md). Tracked for the
maintainer as a GitHub issue. Suggested phasing, smallest mergeable units first:

| Phase | Deliverable | Where |
|---|---|---|
| **L0 — schemas** | JSON Schemas for the Lumen `behavior` section, the LX-AST node set, `scene`, `ports`/`wires`, the capability manifest; accept/reject fixtures | `docs/protocol/schema/` (this repo) → `omadia-canvas-protocol/1.1` |
| **L1 — LX interpreter (Tier 1)** | deterministic AST evaluator with gas + frame ceiling, bounded iteration, seeded `random`/`now`; the extended whitelist validator | host app `app/src/renderer/` |
| **L2 — `scene` primitive** | draw-list rasteriser (canvas2d first, WebGL behind it), token-only styling, buffer-native hit-testing → `TargetRef` | host app renderer |
| **L3 — cadence & animation** | per-region `static`/`reactive`/`{tick}` dirty-tracking + rAF scheduling; declarative `animate` layer on the Lume effect vocabulary; reduced-motion | host app renderer |
| **L4 — events & touch** | `tap`/`longPress`/`drag`/`pinch`/`swipe`/`key`/`tick`; 44 pt hit-targets; host gesture arbitration; input-modality handshake fields | host app + channel |
| **L5 — capabilities broker (Tier 2)** | `persist`/`loadData`/`writeData`/`tiles`/`fetch`/`generateAsset`/`clipboard`; effect-classified brokering + confirmation gate; `surface_capability_*` events; asset transport + content-addressed cache | `omadia-ui-orchestrator` + `omadia-ui-channel` + `byte5ai/omadia` core connectors for `generateAsset` |
| **L6 — ports & wires** | typed ports on primitives/Lumens, Tier-1 wire resolution, shared `viewState.selection` cross-element | host app + orchestrator |
| **L7 — lifecycle & presets** | author-once/patch; `lumen-presets/**` + `lumen-state/**` stores; resolve-then-generate lookup; fork+patch; behaviour-idiom library in the UI Skill | `omadia-ui-orchestrator` |
| **L8 — sharing** | `canvasOwnership` group extension + channel fan-out + import consent (rides the v2 shared-canvas hooks) | channel + orchestrator |
| **L9 — reference Lumens** | Tetris · interactive workflow · defrag-viz · map, traced end-to-end like `walkthroughs.md`; conformance fixtures | this repo |

**Riskiest items** (mirror `interactivity-concept.md` §13): LLM reliability
emitting valid LX (likely a strong-model authoring job, fast-model patching);
gas/scene-perf calibration on the four reference Lumens; capability-consent UX.

---

## Appendix — corrected critical-file map (omadia core @ `83ef79b`)

The concept's "Critical files" section with line numbers refreshed against live
main. Line numbers drift; treat as starting points.

| Surface | File | Note vs. concept |
|---|---|---|
| `PluginKind`, `ChannelCapability` (+`canvas`), `dispatchService` | `middleware/src/api/admin-v1.ts:114-159` | Concept said capabilities enum at `136-144`; actual `129-135`. |
| Channel-block manifest parsing (`CHANNEL_CAPABILITIES`, new fields) | `middleware/src/plugins/manifestLoader.ts:436-509` | Concept said `409-463`; actual set at `436-443`, `extractChannelBlock` at `455-509`. |
| Boot dispatch wiring (`createCoreApi`, `orchestratorDispatcher`) | `middleware/src/index.ts:~2342-2370` | Concept said `1700-1716` — **stale**. |
| Service registry (no version-stripping) | `middleware/src/platform/serviceRegistry.ts:45,92`; `pluginContext.ts:176-189` | Concept claimed stripping at `pluginContext.ts:213-216` — **wrong** (P9). |
| `IncomingTurn` (+`tenantId`/`target`/`viewState`) | `middleware/packages/harness-channel-sdk/src/incoming.ts:6-20` | Concept said `6-19`; close. `PlatformIdentity` (v1 passthrough) at `68-74`. |
| `CoreApi.handleTurnStream` (contract) / `TurnDispatcher` (adapter) | `harness-channel-sdk/src/coreApi.ts:25` / `middleware/src/channels/coreApi.ts:19-26` | Two distinct files; the SDK one is the contract. |
| `SemanticAnswer` (+`surface?`), `OutgoingInteractive` (4) | `harness-channel-sdk/src/outgoing.ts:25-90,130-134` | `OutgoingTopicAsk` declared but unwired. |
| `ChatStreamEvent` (+`surface_*`), `ChatTurnResult` (+`surface?`) | `harness-channel-sdk/src/chatAgent.ts:411-541,250-326` | Concept said `374-500`; actual union `411-541`. 15 current arms, none `surface_*`. |
| Sentinel extractors (+origin metadata, new keys) | `harness-orchestrator/src/orchestrator.ts:640-755,1176-1239` | Concept said `514-590,903-919` — **stale**. Two real sentinels, not three (P6). |
| Structured tool result / `writeCapabilities` | `plugin-api/src/localSubAgentTool.ts:32-41`; `plugin-api/src/pluginContext.ts:347-365` | `LocalSubAgentToolResult` already exists (P11); extend it. |
| `memoryStore@1` (filesystem, no CAS) | `harness-memory/src/{plugin.ts:53-56,filesystem.ts:72-76}`; `plugin-api/src/pluginContext.ts:715-732` | Holds (P10). |
| New Tier-2 plugin | `middleware/packages/omadia-ui-orchestrator/` (new) | `kind: extension`, mirrors `harness-orchestrator` (§1.3). |
| New Tier-1 server plugin | `middleware/packages/omadia-ui-channel/` (new) | `kind: channel`, `capabilities: [text, canvas]`. |

**This repo (`byte5ai/omadia-ui`):** `CONCEPT.md`; `docs/protocol/1.0.md` (spike);
the Tier-1 Host App source (Electron); `docs/spike-report.md` (Phase 1 output).
