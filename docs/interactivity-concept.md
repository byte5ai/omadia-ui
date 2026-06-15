# Omadia UI — Live Interactivity Concept (Lumens)

> How Omadia UI gains rich, agent-generated, **Tier-1-fast** interactivity —
> small games, interactive data workflows, unusual visualisations (think the old
> HDD-defragmenter view), live maps — **without** giving up the whitelist /
> no-arbitrary-code security model that makes the canvas safe.
>
> This is the Omadia answer to Claude's Live Artifacts, deliberately
> re-aimed: more capable where Live Artifacts is uselessly limited, and
> *structurally* safer than "arbitrary code in a sandbox".
>
> This is the **rationale** (the *why*, narrative); its **normative
> definition** (the *what* — types, grammar, contracts) is the companion
> [`lumens-spec.md`](lumens-spec.md). Further companions: `CONCEPT.md` (the
> canvas), `visual-spec.md` §4.13 (Lume rendering of Lumens),
> `docs/protocol/1.0.md` (the base wire format). This document is **concept
> only** — no implementation, no PR
> plan. It extends, and stays inside, the architecture in `CONCEPT.md`.

Version 0.5 — expands §9 with §9.1 "Composition & cross-element interaction":
a Lumen is just a node in the same primitive tree (composes in
container/pane/grid/tabs; a Lumen's `view` can hold primitives and vice
versa). Elements interact **bidirectionally and deterministically on Tier 1**
via shared `viewState.selection` by stable id and declarative **ports & wires**
(typed inputs/outputs, `from`→`to` bindings), with a least-privilege boundary
(a node reads only what is wired to it). Authority split unchanged.
Version 0.4 — adds §8 "Lumen lifecycle & reuse — author once, then instantiate
& patch (never rebuild)": the Omadia counterpart to Claude's artifact logic.
Author once (`surface_snapshot`), persist in canvas-state, edit by **targeted
`surface_patch`** (not regeneration, not string-replace); a **preset library**
(first-party / tenant / user / canvas scopes, content-addressed, versioned,
parameterised) so reuse is **instantiate-without-an-LLM**; a **two-speed**
model (rare cold authoring vs. constant warm reuse); **resolve-then-generate**
lookup before any build; **fork+patch** with lineage for variations; a
behaviour-idiom library so even cold builds assemble vetted fragments.
Version 0.3 — review fixes. **Lume correctness**: the motion/effect vocabulary
is now exact to `visual-spec.md` — Lume is **light-as-material** (surface
luminosity, accent-as-illumination, directional borders, soft corners), *not*
glassmorphism; the erroneous "frosted glass / backdrop-blur" effects are
removed (the only blur is the transient 800 ms condensation). **Touch & pointer
input** added to §5 as first-class (tap/longPress/drag/pinch/swipe, 44 pt
hit-targets, host gesture arbitration, no hover dependency, input-modality
handshake) for kiosk/iPad. **Assets** §6.1 — transport + **content-addressed,
never-stale caching** (`id = kind-sha256(content)`, cache-busting by
construction, HMAC-signed fetch, explicit invalidation). **Generated material**
§6.2 — images/sounds/voice come from **omadia-core LLM connectors** (Tier 3),
the Lumen only requests (`generateAsset`) and renders; nothing generated on the
client.
Version 0.2 — adds §5 "Render cadence, motion & the thin-client / kiosk
envelope": cadence is declared per region (`static` / `reactive` / `tick`),
**reactive-by-default (~0 % CPU at rest)** — 60 Hz never applies to the whole
tree; presentation motion is a **declarative, GPU-run animation layer**
(transitions, parallax, Ken-Burns, particles, glow), distinct from LX
simulation ticks; the "wow" comes from existing assets + generated layout +
native effects; plus the thin-client/kiosk capability ladder and a mapping to
the four priorities (security · performance · visuals · wow · generative).
v0.1 — first draft. Introduces the **Lumen**: a self-contained, declarative,
deterministic interactive unit that runs in a bounded interpreter on Tier 1,
is generated and brokered agentically on Tiers 2/3, and is safe to share and
to save as a preset *because* it is data, not code.

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
> not missing *compute*.** A game loop does not need network. A map needs *tiles*,
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

- **`state`** — the Lumen's memory. For a game: the board, the moving
  token(s), score, level, game-over flag. Typed and size-capped.
- **`transitions`** — the rules. Pure functions `(state, event) → newState`,
  written in **Lume Expressions** (a small, total, sandboxed expression
  language — §3). For a game: `tick` advances the board, `moveLeft`, `rotate`,
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
  deny. Each is effect-classified and brokered by Tier 2 (§6).

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

## 5. Render cadence, motion & the thin-client / kiosk envelope

Nothing about a Lumen forces 60 Hz. A blanket game-loop is the *wrong* default
for almost everything and ruinous for an always-on kiosk. This section pins
the rendering model and the realistic capability envelope on weak hardware.

### Reactive by default — 60 Hz only where it earns it

Cadence is declared **per node/region, not globally**, in three classes:

| Cadence | When it runs | LX cost at rest | For |
|---|---|---|---|
| **`static`** | rendered once; redrawn only when a `surface_patch` changes it | **zero** | most kiosk/dashboard content: layout, imagery, copy, KPIs |
| **`reactive`** *(default)* | `view` re-evaluated only for the sub-tree whose `state` slice changed, on event/data | **zero** until something changes | forms, tables, controls, selection |
| **`{ tick: hz }`** | host clock drives an LX transition at a declared, capped rate, **scoped to that sub-tree only** | one bounded transition/frame for that region only | the falling tetromino, a live chart, a defrag animation |

The runtime **dirty-tracks** which `state` slices changed and re-evaluates only
the dependent `view` branches (retained-mode + memoisation).
`requestAnimationFrame` is scheduled **only while a ticking/animating region is
live** and torn down when it settles. **At rest a Lumen costs ~0 % CPU** — a
kiosk showing a beautiful, mostly-static screen burns nothing until someone
touches it or a single badge pulses. One Lumen routinely mixes all three: a
a game's scene ticks at 60 Hz, the score label beside it is `reactive`, the
surrounding chrome is `static`. Only the part that must move pays.

### Motion comes from a declarative animation layer, not from LX

"Animation" conflates two different things; separating them is what makes
*wow on weak hardware* possible:

- **Simulation** — state genuinely evolves by rules each step (a piece falls,
  cells flip). This is an LX **tick**, used sparingly.
- **Presentation motion** — a panel slides in, a glow pulses, a number counts
  up, a camera eases, an image slowly pans (Ken Burns). This must **not** be an
  LX tick recomputing state per frame. It is a **declarative animation** the
  host runs on the compositor/GPU:

  ```json
  { "animate": { "property": "opacity", "from": 0, "to": 1, "duration": 300, "easing": "ease-out" } }
  ```

The agent *declares* enter/exit/change transitions, easing, pulses, parallax
layers, Ken-Burns pan-zoom on assets, **accent glow / halo / aura** (the
two-stop and donut glow recipes), **surface luminosity**, **directional
light**, the **patch-condensation** materialisation, and (as a native effect)
light-mote particle emitters. The **host executes them natively on the GPU** —
zero LX per frame, 60 fps smoothness on a fanless thin client. This *is* the
Lume material — **light-as-material**, condensed out of light: surface
luminosity, accent-as-illumination, directional borders, soft corners
(`visual-spec.md` §1.2). **Lume is explicitly *not* glassmorphism** — no
refraction, no blur-as-chrome, "solid light, not see-through plastic"
(`visual-spec.md` §1.3). The only blur is the transient 800 ms condensation
materialisation, never standing chrome. So the wow is cheap and on-rails,
never hand-coded pixel math.

### Where the "wow" actually comes from (generated, natively executed)

A stunning generated kiosk screen = **existing assets + generated layout +
native Lume effects + a touch of declarative motion**:

- **Existing image/video material** → `sprite`/`image`/`media` via `DataRef`
  (brand imagery, product photos, loops). The agent *composes*; it does not
  synthesise pixels on-device.
- **Native Lume effect vocabulary** (whitelisted, GPU): surface-luminosity
  gradients, accent glow / halo / aura (two-stop + donut), `glow-core` inner
  light, directional light, elevation, parallax depth, Ken-Burns pan-zoom,
  light-mote particles — *declared*, not computed in LX. No glassmorphism, no
  blur-as-chrome (`visual-spec.md` §1.3).
- **Generative authorship, native execution**: the agent generates the
  composition, the motion declarations, and the asset bindings as data; the
  host runs them on native rails. The result looks like a hand-tuned demo,
  but it was generated.

### Touch & pointer input — first-class, not an afterthought (kiosk · iPad)

Kiosks and iPads are touch-first, so touch is in the Lumen event model from
day one — it is **not** mouse events with a shim. A Lumen's `events` declare
**pointer-semantic** inputs that resolve identically across mouse, trackpad
and touch (the same abstraction `CONCEPT.md` already uses for *context-invoke*
= long-press):

| Declared event | Touch | Mouse/trackpad | Use |
|---|---|---|---|
| `tap` | tap | click | activate a control, place, select |
| `longPress` (~400 ms) | press-and-hold | right-click / hold | **context-invoke** → action panel + Beam (per `CONCEPT.md`) |
| `drag` | one-finger drag | press-move | move a piece, pan a board, reorder |
| `pinch` | two-finger pinch | ctrl+wheel / trackpad pinch | zoom a map / scene |
| `swipe` | flick | wheel / two-finger | next/prev, dismiss, scroll |
| `pointerMove` *(opt-in)* | finger track | hover | drawing, aiming — `continuous-input` |

Rules that make it kiosk-grade:

- **Hit-targets, not pixels.** A Lumen declares interactive scene elements
  with a **minimum 44×44 pt hit area** (Apple HIG), independent of the drawn
  glyph size. The runtime enforces the minimum and does hit-testing against
  stable element ids → the existing `TargetRef`/beam model works by touch.
- **Gesture arbitration is the host's job**, reusing `CONCEPT.md`'s long-press
  arbitration (move > 6 px before 400 ms ⇒ drag, else context-invoke). A Lumen
  never re-implements gesture disambiguation.
- **No hover dependency.** Hover is dropped as a *required* affordance (not
  touch-capable); any hover effect is pure decoration with a tap/long-press
  equivalent. This matches `CONCEPT.md`'s interaction model.
- **Touch-tuned density.** `style: "spacious"` and larger Lume hit-areas are
  the kiosk default; the agent is told (UI Skill) to compose touch-first when
  the canvas is flagged as a kiosk/tablet surface.
- **On-screen input.** Text entry uses the platform soft-keyboard via the
  `input` primitive; a kiosk with no keyboard still works. No raw key events
  are *required* — declared keys (`ArrowLeft`, `Space`) are an *enhancement*
  for hardware-keyboard hosts, and every key-driven action has a touch
  equivalent (on-screen control) when the host reports no keyboard at
  handshake.

The handshake already carries client capabilities; it is extended to report
**input modalities** (`touch` / `mouse` / `keyboard` / `pen`) so Tier 2
composes the right affordances — a kiosk Lumen ships on-screen controls, a
desktop Lumen may add keyboard shortcuts on top.

### Thin-client / kiosk capability ladder

Because the client only ever does *bounded interpretation* + *raster of a
draw-list it already has* (everything heavy is brokered to Tier 2/3), the
thin client is the design centre, not the stress test:

- 🟢 **Flüssig:** puzzle/board/card games (2048, chess, solitaire), interactive
  dashboards & workflows, data-viz incl. defrag-style grids to ~5–10 k cells
  (canvas2d; more on WebGL), maps (tiles are GPU-composited images fetched by
  Tier 2/3 — the client doesn't compute the map).
- 🟡 **Mit Maßnahmen:** large cellular automata / sims over big grids (drop to
  30 Hz, smaller grid, or push the step to Tier 3), very large scenes (WebGL
  rasteriser, same declarative draw-list).
- 🔴 **Nicht in reinem LX:** realtime 3D, thousand-body physics, 100 k-particle
  systems, per-pixel image processing, heavy solvers/ML. → escape hatches:
  **native local-ops catalog** (Class B, pixel work), **Tier 3** (heavy
  compute returns a `DataRef` the Lumen merely visualises), **v2 WASM** (hard
  gated, rare outliers).

The decisive kiosk property no "arbitrary-code-in-sandbox" approach has: the
**gas budget guarantees a clean halt** — a badly generated Lumen never freezes
an always-on display, it is stopped with a `surface_error`.

### Mapping to the four priorities

| Priority | How the cadence/motion model delivers it |
|---|---|
| **Security** | host-owned capped clock; `static`/`reactive` branches execute *no logic* at rest; motion is declarative (no per-frame code); capability default-deny unchanged; gas guarantees a clean halt |
| **Performance** | ~0 % CPU at rest; only ticking/animating sub-trees cost frames; GPU does the pretty part — built for fanless always-on kiosks |
| **High-quality visuals** | native Lume effects + GPU compositing + real assets via `DataRef`; consistent, on-theme, never a foreign iframe |
| **Wow-effect** | declarative transitions, parallax, Ken-Burns, particles, glow — generated by the agent, run natively at 60 fps even on thin clients |
| **Generative** | the agent authors structure, motion and asset bindings as data; existing material is referenced, not regenerated |

---

## 6. Capabilities — the mediated doors

Capabilities are the heart of "better than Live Artifacts". Each is declared
in the Lumen, effect-classified, and brokered by Tier 2. Default deny.

| Capability | Effect class | Broker path | Example |
|---|---|---|---|
| `persist(key, value)` | `internal` | Tier 2 → `memoryStore@1` under a Lumen-scoped namespace | a game's high score; map's last viewport |
| `loadData(dataRef)` | `internal` | Tier 2 hands the Lumen a **read-only, size-capped projection** of an existing `DataRef` | drive a defrag-style viz from a real dataset; bind a map to a places table |
| `writeData(target, value)` | `internal` / `external-effect` | reuses the **Class-D mutation contract** + `writeCapabilities` manifest | an interactive triage workflow that commits status changes back to Jira |
| `tiles(provider, z/x/y)` | `internal` | Tier 2/3 fetches from a **provider-allowlisted** endpoint, returns sprite `DataRef`s | OpenStreetMap / Mapbox map tiles |
| `fetch(declaredEndpoint)` | `internal` / `external-effect` | Tier 3 tool call against an **allowlisted, agent-approved** endpoint only | a live feed into a visualisation |
| `clipboard(text)` | `external-effect` | confirmation-modal gate | "copy result" |
| `generateAsset(spec)` | `internal` / `external-effect` | Tier 2 → **omadia-core LLM connectors** (Tier 3); returns a `DataRef` | generate an image / sound / TTS voice line for the scene |
| `share(lumen)` / `savePreset(lumen)` | `external-effect` | §7 | share a game with a colleague; save as a gallery preset |

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

### 6.1 Assets — transport, content-addressed caching, never-stale

Images, sounds, video, voice lines and any other binary an asset-bearing
Lumen references all travel as **`DataRef`s** — the canonical mechanism from
`CONCEPT.md` §"DataRef lifecycle". The key property the user asked for —
**no stale-cache problem** — falls out of `DataRef` being **content-addressed**:

> `id = "<kind>-<sha256(content)[:16]>"` — `kind ∈ {pixel, audio, video, …}`.
> **Same bytes → same id. Different bytes → different id. Always.**

This is **cache-busting by construction**, the structural fix for the
"annoying browser still shows the old image because it didn't notice it
changed" behaviour: the id *is* the content hash, so a changed asset is a
**different id** and there is no way to address new content with an old
reference. The client cache is keyed by that hash, so a cache hit is a
*provable* byte-identity, never a heuristic on a URL + `Cache-Control` guess.

**Transport path (host → UI client):**

1. **Origin.** A Tier-3 tool or an omadia-core LLM connector (see §6.2)
   produces the binary and returns a `DataRef {id, signedToken, expiresAt}` —
   the binary itself stays server-side until fetched.
2. **Announce.** Tier 2 emits `surface_data_ref_created {DataRef, schema,
   sizeHint}` on the surface stream; the Lumen's `view` references the asset
   by `dataRef` on a `sprite`/`image`/`media` node.
3. **Fetch.** The client fetches the bytes **once** from the channel endpoint
   using the **HMAC-signed token** (scope = tenant ‖ user ‖ canvasSession ‖
   body ‖ expiry; re-validated server-side — `CONCEPT.md` §"Security Surface").
4. **Cache.** The client stores the bytes in a local content-addressed store
   keyed by `id`. Every later reference to the same `id` is an instant local
   hit — across turns, across Lumens, across canvases. Dedup is automatic
   (identical assets share one entry).
5. **Invalidate.** Two triggers, both explicit: `expiresAt` reached, or a
   `surface_data_ref_invalidated {id, reason}` from Tier 2 when a durable op
   replaces the buffer. There is no time-based "maybe it's stale" guesswork.
6. **GC.** The client drops a local buffer once no live primitive references
   its `id` **and** its expiry has passed.

Large client-authored buffers (a `canvas-region` the user painted) are
content-hashed **locally** and only uploaded if a Tier-3 op needs them — the
same content-addressing in the other direction.

### 6.2 Generated material comes from omadia-core, not from the Lumen

Generative assets — images, sounds, music, **synthesised voice** — are
produced by the **LLM connectors wired into the omadia host (omadia-core)**,
**never** by the Lumen or the Tier-1 client. The UI side only *supports* them:
it **requests** via the `generateAsset` capability and **renders** the
returned `DataRef`. The division of labour:

| Layer | Role in asset generation |
|---|---|
| **Lumen / Tier 1** | declares the need (`generateAsset(spec)`), renders the resulting `sprite`/`media`, runs declarative motion (Ken-Burns, etc.) on it. Generates **nothing**. |
| **Tier 2** | validates the capability grant, shapes the request, brokers it to the right connector, caches the returned `DataRef`, patches it into the scene. |
| **Tier 3 / omadia-core connectors** | the actual image/audio/voice model. Owns the generation, the model choice, the cost, the rate limits. Returns a content-addressed `DataRef`. |

This keeps the security model intact (no model keys or generation logic on the
client), keeps the protocol model-agnostic (swap connectors without touching
the Lumen), and means generated material flows through the **exact same
content-addressed, never-stale cache** as any other asset (§6.1). A
regenerated image is simply a **new `id`** — the scene updates, the old bytes
GC out, nothing stale lingers.

---

## 7. Sharing & presets — safe because it's data

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
because capabilities are per-user-granted, a shared game can save *your*
high score without touching *mine*. Real-time multiplayer (two people in one
game) is a v2 topic but is *unblocked* by determinism — deterministic ops
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

## 8. Lumen lifecycle & reuse — author once, then instantiate & patch (never rebuild)

Regenerating a kiosk surface or a game from scratch on every turn would be
expensive (tokens), slow (a full generation), and inconsistent (two "builds"
drift). It must not happen, and the architecture already has the pieces to
stop it. This is the Omadia counterpart to Claude's artifact logic
(create-once, then `update`) — extended from "one artifact per conversation"
to a **persistent, versioned, shareable component library**.

### 8.1 Author once, edit by patch — never regenerate

A Lumen is generated **once** (`surface_snapshot`) and then **lives in
canvas-state** (`CONCEPT.md` §"State Model"), persisting across turns and Host
App restarts. The agent does **not** re-emit it to keep it alive. Subsequent
changes are **targeted `surface_patch`es** addressed by stable id/path,
bumping `treeRevision`:

| User says | What the agent emits | Cost |
|---|---|---|
| "Build me a game" *(nothing reusable exists)* | one `surface_snapshot` with the full Lumen | one expensive turn (once) |
| "Make it faster as the score climbs" | `surface_patch` touching only the `tick` transition | a few tokens |
| "Bigger board" | `surface_patch` on one `state` field + the `view` grid bounds | a few tokens |
| "Change the accent to Atelier" | accent re-tint patch (existing palette mechanic) | trivial |

This is exactly Claude's create-then-update model — but a patch targets a
**validated tree by stable id**, not a string-replace on source code, so there
is no resync/drift surface and no risk of an edit corrupting the program. The
*structure is preserved by construction* across edits → consistency for free.

### 8.2 The reuse library — presets & templates (the real "not from scratch")

The durable answer is the **preset library** (§7). A vetted Lumen is authored
**once** and saved as a preset: **named, versioned, content-addressed,
parameterised**. Thereafter the agent does not build it — it **instantiates**
it:

> "Instantiate the game" → Tier 2 resolves the intent to the `arcade@2` preset,
> binds its parameters (board size, palette, data), and renders it.
> **Near-zero LLM, sub-second, byte-identical every time.**

Library scopes, outermost to innermost (first match wins, like CSS cascade):

| Scope | Namespace | Holds |
|---|---|---|
| **First-party** | shipped with the orchestrator | curated, audited Lumens (an arcade game, map, defrag-viz, standup board) |
| **Tenant / org** | `lumen-presets/<tenant>/shared/**` | the organisation's vetted library |
| **User** | `lumen-presets/<tenant>/<user>/**` | "my defrag-style project viewer" |
| **Canvas-local** | canvas-state | the instance currently on screen |

Because a preset is **content-addressed** (`preset-<sha256(spec)[:16]>`) and
**deterministic**, every instantiation is identical — there is no
"two-divergent-instances" problem, and a shared preset replays the same on every
machine (§2 determinism, §6.1 content-addressing).

### 8.3 Two-speed generation — the cost & consistency model

| Mode | When | Model | Latency | Frequency |
|---|---|---|---|---|
| **Cold authoring** | nothing in the library fits | strong model (Sonnet/Opus) | seconds | **rare** — once per genuinely new idea |
| **Warm reuse** | a preset matches (exactly or after a small edit) | none, or a fast model for a parametric patch | sub-second | **the common case** |

After a cold authoring, Tier 2 **offers to save the result as a preset**
("Save this game to your gallery?"). The expensive build is paid **once**;
every later use is warm. This is the same economics that makes Claude
artifacts feel cheap after creation — generalised into a persistent library
instead of a per-conversation artifact.

### 8.4 Resolve-then-generate — the lookup before the build

Before generating anything, Tier 2 runs a **library lookup** — the *same
shape* as the existing "check the per-canvas data cache before calling Tier 3"
rule in `CONCEPT.md` §"Per-canvas data cache":

```
intent ──▶ library lookup (semantic + capability match across scopes)
            ├─ exact hit      ──▶ instantiate preset           (no LLM)
            ├─ near hit        ──▶ fork preset + targeted patch  (fast model)
            └─ miss            ──▶ cold-author + offer to save   (strong model)
```

So "build me X" is, by default, a **retrieve-and-bind** operation, not a
generation. Generation is the fallback, not the first move.

### 8.5 Fork & vary — copy-on-write, with lineage

"the game, but on a hexagonal board" does **not** rebuild it. Tier 2 **forks**
the `arcade` preset (copy-on-write → new content-addressed id, parent id recorded
for provenance) and applies a **targeted patch** to the affected
transitions/view. Cheap, consistent with the original, and the lineage is
auditable — important for the trust model when forks are shared (§2 point 5).

### 8.6 Compose from idioms, not from zero

Even cold authoring is not truly from scratch. The UI Skill carries a
**behaviour-idiom library** — the behaviour-layer extension of the
composition-idiom library already in `CONCEPT.md` §"The UI Skill" (Norton
Commander → two panes, etc.). Vetted building blocks the agent assembles:

- a **scene-grid** skeleton (board/cell-matrix render),
- a **tick-loop** skeleton (gravity / animation step),
- **input-binding sets** (WASD/arrows/touch-swipe → moves),
- **Lume effect bundles** (a glow-pulse, a Ken-Burns hero, a condensation-in).

Cold builds therefore assemble audited LX fragments rather than inventing
control flow each time — cheaper to generate **and** more consistent across
builds. This is the single biggest lever on both cost and reliability of cold
authoring.

### 8.7 vs. Claude artifact logic

| | Claude artifacts | Omadia Lumens |
|---|---|---|
| Persistence | per-conversation | cross-session canvas-state + **cross-user preset library** |
| Edit mechanism | string `update` / `rewrite` on source | **structural patch on a validated tree by stable id** (no drift) |
| Reuse | copy text into a new chat | **named, versioned, parameterised preset** — instantiate without an LLM |
| Consistency | re-generation can drift | content-addressed + deterministic ⇒ byte-identical |
| Sharing | share the code | share a **vetted, capability-manifested** preset (§7) |
| Variation | re-prompt | **fork + patch** with tracked lineage |

The thesis: **the agent's job is to author rarely and reuse constantly.** A
Lumen is a durable, versioned component — built once, instantiated and patched
forever after.

---

## 9. The agent relationship — generation *and* live introspection

Lumens are generated agentically (Tier 2 composes the Lumen the way it
composes primitive trees today; heavy generation or data binding can recruit
Tier 3). But the deeper win over Live Artifacts is **bidirectionality**:

- **Agentic generation.** "Build me a game" → Tier 2 emits a Lumen
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
- **Composability on one canvas.** A Lumen is ordinary tree content (see §9.1),
  so a map Lumen sits next to a Jira `table` and they interact through normal
  canvas mechanics. Live Artifacts are isolated islands; Lumens are first-class
  canvas citizens.

### 9.1 Composition & cross-element interaction (it is just one tree)

A Lumen is a node in the same primitive tree as every other primitive. There
is **no separate surface, no iframe, no island**. Two consequences:

**(a) It composes like any primitive.** A Lumen lives inside `container` /
`pane` / `grid` / `tabs`, obeys the same layout, the same surface-nesting
ladder, the same Lume material, the same validator and the same render pass.
The agent places a map Lumen in one pane, a Jira `table` in another, a `chart`
below — one canvas, one tree. The boundary is porous *both ways*: a Lumen's
`view` itself emits ordinary primitives (a `button`, a `table`, a `status`),
so a Lumen can contain regular UI and regular UI can contain a Lumen.

**(b) Elements interact — bidirectionally, deterministically, on Tier 1.**
The wiring reuses machinery that already exists, so it costs **no turn** and
runs at 60 fps:

| Mechanism | How it wires | Direction | Tier |
|---|---|---|---|
| **Shared selection / view-state** | a `table` and a Lumen both reference the same `DataRef` + **stable IDs**; selection lives in `viewState.selection` keyed by those IDs (`CONCEPT.md` Authority Model) | UI ⇄ Lumen | **1 (Class A)** — no server |
| **Declarative ports & wires** | a node declares typed **inputs** and **outputs**; the agent declares **wires** (`from` → `to`) by stable id. The host routes values at Tier 1 | UI ⇄ Lumen, Lumen ⇄ Lumen | **1 (Class A)** |
| **Lumen capability → patch** | a Lumen output bound to `writeData`/`generateAsset`/etc. patches another container via Tier 2 | Lumen → UI (semantic) | 2 / 3 |
| **Beam / agent** | user beams across both ("compare these rows with the map"); agent reasons over the wired set | either, semantic | 2 |

Concrete:

- **Map Lumen ⇄ Jira `table`.** Select rows in the table → the bound markers
  on the map glow (shared selection by `rowKey`). Tap a marker → the table
  filters/scrolls to that `rowKey` (Lumen output wired to the table's
  view-state). Both directions are pure Tier 1.
- **`form`/slider → simulation Lumen.** A `choice`/slider primitive is wired to
  a Lumen `state` input (gravity, speed, grid size). Dragging the slider
  retunes the running sim live — declarative, no turn.
- **Lumen output → primitive.** A game's `game-over` (a Lumen output) wired to a
  `status` primitive ("New high score!") and to a `writeData` capability that
  persists the score back through Tier 3.
- **List ⇄ defrag-viz Lumen.** Hover/select a file in a `list` → its blocks
  light up in the scene; click a block cluster → the list scrolls to that file.

**The boundary that keeps it safe.** Cross-element wiring is **declared data**
(validated by the whitelist parser), and a node can only read what is **wired
to it** — it cannot reach arbitrary other elements' internals. This is
least-privilege by construction: the same port/wire boundary that makes a
Lumen safe to share makes cross-element interaction auditable and
shared-canvas-safe (wires resolve by stable id, deterministically, so they
replay and multicast unchanged). The **authority split is unchanged**: the
agent owns *which elements and wires exist* (structure); the client owns *the
values currently flowing through them* (view-state).

> **SDK delta:** declarative **`ports`** (typed inputs/outputs) on primitives
> and Lumens, and **`wires`** (a `[{from: TargetRef+port, to: TargetRef+port}]`
> list) at the container/canvas level — additive tree content, Tier-1-resolved,
> whitelist-validated. No new transport.

---

## 10. The user's four use cases, mapped

| Use case | state | view | events | capabilities | Tier split |
|---|---|---|---|---|---|
| **An arcade game** (build · play · share) | board, moving token(s), score, level | `scene` cell grid | declared keys + host `tick` (≤60 fps) | `persist` (high score), `share` | loop is pure **Class A** on Tier 1; generation/share on Tier 2 |
| **Interactive data workflow** | working set, step, selection, edits | primitives (table/form) or `scene` | pointer/submit | `loadData` (real data in), `writeData` (commit back via Class-D + `writeCapabilities`) | Tier 1 interaction; Tier 2 brokers writes; Tier 3 owns the system of record |
| **Defrag-style / unusual viz** | dataset projection, animation cursor | `scene` coloured-cell grid | host `tick` for animation | `loadData` | data fetch via Tier 2/3; animation pure Tier 1 |
| **Interactive map** | viewport, markers, selection | `scene` (sprites = tiles, markers) + pan/zoom | pointer (pan/zoom/click) | `tiles` (provider-allowlisted), `loadData` (places), `persist` (last viewport) | pan/zoom/render pure Tier 1; tiles brokered Tier 2/3 |

Every one of these is impossible-or-crippled in both Omadia-today (no
behaviour model) and Live-Artifacts (no real capabilities). Each is natural
in the Lumen model.

---

## 11. How it fits the existing architecture (deltas, not rewrites)

Everything below is **additive** and stays inside the `CONCEPT.md` tier model,
authority split, and security surface. No wire-grammar rewrite.

| Area | Delta |
|---|---|
| **Primitives** | add `scene` (editor-class) — protocol minor bump (`1.x`); draw-list is whitelisted shape data |
| **Tree content** | add the `behavior`/`lumen` section (state/transitions/view/events/capabilities) — validated by an **extended whitelist parser** (schema + LX-AST validator) |
| **Composition / interaction** (§9.1) | declarative **`ports`** (typed inputs/outputs) on primitives & Lumens + **`wires`** (`from`→`to` by `TargetRef`) at container/canvas level; Tier-1-resolved by stable id, whitelist-validated; reuses shared `viewState.selection`. No new transport |
| **Tier-1 client** | new **Lumen runtime**: deterministic LX evaluator, gas + frame ceiling, scene rasteriser, event dispatch, seeded `random`/clock. All Class-A; the frame loop never touches the server |
| **Tier-2 orchestrator** | composes/patches Lumens; **brokers capability calls**; grants/scopes capability manifests; persists Lumen state & presets; manages share/ownership |
| **Lifecycle / reuse** (§8) | **resolve-then-generate**: library lookup before any build (same shape as the existing pre-Tier-3 data-cache check); preset **instantiate** (no LLM) / **fork+patch** (fast model) / **cold-author** (strong model); content-addressed, versioned, parameterised presets; behaviour-idiom library in the UI Skill |
| **Tier-3** | reached only via brokered capabilities (`tiles`, `fetch`, `writeData`, AI ops) — unchanged interface |
| **Transport** | Lumen rides existing `surface_snapshot`/`surface_patch`; capability calls reuse the effect-classified action path + `surface_action_result`/patch; **one** new optional event family `surface_capability_*` if streaming results need it |
| **Security** | extend whitelist parser to LX-AST + scene + capability manifest; reuse HMAC scoping for capability tokens; reuse `local`/`internal`/`external-effect` + confirmation modal |
| **Handshake** | client declares supported **LX version**, **gas limits**, **scene support**, and **granted capability classes** alongside `localOperations` |
| **Identity / sharing** | reuse `canvasOwnership` group extension + channel fan-out; new `lumen-presets/**` and `lumen-state/**` memory namespaces |
| **Versioning** | LX, scene vocabulary, and capability catalog versioned with `omadia-canvas-protocol`; capability catalog negotiated like the ops catalog |

What classic channels see: **nothing** — same as `CONCEPT.md`. All additive,
engaged only behind the `canvas` capability.

---

## 12. The sweet-spot dial (answering the user's central ask)

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

## 13. Open questions for the spike (flagged, not answered)

1. **Gas & frame-budget numbers.** Initial caps for LX gas/frame, state size,
   scene draw-list length, tick rate — measured against the four reference
   Lumens (an arcade game, workflow, defrag-viz, map). Spike-tunable, like the
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

## 14. What this is not (scope discipline)

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
