# Omadia UI — Visual Specification

> The single shipped Omadia theme. Tokens, per-primitive visuals, composition idioms,
> motion language. Precise enough that two independent implementers produce the same
> result.

Version 0.1 — first draft, written against [`../CONCEPT.md`](../CONCEPT.md) v0.7,
[`./walkthroughs.md`](./walkthroughs.md), [`./tech-stack.md`](./tech-stack.md).
Codex-review-ready in the CONCEPT.md cadence (2–3 review rounds expected before
implementation freeze).

---

## 0. How to read this document

- All values are **semantic tokens**, never raw `#hex`. Implementers consume them
  through a `tokens` module; raw values appear in **exactly one** place — the token
  definitions in §1. Anything that reaches for a hex code outside §1 is a bug.
- Tables are the primary format. ASCII wireframes appear where layout matters more
  than pixel-precise visuals. Pixel mockups for `canvas-region`, `timeline`, `media`
  are explicitly out of scope (§7).
- Rationale blocks appear under headings prefixed **"Rationale —"**. They document
  the alternatives that were weighed; reviewers should challenge the rationale, not
  just the choice.
- The spec is normative for v1. Forward-compat notes (e.g. shared-canvas presence
  surfaces) are advisory.

### Non-negotiable constraints inherited from CONCEPT.md

1. **Single shipped theme.** No skinning, no era mimicry. Era references resolve to
   layout idioms, not visuals.
2. **macOS-first.** Windows next, Linux power-user subset. macOS rendering quality
   is the bar.
3. **Data-dominant typography.** Data has visual weight; chrome recedes. Hierarchy
   is typographic, not chromatic.
4. **One accent slot.** No status-pill salad (rot/grün/gelb verboten).
5. **Skeletons, no spinners** for loading (single documented exception in §5).
6. **Keyboard-first.** Visible focus, ⌘K palette, full arrow-key reach.
7. **Editor-class first-class.** `canvas-region`, `timeline`, `media`, `vector-path`
   must render credibly in the same theme that renders a table.

### Reference apps (orientation, never mimicry)

- **Linear** — typography rigour, density, focus rings, command palette UX.
- **Things 3** — restraint, generous whitespace, single soft accent.
- **Raycast** — Spotlight idiom; compact result lists; mono-leaning utility feel.
- **Apple Design Resources (latest)** — native macOS rhythm, control shape, motion.
- **Notion (light mode)** — typographic hierarchy, content-dominant pages.
- **Tremor** — restrained, on-brand charts; muted palette discipline.
- **shadcn-ui** — component composability and token discipline.

**Explicitly NOT references:** Confluence, Microsoft Teams, JIRA Cloud (enterprise
clutter), Figma sidebars (too many panels), Slack (single-conversation paradigm).

---

## 1. Design Tokens

All colour tokens are expressed in **OKLCH** with `L C h`. OKLCH is chosen over HSL
because:

- Perceptual L: same `L` value reads at the same lightness across hues. HSL fails
  here — `hsl(60 100% 50%)` (yellow) is visually much lighter than
  `hsl(240 100% 50%)` (blue) at the same `L`.
- Wide-gamut friendly. Display-P3 on modern Macs renders Omadia's accent at higher
  chroma than sRGB without re-authoring tokens.
- Trivially convertible to sRGB hex for legacy renderers. Conversion lives in the
  token-build step, not in product code.

If a renderer can't consume OKLCH directly (older CSS engines, native Cocoa drawing
APIs without colour-space conversion), the token-build step emits a parallel sRGB
hex map. **OKLCH is the source of truth, sRGB hex is generated.**

### 1.1 Colour — Light mode

#### Background hierarchy

| Token                | OKLCH               | sRGB approx | Use                                              |
|----------------------|---------------------|-------------|--------------------------------------------------|
| `bg.canvas`          | `0.99 0.002 250`    | `#FCFCFD`   | Workspace background (the agent's "blank page")  |
| `bg.surface`         | `0.985 0.003 250`   | `#FAFAFC`   | Primary content surface inside containers        |
| `bg.surface.raised`  | `1.00 0 0`          | `#FFFFFF`   | Card-like raised surfaces, popovers, inputs      |
| `bg.surface.sunken`  | `0.97 0.004 250`    | `#F4F4F7`   | Code blocks, table cell hover, secondary panels  |
| `bg.modal.overlay`   | `0.20 0.01 250 / 0.40` | rgba(black,0.40) | Scrim behind modal panes                  |
| `bg.modal.surface`   | `1.00 0 0`          | `#FFFFFF`   | Modal pane interior                              |

#### Text hierarchy

| Token              | OKLCH              | sRGB approx | Use                                        |
|--------------------|--------------------|-------------|--------------------------------------------|
| `text.primary`     | `0.22 0.01 250`    | `#1B1D24`   | Headings, body, data values                |
| `text.secondary`   | `0.45 0.01 250`    | `#5B5F6B`   | Labels, captions, axis ticks               |
| `text.tertiary`    | `0.62 0.01 250`    | `#8D9099`   | Hints, placeholders, low-priority metadata |
| `text.disabled`    | `0.78 0.005 250`   | `#BFC1C6`   | Disabled controls                          |
| `text.inverse`     | `0.99 0.002 250`   | `#FCFCFD`   | Text on accent or dark surfaces            |
| `text.accent`      | `0.55 0.16 235`    | `#0F7AB8`   | Links, accent-emphasised values            |

#### Border

| Token              | OKLCH              | sRGB approx | Use                                              |
|--------------------|--------------------|-------------|--------------------------------------------------|
| `border.subtle`    | `0.93 0.004 250`   | `#E6E7EB`   | Default container, table cell, divider           |
| `border.default`   | `0.88 0.005 250`   | `#D6D7DB`   | Input borders, button outlines                   |
| `border.strong`    | `0.72 0.008 250`   | `#A4A6AC`   | Pressed state, prominent edges                   |
| `border.focus`     | `0.55 0.16 235`    | `#0F7AB8`   | Focus ring (= accent)                            |

#### Accent (the single slot)

| Token               | OKLCH              | sRGB approx | Use                                              |
|---------------------|--------------------|-------------|--------------------------------------------------|
| `accent`            | `0.55 0.16 235`    | `#0F7AB8`   | Primary actions, focus rings, selection edges    |
| `accent.hover`      | `0.50 0.17 235`    | `#0C6CA8`   | Hover state for accent fills                     |
| `accent.active`     | `0.45 0.17 235`    | `#0A5E94`   | Pressed state for accent fills                   |
| `accent.subtle`     | `0.96 0.025 235`   | `#E5F0F8`   | Selected row tint, accent background wash        |
| `accent.subtle.hover` | `0.93 0.035 235` | `#D6E7F2`   | Hover over already-selected accent-subtle rows   |

#### Semantic states (intentionally muted — see Rationale)

| Token               | OKLCH              | sRGB approx | Use                                              |
|---------------------|--------------------|-------------|--------------------------------------------------|
| `state.loading`     | `0.90 0.008 250`   | `#DCDEE3`   | Skeleton fill base                               |
| `state.loading.hi`  | `0.96 0.004 250`   | `#EFEFF2`   | Skeleton pulse highlight                         |
| `state.error.fg`    | `0.45 0.12 25`     | `#A8443B`   | Error text — never used as a pill background     |
| `state.error.edge`  | `0.55 0.14 25`     | `#C45A50`   | Error border on a field (1px, not a block fill)  |
| `state.success.fg`  | `0.42 0.10 150`    | `#3F7A55`   | Confirmation text — text only, no green pill     |
| `state.warning.fg`  | `0.50 0.09 80`     | `#8C6A1F`   | Warning text — text only, no yellow pill         |

**Rationale — semantic states as text-only, never as filled pills.** Three reasons:

1. CONCEPT.md forbids the status-pill salad by name. Implementers reading the
   constraint will reflexively reach for a red badge — we make that impossible by
   not shipping `bg.error` / `bg.success` / `bg.warning` tokens.
2. In a data-dominant UI, the row, the value, the column header carry the meaning.
   "AcmeInsure overdue" is louder when "overdue" sits next to "AcmeInsure" in body
   text than when a tomato badge floats next to it.
3. Single accent already covers "this thing is selected / focused / actionable".
   That is what users scan for. Adding more colour categories competes with the
   accent and dilutes it.

Where a state needs visual weight (an error on a form field, a failed sub-agent),
the affordance is: **1px coloured border + inline message in coloured text**. No
filled pill, no large filled block. See §4.13 `form` and §5.3 error patterns.

#### Rationale — single accent: the colour choice

Candidates considered, with single-line summary:

| Candidate                         | OKLCH approx     | Why                                                | Why not                                                                  |
|-----------------------------------|------------------|----------------------------------------------------|--------------------------------------------------------------------------|
| Linear indigo (`#5E6AD2`-ish)     | `0.55 0.17 280` | Familiar, signals "modern productivity"           | Too close to Linear's brand; we don't want to read as a Linear clone     |
| Things sky-blue                   | `0.65 0.15 240` | Calm, soft                                         | Reads as "consumer app", not enough gravity for editor workloads         |
| Raycast bright red                | `0.60 0.21 25`  | Distinctive, energetic                             | Red as accent collides with `state.error.*`; same-channel ambiguity      |
| **Selected — petrol/steel-blue** | `0.55 0.16 235` | Cool, slightly desaturated; signals "synthesised, live, on-canvas"; clearly not Linear; reads well in dark mode at higher chroma; mathematically separable from any error-red usage | — |
| Warm copper                       | `0.62 0.13 60`  | Differentiated from every reference app           | Risk: too "branded", drifts toward designer-app aesthetic                |

The selected accent (`#0F7AB8` ≈ OKLCH `0.55 0.16 235`) is a desaturated
petrol/steel-blue at 235°. Cool enough to recede when used as a row tint, saturated
enough to anchor focus rings and primary CTAs. Distinct from every reference app
listed; distinct from `state.error.*` (25°) by 210° on the hue circle, so colour-
blindness simulators don't merge them.

### 1.2 Colour — Dark mode

Same semantic structure, OKLCH-flipped. The relationship between tokens is preserved
(e.g. `text.primary` stays the most prominent text token).

#### Background hierarchy

| Token                | OKLCH               | sRGB approx | Use                                              |
|----------------------|---------------------|-------------|--------------------------------------------------|
| `bg.canvas`          | `0.16 0.01 250`     | `#1F2127`   | Workspace background                             |
| `bg.surface`         | `0.19 0.01 250`     | `#262830`   | Primary content surface                          |
| `bg.surface.raised`  | `0.22 0.012 250`    | `#2C2F38`   | Raised surfaces, popovers, inputs                |
| `bg.surface.sunken`  | `0.14 0.01 250`     | `#1A1C22`   | Sunken (code, hover, secondary)                  |
| `bg.modal.overlay`   | `0.05 0.005 250 / 0.60` | rgba(black,0.60) | Modal scrim                              |
| `bg.modal.surface`   | `0.22 0.012 250`    | `#2C2F38`   | Modal pane interior                              |

#### Text hierarchy

| Token              | OKLCH              | sRGB approx | Use                                        |
|--------------------|--------------------|-------------|--------------------------------------------|
| `text.primary`     | `0.96 0.005 250`   | `#EEEFF3`   | Headings, body, data values                |
| `text.secondary`   | `0.75 0.008 250`   | `#B6B9C3`   | Labels, captions                           |
| `text.tertiary`    | `0.58 0.008 250`   | `#888B95`   | Hints, placeholders                        |
| `text.disabled`    | `0.38 0.008 250`   | `#525561`   | Disabled                                   |
| `text.inverse`     | `0.16 0.01 250`    | `#1F2127`   | Text on accent / inverse                   |
| `text.accent`      | `0.72 0.13 235`    | `#52B0E2`   | Links, accent-emphasised values            |

#### Border

| Token              | OKLCH              | sRGB approx | Use                                              |
|--------------------|--------------------|-------------|--------------------------------------------------|
| `border.subtle`    | `0.27 0.012 250`   | `#363944`   | Default container edges                          |
| `border.default`   | `0.34 0.013 250`   | `#454854`   | Input borders                                    |
| `border.strong`    | `0.50 0.014 250`   | `#71747F`   | Pressed, prominent                               |
| `border.focus`     | `0.72 0.13 235`    | `#52B0E2`   | Focus ring (= accent in dark mode)               |

#### Accent — Dark mode

| Token               | OKLCH              | sRGB approx | Use                                              |
|---------------------|--------------------|-------------|--------------------------------------------------|
| `accent`            | `0.72 0.13 235`    | `#52B0E2`   | Primary actions, focus rings, selection edges    |
| `accent.hover`      | `0.78 0.13 235`    | `#74C0E8`   | Hover                                            |
| `accent.active`     | `0.82 0.12 235`    | `#90CFEE`   | Pressed                                          |
| `accent.subtle`     | `0.32 0.04 235`    | `#2C404F`   | Selected row tint                                |
| `accent.subtle.hover` | `0.36 0.045 235`| `#34495A`   | Hover over selected                              |

#### Semantic states — Dark mode

| Token               | OKLCH              | sRGB approx | Use                                              |
|---------------------|--------------------|-------------|--------------------------------------------------|
| `state.loading`     | `0.30 0.01 250`    | `#3E414C`   | Skeleton base                                    |
| `state.loading.hi`  | `0.38 0.012 250`   | `#525561`   | Skeleton highlight                               |
| `state.error.fg`    | `0.75 0.12 25`     | `#E08577`   | Error text                                       |
| `state.error.edge`  | `0.65 0.14 25`     | `#C5685A`   | Error border                                     |
| `state.success.fg`  | `0.78 0.10 150`    | `#88C499`   | Success text                                     |
| `state.warning.fg`  | `0.80 0.09 80`     | `#D6B468`   | Warning text                                     |

**Rationale — accent flip in dark mode.** The light-mode accent at L=0.55 reads as
"deep blue" against white. In dark mode the same L drowns in the background. The
dark-mode accent moves to L=0.72 with reduced chroma (0.13 → preserves identity).
Test: place both accents in their respective modes next to body text — both should
read at the same "perceptual weight". Implementers verifying the dark theme should
not use light-mode `accent` literally.

#### Theme switching

- macOS: follow system appearance by default; user can override via ⌘K → "Set
  appearance to ...".
- Windows / Linux: follow OS dark-mode preference; user override identical.
- No mid-session animation between modes (CONCEPT.md "instant deterministic
  rendering" principle). Theme swap is paint-only, no transitions.

### 1.3 Typography

#### Type families

| Role            | Family                   | Fallback                                              |
|-----------------|--------------------------|-------------------------------------------------------|
| UI sans         | **Inter** (variable)     | `system-ui, -apple-system, "Segoe UI", sans-serif`    |
| Mono            | **JetBrains Mono**       | `ui-monospace, "SF Mono", Menlo, Consolas, monospace` |
| Display (rare)  | **Inter Display**        | Same as UI sans (variable axis covers display)        |

**Rationale — Inter, not SF Pro.** SF Pro is the native macOS system font and
would read most native there. But:

- Electron is the chosen runtime (`docs/tech-stack.md`). Inter rendering through
  Skia is identical on macOS, Windows, Linux. SF Pro is licensed for macOS Cocoa
  rendering, not freely embeddable.
- Linear, Vercel, Notion, Things 3 (newer builds) all use Inter or a near-Inter
  variant — the reference apps. Users reading Omadia next to Linear will not feel
  a typeface clash.
- Inter's variable axis (weight 100–900, slant) lets us ship one file and address
  every weight we need. SF Pro requires separate font assets per weight.

**Rationale — JetBrains Mono, not SF Mono / Menlo.** JetBrains Mono has:

- Generous x-height (data tables read at smaller sizes without losing legibility).
- Distinguishable `0` / `O`, `1` / `l` / `I` (correctness matters for financial
  data — Walkthrough 1's ERP budget column).
- Open ligatures (`->`, `>=`) — useful in code blocks and TUI-style layouts where
  the agent renders bash output or terminal-style diffs.

Mono **is not a stylistic flourish**. It is the typographic anchor for the
"Norton Commander" idiom (data-grid panels, terminal-feel data dumps), for code
blocks in research walkthroughs (Walkthrough 4), and for any column where digit
alignment matters (table financial columns). The single-mono-everywhere choice
makes the Omadia idiom coherent.

#### Type scale (semantic)

All sizes are in `rem`, base `1rem = 16px`. Line heights are unitless.

| Token                | Size            | Line height | Weight | Letter-spacing | Role                                              |
|----------------------|-----------------|-------------|--------|----------------|---------------------------------------------------|
| `type.display`       | `1.75rem` (28px) | `1.20`      | 600    | `-0.01em`      | Rare. Welcome surfaces, top-level pane title in editor workspace |
| `type.heading.1`     | `1.375rem` (22px) | `1.25`     | 600    | `-0.005em`     | Canvas-level title, top of a `container` group     |
| `type.heading.2`     | `1.125rem` (18px) | `1.30`     | 600    | `0em`          | Section heading inside a container                 |
| `type.heading.3`     | `0.9375rem` (15px) | `1.35`    | 600    | `0em`          | Sub-section, table-group header                    |
| `type.body`          | `0.875rem` (14px) | `1.50`     | 400    | `0em`          | Default UI text, paragraph copy                    |
| `type.body.strong`   | `0.875rem` (14px) | `1.50`     | 600    | `0em`          | Inline emphasis; column-header text in tables      |
| `type.body.compact`  | `0.8125rem` (13px) | `1.45`    | 400    | `0em`          | Dense table rows, `style: "compact"` containers    |
| `type.caption`       | `0.75rem` (12px) | `1.40`      | 400    | `0.005em`      | Labels above inputs, timestamps, axis ticks        |
| `type.caption.strong`| `0.75rem` (12px) | `1.40`      | 600    | `0.02em`       | Uppercase eyebrow labels (sparingly)               |
| `type.mono.data`     | `0.8125rem` (13px) | `1.45`    | 450    | `0em`          | Numeric table cells, code snippets, terminal lines |
| `type.mono.code`     | `0.8125rem` (13px) | `1.55`    | 400    | `0em`          | Multi-line code blocks                             |

Weight `450` for `mono.data` uses a variable-axis intermediate weight: slightly
heavier than 400 so digits hold up against denser table backgrounds, but lighter
than 600 so they don't shout.

**Rationale — no Helvetica-massive headings.** A typical "marketing UI" tops out at
40–60px display. We cap at 28px because:

- Omadia is a work surface, not a landing page. There is no hero.
- Data is the protagonist. Headings above 28px steal attention from data.
- The largest text on screen at any given moment should be either a `text` primitive
  used as a hero quote (rare, user-chosen) or a single `heading.1` per canvas.

#### Letter-spacing and weight discipline

- Headings: tighter than body (-0.005em to -0.01em). Counteracts the visual
  loosening that bigger sizes cause.
- Caption-strong (uppercase eyebrows): wider tracking (+0.02em). Uppercase always
  needs more space.
- Body: zero tracking. Inter is metrically correct at body sizes.
- Weights used: 400, 450 (mono only), 600. Anything else is forbidden — no
  300 (too light at body sizes), no 500 (collides with 600 perceptually), no 700+
  (heavy weights compete with accent).

### 1.4 Spacing

4pt grid. **Not** 8pt — 4pt offers the density required for editor workloads
(toolbar button spacing, inspector field rows) without forcing implementers to use
fractional values.

| Token       | Value   | Use                                                                    |
|-------------|---------|------------------------------------------------------------------------|
| `space.0`   | `0`     | Touching edges                                                         |
| `space.1`   | `2px`   | Hairline gap between same-group icons; sub-pixel-feeling adjustments   |
| `space.2`   | `4px`   | Default gap inside a tight group (input + clear button)                |
| `space.3`   | `8px`   | Default gap in a row of controls, between list items in compact density |
| `space.4`   | `12px`  | Default block spacing inside a container; default `gap` of a stack      |
| `space.5`   | `16px`  | Default container padding; section gap                                  |
| `space.6`   | `24px`  | Generous block spacing; spacious density default                        |
| `space.7`   | `32px`  | Top-of-canvas padding; sectional dividers                               |
| `space.8`   | `48px`  | Major layout gaps (left rail to content area)                           |
| `space.9`   | `64px`  | Reserved for explicit "breathing-room" placements (rare)                |

Density variants apply a per-primitive override (see §4): `style: "compact"` shifts
defaults one step down, `style: "spacious"` shifts one step up.

### 1.5 Border radii

| Token        | Value  | Use                                                       |
|--------------|--------|-----------------------------------------------------------|
| `radius.0`   | `0`    | Tables, panes, canvas-region (engineering surfaces)       |
| `radius.sm`  | `4px`  | Inputs, buttons, list-item hover/selected backgrounds      |
| `radius.md`  | `6px`  | Containers, cards, popovers                                |
| `radius.lg`  | `8px`  | Modals, raised cards (only one elevation step above `md`)  |
| `radius.pill`| `999px`| Pill chips (badge primitive, rare; status indicators)      |

**Rationale — restrained radii.** Things 3 uses ~10px on cards; Notion ~6px on
blocks; Linear ~6–8px. We pick 6px for containers because the canvas is dense; a
larger radius would create visible empty corners between adjacent containers and
break the data-grid feel.

`radius.0` exists explicitly so editor workloads (Photoshop workspace) have
sharp-corner surfaces. A pixel editor with rounded corners reads "consumer photo
app", not "professional tool".

### 1.6 Elevation / shadows

Sparing. Almost everything sits flat on `bg.canvas` or `bg.surface`. Elevation is
for **temporally raised** surfaces: popovers, dropdowns, modals, drag-in-flight.

| Token           | Light                                                | Dark                                                  | Use                                  |
|-----------------|------------------------------------------------------|-------------------------------------------------------|--------------------------------------|
| `elev.0`        | none                                                 | none                                                  | Flat content surfaces                |
| `elev.popover`  | `0 1px 2px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.06)` | `0 1px 2px rgba(0,0,0,0.30), 0 4px 12px rgba(0,0,0,0.40)` | Dropdowns, popovers, hover cards     |
| `elev.modal`    | `0 4px 8px rgba(0,0,0,0.06), 0 16px 32px rgba(0,0,0,0.10)` | `0 4px 8px rgba(0,0,0,0.40), 0 16px 32px rgba(0,0,0,0.55)` | Modal panes                          |
| `elev.drag`     | `0 8px 24px rgba(0,0,0,0.16)`                        | `0 8px 24px rgba(0,0,0,0.50)`                          | Drag-in-flight ghost preview         |

No "card" elevation. Cards are differentiated by **border + radius**, not by
shadow. This is a deliberate departure from Material Design and an alignment with
Linear / Things / Apple Catalyst.

### 1.7 Motion

| Token            | Value                                  | Use                                                 |
|------------------|----------------------------------------|-----------------------------------------------------|
| `motion.instant` | `0ms`                                  | Theme switch, scroll jumps, focus moves on tab nav  |
| `motion.quick`   | `100ms`                                | Hover state, focus ring fade-in                     |
| `motion.smooth`  | `200ms`                                | Modal open/close, accordion expand, patch fade-in   |
| `motion.deliberate` | `320ms`                             | Reserved — used only for canvas-activate transitions between Spaces |
| `easing.standard`| `cubic-bezier(0.22, 0.61, 0.36, 1.00)` | Most transitions (decelerate-out)                   |
| `easing.emphasis`| `cubic-bezier(0.4, 0.0, 0.2, 1.0)`     | Bigger moves (modal scale-in, full snapshot replace) |
| `easing.linear`  | `linear`                               | Skeleton pulse                                      |

#### Skeleton pulse

`@keyframes skeleton-pulse`:

```text
0%   { background-position: -200% 0; }
100% { background-position:  200% 0; }
```

- Duration: `1400ms`, `linear`, infinite.
- Gradient: `linear-gradient(90deg, state.loading 0%, state.loading.hi 50%, state.loading 100%)` at 400% width.
- Reduced-motion: pulse disabled, skeleton renders as static `state.loading` fill.

#### Reduced motion

When the OS reports `prefers-reduced-motion: reduce`:

- `motion.quick` → `0ms`. (Hover/focus changes still happen, just without fade.)
- `motion.smooth` → `0ms`. (Modal opens instantly.)
- `motion.deliberate` → `0ms`.
- Skeleton pulse → static.
- Patch-apply highlight (§5.1) → no fade-out; the highlight simply isn't drawn.

### 1.8 Icons

**Library: Lucide.** Stroke-based, MIT-licensed, ~1100 icons, actively maintained,
React/Vue/Svelte/HTML bindings — covers every Electron renderer choice.

Heroicons was the runner-up; rejected because:

- Two-style split (outline vs. solid) tempts implementers to mix metaphors.
- Smaller icon set; editor workloads (brush, magic-wand, vector-pen, timeline-
  scrub) hit gaps faster.

Custom icons forbidden in v1 except where Lucide has no equivalent:

- Three documented exceptions allowed: `magic-wand` (selection tool), `brush-pressure`
  (pressure-sensitive brush variant), `vector-pen-anchor` (path-anchor handle).
  These ship in `assets/icons/custom/` and follow Lucide stroke/width conventions
  exactly.

#### Icon sizes (semantic)

| Token             | Size  | Stroke | Use                                          |
|-------------------|-------|--------|----------------------------------------------|
| `icon.xs`         | 12px  | 1.5    | Inline with caption text                     |
| `icon.sm`         | 14px  | 1.5    | Inline with body text                        |
| `icon.md`         | 16px  | 1.75   | Buttons, toolbar default                     |
| `icon.lg`         | 20px  | 1.75   | Tab indicators, prominent toolbar tools       |
| `icon.xl`         | 24px  | 2.0    | Empty-state illustrations (centred glyph)    |

Stroke width scales with size — preserves perceived weight. Lucide ships
configurable stroke width; the token-build step bakes the right values.

---

## 2. Per-Primitive Visual

For each of the 24 primitives from CONCEPT.md §"The Primitive Vocabulary", this
section specifies: default visual, interactive states, variants, density behaviour,
and edge cases (empty, overflow, error). ASCII wireframes accompany layout-heavy
primitives.

Conventions:

- "Default density" = no `style` override; behaves as if `style: "default"`.
- "Compact" / "Spacious" = `style.density` override.
- "Selected" applies only when the primitive has a `selection` trait.
- Tokens referenced by name (`bg.surface`, `accent`, …); resolve via §1.

### 2.1 `text`

Block or inline copy. The workhorse of agent prose.

| State              | Visual                                                         |
|--------------------|----------------------------------------------------------------|
| Default            | `type.body` / `text.primary`. No background, no border.        |
| Inside heading group | Inherits font from heading; otherwise default                |
| Long prose         | Max width 72ch when not constrained by parent; left-aligned    |
| Inline emphasis    | `type.body.strong` for `<strong>`-equivalent semantics         |
| Inline code        | `type.mono.data` on `bg.surface.sunken` with `radius.sm` padding `0 4px` |

Density:

- Compact: `type.body.compact`.
- Spacious: increased line-height to `1.6` (no size change).

No hover, no focus (text is not interactive). Selection (text-selection by mouse)
uses native OS behaviour with `accent.subtle` highlight tint.

### 2.2 `heading`

Section title. Always renders inside a `container` or pane.

| Level | Token            | Margin-top (within container)                                |
|-------|------------------|--------------------------------------------------------------|
| 1     | `type.heading.1` | First child: 0; otherwise `space.6`                          |
| 2     | `type.heading.2` | First child: 0; otherwise `space.5`                          |
| 3     | `type.heading.3` | First child: 0; otherwise `space.4`                          |

Margin-bottom inside a heading is always `space.3`.

Variants:

- `style.divider: true` — adds a `border.subtle` underline running the full content
  width. Used when the agent wants visual separation under a section heading.
- `style.eyebrow: true` — renders `type.caption.strong` (uppercase eyebrow) above
  the heading at `text.tertiary`.

### 2.3 `container`

Grouping primitive. Optional title, optional border, optional padding.

```
┌──────────────────────────────────────────────┐
│ Optional heading                             │
│                                              │
│  child                                       │
│  child                                       │
│                                              │
└──────────────────────────────────────────────┘
```

Default (no title, no border, no shadow): 0 padding, behaves as a flex group with
`gap: space.4`.

| Variant           | Visual                                                       |
|-------------------|--------------------------------------------------------------|
| `border: true`    | `1px solid border.subtle`, `radius.md`, padding `space.5`    |
| `title: <string>` | `heading.3` at top, `space.3` bottom margin                  |
| `style: compact`  | padding `space.3`, gap `space.3`                             |
| `style: spacious` | padding `space.6`, gap `space.5`                             |
| `style: sunken`   | `bg.surface.sunken`, no border by default                    |
| `style: raised`   | `bg.surface.raised`, `1px solid border.subtle`, `radius.md`  |

Empty container with `title` only: shows title and a tertiary-text placeholder
hint if and only if the agent provides `placeholder`. **Never** ships a default
"This container is empty" string.

### 2.4 `list`

Ordered collection. Vertical by default.

```
─── item label                            ─┐
                                           │ row height: 32px (default)
─── item label                            ─┤
                                           │  hover: bg.surface.sunken
─── selected item                         ─┤  selected: accent.subtle + 2px left bar in accent
                                           │
─── item label                            ─┘
```

| Mode (`selection`) | Visual                                                                  |
|--------------------|-------------------------------------------------------------------------|
| `none`             | Plain rows, hover bg only                                               |
| `single`           | Selected row: `accent.subtle` + 2px `accent` left bar; hover otherwise  |
| `multi`            | Same as single + leading checkbox indicator (toggle primitive embedded) |

Density:

| Density   | Row height | Padding (x/y)   | Type token         |
|-----------|------------|-----------------|--------------------|
| Compact   | 28px       | `space.3` / `space.2` | `type.body.compact` |
| Default   | 32px       | `space.4` / `space.3` | `type.body`         |
| Spacious  | 40px       | `space.5` / `space.4` | `type.body`         |

Focus: keyboard-focused item draws a 2px `border.focus` ring **inset** by 2px (so
the ring doesn't overlap neighbours). Arrow up/down moves focus; Enter triggers the
item's `action`.

Empty: tertiary-text inline hint, 1 line, agent-authored. No icon, no illustration.

Overflow: rows render as-is up to virtualised threshold (declared via trait
`virtualized: true`). Past 200 rows without virtualisation: implementer logs a
warning; rendering is still correct but degrades.

### 2.5 `table`

Rows × columns. The data-aggregation workhorse.

```
┌─────────────────────────────────────────────────────────────────┐
│ OWNER          OPEN TICKETS    BUDGET LEFT (h)    STATUS         │ ← header row
├─────────────────────────────────────────────────────────────────┤
│ Anna Schmidt          12               5.0        out of budget  │
│ Bernd Lutz             8               7.5        under budget   │
│ Cara König            15              22.0        ok             │
└─────────────────────────────────────────────────────────────────┘
```

- Header: `type.body.strong`, `text.secondary`, uppercase tracking optional
  (per-table flag, default off). Row separator: 1px `border.subtle` below header.
- Body rows: `type.body` for text columns, **`type.mono.data` for numeric columns**
  (detected by column declared `kind: 'number' | 'currency' | 'count'`).
- Numeric columns right-aligned. Text columns left-aligned. No vertical separators
  by default.
- Row height: 36px default, 30px compact, 44px spacious.
- Zebra: **off by default**. Reading data depends on alignment, not stripes.
  `style.zebra: true` enables alternating `bg.surface.sunken` on every second row;
  the agent uses this for very wide tables.
- Hover: `bg.surface.sunken` on hovered row.
- Selection (`single` / `multi`): same accent treatment as list. Multi-select shows
  a checkbox in a leading column.
- Sort indicators: small caret in `text.tertiary` next to the active sort column;
  on hover of a sortable column header, caret appears in `text.secondary`.
- Sticky header on scroll: header stays at top, gets `1px solid border.subtle` shadow
  separator (no `elev.popover`, the shadow is purely a divider).

Loading rows:

```
┌─────────────────────────────────────────────────────────────────┐
│ OWNER          OPEN TICKETS    BUDGET LEFT (h)    STATUS         │
├─────────────────────────────────────────────────────────────────┤
│ ▓▓▓▓▓▓▓▓▓▓▓     ▓▓▓▓▓▓▓        ▓▓▓▓▓▓▓             ▓▓▓▓▓▓▓▓▓▓   │ ← skeleton row
│ ▓▓▓▓▓▓▓▓▓       ▓▓▓▓▓▓▓        ▓▓▓▓▓▓▓             ▓▓▓▓▓▓▓▓     │
│ ▓▓▓▓▓▓▓▓▓▓▓▓    ▓▓▓▓▓▓▓        ▓▓▓▓▓▓▓             ▓▓▓▓▓▓▓▓▓    │
└─────────────────────────────────────────────────────────────────┘
```

Skeleton cell width per row is randomised but stable for the lifetime of that row
identifier (so it doesn't flicker between repaints).

Empty: row-area replaced with a single centred tertiary-text line at half-height of
a typical row.

Variant — **highlighted row**: a row with the cross-cutting trait
`style.emphasis: "accent"` renders with `accent.subtle` background and **no** left
bar (left bar is reserved for selection — must remain unambiguous). This is what
Walkthrough 1 step 13 uses to flag "under budget" rows.

### 2.6 `tree`

Hierarchical list. Also serves as **layer-stack** when carrying editor traits.

```
▾ Group                              hover: bg.surface.sunken
   ▾ Subgroup
       Item                          focus: 2px border.focus inset
       Item (selected)               selected: accent.subtle + 2px accent left bar
   ▸ Subgroup (collapsed)
Item
```

- Indent: `space.4` per level.
- Expand/collapse caret: `icon.sm` chevron, `text.tertiary` default,
  `text.secondary` on hover.
- Selection visuals: identical to `list`.
- Drag handle (layer-stack mode only): appears on hover at the right edge of the
  row, `icon.sm` `grip-vertical`, `text.tertiary`.
- Layer trait (when present): row shows leading 16×16 thumbnail (canvas-region
  preview) + visibility toggle (eye icon) + opacity slider on a row hover-popover.

Performance: implementers must implement either virtualisation (preferred for
large trees) or progressive disclosure (collapse-by-default past depth N).

### 2.7 `button`

Action trigger.

| Variant         | Background           | Border              | Text                | Use                                     |
|-----------------|----------------------|---------------------|---------------------|-----------------------------------------|
| `primary` (default if `accent: true`) | `accent` | none | `text.inverse` | One per surface; e.g. "Send", "Generate" |
| `secondary`     | transparent          | `1px border.default`| `text.primary`      | Toolbar default, "Cancel" siblings      |
| `ghost`         | transparent          | none                | `text.primary`      | Icon-only buttons in toolbars            |
| `danger`        | transparent          | `1px state.error.edge` | `state.error.fg` | Destructive confirm in modals (rare)    |

Sizes (uniform across variants):

| Size      | Height | Padding (x)   | Type token   | Icon size |
|-----------|--------|----------------|--------------|-----------|
| Compact   | 24px   | `space.3` (8px) | `type.body.compact` | `icon.sm` |
| Default   | 32px   | `space.4` (12px) | `type.body`        | `icon.md` |
| Spacious  | 40px   | `space.5` (16px) | `type.body`        | `icon.md` |

States:

| State    | Primary                                  | Secondary                               | Ghost                                |
|----------|------------------------------------------|------------------------------------------|--------------------------------------|
| Hover    | bg → `accent.hover`                      | bg → `bg.surface.sunken`                 | bg → `bg.surface.sunken`             |
| Active   | bg → `accent.active`                     | bg → `bg.surface.sunken`, border darker  | bg → `bg.surface.sunken`             |
| Focus    | 2px `border.focus` ring, 2px offset      | same                                     | same                                 |
| Disabled | bg → `state.loading`, text → `text.disabled` | border → `state.loading`              | text → `text.disabled`               |
| Loading  | spinner *not* allowed — see §5; button shows `type.body.compact` "Working…" replacing label with marquee dots animation | same | same |

**Rationale — single spinner exception, only for buttons.** A button that
performs an external-effect action (Walkthrough 3 step 20: "Send") cannot show a
skeleton (the button has no content to skeletonise). Three documented options
considered:

1. Disable the button, change label to "Sending…", no visual motion. Risk: user
   thinks the click didn't register.
2. Add a tiny inline spinner glyph. Violates CONCEPT.md skeleton-only rule.
3. **Selected** — replace label with "Sending…" plus animated marquee dots
   (`Sending.`, `Sending..`, `Sending...` at `motion.quick * 4` interval). No
   spinner glyph, no ring. Conveys progress without a circle.

This is the single skeleton-rule exception, scoped to button-in-flight. The
exception lives here, in the spec, and is documented at the §5 anti-pattern list.

### 2.8 `input`

Text entry.

```
┌──────────────────────────────────────┐
│ Placeholder text…                    │   default: 1px border.default
└──────────────────────────────────────┘
                                          focus: 2px border.focus (inset, no offset)
                                          error: 1px border = state.error.edge
```

| Size      | Height | Padding (y/x)        | Type        |
|-----------|--------|----------------------|-------------|
| Compact   | 28px   | `space.2` / `space.3` | `type.body.compact` |
| Default   | 32px   | `space.3` / `space.3` | `type.body`         |
| Spacious  | 40px   | `space.4` / `space.4` | `type.body`         |

States: hover bg → `bg.surface`, focus inset 2px `border.focus`, error 1px
`state.error.edge` + inline message below input at `state.error.fg` and
`type.caption`. Disabled: bg → `bg.surface.sunken`, text → `text.disabled`.

Variants:

- `multiline: true` → renders as a textarea, min-height 96px, vertical resize handle
  in bottom-right (16×16 grip glyph at `text.tertiary`).
- `leadingIcon` / `trailingIcon` → icon size `icon.md`, `text.tertiary`, inset by
  `space.3` from input edge; input text padding shifts to leave room.
- `password: true` → reveal-toggle icon in trailing slot, `eye-off` / `eye`.

### 2.9 `choice`

Single-select from N. Renders as **dropdown** by default, **radio group** when the
agent sets `style.layout: "inline"`.

#### Dropdown variant (default)

```
┌──────────────────────────────────────────┐
│ Selected option                       ▾  │   trigger: button-secondary look
└──────────────────────────────────────────┘
       ↓ click / Enter / Space
┌──────────────────────────────────────────┐
│  Option A                                │   open: elev.popover, radius.md
│  Option B  ✓                             │   selected option: leading check
│  Option C                                │   keyboard: arrow up/down, Enter to pick
└──────────────────────────────────────────┘
```

- Trigger same dimensions as input.
- Open menu: `bg.surface.raised`, `border.subtle`, `radius.md`, `elev.popover`.
- Item hover: `bg.surface.sunken`. Item focus (keyboard): 2px `border.focus`
  inset. Selected item: leading checkmark `icon.sm` in `accent`.
- Max-height 320px before scroll; overflow scrolls vertically with no scrollbar
  by default (overlay scrollbars).

#### Radio variant (inline)

```
( ) Option A    ( ) Option B    (•) Option C
```

- Circle: 16px outer, `1px border.default`, inner dot 6px `accent` when selected.
- Focus: 2px `border.focus` ring around the outer circle, 2px offset.
- Inline layout: horizontal flex, gap `space.5`.

### 2.10 `toggle`

Boolean. Two visual forms — **checkbox** by default for in-form use, **switch** for
on/off-of-a-feature mental model (set via `style.layout: "switch"`).

#### Checkbox (default)

```
[ ] Label text          off
[✓] Label text          on:  accent fill + text.inverse check glyph
```

- Box: 16×16, `radius.sm`, `1px border.default` off, `accent` fill on.
- Indeterminate: `accent` fill, `text.inverse` minus glyph.
- Focus: 2px `border.focus` ring, 2px offset.

#### Switch (style.layout: "switch")

```
( ●─ )  off:  bg = bg.surface.sunken, knob = bg.surface.raised + 1px border.default
( ─● )  on:   bg = accent, knob = bg.surface.raised
```

- Dimensions: 28×16 track, 12×12 knob, knob inset 2px.
- Transition: knob slide `motion.quick / easing.standard`.

### 2.11 `image`

Static bitmap content.

- Rendered with `object-fit: contain` by default; agent can override via
  `style.fit: "cover" | "contain"`.
- Loading: skeleton with the image's known aspect ratio (agent passes `width` /
  `height` in props; renderer uses them as the skeleton box).
- Error: container at the same dimensions, centred `image-off` icon at `icon.lg`
  `text.tertiary`, no text (consistent with the empty-state restraint).
- No border / no shadow by default. `style.border: true` adds `1px border.subtle`
  `radius.md`.

### 2.12 `chart`

Static data-driven visual. v1 supports `bar`, `line`, `pie`. Implementations should
use a small library (Tremor's primitives or Recharts via Visx for full control) —
but the **visual language** is normative:

- Single accent for the primary series. Additional series use accent variations
  on the **chroma axis** (drop chroma to 0.06 for series 2; chroma 0.04 for series
  3) at the same `L`. Never multi-hue.
- Grid lines: `border.subtle`, dashed 1px on Y-axis, no X-axis grid.
- Axis labels: `type.caption`, `text.tertiary`.
- Value labels: `type.mono.data`, `text.secondary`, shown on hover only.
- Tooltip on hover: `bg.surface.raised`, `elev.popover`, `radius.md`, padding
  `space.3`. Content: series name (`type.body.strong`) + value (`type.mono.data`).
- No legend if there's only one series. Multi-series: legend below chart in
  `type.caption`, `text.secondary`, with 8px swatch squares matching the series
  chroma reduction.

Empty: `chart` with no data renders the axes only and a tertiary-text inline hint
at chart centre.

### 2.13 `form`

Group of inputs + submit. When carrying the `context-binding` trait
(CONCEPT.md §"Editor primitives"), this primitive **is the inspector** in editor
workspaces.

Default layout: vertical stack of labelled rows.

```
Label                                              ← type.caption.strong, text.secondary
┌──────────────────────────────────────────┐
│ value                                    │       ← input
└──────────────────────────────────────────┘
Optional helper text                               ← type.caption, text.tertiary

Label
[✓] Toggle option
( ) Choice A    (•) Choice B

[ Submit ]   [ Cancel ]                             ← toolbar at bottom: primary + secondary
```

- Row gap: `space.4` (default), `space.3` (compact), `space.5` (spacious).
- Submit button: primary variant, default size. Cancel: secondary, same size.
- Inline error: under the input at `state.error.fg`, `type.caption`.
- Form-level error (e.g. "Send failed — try again"): banner above the submit row,
  `1px state.error.edge` left border, `bg.surface` background, padding `space.4`,
  text in `state.error.fg`.

**Inspector mode (`form` with `context-binding` trait):**

- Renders without a Submit button. Each input change emits its own action.
- Compact density by default.
- Labels render to the **left** of inputs (label-input grid), not above. Label
  column 40% width, input column 60%.

### 2.14 `toolbar`

Action strip. Horizontal flex of buttons (typically ghost variant) + optional
separators.

```
┌────────────────────────────────────────────────────────────────┐
│ [ ⤴ ] [ ⤵ ] │ [ B ] [ I ] [ U ] │ [ ⬛ ] [ ⊙ ] │ ...   [ Send ] │
└────────────────────────────────────────────────────────────────┘
   undo  redo │  text styles      │  shape tools │       primary action
```

- Height: 40px default, 32px compact, 48px spacious.
- Padding: `space.3` (x), 0 (y; buttons size themselves).
- Background: `bg.surface`. Optional `border.subtle` 1px bottom (when toolbar sits
  above content) or top (when toolbar sits below content).
- Separators: 1px `border.subtle` vertical, 16px tall, `space.3` margin.
- Primary action (if any): pushed to the right, never centred.

Vertical toolbar variant (left side of editor workspaces): same rules, rotated 90°.
Buttons square (40×40 default), separators horizontal.

### 2.15 `menubar`

Cascading menu (top-of-window classic macOS-style menu, or context menu invoked by
right-click).

Top-of-window menubar:

```
File  Edit  View  Canvas  Help
```

- `type.body` at default density, `text.primary`.
- Hover/open: `bg.surface.sunken` on the menu trigger.
- Open menu: `bg.surface.raised`, `radius.md`, `elev.popover`, min-width 200px.
- Menu items: 28px tall, padding `space.3` x, `type.body` text, optional leading
  icon at `icon.sm`, optional trailing keyboard shortcut in `type.caption.strong`
  uppercase tracking at `text.tertiary`, right-aligned.
- Item hover: `accent.subtle` background, `text.primary`.
- Disabled item: `text.disabled`, no hover.
- Separator: 1px `border.subtle`, full width inside the menu.

Context menu (right-click or long-press): identical to opened menu, no top-of-window
trigger. Position: anchored to cursor point. Auto-flip to fit viewport.

### 2.16 `tabs`

Sibling containers with selector.

```
─── Tab one ──┬─── Tab two ──┬─── Tab three ──┬───────────────
              │                                 active tab edge
   inactive   │   inactive    │   inactive
─────────────────────────────────────────────── ← 1px border.subtle, full width
[ tab content ]
```

- Tab labels: `type.body`, `text.secondary` inactive, `text.primary` active.
- Active tab: 2px solid `accent` underline, sits flush with the 1px subtle border
  (overlaps it, so it appears "in front").
- Hover (inactive): `text.primary`, no underline.
- Focus: 2px `border.focus` ring, 2px offset, around the tab label itself.
- Wizard variant (`style.variant: "wizard"`): tabs render as **steps** — see §3.2.

### 2.17 `pane`

Positionable, resizable container. The Miro-hybrid: technically a window, visually
theme-driven (no per-window chrome, no traffic-light buttons inside the canvas —
those belong to the OS window).

Default appearance:

- `bg.surface`, `radius.md`, `1px border.subtle`.
- Drag handle: top 28px strip, `type.caption.strong` `text.secondary` title,
  cursor `grab` on hover.
- Resize affordance: 8px hit-target along the right + bottom edges and the
  bottom-right corner; cursor changes to `col-resize` / `row-resize` / `nwse-resize`
  on hover. No visible drag handle glyph (the cursor is the affordance).
- Pinned / unpinned: a pinned pane shows a pin icon in the title strip
  (`icon.sm`, `text.tertiary`); pinned panes cannot be dragged.

Modal variant (`pane.kind: "modal"`):

- Centered in viewport (max 640px wide, max viewport-height - 64px tall).
- `elev.modal`.
- Scrim `bg.modal.overlay` covers everything underneath.
- Title strip: `type.heading.2` left, optional close `x` icon right.
- See §5.4 for the full confirmation-modal pattern.

Drag in-flight:

- Ghost preview at 50% opacity, `elev.drag`.
- Drop targets highlight with 2px dashed `accent` border.

### 2.18 `status`

Read-only display. Used by the agent to surface state without occupying input
attention: "Last synced 14:23", "Connected to ERP", "3 sub-agents working".

Layout: inline horizontal — optional leading icon (`icon.sm`, `text.tertiary`) +
status text (`type.caption`, `text.secondary`). No background, no border.

For **liveness** (e.g. "3 sub-agents working" in Walkthrough 4), `status` may carry
the `loading` trait — then the leading icon area renders a skeleton pulse-bar
(8px wide, 12px tall, `radius.sm`) at `state.loading` / `state.loading.hi`.

### 2.19 `progress`

Progress of an ongoing operation. Linear bar, no circular spinner.

```
─── operation label                                  78%
████████████████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░
```

- Track: 4px tall, full available width, `bg.surface.sunken`, `radius.pill`.
- Fill: `accent`, `radius.pill`.
- Label (above the bar): `type.caption` `text.secondary`. Right-aligned numeric
  percent in `type.mono.data` `text.secondary`.
- Indeterminate (no known percentage): fill renders as a 30%-width segment that
  travels back and forth across the track at `motion.deliberate * 4` interval,
  reverses on each pass. `prefers-reduced-motion`: indeterminate static, fixed at
  left 0%.

### 2.20 `divider`

Visual separator. Horizontal 1px `border.subtle`, full width by default. Vertical
variant available for in-toolbar use (see §2.14).

Variants:

- `style.thickness: "strong"` → `border.strong` instead of `border.subtle`. Rare;
  reserved for major canvas-level separations (e.g. left rail vs. content area).
- `style.dashed: true` → 1px dashed `border.subtle`. Used for drop-zone indicators
  during drag.

### 2.21 `media` (editor-class)

Audio/video with playback controls.

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│                        [video frame]                        │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│ [▶] [⏸] [⏹]    00:34 / 02:15    ─────●────────  [ 🔊 ─●── ] │
└─────────────────────────────────────────────────────────────┘
   transport    time           scrubber           volume
```

- Frame area: `bg.surface.sunken` background, `radius.md`, video letterboxed with
  `object-fit: contain`. Poster (if provided) shown until first play.
- Transport bar height: 40px. `bg.surface`, `1px border.subtle` top.
- Buttons: ghost-variant, `icon.md`. Time display: `type.mono.data`.
- Scrubber: see `vector-path` / range-input visual — 4px track `bg.surface.sunken`,
  3px buffered region `border.default`, 4px played region `accent`, 12px circular
  knob with `accent` fill, focus ring on knob 2px `border.focus`.
- Volume: smaller scrubber, 80px wide.

For audio-only (`mediaType: "audio"`), the frame area is replaced by a
**waveform** rendering using `accent.subtle` fill, `accent` for the played portion.
Implementation note: visual mockup follows in mockup phase — waveform rendering
detail is implementer choice within those colour constraints.

### 2.22 `canvas-region` (editor-class)

Pixel-editor region. Theme-wise the simplest primitive — it is **deliberately**
visually plain so the user's image fills its content area.

- Container: `bg.surface.sunken`, no radius (radius.0 — sharp corners for editor
  feel), no border by default; **2px `accent` border** when this region is the
  active editing target.
- Cursor: changes to match the active tool (declared by Tier-2 via tool-mode
  selection on the toolbar). The renderer maps tool identifier → CSS cursor (e.g.
  `crosshair` for selection, custom 24×24 PNG cursor for brush — implementer
  ships these alongside).
- Selection-region overlay: 1px dashed line, animated dash-offset (marching ants).
  Dash pattern: 4px on, 4px off; offset increments by 1px per `motion.quick`,
  loops. Reduced-motion: static dash, no animation.
- Zoom level indicator: bottom-right corner, `type.mono.data`, `text.tertiary`,
  padding `space.3`, `bg.surface.raised` chip with `radius.sm`.
- Loading (during durable op or Tier-3 AI op): full-region overlay,
  `bg.surface.overlay` (50% scrim), centered status text "Removing object…",
  `type.body.strong`, `text.primary`, with a 32×32 skeleton-pulse square below.

Visual mockup of the Photoshop-workspace composition follows in mockup phase.

### 2.23 `timeline` (editor-class)

Multi-track, frame/sample-precise time axis. Theme-wise:

```
┌────────────────────────────────────────────────────────────────────┐
│ 00:00       00:30       01:00       01:30       02:00       02:30 │ ← ruler
├────────────────────────────────────────────────────────────────────┤
│ V1 ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒░░░▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒ │ ← video track
├────────────────────────────────────────────────────────────────────┤
│ A1 ▁▁▂▂▃▄▅▆▇█▇▆▅▄▃▂▁▁▁▁▂▃▄▅▆▇█▇▆▅▄▃▂▁▁▁▁▁▂▃▄▅▆▇█▇▆▅▄▃▂▁▁▁▁▁▁▁▁▁▁ │ ← audio track
├────────────────────────────────────────────────────────────────────┤
│ ▲ playhead at 00:34                                                 │
└────────────────────────────────────────────────────────────────────┘
```

- Ruler: 24px tall, `type.caption` `text.secondary` ticks, major ticks at full-
  second/full-minute intervals depending on zoom.
- Track height: 48px video, 56px audio (waveform needs vertical room), 24px marker.
- Track label column: 32px wide on the left, `type.caption.strong` `text.secondary`,
  centred vertically.
- Track clip rendering: 1px `border.default` outline, `accent.subtle` fill for
  audio waveform background, `bg.surface.sunken` for video, with the source-media
  preview thumbnails inside.
- Selected clip: 2px `accent` border, accent.subtle background tint.
- Playhead: 2px vertical `accent` line spanning all tracks, with a 12×12 downward-
  pointing triangle at the top.

Visual mockup of multi-track editing follows in mockup phase.

### 2.24 `vector-path` (editor-class)

Pen-tool curves.

- Path stroke: 2px `accent` when active, 1px `text.primary` when not.
- Anchor points (when path is selected): 8×8 square, `bg.surface.raised` fill,
  1px `accent` border. Selected anchor: 8×8, `accent` fill.
- Control-handle lines: 1px dashed `accent.subtle`, with the handle endpoint
  rendered as a 6×6 circle, `bg.surface.raised`, 1px `accent` border.

Used inside `canvas-region` (as an overlay) or standalone (e.g. an EQ curve
inside an audio-edit inspector form).

---

## 3. Composition Idiom Visuals

The five idioms from the Composition-Idiom Library, rendered in the Omadia theme.
**No visual mimicry of the era they reference** — the idiom is a layout hint, not a
skin. The Omadia theme renders all of them.

### 3.1 Norton-Commander-style

Two panes side-by-side, each holding a `list`, shared `toolbar` below.

```
╔═══════════════════════════════════════════════════════════════════╗
║ ┌────────────────────────┐  ┌────────────────────────────────┐    ║
║ │ Left pane              │  │ Right pane                     │    ║
║ │ ───────────────────────│  │ ───────────────────────────────│    ║
║ │ /home/user/projects    │  │ /home/user/projects/omadia-ui  │    ║
║ │                        │  │                                │    ║
║ │ ▸ omadia               │  │   CONCEPT.md          25.3 KB  │    ║
║ │ ▸ omadia-ui            │  │   README.md            1.2 KB  │    ║
║ │ ▸ tri-trading          │  │ ▸ docs/                        │    ║
║ │ ▸ archive              │  │   visual-spec.md      18.4 KB  │    ║
║ │                        │  │                                │    ║
║ └────────────────────────┘  └────────────────────────────────┘    ║
║                                                                    ║
║ ┌────────────────────────────────────────────────────────────┐    ║
║ │ [Copy]  [Move]  [Diff]  [Open]               [⌘K palette]  │    ║
║ └────────────────────────────────────────────────────────────┘    ║
╚═══════════════════════════════════════════════════════════════════╝
```

- Two panes, side-by-side, equal width by default, resizable divider in the
  middle (drag-handle treatment from §2.17).
- Each pane: title strip + `list` with `type.mono.data` for data-grid feel (file
  sizes, line counts).
- Shared toolbar below: 40px default, ghost-variant action buttons left, primary
  action right.
- Keyboard focus moves between panes via Tab; arrow keys move within active pane.
- Density: typically compact (mono-leaning data grid).

What is **not** taken from Norton Commander: blue background, white-on-blue text,
heavy box-drawing borders, function-key labels at the bottom. The agent expresses
the layout, the theme renders it Omadia-style.

### 3.2 Wizard

`container` with step-`tabs` + `form` per step + `toolbar` (back/next).

```
┌─────────────────────────────────────────────────────────────────┐
│ Sales Proposal — AcmeInsure                                      │
│ ─────────────────────────────────────────────────────────────── │
│                                                                  │
│  ● Customer ─── ● Use Case ─── ○ Pricing ─── ○ Document          │
│                                                                  │
│ ─────────────────────────────────────────────────────────────── │
│                                                                  │
│ Customer name        ┌────────────────────────────┐              │
│                      │ AcmeInsure                 │              │
│                      └────────────────────────────┘              │
│                                                                  │
│ Contact email        ┌────────────────────────────┐              │
│                      │ contact@acmeinsure.com     │              │
│                      └────────────────────────────┘              │
│                                                                  │
│ Branch               (•) Insurance   ( ) Banking   ( ) Other     │
│                                                                  │
│ ─────────────────────────────────────────────────────────────── │
│                                                                  │
│ [ ← Back ]                                          [ Next → ]   │
└─────────────────────────────────────────────────────────────────┘
```

- Steps: filled accent circle (●) for completed, accent ring (○) for current,
  border-subtle ring for upcoming. Connecting lines: `border.subtle`, current /
  completed segments switch to `accent`.
- Step labels under each circle: `type.caption` `text.secondary` for inactive,
  `type.caption.strong` `text.primary` for current/completed.
- Form: label-on-left layout (40/60 split), as inspector-mode in §2.13.
- Back / Next: secondary / primary, right-aligned for forward motion.
- Next-disabled state until required fields valid (rendered as button-disabled in
  §2.7).

### 3.3 Spotlight

Centered `input` + `list` of hits.

```
                  ┌────────────────────────────────────────────┐
                  │ 🔍  Search projects, files, commands…      │
                  └────────────────────────────────────────────┘
                  ┌────────────────────────────────────────────┐
                  │ ► CONCEPT.md                  /omadia-ui   │
                  │   visual-spec.md              /omadia-ui   │
                  │   architecture-3tier.svg      /omadia-ui   │
                  │ ─────────────────────────────────────────  │
                  │   Run: omadia start                        │
                  │   Run: vercel deploy --prod                │
                  └────────────────────────────────────────────┘
```

- Centered in viewport, max 640px wide.
- Input: 48px tall, `type.heading.2` text size, 1px `border.default`, leading
  search icon at `icon.lg` `text.tertiary`.
- Results list: directly below, no gap, same width, `bg.surface.raised`,
  `elev.popover`, `radius.md`.
- First result auto-focused (►). Arrow up/down moves focus, Enter triggers.
- Section dividers: 1px `border.subtle` with optional `caption.strong` label
  on the left side (`text.tertiary`).
- Right-side hint: `type.caption` `text.tertiary` (path, type, age).

This idiom **is** Omadia UI's command palette (⌘K).

### 3.4 Dashboard

`grid` of `container` with `chart`, `status`, KPI-`text`.

```
┌──────────────────────────────────────────────────────────────────────┐
│ Monthly Overview                                       Apr 2026  ▾   │
│ ──────────────────────────────────────────────────────────────────── │
│                                                                       │
│ ┌────────────────┐ ┌────────────────┐ ┌────────────────────────────┐│
│ │ Open Tickets   │ │ Hours Budget   │ │ Weekly Trend                ││
│ │                │ │ Remaining      │ │                             ││
│ │     127        │ │     342h       │ │     ▁▂▃▅▆▇█▇▆▅▃▂            ││
│ │ ▲ 12 vs Mar    │ │ ▼ 8% vs Mar    │ │                             ││
│ └────────────────┘ └────────────────┘ └────────────────────────────┘│
│                                                                       │
│ ┌──────────────────────────────────────┐ ┌─────────────────────────┐ │
│ │ Owners under budget                  │ │ Recent activity         │ │
│ │ ─────────────────────────────────────│ │ ────────────────────────│ │
│ │  Anna Schmidt           5.0h         │ │ 14:23 — pdf generated   │ │
│ │  Bernd Lutz             7.5h         │ │ 13:51 — sub-agent done  │ │
│ │  ...                                  │ │ ...                     │ │
│ └──────────────────────────────────────┘ └─────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────┘
```

- Outer container: `space.5` padding, optional `style: "spacious"` for breathing
  room.
- KPI cards: small `container` with `border: true`, `radius.md`, padding `space.5`.
  Top label `type.caption.strong` `text.secondary`, big value `type.display`
  `text.primary`, delta line below at `type.caption` `text.secondary` with a
  small ▲/▼ glyph in `accent` (up) or `state.warning.fg` (down) — note this is
  the **single** documented use of a non-accent semantic colour in a "status"
  context, and it is text-only, not a pill.
- Charts inside the same containers, no decorative chrome.
- Grid: 4-column CSS grid, gap `space.5`, KPI cards span 1 col, trend chart span 2,
  table widgets span 2.

### 3.5 Photoshop-workspace

`canvas-region` centre, `toolbar` left, `inspector` (`form` with context-binding)
right, `tree` (layer stack) bottom-right.

```
╔═══════════════════════════════════════════════════════════════════════════╗
║┌──┐ ┌─────────────────────────────────────┐ ┌──────────────────────────┐ ║
║│⬛│ │                                     │ │ INSPECTOR                │ ║
║│⊙ │ │                                     │ │ ──────────────────────── │ ║
║│✦ │ │                                     │ │ Tool      Brush          │ ║
║│✎ │ │                                     │ │ Size      ────●────  18  │ ║
║│  │ │       active canvas region          │ │ Hardness  ────●────  60%  │ ║
║│⤬ │ │       (image being edited)          │ │ Opacity   ────●────  85%  │ ║
║│  │ │                                     │ │ Colour    ████ #0F7AB8   │ ║
║│✂ │ │                                     │ │ Flow      ─●──────   24% │ ║
║│  │ │                                     │ └──────────────────────────┘ ║
║│■ │ │                                     │ ┌──────────────────────────┐ ║
║│  │ │                                     │ │ LAYERS                   │ ║
║│⤡ │ │                                     │ │ ──────────────────────── │ ║
║│⤢ │ │                                     │ │ 👁 ▸ Adjustments         │ ║
║│  │ │                                     │ │ 👁    Curves             │ ║
║│  │ └─────────────────────────────────────┘ │ 👁    Levels             │ ║
║│  │                                         │ 👁 ► Background          │ ║
║│  │ ┌─────────────────────────────────────┐ │                          │ ║
║│  │ │ ⏵  ┃━━━━━━━━━━●━━━━━━━━━━━━━━━━ 32% │ │                          │ ║
║│  │ │   undo · redo · zoom in/out · fit   │ │                          │ ║
║└──┘ └─────────────────────────────────────┘ └──────────────────────────┘ ║
╚═══════════════════════════════════════════════════════════════════════════╝
```

- Left toolbar: vertical, 48px wide, button-square 40×40, `bg.surface.sunken`,
  `border.subtle` right edge. Active tool button: `accent.subtle` background,
  `1px accent` border.
- Inspector (right top): `form` in context-binding mode (label-left layout).
  Sliders use the scrubber visual from §2.21 (4px track, 12px knob).
- Layer stack (right bottom): `tree` with layer trait. Eye-icon toggles visibility.
- Bottom toolbar: zoom slider + undo/redo, ghost buttons.
- Canvas region: see §2.22; sharp corners, sunken background.

The colour swatch in the inspector (`#0F7AB8` shown above) is illustrative — when
the user picks a custom colour, that custom colour is shown verbatim. **This is
the only place in the UI where a non-theme colour is rendered**, and it is rendered
because it is *data*, not chrome.

---

## 4. Animation and Transition Language

### 4.1 Patch-apply

When a `surface_patch` arrives and rewrites part of the tree:

- The replaced subtree fades out (`opacity: 0`) over `motion.quick`.
- The new subtree fades in over `motion.quick`.
- Cross-fade if both old and new fit the same DOM slot; otherwise sequential
  out-then-in.
- The new subtree gets a **patch-highlight overlay**: a `radius.sm` rectangle
  matching the new content's bounds, filled with `accent.subtle`, fading from
  `opacity: 1` to `opacity: 0` over `motion.smooth * 4` (~800ms). This is the
  visual signal that "the canvas just grew here".

Patches affecting a single value (table cell update, status text change): no
fade-out, just the highlight overlay on the changed cell.

Snapshots (`surface_snapshot`) get a full-canvas crossfade over `motion.smooth`
with `easing.emphasis`.

**Rationale — fade-in chosen over slide-down.** Three options considered:

1. **Slide-down** (new content slides in from above the patch target). Risk: in
   dense data UIs, sliding visually pushes adjacent content around; on a 60-row
   table this is more disorienting than helpful.
2. **Pulse** (new content briefly scales 1.05 → 1.00). Risk: scale animations
   look toy-like in editor workloads; collides with the "data is the protagonist"
   value.
3. **Selected — fade + highlight.** Quiet, doesn't move layout, signals "this is
   new" via a temporary accent wash, reduced-motion-safe (skip the fade, drop
   the highlight, jump to final state).

### 4.2 Skeleton states

See §1.7 — pulse animation. The skeleton fills the bounds of the missing primitive
with `state.loading`, animates the pulse, and never shows a spinner. Reduced-motion
disables the pulse but keeps the fill.

### 4.3 Modal appearance

- Scrim (`bg.modal.overlay`): fade in over `motion.smooth` with `easing.standard`.
- Modal pane: opacity 0 → 1 + scale 0.97 → 1.0 over `motion.smooth` with
  `easing.emphasis`.
- Modal dismiss: reverse, `motion.quick`.

### 4.4 Selection / focus feedback

- Focus ring (`border.focus` 2px): instant on focus change. No fade — focus must
  be visible the moment the user tabs to it.
- Selection (list/table/tree row): `accent.subtle` background fades in over
  `motion.quick`. Multi-select cumulative selection: each newly-selected row
  fades in over `motion.quick`.
- Deselect: fade out over `motion.quick`.

### 4.5 Hover

- Background tint changes fade over `motion.quick`.
- Cursor change is instant.

### 4.6 Canvas-activate transition (Spaces switch)

When user switches canvases (CONCEPT.md §"Multiple Canvases"):

- Outgoing canvas: fade out + 4px horizontal slide (depending on switch direction)
  over `motion.deliberate`.
- Incoming canvas: fade in + 4px horizontal slide-in over `motion.deliberate`,
  starts 60ms after outgoing begins.
- Reduced motion: instant swap, no fade.

This is the **only** use of `motion.deliberate`. Spaces-switch is meant to feel
heavier than an in-canvas patch — the user has changed context, and the motion
acknowledges that.

### 4.7 Drag-in-flight

- Ghost preview: 50% opacity copy of the source primitive, `elev.drag`,
  follows cursor. Z-index sits above all canvas content.
- Drop targets: 2px dashed `accent` border fades in (`motion.quick`) when the
  ghost enters the target's bounding box; fades out when it exits.
- Drop: ghost fades out over `motion.quick`, real content appears in new location.

---

## 5. Edge Cases and Anti-Patterns

### 5.1 Empty canvas (first launch, no prior session)

- No "Welcome to Omadia!" splash. No branded empty state. No tutorial overlay.
- The canvas renders `bg.canvas`, nothing else.
- A `status` primitive in the lower-left corner, `type.caption` `text.tertiary`,
  reads: `Canvas ready. ⌘K to start.`
- That is the entire empty state. Anything more is an anti-pattern in v1.

**Rationale.** CONCEPT.md is explicit: the canvas is "the agent's blank page".
A welcome screen authored by a designer breaks the model — the user should
immediately feel that this surface waits for *them*. Power users learn ⌘K once,
forever; new users discover it through the status hint or through the agent's
first response after they type into the channel-side chat.

### 5.2 Loading > 300ms

- 0–300ms: nothing rendered. Render the eventual primitive immediately if the
  payload arrives in time.
- 300ms+: skeleton renders for the expected primitive shape.
- 3s+: skeleton continues; status indicator (`status` primitive with `loading`
  trait) appears below or beside the skeleton, agent-authored caption explaining
  what's happening.
- 10s+: same skeleton; status caption becomes more specific ("Still fetching
  Q1 invoices — large dataset, ~30s expected").

Skeletons never time out into a spinner. They time out into a useful error if
the operation actually fails (§5.3).

### 5.3 Errors

Three error scopes:

1. **Primitive-scoped error** (a single primitive failed to render or fetch its
   dataRef):
   - 1px `state.error.edge` border on the primitive.
   - Inline message below or inside, `state.error.fg`, `type.caption`.
   - No badge, no pill, no toast.

2. **Field error** (form field validation):
   - 1px `state.error.edge` border around the `input`.
   - Helper-text slot under the input becomes the error message, `state.error.fg`,
     `type.caption`.

3. **Canvas-scoped error** (a sub-agent failed, a Tier-3 tool errored, dataRef
   denied):
   - A `status` primitive at the top of the affected container, leading
     `alert-triangle` icon at `icon.sm` `state.error.fg`, message at `type.body`
     `state.error.fg`.
   - Optional inline retry action: `button` ghost-variant + text "Retry".

Toasts (transient floating notifications): **not used**. The canvas is the surface
of record; transient toasts would create a parallel notification stream that the
agent didn't author. If the agent needs to surface an error, it adds it to the tree
(as a primitive, in the right scope) — and the user sees it in context.

### 5.4 Confirmation modals

CONCEPT.md § "External-effect action confirmation contract" defines the wire
shape. The visual is:

```
                ╔════════════════════════════════════════════════╗
                ║                                                ║
                ║  Confirm send                                  ║   ← heading.2
                ║                                                ║
                ║  Send proposal PDF to contact@acmeinsure.com?  ║   ← body
                ║  This email cannot be unsent.                  ║   ← body, text.secondary
                ║                                                ║
                ║                                                ║
                ║                       [ Cancel ]  [ Send → ]   ║   ← secondary + primary
                ╚════════════════════════════════════════════════╝

       (scrim covers everything else: bg.modal.overlay)
```

- Modal pane: `bg.modal.surface`, `radius.lg`, `elev.modal`, max 480px wide.
- Padding: `space.6` (spacious — modal is a moment of focus).
- Heading: `type.heading.2`, `text.primary`.
- Body: `type.body`, `text.primary` for the main message, `text.secondary` for
  the irreversibility caveat.
- Toolbar: right-aligned, Cancel (secondary) + primary action. Primary action
  label uses the verb of the action, not "OK" or "Confirm".
- Keyboard: Esc cancels, Enter triggers the primary action. Focus on first open
  is the primary action **unless** the action is destructive (`danger` variant),
  in which case focus opens on Cancel — a small but deliberate friction.

For `danger` confirmations (file delete, payment, irreversible publish), the
primary button uses the `danger` variant (1px `state.error.edge` border, text in
`state.error.fg`, on hover bg → `bg.surface.sunken`). No filled red button.

### 5.5 Anti-patterns to call out by name

The implementer must not:

- Add coloured **status pills** ("OK", "BLOCKED", "OVERDUE") in any colour. The
  word in body text, in `text.primary`, is what carries meaning. Where emphasis
  is needed, use `type.body.strong` or row tint via `accent.subtle`.
- Add **emoji glyphs** as decorative chrome. Emoji that the agent emits as
  content (Walkthrough 1 prose "🎉") are content and pass through verbatim. Emoji
  that an implementer adds to button labels or empty-state hints are forbidden.
- Add **toasts**, **snackbars**, or any floating non-modal notification surface.
- Add **circular spinners** anywhere except the documented button-in-flight
  exception (§2.7) and the `loading: "spinner"` trait on `canvas-region` (§2.22),
  which renders as a 32×32 skeleton-pulse square, not an animating ring.
- Add **gradients** beyond the skeleton-pulse gradient. No accent-to-purple
  gradient buttons, no glassmorphism, no neumorphism.
- Add **drop shadows** to flat content (cards, list items, panels). Shadows are
  reserved for temporally elevated surfaces (§1.6).
- Add a **branded splash** or empty-state illustration.
- Add **multiple accent colours**. There is exactly one accent slot.

---

## 6. Accessibility floor

This is not a full accessibility spec; it is the floor below which the visual
choices already documented would themselves break a11y guarantees.

- **Contrast ratios** (verified against WCAG 2.2 AA at body-text size):
  - `text.primary` on `bg.canvas` (both modes): ≥ 7.0:1 (AAA).
  - `text.secondary` on `bg.canvas`: ≥ 4.5:1 (AA).
  - `text.tertiary` on `bg.canvas`: ≥ 3.5:1 (AA Large only — used only on type at
    14px+).
  - `text.inverse` on `accent`: ≥ 4.5:1 in both modes.
  - `accent` on `bg.canvas`: ≥ 3:1 (AA non-text — focus rings, icons).
- **Focus rings**: 2px solid `border.focus`, 2px offset (or inset where noted).
  Never just a colour change without a ring.
- **Hit targets**: minimum 32×32 for any clickable affordance (default button
  size). 24px buttons exist only inside high-density toolbars where 32px would
  break the layout; those toolbars are keyboard-accessible parallel paths.
- **Motion**: every animation respects `prefers-reduced-motion: reduce` (§1.7).
- **Colour as sole signal**: forbidden. Every state communicated through colour
  also carries a text label, an icon, or both.
- **Keyboard reach**: every interactive primitive must be reachable via Tab and
  operable via Enter/Space. Composite primitives (table, tree, list) must support
  arrow-key navigation within them.

---

## 7. What is explicitly NOT specified in this document

| Out of scope                                          | Where it belongs                             |
|-------------------------------------------------------|----------------------------------------------|
| Pixel-genau editor-workspace mockup (Photoshop idiom) | Mockup phase + Tier-1 spike                  |
| `canvas-region` / `timeline` / `media` pixel visuals  | Mockup phase                                 |
| Brand identity — logo, wordmark, app icon, name       | Separate brand-work track                    |
| Onboarding / first-run flow                           | Separate UX phase                            |
| Settings / Preferences screen                         | **Does not exist by design** — user prefs are conversational |
| Marketing site visuals                                | Separate marketing-design track              |
| Email or notification visuals (transactional)         | Out of scope — Omadia UI has no email surface |
| Cross-platform native-control divergence              | Implementation choice during Tier-1 spike     |
| Print stylesheets                                     | Not a workload for v1                        |

---

## 8. Implementation contract

When implementers consume this spec:

- Token names from §1 are authoritative; renderer code references tokens by
  semantic name only.
- Per-primitive visual tables (§2) are authoritative for default, hover, focus,
  active, disabled, loading, error states. Variants are restricted to those
  listed; new variants require a spec amendment.
- Composition idioms (§3) are normative for the wireframe relationships
  (which primitive is where, which gets which density). The Skill remains free to
  vary primitive choice within the idiom (e.g. swapping `list` for `table` if
  data is uniform), but the layout language is fixed.
- Motion (§4) is normative. Implementers may not invent new transitions for
  unlisted situations without an amendment.
- Anti-patterns (§5.5) are blockers — code that reintroduces them must not ship.

---

## 9. Open questions for review

These are explicitly flagged for Codex review rounds — areas where the spec made a
call but a reviewer might land elsewhere with good arguments.

1. **Accent choice.** Petrol/steel-blue at 235°. Alternatives (indigo, copper,
   ochre) listed in §1.1 rationale. Worth a second pass before lock-in.
2. **Inter vs. system sans.** Inter on all platforms vs. SF Pro on macOS / Inter
   elsewhere (two-typeface compromise). The current choice is Inter-everywhere
   for consistency; native-purist reviewers may push back.
3. **JetBrains Mono vs. SF Mono / IBM Plex Mono.** Trade-offs in §1.3.
4. **4pt vs. 8pt grid.** 4pt was chosen for editor-workload density. 8pt would
   be cleaner for non-editor workloads. A hybrid (8pt grid with 4pt half-stops
   for editor only) was considered and rejected because it complicates the token
   set.
5. **Single-spinner exception in §2.7.** The marquee-dots compromise for button-
   in-flight may strike reviewers as too clever; the alternative is silence
   (disabled button with label change only).
6. **Toasts forbidden — too strict?** A reviewer might argue background-Tier-3
   completions (Walkthrough 4) deserve a transient surface that doesn't displace
   canvas content. Current answer: those are status primitives in a designated
   "activity" pane, not toasts. Worth re-examining.
7. **Patch-highlight overlay (§4.1).** ~800ms accent-subtle wash may be too long
   for high-frequency patch streams (typing-speed canvas updates in Walkthrough 4
   step 8: live notes pane). A patch-rate-aware shorter highlight, or no
   highlight on rapid streams, may be needed.
8. **Empty canvas hint (§5.1).** The "Canvas ready. ⌘K to start." caption is the
   single concession to discoverability. A reviewer might reasonably argue for
   no caption at all. Counter-argument: first-launch UX without any affordance
   leaves new users staring.

---

## 10. Changelog

- **v0.1** — first draft, written against CONCEPT.md v0.7 and walkthroughs.md.
  Defines tokens (light + dark), 24 per-primitive visuals, 5 composition idioms,
  motion language, accessibility floor, anti-patterns. 8 open questions flagged
  for Codex review.
