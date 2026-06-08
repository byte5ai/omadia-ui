# Omadia UI — Design Rationale

> The path from "Chat is the DOS era of LLM interaction" to Lume + Lagoon +
> Source Serif 4. Companion to `CONCEPT.md`, `visual-spec.md` and
> `tech-stack.md`, which all document the *what*. This document documents
> the *why* — research findings, reference-app analysis, alternatives
> considered and rejected, the iterations the design went through.

Audience: anyone joining the project who wants to understand the
decision-making, anyone preparing a team slide deck, anyone reviewing
whether the conclusions still hold against new evidence.

---

## 0. How to read this document

- This is **a narrative**, not a spec. The order is roughly chronological
  (thesis → reference scan → material hypothesis → palette → typography),
  not normative.
- Every section ends with a **"What ships:"** block referencing the relevant
  normative doc, so the reader can jump from the *why* to the *what*.
- Sources at the end (§13). All claims that depend on external evidence
  link back to a source there.
- Where the team disagrees with a conclusion, the right artefact to update
  is the normative spec (`CONCEPT.md` / `visual-spec.md` / `tech-stack.md`),
  not this document. This document is the historical record.

---

## 1. The AI-first UI thesis

### 1.1 The categorical claim

> "Chat is the DOS era of LLM interaction: powerful, but linear, text-only,
> single-stream. Omadia UI is the next layer." — CONCEPT.md §"Vision"

This is the load-bearing premise of the whole project. Two things follow
from it:

1. **The form factor of LLM interaction is not solved.** Despite three
   years of ChatGPT-style products, every leading agent product still ships
   the same chat-bubble surface. Some experiments exist (Anthropic's
   Artifacts, OpenAI's Canvas, Vercel's v0) but they treat *generated
   content* as the artefact and chat as the still-central interaction
   surface. None of them treat *the UI itself* as the agent's primary
   output medium.
2. **The bottleneck for what an agent can show should be the model, not
   the architecture.** Top-tier LLMs already know what a Norton Commander
   layout, a Photoshop workspace or a multi-track timeline look like.
   The product surface should let them express any of those, in the
   composition the user's task wants in the moment.

### 1.2 The design constraint this generates

If the UI is generated per turn from a fixed vocabulary, then:

- **Composition is the USP, not optics.** Two users running the same
  Omadia at the same time can see radically different layouts (Norton
  Commander for one, Dashboard for the other) — but the *visuals* must
  read as one coherent product. Otherwise we have a skinning system, not
  a UI synthesis system.
- **No one designer ships a "design".** Designers ship the primitive
  vocabulary + the theme + the composition idiom library. The actual
  surface the user sees is co-authored by the agent at runtime.
- **User preferences are conversational, not configural.** Settings
  screens belong to apps where the user adjusts a fixed product. Omadia's
  surface is generated to the user's task; the user expresses preference
  in the same channel they express the task.

### 1.3 Where this is encoded normatively

CONCEPT.md §"Vision" and §"Architecture — Two Dimensions". The constraint
"no Settings UI" propagates through every subsequent decision (palette
binding, type register, density preferences).

---

## 2. UI platform reference analysis

Every design decision needs a reference frame. Which existing products do
we adopt patterns from? Which do we explicitly *not* look like?

### 2.1 References we orient toward

| Product | What we adopt | Why |
|---|---|---|
| **Linear** | Typography rigour, density discipline, ⌘K command palette, focus-ring discipline | Most coherent productivity-tool design language of the 2020s. Their "ProKit philosophy" — translucency without refraction — is also our Lume throttling principle. |
| **Things 3** | Restraint, generous whitespace, single soft accent | Proves that consumer-tier minimalism can carry serious work without becoming friendly. |
| **Raycast** | Spotlight idiom, compact result lists, mono-leaning utility feel | The ⌘K-everything pattern, distilled. |
| **Vercel (Geist)** | Type system (Geist Sans + Geist Mono), data-density-first discipline | Vercel commissioned Geist *because* Inter wasn't good enough for data-dense developer UIs — that critique applies to Omadia too. |
| **Notion (light mode)** | Typographic hierarchy, content-dominant pages | Notion treats the page as the protagonist; chrome recedes. Same value as Omadia's "data-dominant" rule. |
| **Tremor** | Restrained chart palette discipline | Charts in a single accent, never multi-hue. |
| **shadcn-ui** | Token discipline, component composability | The token model (`bg.surface`, `accent.subtle`) is shadcn-style semantic naming. |
| **Apple Design Resources (latest)** | Native macOS rhythm, control shape, motion timing | macOS-first means the rendering bar is the bar Apple sets. |

### 2.2 References we explicitly avoid

| Product | Why we don't look like this |
|---|---|
| Confluence | Enterprise visual clutter, multiple competing accent colors, "every-feature-everywhere" mass. |
| Microsoft Teams | Heavy chrome, blue overload, tab-and-pane fatigue. |
| JIRA Cloud | Status-pill salad (red/green/yellow/orange), badge-everything aesthetic. |
| Figma sidebars | Information-dense to the point of visual noise; too many panels. |
| Slack | Single-conversation-stream paradigm. Omadia's *canvas* is the opposite premise. |

### 2.3 Why Anthropic is a special case

Anthropic's brand uses Styrene (paid grotesque sans, Berton Hasebe) +
Tiempos (paid editorial serif, Klim Type) with a warm terracotta accent
in an editorial layout. That is *architecturally* what Omadia ended up
proposing — modern sans + editorial serif, warm accent. We treat
Anthropic-adjacency as a **risk to manage**, not as a destination:

- Different actual fonts (Geist vs Styrene, Source Serif 4 vs Tiempos)
- Different actual palette (Lagoon teal vs warm terracotta)
- Different positioning (productivity canvas vs research lab)

Anthropic-adjacency was the explicit reason **Atelier (warm-amber palette)
was kept off the default slot** — it would have collided too closely
with Anthropic's terracotta. Lagoon (teal-cyan) keeps Atelier available
as an alternative without leading with it.

### 2.4 What ships

`CONCEPT.md` §"The UI Skill" composition-idiom library; `visual-spec.md`
§"Non-negotiable constraints" reference list. The Reference list in the
spec is the short-form version of this section.

---

## 3. Apple's material lineage

### 3.1 The pattern

Apple has, in every generation since 1984, shipped a **named material**
with physical properties. Not a colour scheme; a material. The material
is what users name when they describe an Apple OS visually.

| Era | Year | Material name | What it was |
|---|---|---|---|
| Classic Mac | 1984–2000 | (unnamed, but: 1-bit B/W, Chicago/Geneva, Kare icons) | The first widely-adopted GUI with personality. |
| **Aqua** | 2001 (Mac OS X) | Water-droplet / "lickable" surfaces | Translucency, reflection, soft drop shadows; Apple's first explicit material identity for the Mac era. |
| iOS 1–6 | 2007–2013 | Skeuomorphism — leather, wood, felt | Photorealistic textures imported from physical objects. Forstall era. |
| **iOS 7** | 2013 | Frosted glass | Realtime blur as hierarchy mechanism; flat reset; Ive era. The biggest visual reset in tech UI in 30 years. |
| Big Sur | 2020 (macOS 11) | Vibrant translucency | Softer corners, increased contrast, iOS-leaning macOS. |
| **visionOS** | 2023 | Spatial glass | Glass-like UI elements designed for spatial computing. Three material tiers (`.thin`, `.regular`, `.thick`). Specular highlights for depth perception. |
| **Liquid Glass** | 2025 (iOS 26, macOS Tahoe 26) | Adaptive refractive meta-material | Translucency + refraction + dynamic adaptation to content behind it. Unified across iPhone, iPad, Mac, Watch, TV, Vision. Apple's first cross-platform material. |

### 3.2 The throughline

The progression isn't a colour or shadow style — it's the consistent
treatment of **light as the structural element**. From Aqua's reflections
through iOS 7's frosted blur to visionOS's specular highlights to Liquid
Glass's refraction, the question Apple keeps answering is:
*how does light shape this surface?*

Apple states this directly about Liquid Glass:

> "Liquid Glass is composed of multiple layers that continuously shift
> tint, shadows, and dynamic range to ensure legibility while maintaining
> visual clarity. Unlike previous materials that had a fixed light or
> dark appearance, each layer continuously adapts based on what's behind
> it." — Apple Newsroom, 2025

And explicitly attributes the lineage:

> "Liquid Glass builds on learnings from all the way from the Aqua user
> interface of Mac OS X, through to the realtime blurs of iOS 7, to the
> fluidity of iPhone X, the flexibility of the Dynamic Island, and the
> immersive interface of visionOS." — Apple Newsroom, 2025

### 3.3 The lesson for Omadia

The current Omadia v0.1 spec (the predecessor to the Lume spec) had no
material. It picked tokens from the Linear/Notion lineage — which itself
is second-derivative of Apple's flat-era patterns. The result was
*correct in spirit but materially flat*: we shipped buttons and tables
without a material story.

This was a load-bearing gap. The Omadia thesis is that the agent
*materialises UI live*. The visual identity must say so too. Apple's
progression shows that material identity is what users actually name —
not the colour, not the typography, but "the iOS 7 look" or "the
visionOS look".

### 3.4 Linear's ProKit precedent

Linear adapted Liquid Glass for productivity tools in 2025–2026 with
explicit, well-documented design discipline. What they kept, what they
discarded, and why, became the template for Omadia's Lume material
throttling:

| Kept by Linear | Discarded by Linear | Reason given |
|---|---|---|
| Translucency, depth | — | — |
| Soft edge blur at scroll-view boundaries | — | — |
| Physical light response (specular core) | — | — |
| Accessibility-first contrast | — | — |
| — | **Refraction** | "Refraction can make dense professional interfaces harder to read." Pixel-level access also impractical for third-party developers. |

Implementation: layered effects — Gaussian blur base + subtle gradient
for structure + specular highlight via SwiftUI shader using signed
distance fields.

The conclusion Omadia draws: **light-as-material is portable to
productivity tools if you throttle out refraction and the optical effects
that compete with data legibility.**

### 3.5 What ships

`visual-spec.md` §1 ("Material — Lume"), specifically §1.3 "What Lume is
NOT" — the explicit list of Apple-lineage features we discard. The
no-refraction rule cites Linear's ProKit directly.

---

## 4. The Lume hypothesis

### 4.1 How we got here

The starting point: v0.1 of `visual-spec.md` had tokens, primitives, a
composition idiom library — but no material identity. Reviewing it
against Apple's lineage (§3 above) made the gap concrete: every
established product surface ships a *material*; Omadia v0.1 shipped a
set of tokens without one.

The question became: what material identity is **coherent with the
Omadia thesis**?

Brainstormed candidates:

| Candidate | Story | Why rejected (if applicable) |
|---|---|---|
| Liquid Glass adoption | Inherit Apple's direction directly | Dated quickly; Apple owns this language; copying reads derivative |
| Paper / vellum | The canvas is a piece of paper the agent draws on | Too skeuomorphic, fights the "this is computer-generated UI" message |
| Synthesized surface | Subtle gradients that signal generation | Hard to nail visually; easy to slip into noise |
| **Light-as-material ("Lume")** | UI condenses out of light. The agent's attention is visible as accent-tinted illumination. | **Selected.** Directly reinforces "agent materialises UI" thesis. |
| Studio glass / vellum + light | Backlit studio table | Subsumed into Lume; the "light" is the load-bearing idea |

### 4.2 What Lume claims, in one sentence

UI doesn't get drawn, it *materialises*: backgrounds carry a subtle
directional luminosity that suggests they were generated from light, not
printed on paper; the accent is the trace of where the agent's attention
has been.

### 4.3 The four forces

These were derived working backwards from the claim. What concrete CSS
properties have to be present for "light-as-material" to read as
material, not as decoration?

1. **Surface luminosity** — every surface a `linear-gradient(180deg,
   top, btm)` with ~1.5% L difference. Imperceptible per-surface,
   cumulative across the screen.
2. **Accent as illumination** — single accent token splits into fill
   (buttons) and glow (halos at selection/focus). `accent.glow-core` is
   white-shifted to read as *emitted light*, not as tinted shadow.
3. **Directional borders** — top edge lighter than bottom edge, so the
   border catches light from above. Gives surfaces perceived thickness.
4. **Soft corners (with editor exception)** — light has no edges. Radius
   scale shifts one stop softer; the editor boundary (`canvas-region`,
   `timeline`) stays at radius 0 to mark the boundary where Lume material
   ends and the user's raw work begins.

### 4.4 Why "Lume"

Apple names every material era. We follow the convention because it
forces decisions and gives the team a vocabulary. Candidates considered:

| Name | Why considered | Why not |
|---|---|---|
| Aurora | Light show, gradient hues | Too cosmic, suggests colour-shift |
| Atelier | Workshop, craftsman | Undersells the synthesis angle |
| Vellum | Translucent design paper | Misses the light aspect |
| Specular | Optical phenomenon | Too technical |
| Phosphor / Cathode | Emissive electronics | Backward-looking |
| **Lume** | Short, light-evocative ("luminance"), Apple-tradition (substantive material name), not Apple-mimetic | **Selected** |

### 4.5 What ships

`visual-spec.md` §1 (Material — Lume), §2 (token model with `top`/`btm`
pairs), §3 (implementation primitives: two-stop glow, donut glow,
directional border, patch condensation).

---

## 5. 2026 industry-trend mapping

External evidence — what the design world is moving toward in 2026 —
gave us the calibration for which of our intuitions were on-trend, which
were defensive, and which were genuinely differentiating.

### 5.1 Colour trends

| Source / signal | Finding | What it told us |
|---|---|---|
| **Pantone Color of the Year 2026 — "Cloud Dancer"** (white) | First-ever white as CotY. Pantone framed it as "a calming influence in a society rediscovering the value of quiet reflection." | The mood is *away from chroma toward atmosphere*. Lume's light-over-colour priority is on-trend, not contrarian. |
| **2026 SaaS palette trend reports** (UpDivision, Recursion, I Love Hue) | Explicit movement away from "Startup Blue" (#2563EB, #3B82F6). | Petrol-blue (our v0.1 default) is exactly the territory the industry is leaving. Reinforced the multi-palette decision. |
| **Elevated warm neutrals** (sand, stone, oat) replacing pure white | Lume's `bg.canvas` already trends slightly warmer than pure white. Matches. | Atelier-warm-amber palette is a *trend-positioned* alternative, not a niche choice. |
| **Eco-inspired palettes** (moss, ocean, copper) | Lagoon (ocean-teal) and Atelier (copper-warm) sit directly in this family. | The three palettes span the 2026 trend space: cool (Petrol), warm (Atelier), eco (Lagoon). |
| **Neon cyan + violet AI cliché** (#8B5CF6 → #06B6D4 gradient) | Visible everywhere in AI startup branding 2024–2025. | Documented as "what we're NOT doing." Confirmed avoidance. |
| **Dark mode as default expectation** | Universal in productivity tools by 2026. | Lume tokens are dual-mode from inception; no retrofit needed. |

### 5.2 Reference-app palette positioning

| App | Accent | Position |
|---|---|---|
| Vercel | `#0070F3` blue | "Startup Blue" territory, the very thing 2026 is moving away from. |
| Linear | Purple | Distinctive but Linear-owned. |
| Things 3 | Sky-blue | Friendly, soft, consumer-tier. |
| Raycast | Bright red | Energetic, but collides with error-red semantically. |
| Notion | Effectively neutral / configurable | Brand-light; the accent is optional. |
| Anthropic | Warm terracotta | Editorial / research-lab feel. |
| **Omadia (Lagoon default)** | Petrol-cyan teal | Differentiated from every reference app; on-trend (eco-ocean); separable from error/warning by hue and chroma. |

### 5.3 Typography trends

| Source / signal | Finding | What it told us |
|---|---|---|
| **Inter ubiquity** | "Inter has become the typographic equivalent of a design standard for the SaaS industry" (Linear, Notion pre-Diatype, Vercel pre-Geist). | Inter is the *Startup Blue of type*. Choosing it = zero typographic differentiation. |
| **Geist (Vercel × Basement Studio, 2023)** | Vercel commissioned a new font because "existing monospace fonts" were lacking; built Swiss-design-inspired, variable-axis, sibling sans + mono. MIT-licensed. | Open-source escape hatch from Inter that does the same job better. Free. |
| **Berkeley Mono (US Graphics)** | Used by Perplexity AI. Paid commercial license. | Excellent but paid + single-foundry-dependency. Lock-in risk for an open-source-aligned project. |
| **Editorial-serif revival in productivity** (Wispr Flow rebrand, Anthropic, neuere Vercel-Subdomains) | "Every SaaS dashboard started to look the same with pastel gradients, friendly sans-serif type, and meaningless illustrations — but professionals don't want decoration." | Mixing modern sans with editorial serif is a 2026 productivity-tool move, no longer "Anthropic-only" territory. |
| **Variable axis as mandatory best practice** | One file per family; weight + width + slant + optical-sizing in a single asset. | All three Omadia families (Geist, Geist Mono, Source Serif 4) are variable — alignment with the industry standard. |
| **Anthropic's pair: Styrene + Tiempos** | Editorial sans + serif, paid commercial. | Architecturally what Omadia ended up doing — different specific fonts, same pattern. Adjacency managed by font choice. |

### 5.4 What ships

`visual-spec.md` §2.5 (palette token tables with trend rationale inline),
§2.7 (type-architecture rationale with "Why not the v0.2 baseline" block).

---

## 6. Palette decision trail

### 6.1 Iteration 1 — four candidates against the v0.1 single-accent slot

When v0.1 first asked "which colour?", four candidates were presented:

| # | Candidate | Hue | Story | Outcome |
|---|---|---|---|---|
| 1 | Petrol / Steel blue | 235° | Computational ambient, calm | **Carried forward.** Most-restrained, defensible as a default. |
| 2 | Linear indigo | 280° | Familiar productivity-tool feel | Rejected. Reads as a Linear clone. |
| 3 | Things sky-blue | 240° | Calm, friendly | Rejected. Reads consumer-app, not editor-grade. |
| 4 | Raycast bright red | 25° | Distinctive, energetic | Rejected. Collides with `state.error.fg` hue (25°). |

Outcome: Petrol locked as the leading candidate for the v0.1 default.

### 6.2 Iteration 2 — review feedback: under-powered

Review of the v0.1 preview flagged the single-accent approach as
visually under-powered: defensible but uninspiring. That feedback forced
a re-examination. The Apple-lineage research (§3 above) was triggered
by this exact gap. The conclusion: the problem wasn't Petrol
specifically — it was that **a single accent on flat material has no
story.** Material identity (§4) needed to come *before* palette
selection, not after.

This ordering is now baked into the design rationale: material first,
then palette.

### 6.3 Iteration 3 — three curated palettes proposed

With Lume established as the material, the palette question changed
from "which one colour?" to "which spectrum of light source?". Three
candidates emerged from a deliberate trend-mapping exercise (§5):

| Palette | Hue | Story | Trend-position |
|---|---|---|---|
| **Petrol** | 235° | Computational ambient | Cool/blue family, restrained, traditional productivity |
| **Atelier** | 50° | Studio warmth, craftsman lamp | Warm-amber family, 2026 elevated-warm-neutrals trend |
| **Botanical** (initial) | 195° | Bioluminescence, generative tide | Eco-inspired ocean trend |

All three were positioned to:
- Span different hue families (no two adjacent on the colour wheel)
- Each carry a distinct narrative under Lume (different "light source")
- All clear semantic-state hues (error 25°, warning 80°, success 150°)
- Avoid every reference-app's accent space (Vercel blue, Linear purple,
  Anthropic terracotta)

### 6.4 Iteration 4 — Botanical refinement to Lagoon

Review of the three-palette preview surfaced a real implementation gap
in the third palette (Botanical): the colour read as under-utilised in
light mode (too austere) and out of balance against the stronger
dark-mode rendering. The recommendation was a twist that would lean
harder into the light metaphor.

The diagnosis: the light-mode glow was reading as a tinted *shadow*,
not as emitted *light*. Two changes followed:

1. **Hue shift** 195° → 200°: cyan-leaning shift from "deep pool" to
   "lit water surface".
2. **`accent-glow-core` token introduced**: a *bright cyan-white* (rather
   than accent-tinted) inner core that reads as emitted light in light
   mode. Closed the light/dark asymmetry.

The refined palette was renamed Lagoon — water + light, not "botany".
The naming change also made the architectural change visible: this
wasn't Botanical-v2, it was a new identity built on the same foundation.

The `accent-glow-core` token then propagated as a **universal Lume
primitive**, not Lagoon-specific — all three palettes gained it. This
turned the Lume material itself stronger across the board, not just
Lagoon.

### 6.5 Iteration 5 — user-bindable, not single-shipped

After locking the three palettes, a natural question: which one ships as
*the* Omadia colour?

The answer reframed: **all three ship; the user binds.**

Reasoning:
- CONCEPT.md already documents context-aware preferences keyed by
  `contextKey`. The infrastructure exists.
- Apple lets users pick the system accent on macOS and iOS. OS-like
  surfaces (which Omadia is) follow that convention; brand apps (Linear,
  Slack) usually don't.
- This is not dynamic skinning — the material (Lume), typography,
  spacing, motion, idioms remain single-source. Only the value bound to
  the `accent` token slot varies.
- Different work contexts genuinely want different light sources
  (financial review wants calm, creative work wants warmth, research
  wants generative-eco).

**Default palette: Lagoon.** It carries the strongest light-metaphor
coherence, differentiates maximally from reference apps, and is what
ships in marketing screenshots, app icon, splash, demo videos.

### 6.6 What ships

`visual-spec.md` §2.5 (three full palettes with light + dark mode tokens),
§2.5.4 (binding rules); `CONCEPT.md` §"Style" (the user-bindable-not-
dynamic-skinning distinction); `CONCEPT.md` §"The UI Skill"
(palette-binding protocol).

---

## 7. Typography decision trail

### 7.1 The recognition

The first draft of `visual-spec.md` had Inter + JetBrains Mono —
selected casually, with the rationale "Inter for cross-platform
consistency via Skia, JBM for distinguishable digits". After the
material and palette decisions had been locked, the typography choice
was flagged in review as under-researched relative to the rest of the
spec — closer to placeholder than to deliberate decision.

The honest assessment: not pure placeholder, but **not researched at
the same depth as material and palette either.** Inter + JBM is the
*Startup Blue of typography* — the same defensive choice the palette
work explicitly rejected.

### 7.2 The research

Same depth as the palette work this time. Findings (§5.3 above):

- Inter is the SaaS industry default; Linear, Notion (pre-Diatype),
  Vercel (pre-Geist) all ran it. Zero typographic differentiation.
- Geist (Vercel × Basement, 2023) was built *specifically* because
  existing UI sans wasn't good enough for data-density. Sans + Mono
  designed as siblings, every weight aligned across families.
  MIT-licensed.
- Berkeley Mono is excellent but paid.
- Söhne + Tiempos (Anthropic) is paid and architecturally adjacent to
  any editorial-mix approach.
- Editorial-serif revival in productivity tools is a documented 2026
  trend (Wispr Flow rebrand cited; Anthropic-style mixing now industry-
  pattern rather than Anthropic-property).

### 7.3 Three architectures proposed

| # | Architecture | Sans | Mono | Serif | License | Position |
|---|---|---|---|---|---|---|
| A | Safe / Defensive | Inter | JetBrains Mono | — | OFL | The v0.2 baseline; zero differentiation |
| B | Distinctive Modern | Geist | Geist Mono | — | MIT | Vercel-built, sibling-designed, free; no editorial slot |
| C | Editorial Mix | Geist | Geist Mono | Source Serif 4 | MIT + OFL | Adds editorial register; alignment with 2026 trend |

Recommendation: C — strongest Lume-narrative match. Agent's three speech
acts (prose, structure, data) get three typographic registers.

### 7.4 The Anthropic-adjacency check

Review of Architecture C flagged its architectural similarity to
Anthropic's typography pattern (modern grotesque sans + editorial
serif). True observation. The *architectural pattern* (modern sans +
editorial serif) is the same as Anthropic's. The specific fonts differ
(Geist vs Styrene, Source Serif 4 vs Tiempos), and the typographic
register lands differently (Geist's Swiss precision vs Styrene's warm
grotesque; Source Serif's neutral body face vs Tiempos's refined
editorial).

The deeper question raised: how much Anthropic-adjacency is acceptable?
The same question that ruled Atelier out as the default palette.

Three alternatives proposed within Architecture C: Source Serif 4 (the
neutral choice), Fraunces (the characterful old-style-revival), or
Newsreader (designed for screen news reading).

### 7.5 Iteration with Fraunces (Architecture D)

Fraunces was added to the preview because it has a *variable SOFT
axis* — the type itself responds to material conditions. SOFT 50 on
Lume-lit chrome surfaces, SOFT 70 on prose panes — typography
participating in the material story. Conceptually the strongest Lume
match.

Field-test feedback on Fraunces was decisive: too heavy in stroke
weight, too ornate in character, too broad in proportion, not fluid
enough for productivity-tool prose. Architecture C (Source Serif 4)
was preferred unambiguously.

Fraunces' old-style-revival character was genuinely too heavy for
productivity-tool prose, regardless of the SOFT-axis cleverness. The
lesson: theoretical material coherence cannot override actual
reading-feel. Source Serif 4's neutral character was the right call
all along.

### 7.6 Decision locked

Architecture C, Geist + Geist Mono + Source Serif 4. The
Anthropic-adjacency risk is acknowledged but accepted on the grounds
that:

1. The actual fonts are different (Geist vs Styrene-pair distinct
   character; Source Serif 4 vs Tiempos distinct body-face neutrality).
2. The editorial-mix architecture is a 2026 industry trend, not
   Anthropic-property anymore.
3. The license profile is strictly better (all open-source vs
   Anthropic's paid commercial pair).

### 7.7 What ships

`visual-spec.md` §2.7 (three-register typography with full token table,
variable-axis usage, font loading, fallback chains); `CONCEPT.md`
§"The UI Skill" (prose-vs-structure protocol — when the agent emits
`style: "prose"` to trigger the serif register).

---

## 8. Editor boundary decision

### 8.1 The problem

Lume material is everywhere — but a Photoshop-style `canvas-region`
should *not* feel lit-from-above. The user's raw bitmap is the user's
work; the agent's hand isn't on it. How to mark that boundary visually
without breaking material consistency?

### 8.2 The dual rule

| Surface class | Treatment | Why |
|---|---|---|
| Lume chrome (everywhere the agent has touched) | Soft corners (`radius.sm` to `radius.lg` = 6–12px), gradient surfaces, accent glow on focus | The agent's authored space; light-as-material applies |
| Editor surfaces (`canvas-region`, `timeline`, Photoshop-style tool buttons, in-editor toolbar) | Sharp corners (`radius.0`), opaque background, no surface gradient | The user's raw work surface; Lume material *ends here* |

This emerged from the corners discussion: light has no edges, so Lume
chrome must be soft — *except* where the metaphor explicitly stops. The
visual contrast (lit chrome around an opaque sharp-cornered region)
doubles as a Tier-1 boundary marker: it's exactly where Class-A direct
gestures (brush, scrub) take over from Tier-2-routed semantic intents.

### 8.3 What ships

`visual-spec.md` §2.9 (Radii — Lume scale with editor exception), §4.2
(per-primitive notes on `canvas-region`, `timeline`, `media`,
`vector-path`).

---

## 9. AI-first UI design constraints

A consolidated list — derived from the thesis (§1) but not always
spelled out as a single set in normative docs. These constraints
*should* be derivable from the architecture, but listing them together
helps future contributors notice when a proposed change violates one.

| Constraint | Why it follows from the AI-first thesis |
|---|---|
| **Skeleton, no spinner** | The agent emits a primitive whose final shape it already knows; the skeleton previews that shape. A spinner conveys nothing. |
| **One accent slot** | The agent's attention is a single thing per turn. Multiple competing accents would imply multiple agents working in parallel. |
| **No Settings UI** | User preferences are conversational. A Settings pane is a fixed product's interface; the canvas is generated to the user. |
| **Data-dominant typography** | The data is what the user came for. Chrome that competes with data fights the agent's content. |
| **Keyboard-first** | Power users move at chat-speed. Mouse-only interactions force them out of the agent's interaction rhythm. |
| **Material identity over era skinning** | Era skinning would imply the user picks the visual identity. Material identity says: the product has one visual identity, the agent picks the *layout* within it. |
| **Single material, three palettes** | The light source can vary; the material does not. Material identity is brand; palette is personal context. |
| **Sharp boundary at editor surfaces** | The agent doesn't author user content. The visual contrast marks the handoff. |
| **External-effect actions need confirmation modals** | An agent acting without confirmation is a liability. The confirmation modal is a structural protection, not a UX choice. |
| **No status pill salad** | Status pills imply parallel state machines. The agent has one piece of attention per turn; the visual language reflects that. |
| **No toasts** | The canvas is the surface of record. A transient notification stream the agent didn't author would be a parallel channel that breaks the model. |

### 9.1 What ships

These constraints are enforced through `visual-spec.md` §1.1
"Non-negotiable constraints inherited from CONCEPT.md" and §7.6
"Anti-pattern list".

---

## 10. Open hypotheses for spike

The decisions documented above are conclusions reached against the
available evidence — research, reference-app analysis, three rounds of
user-feedback iteration. They are not yet **empirically validated** at
the implementation level. The spike phase (see `tech-stack.md`) exists
to test the load-bearing assumptions.

| Hypothesis | Where documented | Why it needs spike-level evidence |
|---|---|---|
| Haiku-class LLM can reliably emit valid primitive trees as tool-use JSON | CONCEPT.md §"Riskiest Assumptions" #1 | If false, Tier-2 LLM cost is much higher (Sonnet-class) and the latency story changes. |
| Lume material renders at 60fps in Electron + Skia under typical canvas density | `visual-spec.md` §11 question 4 | If false, multi-layer box-shadows + gradients need GPU optimisation or simplification. |
| Local operations catalog is sufficient for editor workloads | CONCEPT.md §"Riskiest Assumptions" #3 | If false, editor lane constantly hits Tier-3, breaking the latency claim. |
| HMAC-signed `dataRef` rotation is operationally manageable | CONCEPT.md §"Riskiest Assumptions" #5 | Standard pattern, but spike must validate rotation procedure. |
| `crossChannelConversationMemory@1` will be delivered by omadia core in time | CONCEPT.md §"Riskiest Assumptions" #6 | Out-of-scope dependency; if it slips, ship degraded (per-channel context only). |
| Composition-idiom library gives era-style requests value without dynamic skinning | CONCEPT.md §"Riskiest Assumptions" #7 | Empirically falsifiable; if users reject Norton-Commander-as-layout-only, skinning becomes a v2 addition. |
| Anthropic-adjacency in the editorial-mix typography is tolerable | This document §7.4 | Not a technical question; user-feedback question. First-user test will surface it. |
| Lagoon-default carries marketing weight without alienating Petrol-natives | This document §6.5 | Not a technical question; first-user / sales feedback will surface it. |

### 10.1 What this means for sprint planning

The spike phase is the next chapter, not a refinement chapter. The
design rationale is *complete enough* to ship the spike; the spike is
where the design is tested against reality.

`tech-stack.md` §"Spike plan skeleton" defines the Tier-1 spike
(Walkthrough 1 skeleton + Walkthrough 2 editor primitives). The
Tier-2 LLM-tree-synthesis spike is **not yet planned at the same
detail level** — that's the gap to close before sprint 1 starts.

---

## 11. Glossary of decisions (for slide-deck use)

A one-line summary of every load-bearing decision, suitable for slide
titles or bullet-point references.

### Material
- **Lume** = the Omadia material identity. Light-as-material.
- **Four forces** = surface luminosity, accent-as-illumination,
  directional borders, soft corners (with editor exception).
- **No refraction, no blur-everywhere, no specular sheen on chrome,
  no glassmorphism.** Linear's ProKit lesson, adapted.

### Palette
- **Three curated palettes** = Petrol (cool), Atelier (warm), Lagoon
  (lit teal-cyan). **Lagoon = default.**
- **User-bindable per `contextKey`**, set conversationally. No Settings UI.
- **`accent-glow-core` is white-shifted**, not accent-tinted. Closes
  the light-mode-vs-dark-mode asymmetry.

### Typography
- **Three registers** = structural (Geist), prose (Source Serif 4),
  data/code (Geist Mono).
- **All variable-axis, all open-source** (MIT + OFL).
- **Prose-vs-structure trigger** via `style: "prose"` on `text`
  primitive. Default is structural.

### Corners
- **Lume chrome** = soft (6 / 8 / 12 px).
- **Editor surfaces** = sharp (radius 0).
- **Outermost containers** = match macOS window radius (12 px,
  concentric corners rule).

### Animations
- **Patch-condensation** (not fade-in) for new content.
- **Two-stop glow** for selection / focus / hover.
- **Donut glow** when a glyph sits at a surface's centre.

### Non-negotiables
- One accent slot (not multiple).
- Skeleton, no spinner.
- Status as text, not pills.
- No toasts.
- No Settings UI.
- Single material, three palettes.

---

## 12. What this document is NOT

- **Not a substitute for `CONCEPT.md`.** The architecture, protocol
  grammar, primitive vocabulary and SDK changes are normative there.
- **Not a substitute for `visual-spec.md`.** Tokens, recipes,
  per-primitive notes are normative there.
- **Not a substitute for `tech-stack.md`.** Stack choice, spike plan,
  risk-of-reversal are documented there.
- **Not a road map.** Sprint planning happens against the spike-plan
  artefacts, not against this narrative.
- **Not closed.** When new evidence enters (first-user feedback, spike
  measurements, omadia-core capability changes), the conclusions in
  this document should be revisited and amended.

---

## 13. Sources

### Apple's design lineage
- [Apple Newsroom — Liquid Glass announcement (2025)](https://www.apple.com/newsroom/2025/06/apple-introduces-a-delightful-and-elegant-new-software-design/)
- [Wikipedia — Liquid Glass](https://en.wikipedia.org/wiki/Liquid_Glass)
- [WWDC 2025 — Meet Liquid Glass (video)](https://developer.apple.com/videos/play/wwdc2025/219/)
- [CreateWithSwift — Exploring Liquid Glass](https://www.createwithswift.com/exploring-a-new-visual-language-liquid-glass/)
- [CreateWithSwift — Ensuring interface legibility in visionOS](https://www.createwithswift.com/ensuring-interface-legibility-and-contrast-in-visionos/)
- [Linear — A Linear spin on Liquid Glass (ProKit)](https://linear.app/now/linear-liquid-glass)
- [Pixel Envy — On Liquid Glass](https://pxlnv.com/blog/on-liquid-glass/)
- [Macrumors — Ex-Apple designer "Living Glass" concepts](https://www.macrumors.com/2025/06/04/ex-apple-designer-living-glass-ios-concepts/)

### Colour trends 2026
- [NPR — Pantone Color of the Year 2026 (Cloud Dancer)](https://www.npr.org/2025/12/04/nx-s1-5632651/pantones-color-of-the-year-2026-white)
- [UpDivision — UI Color Trends 2026](https://updivision.com/blog/post/ui-color-trends-to-watch-in-2026)
- [Recursion — Modern Color Palette: UI/UX Color Trends 2026](https://recursion.software/blog/ui-color-trends-2026)
- [I Love Hue — Modern Tech Color Palettes for SaaS/AI](https://ilovehue.co/blog/tech-saas-color-palettes/)
- [InkbotDesign — Colour Theory Strategic Guide 2026](https://inkbotdesign.com/colour-theory/)

### Reference-app design systems
- [SeedFlip — Vercel Design System Breakdown](https://seedflip.co/blog/vercel-design-system)
- [type.fan — linear.app uses Inter](https://www.type.fan/site/linear-app)
- [WTFont — Linear App font review](https://wtfont.app/en/linear-app-font-review/)
- [companyfonts.com — Anthropic brand fonts (Styrene + Tiempos)](https://www.companyfonts.com/company/anthropic)
- [type.today — Styrene in use: Anthropic](https://type.today/en/journal/anthropic)

### Typography research
- [Basement Studio — The Birth of Geist](https://basement.studio/post/the-birth-of-geist-a-typeface-crafted-for-the-web)
- [Vercel — Geist typography overview](https://vercel.com/geist/typography)
- [Vercel — Introducing Geist Pixel](https://vercel.com/blog/introducing-geist-pixel)
- [GitHub — vercel/geist-font](https://github.com/vercel/geist-font)
- [US Graphics — Berkeley Mono Typeface](https://usgraphics.com/products/berkeley-mono)
- [Adobe Fonts — Source Serif](https://fonts.adobe.com/fonts/source-serif)
- [SaaSUI — 7 SaaS UI Design Trends 2026 (editorial serif)](https://www.saasui.design/blog/7-saas-ui-design-trends-2026)
- [Wispr Flow — Rebrand (editorial productivity tool example)](https://wisprflow.ai/rebrand)
- [advisegraphics — 12 Best Coding Fonts of 2026](https://www.advisegraphics.com/best-coding-fonts)
- [madegooddesigns — Inter Font Review](https://madegooddesigns.com/inter-font/)

### Variable fonts and OKLCH
- [Builderius — CSS Grid, OKLCH & Dark Mode](https://builderius.io/css-grid-oklch-dark-mode-what-shipped-and-how-it-works/)
- [Steve Kinney — OKLCH Colors with Tailwind](https://stevekinney.com/courses/tailwind/oklch-colors)

---

## 14. Document changelog

- **v0.1 (this document)** — initial design rationale write-up
  consolidating the research and decision trail that produced
  CONCEPT.md v0.9, visual-spec.md v0.3, tech-stack.md v0.1.
  Covers the AI-first UI thesis, reference-app analysis, Apple
  material lineage, Lume hypothesis development, 2026 trend mapping,
  palette decision iterations, typography decision iterations, editor
  boundary, AI-first design constraints. Includes a one-line decision
  glossary for slide-deck use and a sources list for citation.
