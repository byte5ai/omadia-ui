# Omadia UI — Iconography (proposal)

> **Icons are first-class GUI vocabulary — 40 years of evidence — and Omadia's
> generative layer currently has none of it.** This proposal closes the gap:
> an additive protocol affordance (icon trait + opaque `iconRef`), a swappable
> `iconResolver@1` capability with three sources (`app:` / `lib:` / `gen:`), and
> a deferred `iconGenerator@1` so a future image-gen integration (nano-banana,
> gpt-image-2, …) is a late-bound add, not a refactor.

**Status:** proposal / RFC. Targets **protocol 1.1** (additive) + **visual-spec
§2.12** (rewrite). Companion to [`protocol/1.0.md`](protocol/1.0.md) and
[`visual-spec.md`](visual-spec.md). Not yet merged into either canonical spec.

## 0. The finding (verified against the repo)

| Where | Today |
|---|---|
| `protocol/1.0.md`, `CONCEPT.md`, `lumens-spec.md` | the string `icon` appears **zero times**. No `icon` primitive among the 24; no `icon` among the §2.2 cross-cutting traits. |
| `visual-spec.md §2.12` | "Lucide as the icon library, 14/16/20/24 px, 1.5/1.75/2.0 stroke. **Three** documented custom icons allowed (`magic-wand`, `brush-pressure`, `vector-pen-anchor`)." |
| `visual-spec.md §4` (`status`, search, error view) | primitives render a **renderer-chosen** glyph from fixed semantics (search box → search glyph, error → `alert-triangle`). |

**Consequence.** Icons live only in the **chrome** the renderer draws from a
closed, hardcoded vocabulary. Tier 2 — the agent that *materialises* the
content — has **no field by which to name a glyph**. It cannot place a calendar
icon on a list item, a status glyph on a card, or an action glyph on a button it
just composed. For a "next-gen generative UI" this is the one classical GUI
element the generative layer forgot. And the **3-custom-icon cap directly
contradicts** the product direction of *generate-on-demand + user-picked
library*.

## 1. Not re-specified here (already canon)

To keep scope honest — these are already load-bearing in `visual-spec.md` and
must **not** be duplicated by this proposal:

| Principle | Where |
|---|---|
| Accent reserved for the agent's live attention / active state; never decoration | §1.2 "Accent as illumination", §2.5 "one accent slot" |
| No status-pill salad; semantic state is text-only | §0 constraint 4, §2.6 |
| Chrome recedes, data dominates; cards carry no shadow, frameless-first | §0 constraint 3, §2.10, §2.13 |

This proposal only adds the **missing icon vocabulary** and its resolution path.

## 2. Design constraints this must respect

1. **Single material.** Icons are part of Lume, not a second visual language.
   Every resolved glyph — bundled, library, or generated — renders as a
   **monochrome line glyph** in the §2.12 house style (stroke 1.5–2.0, on the
   24-grid, single `currentColor`). This is also the spec that turns "generate
   an icon" from free-form image-gen into a constrained, on-material request.
2. **One accent slot.** An icon tints to a **text token by default**; it takes
   `accent` **only** when it marks live/active state (honouring §1.2). Colour is
   never carried *in* the glyph.
3. **Whitelist discipline.** The protocol rejects unknown primitives/traits
   (§2 of 1.0). Icon references are validated the same way; supplied SVG is
   sanitised, not trusted (§6).
4. **Forward-compatible & late-bound.** The generator does not exist today and
   must not need to. Reference and resolution are decoupled now so it slots in
   later with no wire bump (the `provides`/`requires` pattern).

## 3. Protocol 1.1 — the affordance (additive)

### 3.1 `icon` cross-cutting trait

Add `icon` to the §2.2 trait list. Any primitive may carry it; the renderer
places it in the primitive's leading-glyph slot (`button`, `list`/`tree` item,
`choice`, `menubar`/`toolbar` item, `status`, `heading`). The value is an
**opaque `IconRef` token** — never inline image bytes on the common path.

```json
{ "type": "list", "items": [
  { "itemKey": "k1", "text": "Design review", "icon": "app:calendar" },
  { "itemKey": "k2", "text": "Deep work",     "icon": "app:focus", "iconState": "active" }
] }
```

- `icon: IconRef` — a namespaced token (§3.3).
- `iconState?: "default" | "active"` — `active` tints to `accent` (§2.5),
  default tints to the inherited text token. This is the *only* icon colour
  control; it routes through the accent-discipline rather than around it.

A standalone **`icon` primitive** (the 25th) is added for icon-only affordances
(rail buttons, dock items) where there is no host primitive to hang the trait
on: `{ "type": "icon", "ref": "app:home", "action": {…}, "label": "Home" }`.
`label` is required for accessibility even when visually icon-only (the
icon-only rail/dock is legitimate *because* the function is learned — novel,
unlearned glyphs still ship a visible label; see §5.4).

### 3.2 Old clients ignore it

`icon`/`iconState` are additive 1.1 fields; a 1.0 client ignores them and
renders text-only — graceful degradation per §0 of the protocol. No major bump.

### 3.3 `IconRef` grammar — three namespaces

```
IconRef := "app:" <name>            // bundled, curated, design-controlled
         | "lib:" <dataRefId>       // user-picked from a library (a DataRef)
         | "gen:" <dataRefId>       // generated, content-addressed (a DataRef)
```

| NS | Source | Who controls | Generatable | Precedence |
|---|---|---|---|---|
| `app:` | Lucide names + the curated custom set | design system | never — **reserved/immutable** | highest; cannot be shadowed by `lib:`/`gen:` |
| `lib:` | user-installed icon sets | user | no | middle |
| `gen:` | image-gen agent output | generator | yes | lowest |

`app:` resolves against Lucide + the §2.12 custom glyphs. The **agent-facing
vocabulary is a curated subset** of those names (decided — *not* the full Lucide
set): a smaller, well-chosen vocabulary yields more consistent agent output,
while the renderer can still resolve any bundled glyph for chrome. *This is what
finally lets the agent place icons*: it emits `app:calendar`, the renderer draws
Lucide `calendar`. Reserving `app:` immutable stops user/generated glyphs from
silently replacing chrome icons (trust + consistency).

### 3.4 `lib:` / `gen:` icons **are** DataRefs (reuse, don't reinvent)

A library or generated glyph is an SVG buffer. The protocol already
content-addresses and signs buffers: `DataRef.id = <kind>-<sha256(content)[:16]>`
(§4 of 1.0). So `lib:`/`gen:` icons ride the **existing DataRef machinery** —
`icon-<sha256>` — gaining dedup, HMAC signing, expiry and the
`surface_data_ref_*` lifecycle for free. No new buffer transport.

Content-addressing also makes generated icons **deterministic and shareable**:
the same generation request → the same `gen:<hash>` → cache hit, and every
viewer of a shared canvas resolves the identical token (consistent with the
shared-canvas forward-compat rules).

## 4. `iconResolver@1` — resolution capability

A Tier-1 service (Omadia `ctx.services.provide/get/replace`) that turns an
`IconRef` into a rendered glyph. Contract:

```
resolve(ref: IconRef): GlyphSource | Miss
```

Implemented as an **ordered provider chain**; registration order = precedence:

1. **app-set provider** — `app:` → Lucide/custom lookup. Always present.
2. **library provider** — `lib:` → DataRef fetch from the installed set.
3. **generative fallback** — `gen:` → §5. **Optional**, absent by default.

A `Miss` renders the documented placeholder glyph (never a broken image, never
silent text-substitution that shifts layout). Resolution is render-time; the
wire only ever carries the token.

## 5. `iconGenerator@1` — deferred capability (define now, build later)

The generative source is a **late-bound** capability. Define the contract now;
ship no implementation until someone integrates a backend.

- The generative provider in the resolver chain declares
  `requires: iconGenerator`. **Today absent** → that chain link is a no-op,
  `gen:` refs miss to the placeholder. **Later present** (someone wires
  nano-banana / gpt-image-2 / …) → `gen:` refs resolve. Nothing upstream of the
  resolver changes; no protocol bump.

### 5.1 Generation contract — constrained, not free-form

```
generate(spec: IconSpec): SvgGlyph
IconSpec := { description, style: HOUSE_ICON_STYLE, size, semantic? }
```

`HOUSE_ICON_STYLE` is **not free text** — it is the existing §2.12 descriptor:
monochrome single-stroke line glyph, stroke 1.5–2.0, 24-unit grid, single
`currentColor`, no fills, no embedded colour, no raster. This is what preserves
the original intent of the 3-custom-icon cap (consistency) while removing the
cap: generated glyphs are constrained into the house language instead of
forbidden. A generator that returns anything else is rejected at ingest (§6).

### 5.2 Output → token

A generated SVG is sanitised (§6), stored as a DataRef, and addressed
`gen:<sha256>`. The resolver caches by that token; identical specs never
re-generate.

### 5.3 Who triggers generation

- **User** ("make me an icon for this kiosk action") → explicit, the common
  case, matches "user picks from a library" extended to "user commissions one".
- **Agent** → only when no `app:`/`lib:` match exists *and* the surface
  genuinely needs a glyph; generation is a tool call with latency and cost, so
  the agent prefers an existing `app:` token. Never speculative.

### 5.4 Don't overcorrect (the one anti-pattern)

Icon-only is proven for **learned, stable** functions (macOS dock, taskbar,
mobile home screen) — that is exactly the `app:` chrome (rail/dock). For
**novel, generated** glyphs nobody has learned, icon-only is mystery-meat:
`gen:`/`lib:` icons in content **ship with a visible label** (the §3.1 `label`),
icon-only only after the meaning is established. Progressive disclosure, not
label-removal.

## 6. Security surface (extends §9 of 1.0)

- **`app:` is a closed set** — an unknown `app:` name → `surface_error`, same as
  an unknown primitive.
- **`lib:`/`gen:` SVG is sanitised, never trusted.** Strip `<script>`, event
  handlers, external/`xlink:href` refs, `<foreignObject>`, CSS `url()`; allow
  only the geometry subset (`path`/`circle`/`rect`/`line`/`polyline`/`g` +
  presentation attrs). Supplied SVG is an injection surface; the whitelist
  philosophy of §2 applies to glyphs too.
- **Single-colour enforcement** — ingest rejects multi-colour / raster glyphs;
  fills are normalised to `currentColor`. Keeps icons on-material and prevents
  colour smuggling around the one-accent-slot rule.
- **DataRef signing** — `lib:`/`gen:` icons inherit §9 HMAC scope/expiry.

## 7. `visual-spec §2.12` — replacement text (ready for PR)

> **§2.12 Icons.** Three sources, one material. **Bundled (`app:`)** — Lucide
> (14/16/20/24 px, 1.5/1.75/2.0 stroke) plus the curated custom glyphs; the
> design-controlled, immutable set the agent references by name. **Library
> (`lib:`)** — user-installed icon sets, picked per canvas. **Generated
> (`gen:`)** — produced on demand by `iconGenerator` (deferred) and constrained
> to the house style below. The earlier hard cap of "three custom icons" is
> **retired** — superseded by the constraint, not the count: every icon,
> whatever its source, is a **monochrome single-stroke line glyph**, stroke
> 1.5–2.0, on the 24-grid, single `currentColor`, no fills, no raster. Colour is
> never in the glyph: an icon tints to a text token by default and to `accent`
> only via `iconState: "active"` (§1.2). See `docs/iconography.md` for the
> protocol affordance, the resolver, and the generation contract.

## 8. Decisions & open questions

**Decided (CW, 2026-06-20):**

1. **Keep the standalone `icon` primitive** (the 25th, §3.1). Trait-only would
   force every icon onto a host primitive; the primitive carries the icon-only
   rail/dock affordance and its mandatory-`label` a11y contract.
2. **`app:` exposes a curated subset** of Lucide names to the Skill, *not* the
   full set — smaller vocabulary → more consistent agent output (§3.3).

**Still open:**

3. `lib:` distribution — bundled-with-plugin sets vs. a user-importable format.
4. Placeholder glyph design for a resolver `Miss`.
5. The exact curated subset — which Lucide names form the agent vocabulary, and
   the governance for growing it.
