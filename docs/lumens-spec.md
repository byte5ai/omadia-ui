# omadia-canvas-protocol — Lumens (Live Interactivity) · draft 1.1

> **The normative definition** of the Live-Interactivity extension. Where
> [`interactivity-concept.md`](interactivity-concept.md) holds the *rationale*
> (the *why*, narrative), this document holds the *definition* (the *what*,
> normative) — the types, the grammar, the contracts a renderer and an
> orchestrator must implement. It is the Lumen counterpart to
> [`protocol/1.0.md`](protocol/1.0.md) and a companion to
> [`visual-spec.md`](visual-spec.md) (Lume) and [`../CONCEPT.md`](../CONCEPT.md)
> (the canvas architecture).

**Status:** `draft 1.1`. Additive, **minor** bump over
`omadia-canvas-protocol/1.0` — old clients ignore unknown primitive types,
tree sections, events and capabilities (`protocol/1.0.md` §0). Nothing here
breaks the 1.0 wire grammar. The machine-validatable truth will live in
`schema/` (Lumen, LX-AST, scene, ports/wires, capability manifest) and is a
spike deliverable; where prose and schema disagree, the **schema wins**.

A Lumen is the Omadia answer to "an interactive artifact": **declarative data,
not code**, run by a small deterministic interpreter on Tier 1, generated and
brokered agentically on Tiers 2/3, safe to share and to save as a preset
*because* it is data. See `interactivity-concept.md` §0 for the thesis (most of
what sandbox-artifacts block is blocked by missing *capabilities*, not missing
*compute* — so we constrain compute and open capabilities, mediated).

---

## 0. Conventions & non-negotiable constraints

Inherited from `protocol/1.0.md` §0 (two-axis versioning, opaque `RevisionId`,
stable IDs as the lingua franca, one JSON value per frame) plus:

1. **No arbitrary code, ever.** A Lumen carries *data* — a typed state schema,
   validated expression ASTs, a view template, event bindings, a capability
   manifest. The Tier-1 runtime is an **interpreter shipped in the Host App**,
   never `eval`/`Function()`. CSP stays `default-src 'self'`, no `unsafe-eval`.
   The whitelist-parser discipline of 1.0 **extends** to LX-AST, scene shapes,
   ports and capabilities: any unknown node/type → hard reject (`surface_error`).
2. **Bounded & total.** Every transition / view evaluation runs under a gas
   budget and a wall-clock ceiling; iteration is bounded (no open `while`, no
   general recursion); state is size-capped. A Lumen can never hang the host —
   exceeding budget halts it with `surface_error`.
3. **Deterministic.** All non-determinism is host-seeded (`random`, `now`,
   tick). `(state, event) → state` is identical on every machine — the basis
   for replay, undo, safe sharing and v2 multi-user.
4. **Default-deny capabilities.** A Lumen reaches nothing outside its own state
   except through declared, granted, effect-classified capabilities brokered by
   Tier 2 (`CONCEPT.md` §"Security Surface" effect classes).
5. **Authority split unchanged.** The agent owns *structure* (which Lumens,
   elements, wires, capability grants exist). The client owns *view-state* (the
   values flowing through them, current selection, scroll). Stable IDs bind the
   two (`CONCEPT.md` §"Authority Model").
6. **Lume is the material.** Lumens render in Lume — light-as-material, **not**
   glassmorphism (`visual-spec.md` §1.3). §10.

---

## 1. Definition — the Lumen

A **Lumen** is a self-contained interactive unit on the canvas. It is delivered
as **tree content** (a node, or a `behavior` section attached to a `container`)
inside an ordinary `surface_snapshot` / `surface_patch` — **no new transport**.

```ts
type Lumen = {
  id: string;                          // stable; patches/wires/beam target it
  state:        StateSchema;           // §1.1 — typed, bounded, serialisable
  transitions:  Record<TransitionName, LXNode>;   // §2 — pure (state,event)->state
  view:         LXNode;                // §2,§3 — pure state -> primitive/scene tree
  events:       EventBinding[];        // §4 — declared inputs -> transitions
  cadence?:     CadenceSpec;           // §5 — default "reactive"
  capabilities?: CapabilityRequest[];  // §6 — default-deny doors out
  ports?:       PortSpec[];            // §7 — typed inputs/outputs for wiring
  preset?:      PresetRef;             // §8 — provenance if instantiated/forked
};
```

A Lumen is valid iff: its `state` conforms to §1.1, every `LXNode` in
`transitions`/`view` passes the §2 AST whitelist + static bounds check, every
`EventBinding` names a declared transition and a §4 event, every
`CapabilityRequest` names a §6 catalog capability, and every `PortSpec` is
§7-typed. Any failure → the Lumen is rejected wholesale with `surface_error`
(scope = the Lumen `id`); it never partially renders.

### 1.1 State schema

`state` is a typed, **closed** record. Every leaf declares a type from the LX
value set (§2.1) and bounds:

```ts
type StateSchema = {
  [key: string]:
    | { type: 'int' | 'number', min?: number, max?: number, init: number }
    | { type: 'bool', init: boolean }
    | { type: 'string', maxLength: number, init: string }
    | { type: 'enum', values: string[], init: string }
    | { type: 'list', of: StateLeaf, maxLen: number, init: unknown[] }
    | { type: 'record', fields: StateSchema, init: object }
    | { type: 'grid', w: number, h: number, of: StateLeaf, init?: unknown }  // bounded 2D — boards, defrag cells
    | { type: 'dataRef', init?: DataRef };   // §6.1 read-only projection handle
};
```

Total serialised `state` size is capped (initial default **256 KB**,
spike-tunable). `state` persists in canvas-state (`CONCEPT.md` §"State Model");
it is the *only* memory a Lumen has.

---

## 2. Lume Expressions (LX)

LX is the **pure, total** expression language of `transitions` and `view`. It is
delivered as a **JSON AST**, never as source text (no parser-injection surface;
the validator is a tree-walk, exactly like the primitive whitelist).

### 2.1 Values

`int`, `number`, `bool`, `string`, `list<V>`, `record{…}`, plus the read-only
`state` and `event` bindings in scope. No closures over host objects, no `this`,
no prototypes, no functions-as-values beyond the named std-lib.

### 2.2 AST node catalog (whitelist)

| Node | Form | Meaning |
|---|---|---|
| `lit` | `{lit: value}` | literal |
| `state` | `{state: path}` | read a `state` slice (dotted path; `grid` via `{state, at:[x,y]}`) |
| `event` | `{event: field}` | read a field of the triggering event |
| `var` / `let` | `{let:{name:expr}, in:expr}` | bind a local; lexically scoped, immutable |
| arithmetic | `{"+":[a,b]}` `-` `*` `/` `mod` | numeric |
| comparison | `{">":[a,b]}` `>=` `<` `<=` `==` `!=` | boolean |
| logic | `{and:[…]}` `or` `not` | boolean |
| `if` | `{if:c, then:a, else:b}` | total conditional (both branches required) |
| `match` | `{match:expr, cases:[{when,then}], else}` | total switch |
| record/list ctor | `{record:{…}}` `{list:[…]}` | construction |
| `set` | `{set:{path: expr}}` | **functional** update → returns a new state (no mutation) |
| std-lib call | `{call:name, args:[…]}` | from the §2.3 whitelist only |

### 2.3 Standard library (whitelist, bounded)

`map` `filter` `fold` `range` `len` `min` `max` `clamp` `abs` `floor` `round`
`concat` `slice` `contains` `indexOf` `keys` `values` string ops (`upper`
`lower` `pad` `fmt`) and a small math set. **`map`/`filter`/`fold`/`range`
iterate only over collections bounded by `state`** (which is size-capped) — this
is what makes the gas bound a *static* property. **No `while`, no general
recursion.** `random()` and `now()` read host-seeded context values (§0.3).

### 2.4 Gas & determinism contract

- Each `transition`/`view` evaluation is metered (instruction count). Initial
  default **50 000 gas / evaluation**, spike-tunable. Over budget →
  `surface_error`, the Lumen is halted (not the canvas).
- A wall-clock ceiling per frame is a secondary guard.
- Given identical `(state, event, seed)` the result is byte-identical
  everywhere. Renderers MUST NOT introduce ambient non-determinism.

### 2.5 Validation

A Lumen's LX is accepted iff every node is in §2.2, every `call` target is in
§2.3, every `state`/`event` path resolves against the declared schema, and a
static pass proves iteration bounds and a gas ceiling. `view` MUST return a
valid primitive/scene tree (§3); `transitions` MUST return a value conforming to
`state`. Anything else → reject.

---

## 3. The `scene` primitive (editor-class, 1.1)

`scene` is a declarative immediate-mode draw surface — the 25th primitive, an
editor-class addition (`protocol/1.0.md` §2). The Lumen `view` emits, per
render, a **draw-list** from a closed shape vocabulary. There is **no** canvas
`2d`/`webgl` script exposed to the agent.

```ts
type Scene = {
  type: 'scene',
  id: string,
  width: int, height: int,              // buffer-native coordinate space
  camera?: { x:number, y:number, zoom:number },   // pan/zoom; buffer-native
  draw: SceneNode[],
};

type SceneNode =
  | { kind:'rect',      x,y,w,h, r?, fill?, stroke?, strokeW?, id? }
  | { kind:'circle',    cx,cy,r, fill?, stroke?, strokeW?, id? }
  | { kind:'line',      x1,y1,x2,y2, stroke, strokeW?, id? }
  | { kind:'path',      points:[number,number][], closed?, fill?, stroke?, id? }   // reuses vector-path geometry
  | { kind:'sprite',    x,y,w,h, dataRef: DataRef, id? }     // §6.1 — images, tiles, glyphs
  | { kind:'text',      x,y, text, size?, weight?, register?, fill?, id? }         // Lume type registers
  | { kind:'group',     transform?, children: SceneNode[], id? };
```

- **Colours/styles are theme tokens + the active Lume palette only** (`accent`,
  `accent.glow*`, surface/text tokens, semantic state tokens). A `scene` is
  always on-theme — a game still looks like Omadia. Free-form colours are
  clipped by the Tier-1 normaliser.
- **Coordinates are buffer-native**, independent of zoom/pan (`CONCEPT.md`
  `bufferRegion`). Hit-testing maps pointer → buffer coords → the `id` of the
  topmost hit node.
- A `SceneNode.id` is a **stable element id** → it is a `TargetRef`
  (`{kind:'element', elementId}`) for beams, events (§4) and wires (§7).
- Tier 1 rasterises the draw-list natively (canvas2d or WebGL) at up to 60 fps
  from local state — pure **Class A**, zero server contact per frame.

`scene` coexists with `canvas-region` (the *pixel-editor buffer* for
brush/blur Class-B ops); `scene` is a *state-driven render target*, not an
editable pixel buffer.

---

## 4. Events & input (touch-first)

`events` bind **pointer-semantic** inputs to transitions. They resolve
identically across mouse / trackpad / touch / pen — the same abstraction
`CONCEPT.md` uses for context-invoke.

```ts
type EventBinding = {
  on: 'tap'|'longPress'|'drag'|'pinch'|'swipe'|'pointerMove'|'key'|'tick'|'timer'|'wire',
  target?: TargetRef,        // a scene-node id, a primitive, or the Lumen (default)
  key?: string,              // for 'key' — declared keys only (e.g. 'ArrowLeft','Space')
  rate?: number,             // for 'tick' — declared, capped (≤60) — see §5
  everyMs?: number,          // for 'timer'
  run: TransitionName,       // the transition to evaluate
};
```

Rules (normative):

- **44×44 pt minimum hit-target.** Interactive scene nodes declare/inherit a
  ≥44 pt hit area regardless of drawn glyph size (Apple HIG); the runtime
  enforces it.
- **Host owns gesture arbitration**, reusing `CONCEPT.md` long-press arbitration
  (move >6 px before 400 ms ⇒ drag, else context-invoke). A Lumen never
  re-implements disambiguation.
- **No hover dependency.** Hover is decoration only; every hover affordance has a
  tap/long-press equivalent.
- **Declared keys are an enhancement.** Every key-bound action has a touch
  equivalent (on-screen control) when the host reports no keyboard at handshake.
- **`longPress` is reserved for context-invoke** (action panel + Beam) per
  `CONCEPT.md`; a Lumen may *also* bind it but the host's context-invoke wins
  unless the Lumen declares `captureLongPress: true` on the target.

The handshake (§13) reports **input modalities** (`touch`/`mouse`/`keyboard`/
`pen`) so Tier 2 composes the right affordances.

---

## 5. Cadence & motion

Cadence is declared **per node/region, not globally**. 60 Hz never applies to a
whole tree.

```ts
type CadenceSpec = 'static' | 'reactive' | { tick: number /* Hz, ≤60 */ };
```

| Cadence | Runs | Cost at rest | For |
|---|---|---|---|
| `static` | once; redraw only on patch | zero | layout, copy, imagery, KPIs |
| `reactive` *(default)* | the `view` sub-tree whose `state` slice changed | zero until change | controls, tables, selection |
| `{tick}` | host clock drives a transition at the capped rate, **scoped to that sub-tree** | one bounded transition/frame for that region | game loop, live chart, animation |

The runtime **dirty-tracks** changed `state` slices and re-evaluates only
dependent `view` branches (retained-mode + memoisation); `requestAnimationFrame`
is scheduled only while a ticking/animating region is live. **At rest a Lumen
costs ~0 % CPU** (kiosk-critical).

**Declarative animation ≠ LX tick.** *Presentation motion* (fade, glow-pulse,
count-up, camera ease, Ken-Burns, parallax) is a **declarative animation** the
host runs on the GPU — **zero LX per frame**:

```ts
type Animate = { property, from, to, durationMs, easing, repeat?, delayMs? };
```

Easing/durations come from the Lume motion tokens (`visual-spec.md` §2.11).
Only *simulation* (state evolving by rules) is an LX `tick`. Reduced-motion
(`prefers-reduced-motion`) collapses animations per `visual-spec.md` §2.11.

---

## 6. Capabilities — the mediated doors

Default-deny. Each capability is declared, effect-classified (`local` /
`internal` / `external-effect`, `CONCEPT.md` §"Security Surface"), granted by
Tier 2, and **brokered** — a Lumen never performs the effect directly.

```ts
type CapabilityRequest = { cap: CapabilityName, scope?: object };
```

| Capability | Effect | Broker | Notes |
|---|---|---|---|
| `persist` | internal | `memoryStore@1`, Lumen-scoped namespace | high scores, last viewport |
| `loadData` | internal | read-only, size-capped **projection** of a `DataRef` | data-driven viz/maps/workflows |
| `writeData` | internal / external-effect | **Class-D mutation contract** + `writeCapabilities` manifest | commit back (e.g. Jira) |
| `tiles` | internal | **provider-allowlisted** fetch → sprite `DataRef`s | map tiles (OSM/Mapbox) |
| `fetch` | internal / external-effect | allowlisted, agent-approved endpoint | live feed |
| `generateAsset` | internal / external-effect | **omadia-core LLM connectors** (Tier 3) → `DataRef` | image/sound/voice — §6.2 |
| `clipboard` | external-effect | confirmation-modal gate | copy |
| `share` / `savePreset` | external-effect | §8/§9 | publish a Lumen |

**Mechanic.** A capability call emits an effect-classified action up the
channel; Tier 2 validates it against the granted manifest, brokers it, patches
the result back — or, for `external-effect`, raises the standard confirmation
modal first (`CONCEPT.md`). The deterministic local loop keeps running while a
call is in flight (async-by-default). Imported/shared Lumens surface their
**capability manifest for consent before first run**; capability tokens are
HMAC-scoped like `dataRef`.

### 6.1 Asset transport & content-addressed caching (never-stale)

All binaries (images, audio, video, tiles, voice) travel as **`DataRef`s**
(`CONCEPT.md` §"DataRef lifecycle"), which are **content-addressed**:

> `id = "<kind>-<sha256(content)[:16]>"` — same bytes → same id; different
> bytes → different id. **Always.**

This is **cache-busting by construction** — the structural fix for stale-cache
behaviour: the id *is* the content hash, so changed content is a *different id*
and old content can never be addressed by a new reference. Path: origin
(Tier-3 / connector) → `DataRef{id, signedToken, expiresAt}` →
`surface_data_ref_created` → client fetches **once** via HMAC token → local
content-addressed store keyed by `id` (instant hits across turns/Lumens/canvases,
automatic dedup) → invalidation **only** explicit (`expiresAt` or
`surface_data_ref_invalidated`) → GC when unreferenced and expired. No
time-based "maybe stale" guesswork.

### 6.2 Generated material comes from omadia-core, not the Lumen

Generative assets (images, sounds, music, **synthesised voice**) are produced by
the **LLM connectors wired into omadia-core**, never by the Lumen or the Tier-1
client. The UI only *requests* (`generateAsset`) and *renders* the returned
`DataRef`. Division of labour: **Lumen/Tier 1** declares + renders + animates
(Ken-Burns etc.), generates nothing; **Tier 2** validates/brokers/caches/patches;
**Tier 3 / core connectors** own the model, choice, cost, rate limits, and
return a content-addressed `DataRef`. A regenerated asset is simply a new `id` —
the old bytes GC out, nothing stale lingers.

---

## 7. Ports & wires — cross-element interaction

A Lumen is a node in the same primitive tree; elements interact bidirectionally,
deterministically, on Tier 1 (`interactivity-concept.md` §9.1).

```ts
type PortSpec = { name: string, dir: 'in'|'out', type: PortType };   // on primitives & Lumens
type Wire     = { from: { ref: TargetRef, port: string }, to: { ref: TargetRef, port: string } };  // at container/canvas level
```

- **Shared selection / view-state.** A `table` and a Lumen referencing the same
  `DataRef` + stable IDs share `viewState.selection` (keyed by id) — selecting in
  one highlights in the other. Tier-1, no turn.
- **Wires** route a node's typed `out` port to another's `in` port by stable id;
  the host resolves and propagates at Tier 1 (Class A). Examples: table
  selection → map highlight; slider → sim `state` input; Tetris `game-over` →
  `status` text + `writeData`.
- **Least-privilege.** A node reads **only** what is wired to it — it cannot
  reach arbitrary other elements' internals. Wires are declared data,
  whitelist-validated, resolve by stable id ⇒ deterministic, replayable,
  shared-canvas-safe. Authority split unchanged (agent owns which wires exist;
  client owns the values flowing).

---

## 8. Lifecycle, presets & reuse

The agent **authors rarely and reuses constantly** (`interactivity-concept.md`
§8). A Lumen is a durable, versioned component.

- **Author once, patch after.** Created once via `surface_snapshot`; lives in
  canvas-state; edited by **targeted `surface_patch`** addressed by stable
  id/path (not regeneration, not string-replace). "Faster" = a one-line patch to
  `tick`.
- **Presets.** A vetted Lumen is saved once: **named, versioned,
  content-addressed (`preset-<sha256(spec)[:16]>`), parameterised**. Scopes
  (first match wins): first-party → tenant (`lumen-presets/<tenant>/shared/**`)
  → user (`lumen-presets/<tenant>/<user>/**`) → canvas-local. Instantiation is
  **deterministic, near-zero-LLM**.
- **Resolve-then-generate.** Before any build, Tier 2 runs a library lookup (same
  shape as the pre-Tier-3 data-cache check): exact hit → instantiate; near hit →
  fork + patch; miss → cold-author (strong model) + offer to save.
- **Fork & vary.** Copy-on-write → new content-addressed id, parent id recorded
  for provenance; targeted patch for the variation.
- **Behaviour-idiom library.** The UI Skill carries vetted LX fragments
  (scene-grid, tick-loop, input-binding sets, Lume effect bundles) so even cold
  builds assemble audited pieces — cheaper and more consistent.

---

## 9. Sharing

A Lumen serialises cleanly (validated data + capability manifest). Sharing rides
the `CONCEPT.md` forward-compat hooks: `canvasOwnership` extends to
`{kind:"group", members}`; the channel plugin (the fan-out point) multicasts
surface events. The recipient's Tier 1 **re-validates** and shows the capability
manifest for **consent before first run**. Determinism ⇒ every member runs the
identical Lumen; per-user capability grants ⇒ a shared Tetris saves *your* score,
not *mine*. Real-time multiplayer is v2 but *unblocked* by determinism.

---

## 10. Visual treatment (Lume)

Lumens render in **Lume — light-as-material**, never glassmorphism
(`visual-spec.md` §1.3: "solid light, not see-through plastic"; no refraction,
no blur-as-chrome). The declarative animation layer (§5) *is* the Lume effect
vocabulary (`visual-spec.md` §3): surface-luminosity gradients, two-stop and
donut **glow**, `glow-core` inner light, directional borders, soft corners,
patch-condensation; Ken-Burns/parallax on assets; light-mote particles. `scene`
text uses the three Lume type registers (`visual-spec.md` §2.7). The only blur
is the transient 800 ms condensation (`visual-spec.md` §3.5). See
`visual-spec.md` §"Lumens & scene in Lume".

---

## 11. Security model (summary)

| Risk | Mitigation |
|---|---|
| Arbitrary code in the renderer | None runs — LX is a validated AST walked by a shipped interpreter; CSP `default-src 'self'`, no `unsafe-eval` |
| Runaway / DoS | Gas + frame ceiling + bounded iteration + state cap → halt with `surface_error`, never the canvas |
| Data exfiltration | Default-deny capabilities; Lumen reads only own state + wired-in ports; all egress brokered, allowlisted, confirmed, Trace-audited |
| Stale / poisoned assets | Content-addressed `DataRef` (id = content hash); HMAC-scoped fetch; explicit invalidation |
| Untrusted shared/imported Lumen | Re-validated on import; capability manifest consent before first run; HMAC scoping; fork lineage |
| Cross-element overreach | Port/wire least-privilege; declared, whitelist-validated, stable-id-resolved |
| Non-reversible effects | `external-effect` class → confirmation-modal gate before the real call |

---

## 12. Wire & SDK deltas (additive over 1.0)

- **Tree content:** `behavior`/`lumen` section (§1) and the `scene` primitive
  (§3) — validated by the extended whitelist parser (schema + LX-AST). Carried
  in existing `surface_snapshot` / `surface_patch`.
- **Ports & wires:** `ports` on primitives/Lumens, `wires` at container/canvas
  level (§7) — additive tree content, Tier-1-resolved.
- **Cadence & animation:** `cadence` (§5) and `animate` descriptors — additive
  trait content.
- **Events:** `surface_capability_request` (client→Tier 2) and
  `surface_capability_result` (Tier 2→client) for §6 brokering; results may also
  arrive as ordinary `surface_patch`. Reuses the effect-classified action path
  and `surface_action_result`. One optional new event family.
- **Presets:** `lumen-presets/**` + `lumen-state/**` memoryStore namespaces (§8).
- **Handshake (§13):** client declares LX version, gas limits, scene support,
  granted capability classes, and **input modalities** alongside
  `localOperations`.

Classic channels and 1.0-only clients see none of this — all additive, behind
the `canvas` capability, unknown types ignored (`protocol/1.0.md` §0).

---

## 13. Versioning & negotiation

LX, the scene vocabulary and the capability catalog are versioned with
`omadia-canvas-protocol` and negotiated at boot. The 1.0 `handshake_select`
(`protocol/1.0.md` §1) gains additive fields:

```ts
handshake_select += {
  lxVersion?: string,                 // e.g. "1.1"
  lxGasLimit?: number,                // client's per-eval gas ceiling
  sceneSupport?: 'none'|'canvas2d'|'webgl',
  capabilityClasses?: CapabilityName[],   // what this client can broker/render
  inputModalities?: ('touch'|'mouse'|'keyboard'|'pen')[],
}
```

A client may implement a subset (e.g. `scene` but not `tiles`); Tier 2 routes
accordingly and idioms degrade gracefully — the same principle as
`localOperations`.

---

## 14. Conformance & open questions

Conformance is the schema set in `schema/` (Lumen, LX-AST, scene, ports/wires,
capability manifest) + accept/reject fixtures, plus four reference Lumens
(Tetris, interactive workflow, defrag-viz, map) traced end-to-end like
`walkthroughs.md`. Open tuning items (gas/frame/state caps, LX std-lib surface,
scene perf ceiling, capability-consent granularity, determinism-vs-real-time,
LLM reliability emitting LX, preset trust/distribution) are enumerated in
`interactivity-concept.md` §13 — research items, not unspecified holes.
