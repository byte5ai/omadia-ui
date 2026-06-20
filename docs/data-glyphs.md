# Omadia UI — State as glyph, not prose (proposal)

> **The generative layer narrates state it should *show*.** The render patterns
> already exist (KPI cards, status dots, charts, progress bars); what's missing
> is the **authoring discipline** that makes the agent reach for them instead of
> a sentence — the same LLM-text-bias that had left icons unaddressed. Plus one
> small affordance: a compact / `spark` `chart` variant for inline sparklines.

**Status:** proposal / RFC. Targets the **UI Skill** (an authoring protocol), a
small **protocol 1.1** additive (`chart` spark variant), and a **visual-spec**
note. Companion to `visual-spec.md` §2.7 (prose-vs-structure) and
[`iconography.md`](iconography.md). Sibling to the icon work: icons gave the
agent a glyph *vocabulary*; this gives it a *when-to-show-vs-narrate* rule.

## 0. The finding (verified against the repo)

| Where | Today |
|---|---|
| `protocol/1.0.md` §2 | `chart` · `status` · `progress` primitives exist. |
| `CONCEPT.md` §302, `visual-spec` §4 | a **KPI is a composition**, not a primitive: `grid` of `container` + `chart` + `status` + KPI-`text`. Status renders a dot + one word (§3.3). |
| `visual-spec` preview §8 (dashboard) | mockups already render KPI value + delta arrow + a "weekly trend" mini-bar. |
| everywhere | **nothing tells the agent *when* to show vs. narrate.** §2.7 governs typographic *register* (prose/structure/mono), not glyph-vs-prose. No compact / sparkline chart variant — the KPI trend mini-bars are mockup-only. |

**Consequence.** The text-biased agent (it emits tokens → prose is the path of
least resistance, exactly the icon root cause) writes *"Deep work session: 2 h
15 m so far, going well"* where it should compose KPI-`text` **"2h 15m"** + a
sparkline + a delta. State arrives as a paragraph instead of a glance.

## 1. Not re-specified here (already there)

| Already canon | Where |
|---|---|
| `chart` / `status` / `progress` / `text` primitives — sufficient for most state | §4 |
| KPI = composition, **not** a primitive (keep it that way) | CONCEPT §302 |
| Semantic state is text-only, no pill salad; status **dots** are allowed | §2.6, §3.3 |
| Data-dominant typography; accent marks the live/positive signal | §0 constraint 3, §1.2, preview `kpi-delta.up` glows `accent` |

This proposal adds **discipline + one small affordance**, no new primitives.

## 2. The principle — "show state, don't narrate it" (the core)

A UI-Skill authoring protocol, sibling to the §2.7 prose-vs-structure protocol.
**When the agent holds a value of one of these kinds, it prefers the visual
primitive over a sentence.** Prose is for narration, analysis, reasoning,
recommendation — never for a bare value.

| Value kind | Preferred element | Notes |
|---|---|---|
| Single quantity / metric | KPI-`text` (big number + label) | mono register; the number is the loudest thing on the card |
| Trend / series over time | `chart`, or the `spark` variant (§3) inline | axisless when inline |
| Discrete status / health | `status` (dot + one word) | §2.6 / §3.3 — never a filled pill |
| Progress / ratio / completion | `progress` | lit accent bar (§4) |
| Change vs. baseline (delta) | delta chip: value + direction arrow | arrow is an `app:` icon (iconography PR); accent up / `state.warning` down |

**Prose stays** for: explanation, the reasoning behind a value, a recommendation,
and a short narrative caption *above* a visualisation. The rule replaces
*value-as-sentence*, not *insight-as-sentence*.

**Where it lives.** The UI Skill carries the rule (alongside the §2.7
prose-vs-structure protocol and the palette-binding protocol); `visual-spec`
gets a short cross-referencing note. The principle itself needs **no wire
change**.

## 3. The one affordance gap — compact / `spark` `chart` (additive 1.1)

`chart` today is a full chart (axes, legend, tooltip; §4). Inline state — a KPI
"weekly trend", a per-row sparkline — needs a compact, axisless, legend-less
variant sized to a text line. Add a `chart` variant:

```json
{ "type": "chart", "variant": "spark", "points": [ … ] }
```

- No axes, no legend, no default tooltip; single `accent` stroke + soft
  `accent.glow` underglow (reuse the §4 chart recipe at small size).
- Additive 1.1 trait → 1.0 clients ignore `variant` and render the full chart
  (graceful degradation).

The **delta chip** needs *no* primitive — it is a composition (a `text` value +
an `app:` arrow glyph + accent / `state.warning` tint). Document it as a recipe
+ the §2 Skill rule, not as wire surface.

## 4. Ties to canon

- **Accent as signal.** A positive delta / live trend tints `accent` (the
  preview's `kpi-delta.up` already glows accent); a negative delta is
  `state.warning` **text**, never a red pill (§2.6).
- **One accent slot · data-dominant typography.** The value is the loudest
  element; prose recedes. No second colour language sneaks in via charts.
- **Status stays a dot + word** (§3.3), not a badge.

## 5. Don't overcorrect (the anti-patterns)

- A sparkline or number with **no label** is mystery-meat — always pair value +
  label.
- **No gauge / dial salad.** Tremor's "chart restraint" (a `visual-spec` §0
  reference app) holds: a single static value is just KPI-`text`, not a
  speedometer. Not every number wants a viz.
- **Don't strip genuine narration.** The agent's analysis and recommendations
  stay prose; only bare-value-as-sentence is the target.

## 6. Relationship to the icon work

Both correct the same root cause — the LLM's bias toward text. Icons (PR #41,
`docs/iconography.md`) give the agent a glyph *vocabulary* it can place;
state-as-glyph gives it a *when-to-show-vs-narrate* discipline. They compose: the
delta-chip arrow is literally an `app:` icon from that vocabulary.

## 7. Open questions

1. `spark` as a `variant` value vs. a `density` value on `chart`.
2. Does `status` need a typed health enum (`ok` / `warn` / `error`) to drive the
   dot colour, or is the existing semantic-state token + text enough?
3. Exact home of the Skill protocol block — the CONCEPT.md UI Skill section vs. a
   standalone authoring-discipline doc.
