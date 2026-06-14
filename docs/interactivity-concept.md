# Omadia UI — Live Interactivity Concept (Lumens)

> How Omadia UI gains rich, agent-generated, **Tier-1-fast** interactivity —
> Tetris, interactive data workflows, unusual visualisations (think the old
> HDD-defragmenter view), live maps — **without** giving up the whitelist /
> no-arbitrary-code security model that makes the canvas safe.
>
> This is the Omadia answer to Claude's Live Artifacts, deliberately
> re-aimed: more capable where Live Artifacts is uselessly limited, and
> *structurally* safer than "arbitrary code in a sandbox".
>
> Companion to `CONCEPT.md` (the *what* of the canvas), `visual-spec.md`
> (Lume), `docs/protocol/1.0.md` (the wire format) and `design-rationale.md`
> (the *why*). This document is **concept only** — no implementation, no PR
> plan. It extends, and stays inside, the architecture in `CONCEPT.md`.

Version 0.1 — first draft. Introduces the **Lumen**: a self-contained,
declarative, deterministic interactive unit that runs in a bounded VM on
Tier 1, is generated and brokered agentically on Tiers 2/3, and is safe to
share and to save as a preset *because* it is data, not code.

---

## 0. The problem with the two existing answers

There are two ways the industry currently lets an LLM produce "an
interactive thing", and both are wrong for Omadia:

| Approach | What it does | Why it fails for us |
|---|---|---|
| **Omadia today** (24 declarative primitives + whitelist parser) | Agent emits a JSON tree of fixed primitives; Tier 1 renders it. Safe, beautiful, instant. | Cannot express a *game loop*, *custom per-frame rendering*, *local rules/physics*, or *novel visualisations*. There is no primitive for "a falling tetromino", and there never should be — you cannot enumerate every interactive idea as a primitive. |
| **Claude Live Artifacts** (arbitrary React/JS in a sandboxed iframe) | Agent writes real code; a sandbox runs it. Maximally expressive *in compute*. | The sandbox is **all-or-nothing and near-empty**: no real data, no network, no persistence, no host integration. The simplest real use cases ("load map tiles", "save my high score", "act on my Jira data") are blocked — not by missing compute, but by missing **capabilities**. And the only thing standing between the code and the user's machine is that the sandbox boundary holds. |

The key diagnosis — and the thesis of this document:

> **Most of what Live Artifacts blocks is blocked by missing *capabilities*,
> not missing *compute*.** Tetris does not need network. A map needs *tiles*,
> not arbitrary JS. A data workflow needs *your data and a write-back path*,
> not a Turing-complete escape hatch.
>
> So the smart trade is the inverse of Live Artifacts: **constrain the
> computation** (make it declarative, bounded, deterministic, interpreted —
> not arbitrary code) and **open the capabilities** (real data, tools, even
> network) — but **mediated, declared, and gated** through the Tier-2/3
> orchestration Omadia already has.

That is the whole concept in one paragraph. Everything below is the
mechanics.

---

## 1. The Lumen — definition

A **Lumen** is a self-contained interactive unit on the canvas. It is the
omadia-native equivalent of a Live Artifact, but it is **declarative data**,
not code. A Lumen has exactly four declared parts, plus an optional fifth:

```ts
type Lumen = {
  state:        StateSchema;          // typed, bounded, serialisable state
  transitions:  Record<string, Expr>; // pure (state, event) -> state, in Lume Expressions
  view:         ViewExpr;             // pure  state -> primitive/scene tree, in Lume Expressions
  events:       EventBinding[];        // declared inputs -> transitions (keys, pointer, tick, timer)
  capabilities?: CapabilityRequest[];  // declared, default-deny doors to the outside world
};
```

Plain-English mapping:

- **`state`** — the Lumen's memory. For Tetris: the board grid, the active
  piece, score, level, game-over flag. Typed and size-capped.
- **`transitions`** — the rules. Pure functions `(state, event) → newState`,
  written in **Lume Expressions** (a small, total, sandboxed expression
  language — §3). For Tetris: `tick` drops the piece, `moveLeft`, `rotate`,
  `lockPiece`, `clearLines`. No I/O, no host access, deterministic.
- **`view`** — the look. A pure function `state → tree`, producing either
  ordinary Omadia primitives (so a Lumen can be a live form/table/dashboard)
  **or** a `scene` (the new immediate-mode draw surface, §4) for custom
  visuals like a game board or a defrag grid.
- **`events`** — what wakes the Lumen: declared keys (`ArrowLeft`, `Space`),
  pointer events on scene elements, a host **tick** at a declared, capped
  rate (≤ 60 fps), or a timer. Input is whitelisted — a Lumen cannot listen
  to keys it did not declare.
- **`capabilities`** — the *only* way a Lumen touches anything outside its
  own state: persistence, data fetch, map tiles, clipboard, share. Default
  deny. Each is effect-classified and brokered by Tier 2 (§5).

Because all five parts are declarative data validated by the same kind of
whitelist parser Omadia already ships, a Lumen flows through the **existing**
`surface_snapshot` / `surface_patch` grammar as ordinary tree content. **No
new transport is required for the Lumen itself** — only the validator and the
Tier-1 runtime are new.

> **Naming (light-vocabulary discipline, per `CONCEPT.md` §"Light
> Vocabulary").** "Lumen" — the SI unit of luminous flux — is *proposed*, not
> locked: a Lumen is a discrete, self-contained, portable quantum of Lume.
> The term labels something genuinely new (a shareable, self-running unit of
> the material) and makes it more thinkable. Per the discipline, it needs
> sign-off before it enters the locked vocabulary; until then the descriptive
> fallback is "live canvas unit". The reserved word **Spark** ("a discrete
> generative-initiation event") is *not* this — a Spark would be the *act* of
> the agent condensing a Lumen, distinct from the Lumen itself.

---

## 2. Why this is structurally safer than a sandbox (the security thesis)

The Omadia security moat today is the **whitelist parser**: the renderer
never executes agent input, it validates it against a closed schema and
renders only known primitives (CSP is `default-src 'self'`, no `unsafe-eval`;
the Ajv validators are pre-compiled at build time exactly so raw `Function()`
compilation never happens — see `app/src/renderer/src/validate/`). A Lumen
must not punch a hole in that moat. It does not, because:

1. **No arbitrary code, ever.** A Lumen carries *data* (state schema,
   expression ASTs, view template, event bindings). The Tier-1 runtime is an
   **interpreter shipped inside the Host App**, not `eval`. Lume Expressions
   are parsed to a validated AST and walked by a deterministic evaluator. CSP
   stays `default-src 'self'`, no `unsafe-eval`, no iframe-with-script. The
   whitelist philosophy is *extended*, not *abandoned*: unknown expression
   node → reject; unknown event type → reject; unknown capability → reject.
2. **Bounded computation — cannot hang, cannot DoS the host.** Every
   transition and every view evaluation runs under a **gas budget**
   (instruction count) and a **wall-clock ceiling** per frame. Loops are
   bounded comprehensions (`map`/`fold` over *declared* collections) only —
   no open `while`, no unbounded/​unguarded recursion. State has a size cap.
   Frame rate is capped by the host. A pathological Lumen hits its budget and
   is **halted with a `surface_error`**; it can never freeze the canvas or
   starve other Lumens. (Contrast: a sandboxed `while(true)` can wedge a
   worker.)
3. **Determinism by construction.** All non-determinism is host-supplied and
   seeded: `random` is a seeded PRNG handed in by the host; `now`/tick
   timestamps come from the host clock. Given `(state, event)` the next state
   is identical on every machine. This single property buys four things at
   once: **replay** (Trace can replay a session), **undo/redo** (navigate the
   state history), **safe sharing** (a recipient runs the *identical*
   behaviour), and **v2 multiplayer** (deterministic ops are lockstep- and
   CRDT-friendly — it rides the `treeRevision`-as-opaque-id and shared-canvas
   hooks already reserved in `CONCEPT.md`).
4. **Capability default-deny, effect-classified, agent-brokered.** A Lumen
   reaches the outside world only through declared capabilities, and each
   capability call reuses the existing `local` / `internal` / `external-effect`
   classification and the **confirmation-modal contract** from `CONCEPT.md`
   §"Security Surface". The Lumen never talks to the network, the filesystem,
   or a tool directly — it *requests*, Tier 2 *brokers*. (Contrast: Live
   Artifacts' iframe either has a capability or does not, with no agent in the
   loop to scope, confirm, or audit it.)
5. **Origin & trust for imported Lumens.** A shared or preset Lumen carries a
   **capability manifest** that is surfaced to the receiving user *before
   first run* ("This shared canvas wants to: save high scores · load map
   tiles from OpenStreetMap. Allow?"). Capabilities are HMAC-scoped exactly
   like `dataRef` (`HMAC(serverSecret, tenant ‖ user ‖ canvasSession ‖ …)`),
   and external capabilities carry a provider allowlist. An imported Lumen
   with an un-grantable capability is rendered inert, never silently
   escalated.

The net: a Lumen is **more capable** than a Live Artifact (it can reach real
data, tools, and — when declared and granted — the network) while being
**less dangerous**, because the dangerous axis (arbitrary code execution) is
removed entirely and the powerful axis (capabilities) is mediated by the
agent and the user instead of by a sandbox boundary alone.

| | Claude Live Artifacts | Omadia Lumens |
|---|---|---|
| Compute model | arbitrary JS/React | declarative + bounded interpreter (no `eval`) |
| Security boundary | iframe sandbox must hold | nothing to escape — no code runs; capabilities gated |
| Real data access | essentially none | yes, via brokered capabilities + existing DataRef/Class-D |
| Network | blanket-denied | declared, provider-allowlisted, brokered (e.g. map tiles) |
| Persistence | none | `persist` capability → `memoryStore` |
| Rendering | foreign iframe, off-theme | native Lume, on-theme, 60 fps |
| Agent can read/modify it live | no | yes — state is structured, agent can introspect & live-patch |
| Safe to share / preset | not really (it's code) | yes — it's validated, deterministic data |
| Can hang the host | yes (`while(true)`) | no (gas + frame ceiling → halt) |

---

## 3. Lume Expressions — the bounded language

The transition and view functions are written in **Lume Expressions** (LX):
a small, **pure, total** expression language. It is deliberately *not*
Turing-complete in the dangerous direction.

- **Pure & total.** Every expression is a function of its inputs with no side
  effects. No statements, no mutation, no exceptions-as-control-flow.
- **Values.** numbers, booleans, strings, lists, records, and typed `state`
  references. No closures over host objects, no `this`, no prototypes.
- **Operators & built-ins.** arithmetic, comparison, boolean logic,
  `if`/`match`, record/list construction, and a fixed standard library
  (`map`, `filter`, `fold`, `range`, `min`, `max`, `len`, string ops, a small
  math set). The standard library is a **whitelist** — same discipline as the
  primitive vocabulary.
- **Bounded iteration only.** `map`/`fold`/`range` over collections whose size
  is bounded by `state` (itself size-capped). No `while`, no general
  recursion. This is what makes the gas bound a *static* guarantee rather than
  a hope.
- **Host-provided non-determinism.** `random()` and `now()` are not free
  functions; they read host-seeded values passed into the evaluation context,
  preserving determinism/replay.
- **Validated AST.** LX is delivered as a JSON AST (not source text), so there
  is no parser-injection surface and the validator is the same shape as the
  primitive whitelist: walk the tree, reject any unknown node type.

LX is **versioned** alongside `omadia-canvas-protocol` and negotiated at the
boot handshake (the client declares the LX version and gas limits it
supports, exactly as it already declares `localOperations`).

> **Why not WASM / QuickJS?** A hardened WASM or embedded-JS sandbox is the
> obvious "powerful escape hatch" and is noted here as a possible **v2+**
> capability for the rare Lumen that genuinely needs arbitrary compute. It is
> *not* the v1 answer because it re-introduces exactly the "a boundary must
> hold" risk this concept is built to avoid, and it breaks determinism/replay/
> shareability. v1 deliberately ships the declarative model first and measures
> whether real use cases actually exceed it. (Same "radical-restraint-first,
> measure, then add" discipline `CONCEPT.md` uses for the prompt bar.)

---

## 4. The `scene` primitive — custom visuals without custom code

The 24 primitives cover data/UI; they do not cover "draw me a board of
coloured cells at 60 fps". One new editor-class primitive closes that gap:

**`scene`** — a declarative, immediate-mode draw surface. The Lumen's `view`
function emits, each frame, a **draw-list** from a whitelisted shape
vocabulary:

| Shape | For |
|---|---|
| `rect` / `roundRect` | tetromino cells, defrag blocks, bars, map markers |
| `line` / `polyline` / `path` | grids, connections, routes (reuses `vector-path` geometry) |
| `circle` / `ellipse` | nodes, dots, map pins |
| `sprite` (a `DataRef` image) | tiles, icons, game art |
| `text` | scores, labels (rendered in Lume type registers) |
| `group` / `transform` | layers, camera pan/zoom (reuses canvas-region zoom/pan affordances) |

Properties are restricted to **theme tokens + Lume palette** (so a Lumen is
always on-theme — a game still looks like Omadia, never like a foreign
website) plus geometry. The draw-list is **data**, validated by the whitelist
parser — there is no canvas `2d`/`webgl` script handed to the agent. Tier 1
rasterises the draw-list to canvas/WebGL natively at 60 fps from local state;
this is pure **Class A** interaction — *zero* server contact for the frame
loop (`CONCEPT.md` §"Latency paths").

`scene` is distinct from the existing `canvas-region` (which is a *pixel
editor buffer* for brush/blur ops). `scene` is a *retained/immediate hybrid
render target driven by Lumen state*. Both can coexist. Pointer events on
scene elements bind to Lumen events via stable element ids, so the existing
`TargetRef` and beam model work *inside* a Lumen (you can beam the agent about
a specific marker or cell).

---

## 5. Capabilities — the mediated doors

Capabilities are the heart of "better than Live Artifacts". Each is declared
in the Lumen, effect-classified, and brokered by Tier 2. Default deny.

| Capability | Effect class | Broker path | Example |
|---|---|---|---|
| `persist(key, value)` | `internal` | Tier 2 → `memoryStore@1` under a Lumen-scoped namespace | Tetris high score; map's last viewport |
| `loadData(dataRef)` | `internal` | Tier 2 hands the Lumen a **read-only, size-capped projection** of an existing `DataRef` | drive a defrag-style viz from a real dataset; bind a map to a places table |
| `writeData(target, value)` | `internal` / `external-effect` | reuses the **Class-D mutation contract** + `writeCapabilities` manifest | an interactive triage workflow that commits status changes back to Jira |
| `tiles(provider, z/x/y)` | `internal` | Tier 2/3 fetches from a **provider-allowlisted** endpoint, returns sprite `DataRef`s | OpenStreetMap / Mapbox map tiles |
| `fetch(declaredEndpoint)` | `internal` / `external-effect` | Tier 3 tool call against an **allowlisted, agent-approved** endpoint only | a live feed into a visualisation |
| `clipboard(text)` | `external-effect` | confirmation-modal gate | "copy result" |
| `share(lumen)` / `savePreset(lumen)` | `external-effect` | §6 | share Tetris with a colleague; save as a gallery preset |

Mechanics: a capability call from the running Lumen is *not* a direct call. It
emits a capability-request action (effect-classified) up through the channel;
Tier 2 validates it against the Lumen's granted manifest, brokers it
(memoryStore / Tier-3 tool / allowlisted endpoint), and patches the result
back — or, for `external-effect`, raises the standard confirmation modal
first. **The Lumen's deterministic local loop keeps running** while a
capability call is in flight (async-by-default, `CONCEPT.md`
§"Async Architecture") — a map pans smoothly while new tiles stream in; a
workflow stays interactive while a write-back resolves.

This is the precise inversion of Live Artifacts: the network is *not* banned,
it is **named, allowlisted, agent-brokered, user-confirmed, and audited in
Trace**.

---

## 6. Sharing & presets — safe because it's data

Two user-facing features the user explicitly asked for, both essentially free
once a Lumen is declarative+deterministic+capability-manifested:

**Share a canvas / Lumen with selected users.** A Lumen serialises cleanly
(it is validated data + a capability manifest). Sharing rides the
forward-compat hooks already in `CONCEPT.md` §"Forward Compatibility": extend
`canvasOwnership` from `{kind:"single-user"}` to `{kind:"group", members}`,
and the channel plugin (already the designated **fan-out point**) multicasts
surface events to connected members. The recipient's Tier 1 **re-validates**
the Lumen and shows its **capability manifest for consent before first run**.
Because behaviour is deterministic, every member sees the identical Lumen;
because capabilities are per-user-granted, a shared Tetris can save *your*
high score without touching *mine*. Real-time multiplayer (two people in one
Tetris) is a v2 topic but is *unblocked* by determinism — deterministic ops
are exactly what lockstep/CRDT need.

**Save as a preset.** A Lumen can be named, optionally **parameterised**
(declare which parts of `state` are preset inputs), and stored in a preset
store (`memoryStore@1` namespace, e.g. `lumen-presets/<tenant>/<scope>`). A
**Lumen gallery** lets the user re-instantiate "my defrag-style project
viewer" or "the team standup board" on any canvas, with fresh data bound via
`loadData`. Presets are the natural unit for an eventual community/library of
Omadia interactive templates — and they are safe to distribute precisely
because they are validated, deterministic, capability-declared data, not code.

---

## 7. The agent relationship — generation *and* live introspection

Lumens are generated agentically (Tier 2 composes the Lumen the way it
composes primitive trees today; heavy generation or data binding can recruit
Tier 3). But the deeper win over Live Artifacts is **bidirectionality**:

- **Agentic generation.** "Build me a Tetris" → Tier 2 emits a Lumen
  (state/transitions/view/events) via `surface_snapshot`. "Make it faster as
  the score climbs" → `surface_patch` adjusting the `tick` transition. The
  agent refines the *running* behaviour conversationally.
- **Live introspection.** Because `state` is structured and readable, the
  agent can answer "what's my high score?" or "summarise the current board"
  by reading Lumen state from canvas-state — a Live Artifact is an opaque box
  the model cannot see into.
- **Beam into a Lumen.** A user can beam a scene element ("why is this block
  red?") or a region; the existing `TargetRef`/beam machinery resolves inside
  the Lumen.
- **Composability on one canvas.** A Lumen is ordinary tree content, so a map
  Lumen sits next to a Jira `table` and they can be wired (select a marker →
  filter the table) through normal canvas mechanics. Live Artifacts are
  isolated islands; Lumens are first-class canvas citizens.

---

## 8. The user's four use cases, mapped

| Use case | state | view | events | capabilities | Tier split |
|---|---|---|---|---|---|
| **Tetris** (build · play · share) | board grid, active piece, score, level | `scene` cell grid | declared keys + host `tick` (≤60 fps) | `persist` (high score), `share` | loop is pure **Class A** on Tier 1; generation/share on Tier 2 |
| **Interactive data workflow** | working set, step, selection, edits | primitives (table/form) or `scene` | pointer/submit | `loadData` (real data in), `writeData` (commit back via Class-D + `writeCapabilities`) | Tier 1 interaction; Tier 2 brokers writes; Tier 3 owns the system of record |
| **Defrag-style / unusual viz** | dataset projection, animation cursor | `scene` coloured-cell grid | host `tick` for animation | `loadData` | data fetch via Tier 2/3; animation pure Tier 1 |
| **Interactive map** | viewport, markers, selection | `scene` (sprites = tiles, markers) + pan/zoom | pointer (pan/zoom/click) | `tiles` (provider-allowlisted), `loadData` (places), `persist` (last viewport) | pan/zoom/render pure Tier 1; tiles brokered Tier 2/3 |

Every one of these is impossible-or-crippled in both Omadia-today (no
behaviour model) and Live-Artifacts (no real capabilities). Each is natural
in the Lumen model.

---

## 9. How it fits the existing architecture (deltas, not rewrites)

Everything below is **additive** and stays inside the `CONCEPT.md` tier model,
authority split, and security surface. No wire-grammar rewrite.

| Area | Delta |
|---|---|
| **Primitives** | add `scene` (editor-class) — protocol minor bump (`1.x`); draw-list is whitelisted shape data |
| **Tree content** | add the `behavior`/`lumen` section (state/transitions/view/events/capabilities) — validated by an **extended whitelist parser** (schema + LX-AST validator) |
| **Tier-1 client** | new **Lumen runtime**: deterministic LX evaluator, gas + frame ceiling, scene rasteriser, event dispatch, seeded `random`/clock. All Class-A; the frame loop never touches the server |
| **Tier-2 orchestrator** | composes/patches Lumens; **brokers capability calls**; grants/scopes capability manifests; persists Lumen state & presets; manages share/ownership |
| **Tier-3** | reached only via brokered capabilities (`tiles`, `fetch`, `writeData`, AI ops) — unchanged interface |
| **Transport** | Lumen rides existing `surface_snapshot`/`surface_patch`; capability calls reuse the effect-classified action path + `surface_action_result`/patch; **one** new optional event family `surface_capability_*` if streaming results need it |
| **Security** | extend whitelist parser to LX-AST + scene + capability manifest; reuse HMAC scoping for capability tokens; reuse `local`/`internal`/`external-effect` + confirmation modal |
| **Handshake** | client declares supported **LX version**, **gas limits**, **scene support**, and **granted capability classes** alongside `localOperations` |
| **Identity / sharing** | reuse `canvasOwnership` group extension + channel fan-out; new `lumen-presets/**` and `lumen-state/**` memory namespaces |
| **Versioning** | LX, scene vocabulary, and capability catalog versioned with `omadia-canvas-protocol`; capability catalog negotiated like the ops catalog |

What classic channels see: **nothing** — same as `CONCEPT.md`. All additive,
engaged only behind the `canvas` capability.

---

## 10. The sweet-spot dial (answering the user's central ask)

The user's framing: Live Artifacts errs too far toward restriction; find the
better-tuned point between *possibility* and *safety*. The Lumen model tunes
**two independent dials** instead of the one coarse dial a sandbox gives you:

1. **Compute dial — set permanently to "constrained".** Declarative,
   bounded, deterministic, interpreted. This is not a per-Lumen choice; it is
   the architecture. It removes the entire arbitrary-code threat class. (v2+
   may add an opt-in WASM dial for genuine outliers, gated hard.)
2. **Capability dial — set per-Lumen, per-user, per-call, openable far.**
   This is where expressiveness lives. Because compute is safe, we can afford
   to open capabilities *generously but explicitly*: real data, write-back,
   persistence, even allowlisted network — each declared, brokered, confirmed,
   audited.

Live Artifacts collapses both dials into one ("how much of the sandbox do we
trust?") and is forced to keep it low, which is why "even the simplest use
cases are blocked". Splitting the dials is the smarter approach: **lock the
dangerous one, open the useful one.**

---

## 11. Open questions for the spike (flagged, not answered)

1. **Gas & frame-budget numbers.** Initial caps for LX gas/frame, state size,
   scene draw-list length, tick rate — measured against the four reference
   Lumens (Tetris, workflow, defrag-viz, map). Spike-tunable, like the
   `viewState` budget in `CONCEPT.md`.
2. **LX surface area.** Exactly which standard-library functions ship in
   `LX/1.0`. Bias small; grow by minor bump. Risk: too small blocks real
   Lumens; too large grows the audit surface.
3. **Scene performance ceiling.** Draw-list size at which Tier-1 raster drops
   below 60 fps; whether WebGL is required for v1 or canvas-2d suffices for
   the reference set.
4. **Capability granularity & consent fatigue.** How fine-grained the consent
   prompt should be without nagging; defaults for trusted first-party
   capabilities (`persist`) vs. always-confirm ones (`external-effect`).
5. **Determinism vs. real time.** Maps and live feeds are inherently
   non-deterministic at the *data* edge; confirm that seeding the *compute*
   while treating capability results as external inputs keeps replay coherent
   (replay re-feeds recorded capability results, like a recorded test).
6. **LLM reliability emitting LX.** Can a fast (Haiku-class) model emit valid
   LX ASTs reliably, or is Lumen generation a Sonnet/Opus job? Mirrors
   Riskiest-Assumption #1 in `CONCEPT.md`. Likely: generation on a stronger
   model, in-session tweaks cheaper.
7. **Preset trust & distribution.** Signing, capability-manifest review UX,
   and whether a shared community gallery needs a moderation/attestation
   layer (likely v2+).

---

## 12. What this is not (scope discipline)

- **Not arbitrary code execution.** No `eval`, no iframe-with-script, no WASM
  in v1. If a use case truly needs Turing-complete compute, it is a flagged
  v2+ escape hatch, gated hard — not the default.
- **Not a new design language.** Lumens render in Lume, in the active palette,
  in the type registers. A game looks like Omadia.
- **Not a bypass of the authority/security model.** Lumens obey the same
  authority split (agent owns structure, client owns view-state), the same
  stable-ID discipline, the same effect classification and confirmation
  contract, the same DataRef/HMAC scoping.
- **Not an implementation plan.** This document is concept only. Protocol
  schema, the LX grammar spec, the scene vocabulary, the capability catalog,
  reference-Lumen walkthroughs, and the PR sequence are spike deliverables,
  authored after this concept is accepted.
