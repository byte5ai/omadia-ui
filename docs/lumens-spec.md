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
`omadia-canvas-protocol/1.0`, and **negotiation-gated**: all 1.1 content (the
`scene` primitive, the `behavior`/`lumen` tree section, ports/wires, the
`surface_capability_*` events) is emitted **only to clients that negotiated
support at the boot handshake** (§13). A 1.0-only client never negotiates it, so
Tier 2 never sends it; and if such content ever reached a 1.0 renderer it would
be **hard-rejected** by the whitelist parser (`protocol/1.0.md` §2), never
silently mis-rendered — additivity is enforced **fail-closed by negotiation, not
by clients silently ignoring unknown primitive types**. (Only additive *fields
on already-known types* ride 1.0's "ignore unknown fields" forward-compat,
`protocol/1.0.md` §0; unknown *types / tree sections* are gated, not ignored.)
Nothing here breaks the 1.0 wire grammar. The machine-validatable truth will
live in `schema/` (Lumen, LX-AST, scene, ports/wires, capability manifest) and
is a spike deliverable; where prose and schema disagree, the **schema wins**.

> **Rev 2 (Codex review).** Clarifications within `draft 1.1` (no protocol-minor
> change): additivity is negotiation-gated / fail-closed (§0, §12); the agent
> owns capability *requests*, never *grants* (§0.5); `timer` is bounded like
> `tick` via a combined wakeup budget (§0.2, §4); capability-broker egress
> bounds + state/`DataRef`-derived `fetch`/`writeData` classification (§6, §11);
> shared/preset assets travel by content `id` with recipient-scoped token
> re-mint (§9); ambient cross-element reads replaced by a declared `expose`
> interface (§7, §11).

> **Rev 3 (expressiveness & practice-fit).** Closes three normative gaps the
> prose hid when LX is actually hand-written for a board-game-class Lumen: the
> `map`/`filter`/`fold` **binder node forms** and computed-index `at`/`setAt`
> (§2.2) — without them no iteration or board mutation is expressible. Adds
> **native kernels** (§2.6) — bounded, host-owned algorithms (sort, group,
> aggregate, scale, layout, pathfind, …) that pure first-order LX cannot
> express, exposed as pure calls (the *capability pattern applied to compute*).
> Adds **declared invariants** (§2.7, silent-wrong → loud-error) and a
> **golden-trace authoring gate** (§14). Adds **transactional / high-frequency
> patterns** (§6.3) so kiosk/ordering flows fit without a confirmation modal per
> tap, plus a fifth (transactional) reference Lumen.

> **Rev 3.1 (hand-author test).** Hand-writing the arcade tick + an ordering flow
> in real LX-AST validated rev 3 and surfaced follow-ups, now closed: the `{var}`
> read node (§2.2 — binders were unreadable without it, so iteration was not
> actually expressible); an immutable **`const`** section + `{const}` node (§1.2)
> as the structural fix for static-table explosion (and the unit the idiom
> library ships); 2-D `at`/`setAt` over `list<list>`, not only `grid`, with a
> spatial `[x,y]` convention (§2.2); and ergonomics for the hot render path — the
> optional `idx` binder and `flatten` (§2.2/§2.3).

> **Rev 3.2 (colour authority).** A Lumen's **own content** is **not**
> palette-locked: the agent picks `colorMode: 'theme'|'brand'|'free'` (+ a
> declared `palette`) from the **request + embedding context** (§3.1). `theme` is
> the *no-direction default* — justified only by the assumption that the Lumen
> embeds in an existing Lume UI, an assumption that is **not universal**; a
> kiosk / branded / product surface gets `brand`/`free` **directly**, no opt-out
> to fight. Scoped to the Lumen's subtree: **Omadia chrome always stays Lume** (v1
> identity boundary, no host white-label). In `brand`/`free` the normaliser no
> longer clips colour and enforces **no** contrast floor — accessibility of
> free-colour content is the author's responsibility (44 pt hit-targets and
> reduced-motion still apply; those are interaction-safety, not colour).

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
   general recursion); state is size-capped; the **wakeup rate** (`tick` +
   `timer` combined) is itself capped and count-limited per Lumen (§4). A Lumen
   can never hang the host — exceeding any budget halts it with `surface_error`.
3. **Deterministic.** All non-determinism is host-seeded (`random`, `now`,
   tick). `(state, event) → state` is identical on every machine — the basis
   for replay, undo, safe sharing and v2 multi-user.
4. **Default-deny capabilities.** A Lumen reaches nothing outside its own state
   except through declared, granted, effect-classified capabilities brokered by
   Tier 2 (`CONCEPT.md` §"Security Surface" effect classes).
5. **Authority split unchanged.** The agent owns *structure* (which Lumens,
   elements, wires, published `expose` interfaces, and capability **requests**
   exist). The client owns *view-state* (the values flowing through them,
   current selection, scroll).
   Capability **grants** are *not* agent-owned: a request is granted only by
   Tier-2 policy plus user consent where the effect class requires it (§6) — an
   agent-authored patch can *ask* for a capability, never *self-grant* one
   (no `fetch` / `writeData` / `share` escalation via a patch). Stable IDs bind
   the two (`CONCEPT.md` §"Authority Model").
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
  state:        StateSchema;           // §1.1 — typed, bounded, serialisable (mutable memory)
  const?:       ConstSchema;           // §1.2 — typed, bounded, immutable author-time tables (not serialised)
  transitions:  Record<TransitionName, LXNode>;   // §2 — pure (state,event)->state
  view:         LXNode;                // §2,§3 — pure state -> primitive/scene tree
  events:       EventBinding[];        // §4 — declared inputs -> transitions
  cadence?:     CadenceSpec;           // §5 — default "reactive"
  colorMode?:   'theme'|'brand'|'free';// §3.1 — default 'theme'; opens colour for THIS Lumen's content only
  palette?:     PaletteSpec;           // §3.1 — declared brand colours (used with colorMode 'brand')
  capabilities?: CapabilityRequest[];  // §6 — default-deny doors out
  ports?:       PortSpec[];            // §7 — typed inputs/outputs for explicit wiring
  expose?:      ExposeSpec[];          // §7 — published read-only view-state (the ambient-readable interface)
  invariants?:  LXNode[];              // §2.7 — boolean assertions checked after every transition
  preset?:      PresetRef;             // §8 — provenance if instantiated/forked
};
```

A Lumen is valid iff: its `state`/`const` conform to §1.1/§1.2, every `LXNode` in
`transitions`/`view`/`invariants` passes the §2 AST whitelist + static bounds
check (every `{call}` target in §2.3, every `{kernel}` target in §2.6, every
`{const}`/`{state}` path resolving against the declared schema), every
`EventBinding` names a declared transition and a §4 event, every
`CapabilityRequest` names a §6 catalog capability, every `invariants` entry is a
boolean `LXNode`, and every `PortSpec` / `ExposeSpec` is §7-typed. Any failure →
the Lumen is rejected wholesale with `surface_error` (scope = the Lumen `id`); it
never partially renders.

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
it is the *only* mutable memory a Lumen has.

### 1.2 Constants — immutable author-time data

`const` is a typed, bounded, **immutable** record of author-time data — lookup
tables, shape sets, maze layouts, colour maps, any constant a transition reads
every frame. It uses the same typed-leaf grammar as `state` (§1.1, minus the
mandatory `init`/with a required `value`) but differs in three ways that make it
the structural fix for **table explosion** (the friction of inlining a tetromino
shape set as a giant `match`/`lit` tree in every transition):

1. **Agent-owned structure, not view-state.** It travels with the Lumen spec
   (itself content-addressed), is whitelist-validated like `state`, and is the
   unit the preset/idiom library (§8) ships — an idiom fragment carries its table
   **once**, declared, not re-inlined.
2. **Read-only.** No transition writes it; there is **no `setAt` into `const`**.
   Read it via `{const: path}` (§2.2), computed-indexable with `at`, exactly like
   `{state: path}`.
3. **Not serialised.** It does **not** count against the 256 KB `state` cap, does
   not persist per-turn, and does not appear in undo/replay — it is part of the
   program, not the memory. A patch to a transition no longer drags a re-inlined
   table.

`const` is bounded like `state` (size-capped, spike-tunable), so the static gas
bound covers `map`/`fold` over `const` collections too. For genuinely **large**
blobs (a tile atlas, a big level) prefer a **`DataRef`** (§6.1 — content-
addressed, fetched once, async) over an inline `const`; `const` is for the small,
hot, synchronously-read tables a transition needs inside the frame loop.

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
| `const` | `{const: path}` | read an immutable `const` slice (§1.2); computed-indexable via `at`, exactly like `state` |
| `event` | `{event: field}` | read a field of the triggering event |
| `let` | `{let:{name:expr}, in:expr}` | bind a local (readable via `{var}`); lexically scoped, immutable; nest for multiple bindings |
| `var` | `{var:name}` · `{var:name, path:"f.g"}` | **read** a bound local — a `let` name or a `map`/`filter`/`fold` binder (`as`/`acc`); optional dotted sub-path into a record/list. The *only* way to read a binder; without it no `let`/iteration body can reference what it binds |
| arithmetic | `{"+":[a,b]}` `-` `*` `/` `mod` | numeric |
| comparison | `{">":[a,b]}` `>=` `<` `<=` `==` `!=` | boolean |
| logic | `{and:[…]}` `or` `not` | boolean |
| `if` | `{if:c, then:a, else:b}` | total conditional (both branches required) |
| `match` | `{match:expr, cases:[{when,then}], else}` | total switch |
| record/list ctor | `{record:{…}}` `{list:[…]}` | construction |
| `set` | `{set:{path: expr}}` | **functional** update at a *static* path → returns a new state (no mutation) |
| `setAt` | `{setAt: coll, index:[xExpr] \| [xExpr,yExpr], to: expr}` | **functional** write at a computed index → new collection; 1-D indexes a `list`, 2-D `[x,y]` a `grid` **or** a `list<list>` (as `coll[y][x]`); out-of-bounds is a **no-op** (total) |
| `at` | `{at: coll, index:[xExpr] \| [xExpr,yExpr], default: expr}` | random-access **read** at a computed index → element or, on out-of-bounds, `default` (total); 1-D for `list`, 2-D `[x,y]` for `grid` **or** `list<list>` (`coll[y][x]`); also the form for `{state, at:[…]}` with **expression** indices |
| `map` | `{map: listExpr, as:"x", idx?:"i", body: expr}` | element-wise; binds item `x` (and optional index `i`) per item → new list |
| `filter` | `{filter: listExpr, as:"x", idx?:"i", body: predExpr}` | keep items where `body` is true → new list |
| `fold` | `{fold: listExpr, as:"x", idx?:"i", acc:"a", init: expr, body: expr}` | left fold; binds accumulator `a`, item `x` (and optional index `i`) → final `a` |
| std-lib call | `{call:name, args:[…]}` | first-order helper from the §2.3 whitelist |
| native kernel | `{kernel:name, args:[…]}` | bounded, host-implemented algorithm from the §2.6 whitelist |

`map`/`filter`/`fold` are the **only** iteration; their binders (`as`/`acc`/the
optional `idx`) are syntactic lexical scopes read via `{var}`, **not** first-class
function values (no closures, §2.1). They iterate only over `state`- or
`const`-bounded collections, so the gas bound stays static (§2.4). The optional
`idx` binder gives position-dependent iteration (rendering a board, indexed maps)
without the `map(range,…) + at` detour.

`at`/`setAt` make random-access **total** by requiring an out-of-bounds answer —
the load-bearing forms for any board/cell mutation. **2-D `[x,y]` is spatial — `x`
horizontal, `y` vertical — for both `grid` and `list<list>` (the latter resolving
to `coll[y][x]`), so an author thinks in coordinates regardless of backing.** Pick
**`grid`** for fixed dimensions (Pacman maze, defrag cells: clean random R/W);
pick **`list<list>`** when rows are added/removed (Tetris line-clear: clean
`filter`/`concat`) — both now index identically by `[x,y]`.

### 2.3 Standard library (whitelist, bounded, first-order)

Scalar/collection helpers callable as `{call:name,…}`: `range` `len` `min`
`max` `clamp` `abs` `floor` `round` `mod` `concat` `flatten` `slice` `contains`
`indexOf` `keys` `values`, string ops (`upper` `lower` `pad` `fmt` `split`
`join`) and a small math set. `flatten` (one level) turns nested iteration into a
flat `list` — e.g. a board's per-row node lists into one `scene` draw-list —
without a `fold`/`concat` accumulator. Iteration is **not** here — it is the
dedicated `map`/`filter`/`fold` binder nodes (§2.2), bounded by `state`/`const`
size, so the gas bound stays a *static* property. **No `while`, no general recursion, no
first-class functions.** `random()` and `now()` read host-seeded context values
(§0.3). Genuinely iterative algorithms (sort, group/aggregate, pathfind,
layout, …) are **not** open-coded in LX — they are the bounded **native
kernels** of §2.6.

### 2.4 Gas & determinism contract

- Each `transition`/`view` evaluation is metered (instruction count). Initial
  default **50 000 gas / evaluation**, spike-tunable. Over budget →
  `surface_error`, the Lumen is halted (not the canvas).
- A wall-clock ceiling per frame is a secondary guard.
- Given identical `(state, event, seed)` the result is byte-identical
  everywhere. Renderers MUST NOT introduce ambient non-determinism.

### 2.5 Validation

A Lumen's LX is accepted iff every node is in §2.2, every `call` target is in
§2.3, every `kernel` target is in §2.6, every `state`/`event` path resolves
against the declared schema, and a static pass proves iteration bounds and a gas
ceiling. `view` MUST return a valid primitive/scene tree (§3); `transitions` MUST
return a value conforming to `state`. Anything else → reject.

### 2.6 Native kernels — bounded algorithms the host owns

Pure LX is first-order and non-recursive: it expresses **state machines and
local/greedy logic** but **not** genuinely iterative algorithms (pathfinding,
connected-components, graph layout, sort, grouped aggregation). Rather than
re-open the Turing-complete hole this whole model exists to avoid, those
algorithms are **native kernels** — fixed, audited, host-implemented functions
exposed to LX as pure calls `{kernel:name, args:[…]}`. This is the **capability
pattern applied to compute**: the agent never *writes* a kernel, only *calls* one
from the whitelist, exactly as it draws a primitive from the render whitelist.
The compute dial stays "constrained" (§12); only the *vocabulary of bounded
primitives* widens — additively, by minor bump, like a new primitive.

Every kernel is **(1) deterministic** (seeded, no IO, no capability — a kernel is
*not* a door out; that is what §6 capabilities are); **(2) internally bounded** —
it runs its loop in native code under a per-call **kernel-gas** ceiling
proportional to its (state-capped) input; and **(3) total** — a degenerate input
or an exceeded ceiling returns a declared empty/identity result, or halts the
Lumen with `surface_error` on a hard breach, but never hangs. Kernels are
versioned and negotiated with LX (§13); a client implementing a subset advertises
it, and a Lumen needing an unsupported kernel degrades or is rejected — same
discipline as `localOperations`.

Initial blessed set (bias small — grow by **minor** bump, §13), ordered by
business value:

| Kernel | Signature (sketch) | For |
|---|---|---|
| `sortBy` | `(list, keyExpr, dir) → list` (stable) | tables, leaderboards, any ordering |
| `groupBy` | `(list, keyExpr) → record<key,list>` | pivots, segmentation |
| `aggregate` | `(list, {op, field}) → number` — `sum∣avg∣count∣min∣max∣median∣pNN` | KPIs, rollups |
| `scaleValue` / `ticks` | `(domain, range, kind, v) → number` / `(domain, n) → list` (`linear∣log∣ordinal∣time`) | every chart axis |
| `timeBucket` | `(timestamps, unit) → record` (`day∣week∣month∣…`) | time series, calendars, gantt |
| `layoutGraph` | `(nodes, edges, kind) → positions` (`dag∣hierarchical∣force`) | org / dependency / flow charts, mind maps |
| `treemap` / `packRects` | `(weights, w, h) → rects` | dashboards, treemaps, defrag layout |
| `geo` | `pointInPolygon · bbox · segIntersect` | maps, scene hit-geometry |
| `floodFill` | `(grid, seed) → labelled grid / region` | selection regions, clustering, defrag |
| `pathfind` | `(grid∣graph, start, goal, opts) → path` (`bfs∣dijkstra∣astar`) | routing, wayfinding, maze games |

`keyExpr`/predicates handed to a kernel are **LX expression ASTs** evaluated per
element under the same gas discipline (a kernel taking an expression budgets
`elements × eval` against kernel-gas). Per-kernel signatures, the kernel-gas
schedule, and the exact v1.1 cut line are a **schema/spike deliverable** (§14);
the list above is the *intent*, biased to the cases real business artifacts hit
(the last two are the game-ward outliers — lower priority, since we are not
building a game engine). The boundary stays clean: a kernel may iterate because
it is **audited native code with a hard internal ceiling**, not agent-authored
control flow — so "cannot hang / cannot DoS" (§0.2) and determinism (§0.3) hold
for kernels exactly as for the interpreter.

### 2.7 Declared invariants (silent-wrong → loud-error)

A Lumen MAY declare `invariants` — boolean LX expressions over `state` that MUST
hold **after every transition** (e.g. `score >= 0`, the active piece in bounds,
`len(cart) <= max`). The runtime evaluates them post-transition (cheap, bounded,
same gas pool); a violation **rolls back** the offending transition and raises
`surface_error` (scope = Lumen `id`) rather than letting corrupt state render.
Invariants do not *prove* correctness, but they convert a meaningful class of
generation bugs — the off-by-one the validator **cannot** catch because the
Lumen is syntactically valid — from **silent-wrong** into a caught, loud failure
the agent repairs by patch. They pair with the golden-trace authoring gate (§14).

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

- **Colour is theme-bound by default, author-openable for the Lumen's own
  content (§3.1).** By default a `scene` draws from Lume tokens (`accent`,
  `accent.glow*`, surface/text/semantic tokens), is re-tintable, and is always
  on-theme — a game still looks like Omadia. A Lumen MAY declare `colorMode:
  'brand'|'free'` + a `palette` (§3.1) for kiosk / branded / product surfaces;
  this scopes to the **Lumen's own subtree only** (Omadia chrome always stays
  Lume), and in `brand`/`free` the normaliser does **not** clip colours.
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

### 3.1 Colour authority (theme · brand · free)

Colour inside a Lumen is a **declared, scoped** property the agent chooses from
the **request and the embedding context** — not a fixed preference for Lume. Two
fields on the Lumen:

```ts
colorMode?: 'theme' | 'brand' | 'free';                 // default 'theme'
palette?:   { [name: string]: ColorToken | sRGBHex };   // bounded, declared brand colours
```

| `colorMode` | Colours | Re-tint | For |
|---|---|---|---|
| `theme` *(no-direction default)* | Lume tokens only | yes (palette switch re-tints) | a Lumen meant to sit **inside an existing Lume UI** — the default *only* when no colour direction is given |
| `brand` | a **declared** bounded `palette`, referenced by name | as a unit | kiosk / branded ordering / product surfaces |
| `free` | arbitrary sRGB/hex per node | no | photographic gradients, many-colour games, generative art |

- **`theme` is the no-direction default, not a value judgement.** Absent any
  colour direction, the agent assumes the Lumen will be **embedded in an existing
  Lume-designed UI** and uses `theme` so it sits in seamlessly. **That assumption
  is not universal.** A standalone kiosk, a branded ordering surface, a product
  presentation or a game with its own art are **first-class** cases where the
  agent reads the intent and chooses `brand`/`free` **directly** — the user must
  never have to *fight* an opt-out. `colorMode` is **derived from the request +
  embedding context** (the UI Skill carries the heuristic: explicit brand/colour
  ask, or a standalone/full-bleed surface → `brand`/`free`; "add this to my
  dashboard", no colour ask → `theme`). `theme` wins only when nothing points
  elsewhere; it is not "safer" or "more correct" than `brand`/`free`.
- **Scope = the Lumen's own subtree.** `brand`/`free` colour governs the Lumen's
  `scene` draw-list **and** the themeable surfaces of the primitives its `view`
  emits. It does **not** touch anything outside the Lumen: **Omadia chrome
  (header, action panel, Beam, canvas frame) and sibling canvas elements always
  render in the active Lume theme.** The host stays recognisably Omadia; the
  *content* is the author's brand. (No white-label of the host chrome in v1 — a
  deliberate identity boundary.)
- **Brand colour can still ride the Lume material.** A declared brand colour may
  render as an *illuminating* accent (glow / surface-luminosity, §5/§10) for a
  premium look, **or** as a flat fill to match a brand exactly — author's choice.
  The Lume **material technique** (no glassmorphism, no blur-as-chrome,
  `visual-spec.md` §1.3) governs the host chrome regardless; a `flat` brand fill
  is a colour choice, not a return to glass.
- **No clipping, no contrast enforcement.** In `brand`/`free` the Tier-1
  normaliser does **not** clip colours and does **not** enforce a contrast floor
  — **accessibility of free-colour content (contrast, colour-blind safety) is the
  author's responsibility.** Interaction-safety guarantees are *not* colour and
  still hold: 44 pt hit-targets (§4) and reduced-motion (§5) apply regardless.
- **Still data, still safe.** A `palette` is declared, bounded, whitelist-
  validated data (no code); `free` node colours are plain sRGB values in the
  draw-list. Colour freedom touches the *look* only — determinism, gas and
  default-deny capabilities are unchanged.

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
- **Bounded wakeups (timers are capped like ticks).** `tick` is rate-capped
  (`rate` ≤ 60 Hz, §5). `timer` is bounded the *same* way: `everyMs` has an
  enforced **minimum period**, the number of `tick` + `timer` bindings per
  Lumen is **count-capped**, and their **combined wakeup rate shares one
  per-Lumen budget**. A schedule that exceeds the budget is **rejected at
  validation** (`surface_error`), never accepted-then-throttled. Caps are
  spike-tunable initial defaults, like gas (§2.4); they keep the §0.2
  "cannot hang / cannot DoS the host" guarantee true for `timer`, not only for
  `tick` (a swarm of 1 ms timers each individually under gas is still rejected
  in aggregate).

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

**Broker bounds (anti-DoS / anti-cost).** Because a capability call can be
emitted from a `tick`/`timer`, Tier 2 bounds **egress** the way Tier 1 bounds
compute (§0.2): per-capability **rate + quota**, a **max-in-flight** ceiling,
**idempotent de-duplication** of identical in-flight calls, and **backpressure**
when a broker saturates — so a ticking Lumen cannot move the DoS or cost problem
onto Tier 2/3. Caps are spike-tunable initial defaults (§14). Egress that
carries data **derived from Lumen state or a `DataRef`** (an outbound `fetch`, a
`writeData`) is treated as `external-effect` — per-call confirmation — *unless*
the endpoint **and** request shape were pre-approved at grant time; a bare
`internal` `fetch` may not smuggle state-derived data past the confirmation gate.
The exact quota/idempotency/backpressure contract is a spike deliverable (§14).

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

### 6.3 High-frequency & transactional interaction (kiosk / ordering)

The per-call confirmation gate (§6) is sized for *occasional, agent-driven*
external effects, **not** *user-driven high-frequency* ones — a kiosk ordering
flow must not raise a modal on every "add to cart". Three normative patterns keep
it fluid without weakening the gate:

1. **Local-first, commit-once.** Cart edits, quantities, navigation and form
   state are **pure `state`** — `reactive`, no capability, **zero modals**; they
   never touch a door out. Only the *terminal* commit (place order) crosses a
   single `external-effect` gate. The "20 taps" are local; one tap is brokered.
2. **Session-scoped consent (batched grant).** For genuine multi-write flows a
   capability grant MAY be **scoped to a bounded session** — N calls, a time
   window, or "until a terminal event" — so the user consents **once** to a
   declared, visible, revocable budget instead of per call. Authority is
   unchanged (still Tier-2 policy + user consent; the agent still only
   *requests*, §0.5); consent is merely amortised over the session.
3. **Optimistic + reconcile (server stays authoritative).** A Lumen is the
   *interaction surface*, never the system of record. Inventory, pricing,
   payment and order state are **server-authoritative**: the Lumen shows an
   **optimistic** local state, Tier 2 brokers the authoritative `writeData`
   (reusing the Class-D optimistic-mutation contract), and patches back a
   **confirm or rollback**; determinism makes the rollback exact. Payment and
   stock consistency live in Tier 3 / the system of record — out of Lumen scope
   by design.

A **transactional ordering Lumen** is therefore the right fifth conformance
artifact (§14): it exercises the capability axis a game never does.

---

## 7. Ports & wires — cross-element interaction

A Lumen is a node in the same primitive tree; elements interact bidirectionally,
deterministically, on Tier 1 (`interactivity-concept.md` §9.1).

```ts
type PortSpec   = { name: string, dir: 'in'|'out', type: PortType };  // on primitives & Lumens — explicit, wired
type ExposeSpec = { name: string, type: PortType };                   // published read-only view-state, bindable by shared id WITHOUT a wire
type Wire       = { from: { ref: TargetRef, port: string }, to: { ref: TargetRef, port: string } };  // at container/canvas level
```

- **Shared selection / view-state — via a published interface, not ambient
  reach.** An element declares a **lightweight published interface**: a small,
  named, read-only set of view-state it *offers* to neighbours (`expose`, e.g.
  `selection`, `viewport`). A neighbour referencing the same `DataRef` + stable
  IDs may then read a **published** field by name — selecting in a `table` that
  exposes `selection` highlights the bound markers in a Lumen, with **no explicit
  wire and no turn** (Tier-1). The producer decides what is readable;
  **un-exposed state stays private**, so an imported or untrusted element can
  neither observe a neighbour's internals nor expose more than it declared. This
  is *ambient-by-declaration*, not ambient-by-default.
- **Wires** route a node's typed `out` port to another's `in` port by stable id;
  the host resolves and propagates at Tier 1 (Class A). Examples: table
  selection → map highlight; slider → sim `state` input; a game's `game-over` →
  `status` text + `writeData`.
- **Least-privilege.** A node reads **only** what is **wired or published** to it
  (an explicit `wire`, or a neighbour's declared `expose` interface bound by
  shared id) — it cannot reach arbitrary other elements' internals. Wires and
  `expose` declarations are declared data, whitelist-validated, resolve by stable
  id ⇒ deterministic, replayable, shared-canvas-safe. Authority split unchanged
  (the agent owns which wires and published interfaces exist; the client owns the
  values flowing).

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
identical Lumen; per-user capability grants ⇒ a shared game saves *your* score,
not *mine*. Real-time multiplayer is v2 but *unblocked* by determinism.

**Assets travel by content `id`, not by token.** A shared or preset Lumen
carries its asset references as content-addressed `DataRef` **ids** (or an asset
manifest) only — *never* the author's `signedToken`s, which are HMAC-scoped to
the author's `tenant ‖ user ‖ canvasSession` (§6.1) and would either fail for
the recipient or, if made reusable, break the isolation model. On
import/instantiate the recipient's Tier 2 **re-authorises and re-mints** each
`DataRef` token scoped to the *recipient*; an asset the recipient may not access
renders **inert**, never via a borrowed token.

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

Lume is the **host's own material** and the **no-direction default for a Lumen's
content**: Omadia chrome — header, action panel, Beam, canvas frame — and every
element outside a Lumen always render in Lume, never white-labelled (v1 identity
boundary). A Lumen's content uses `theme` *only* because the agent's default
assumption is that it embeds in an existing Lume UI; where the use case differs —
a kiosk, branded-ordering or product surface that needs the *customer's* colours,
not the accent — the agent chooses `colorMode: 'brand'|'free'` + a declared
`palette` directly (§3.1), no opt-out to fight. Palette and material are
independent: brand colour may ride the Lume *material* (glow, surface-luminosity)
for a premium look, or render flat to match a brand exactly. The no-glassmorphism
rule is about the *material technique* (no refraction, no blur-as-chrome) and
governs the host regardless of a Lumen's palette choice.

---

## 11. Security model (summary)

| Risk | Mitigation |
|---|---|
| Arbitrary code in the renderer | None runs — LX is a validated AST walked by a shipped interpreter; CSP `default-src 'self'`, no `unsafe-eval` |
| Runaway / DoS | Gas + frame ceiling + bounded iteration + state cap + **capped wakeup budget** (`tick` + `timer`, §4) → halt/reject with `surface_error`, never the canvas; capability **egress** is broker-bounded (rate/quota/max-in-flight/idempotent/backpressure, §6) so a tick-driven call cannot DoS Tier 2/3 |
| Iterative compute (sort/pathfind/layout) | **Native kernels** (§2.6), not agent-authored loops: audited host code under a per-call **kernel-gas** ceiling, total on degenerate input, deterministic, no IO — the agent calls but never writes one, so "no arbitrary code" and "cannot hang" both hold |
| Corrupt generated state (silent-wrong) | **Declared invariants** (§2.7) checked post-transition → rollback + `surface_error`; **golden-trace** author-time gate (§14) runs example traces before first render |
| Data exfiltration | Default-deny capabilities; Lumen reads only own state + **wired/`expose`-published** ports; all egress brokered, allowlisted, confirmed, Trace-audited; **state/`DataRef`-derived** `fetch`/`writeData` classified `external-effect` (confirmed) unless pre-approved at grant (§6) |
| Stale / poisoned assets | Content-addressed `DataRef` (id = content hash); HMAC-scoped fetch; explicit invalidation |
| Untrusted shared/imported Lumen | Re-validated on import; capability manifest consent before first run; HMAC scoping; fork lineage |
| Cross-element overreach | Port/wire **+ published-interface** least-privilege — a node reads only what is **wired or `expose`-published** to it; un-exposed state is unreadable (an imported Lumen sees no ambient neighbour state); declared, whitelist-validated, stable-id-resolved |
| Non-reversible effects | `external-effect` class → confirmation-modal gate before the real call |

---

## 12. Wire & SDK deltas (additive over 1.0)

- **Tree content:** `behavior`/`lumen` section (§1) and the `scene` primitive
  (§3) — validated by the extended whitelist parser (schema + LX-AST). Carried
  in existing `surface_snapshot` / `surface_patch`.
- **LX-AST:** `map`/`filter`/`fold` binder nodes (with optional `idx`) + the
  `{var}` read node + `at`/`setAt` computed indexing (1-D and 2-D over `grid`
  **and** `list<list>`) + `flatten` (§2.2/§2.3), the **native-kernel** whitelist
  (§2.6), and optional `invariants` (§2.7) — additive AST content, statically
  validated.
- **Constants:** the immutable `const` section + `{const}` read node (§1.2) —
  agent-owned, bounded, not serialised; the unit the idiom/preset library ships.
- **Ports & wires:** `ports` and `expose` (published read-only interface) on
  primitives/Lumens, `wires` at container/canvas level (§7) — additive tree
  content, Tier-1-resolved.
- **Cadence & animation:** `cadence` (§5) and `animate` descriptors — additive
  trait content.
- **Colour authority:** `colorMode` + `palette` on the Lumen (§3.1) — opens
  brand/free colour for the Lumen's own content; chrome stays Lume. Additive,
  declared data; the normaliser stops clipping in `brand`/`free`.
- **Events:** `surface_capability_request` (client→Tier 2) and
  `surface_capability_result` (Tier 2→client) for §6 brokering; results may also
  arrive as ordinary `surface_patch`. Reuses the effect-classified action path
  and `surface_action_result`. One optional new event family.
- **Presets:** `lumen-presets/**` + `lumen-state/**` memoryStore namespaces (§8).
- **Handshake (§13):** client declares LX version, gas limits, scene support,
  granted capability classes, and **input modalities** alongside
  `localOperations`.

Classic channels and 1.0-only clients see none of this — all additive, behind
the `canvas` capability and **gated by boot negotiation** (§13): a client that
does not negotiate `scene` / LX / capability support is never sent 1.1 content,
and unknown *types / tree sections* are hard-rejected (not silently ignored) by
the 1.0 whitelist (`protocol/1.0.md` §2).

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
  kernels?: KernelName[],             // §2.6 native kernels this client implements
  kernelGasLimit?: number,            // client's per-kernel-call gas ceiling
  capabilityClasses?: CapabilityName[],   // what this client can broker/render
  inputModalities?: ('touch'|'mouse'|'keyboard'|'pen')[],
}
```

A client may implement a subset (e.g. `scene` but not `tiles`); Tier 2 routes
accordingly and idioms degrade gracefully — the same principle as
`localOperations`.

---

## 14. Conformance & open questions

Conformance is the schema set in `schema/` (Lumen, LX-AST **incl. the
`map`/`filter`/`fold` binder nodes, `at`/`setAt`, and the §2.6 kernel
signatures**, scene, ports/wires/`expose`, invariants, capability manifest) +
accept/reject fixtures, plus **five** reference Lumens — an arcade game,
interactive workflow, **a transactional ordering flow (§6.3)**, defrag-viz, map —
each authored **by hand in real LX-AST** and traced end-to-end like
`walkthroughs.md`.

**Hand-authoring the reference set is the acceptance gate *before* implementation
budget is committed.** It is the cheapest test that the binder forms, the kernel
cut, the invariant/golden-trace loop and the transaction patterns actually hold
against a non-trivial artifact — not only in prose. (Tracing a board-game-class
Lumen on paper is exactly what surfaced the Rev-3 gaps; doing the full set
converts "argued watertight" into "tested watertight".)

**Golden-trace authoring gate.** Because behaviour is deterministic, cold
authoring SHOULD emit, alongside the Lumen, a few example `(input events →
expected state)` traces; Tier 2 runs them in the interpreter and ships the Lumen
only if they pass — converting a class of silent-wrong generation into a
caught-before-render failure. Preset/idiom **assembly** (§8) stays the primary
path; novel cold authoring is a strong-model job with a real failure rate, and
this gate plus declared invariants (§2.7) are its safety net.

Open tuning items (gas/frame/state caps, the **kernel-gas schedule and v1.1
kernel cut**, wakeup-budget caps for `tick`+`timer`, the capability-broker egress
contract — rate/quota/max-in-flight/idempotency/backpressure, **session-scoped
consent budgets**, LX std-lib surface, scene perf ceiling, capability-consent
granularity, determinism-vs-real-time, LLM reliability emitting LX, preset
trust/distribution) are enumerated in `interactivity-concept.md` §13 — research
items, not unspecified holes.
