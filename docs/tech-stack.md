# Tech Stack — Omadia UI Host App (Tier 1 Client)

> Decision document. The recommendation is **Electron** for v1, validated by
> a two-milestone spike. The reasoning is derived from `CONCEPT.md` v0.7 and
> the maintainership context of `byte5ai/omadia`.

## Context

The Omadia UI concept (`CONCEPT.md` v0.7, three Codex review rounds) is
implementation-ready across the full surface — 24 primitives,
`omadia-canvas-protocol/1.0`, three-tier architecture, forward-compatibility
hooks for shared canvases (v2+). One decision was still open in the README
status table:

> Tech stack decision (Tauri / Electron / native / Web-PWA) — Open

This document closes that decision. The Tier 1 Client (the Canvas Host App
that renders the primitive tree, holds local UI state, and executes the
Local Operations Catalog) needs a concrete technology stack so the spike
can begin.

The reasoning has two parts: (1) requirements derived from the concept,
(2) maintainership fit with `byte5ai/omadia`. Both point to the same answer.

---

## Requirements profile derived from `CONCEPT.md`

Each row maps a concept requirement to its tech-stack-relevant implication.
Discriminating constraints are marked **★**.

| # | Concept requirement | Tech-stack implication |
|---|---|---|
| 1 | Render 20 core + 4 editor primitives in a single Omadia theme; composition idioms (Norton Commander, Photoshop workspace, Wizard, Dashboard, Spotlight, split-pane) | Composable layout system. HTML + CSS Grid/Flexbox + a component framework is the most expressive prior art. Single-theme rule keeps the styling surface small. |
| 2 | **★** Editor-class primitives first-class from v1: `canvas-region` (RGBA8/RGBA16 pixel buffer, brush / blur / curves / lasso / magic-wand), `media` (audio/video playback + scrubbing), `timeline` (frame- and sample-precise), `vector-path` (Pen-tool curves) | Pixel/audio/video at quality-tool level requires: OffscreenCanvas + Web Workers for off-thread paint; WebGL/WebGPU for real-time filters; WebCodecs for frame-precise video; HDR / 16-bit canvas for serious image work. **Browser-engine parity matters here more than anywhere else.** |
| 3 | **★** Class A latency budget <16ms (brush stroke, scroll, hover, pinch-zoom must NEVER round-trip); Class B sub-second | Render loop must be separable from the WebSocket handler. Requires a multi-threaded runtime with priority isolation: dedicated worker / native thread for paint, separate event loop for IPC/network. Achievable in any modern desktop framework, but the cost differs. |
| 4 | **★** Single Host App instance, N canvases per instance; fullscreen *or* windowed mode (Win-3-in-DOS analogy = fully overlays host OS) | Requires native OS window management. **Hard exclusion for PWA**: browser-mediated Fullscreen API cannot overlay the OS; no real "fullscreen workspace" semantics. |
| 5 | WebSocket to `omadia-ui-channel`, JSON-tree wire format, schema-validate every incoming tree against the primitive whitelist | Trivial in all candidates. Not a discriminator. |
| 6 | Whitelist parser, no eval of arbitrary content, HMAC-signed `DataRef` tokens, sandbox for agent-generated specs | Argues against any stack that encourages dynamic-eval rendering. Strong fit for IPC-isolated frameworks (Tauri commands, Electron `contextBridge`). HMAC: any runtime. |
| 7 | **★** Self-hostable Omadia core → direct-download desktop app, code-signing, auto-update (not App-Store-mandatory) | Needs a mature bundler + updater + signing/notarization toolchain. Eliminates frameworks where this is hand-rolled. |
| 8 | **★** OS tier prioritisation: macOS first; Windows next; Linux power-user subset | Cross-platform consistency is needed but not extreme — Linux can be "best effort". macOS-first means the stack must shine on macOS specifically. |
| 9 | Forward-compat: shared canvases (v2+) multi-user, `presence_*` events, CRDT-store backend swap | Almost entirely server-side per concept § Forward-Compatibility. Channel plugin is the fan-out point. **Not a tech-stack discriminator.** |
| 10 | Bottleneck must be the model (Claude Mythos, GPT-6, real-time models) — not the UI | Demands streaming-friendly rendering and headroom in the render loop. Subsumed by (3). |
| 11 | Local Operations Catalog: ~30 deterministic ops (pixel: brush, erase, fill, blur, sharpen, levels, curves, crop, resize, rotate, flip; selection: rectangle, lasso, magic-wand, invert; vector: move, scale, rotate, smooth, bezier-edit; audio: trim, fade, normalize, gain, mute + preview-gain, preview-eq, scrub; video: trim, splice, speed, mute-track + scrub, preview-speed; geometry; layer) | Magic-wand (flood-fill / connected-components) and 16-bit pixel ops are non-trivial. Heavy lift candidates: WASM/Rust + SIMD, or native code. JS-only is workable but slower; for the v1 baseline catalog, WASM is the sweet spot. |
| 12 | `DataRef` lifecycle with content-addressed IDs (`sha256` of buffer), per-canvas buffer ownership at Tier 1, GC on no-refs + expiry | SHA-256 over multi-MB buffers must be fast (off-thread, ideally WASM-SIMD or native). Hashing on the main thread will violate Class A. |

---

## Candidates evaluated

| Stack | Approach | Bundle | Memory baseline | Render-engine consistency across OSes |
|---|---|---|---|---|
| Electron | Bundled Chromium + Node main process | ~100–150 MB | ~150–300 MB | **Identical** (same Chromium build everywhere) |
| Tauri 2.x | Rust core + system WebView (WKWebView / WebView2 / WebKitGTK) | ~5–20 MB | ~50–120 MB | **Divergent** — three different engines |
| Native per OS | SwiftUI (macOS) + WinUI 3 (Windows) + GTK or Qt (Linux) | ~10–30 MB | ~30–80 MB | N/A — three implementations |
| Web PWA | Browser-installed, no install step | 0 (cache) | per-browser | **Divergent**, plus browser sandbox limits |
| Flutter Desktop | Own renderer (Skia / Impeller), no WebView | ~30–60 MB | ~80–150 MB | Identical, but no web ecosystem reuse |
| Wails (Go) / Neutralino | Same WebView-divergence as Tauri, smaller ecosystems | small | low | divergent |

PWA, Native, Wails/Neutralino and Flutter are evaluated below but excluded
early for reasons stated. The serious decision is **Electron vs. Tauri**.

### Requirement × stack fit matrix

Legend: ✅ strong fit · 🟡 workable with caveats · ⚠️ significant risk · ❌ blocking

| Requirement | Electron | Tauri | Native | PWA |
|---|---|---|---|---|
| **P — Project context**: fit with omadia core (`byte5ai/omadia`) TS/Node monorepo, direct `@omadia/channel-sdk` import, shared type graph | ✅ native (TS↔TS) | ⚠️ Rust core cannot import TS; SDK types must be duplicated, generated, or sidestepped | ⚠️ same problem, 3× | ✅ TS↔TS, but PWA excluded on other grounds |
| 1 — primitive rendering / composition idioms | ✅ | ✅ | 🟡 (3× impl) | ✅ |
| 2 — editor primitives (16-bit canvas, WebCodecs, WebGPU, OffscreenCanvas) | ✅ identical Chromium APIs | ⚠️ WKWebView lags Chromium on WebGPU, WebCodecs partial, 16-bit canvas spotty | ✅ direct native APIs | ⚠️ same divergence as Tauri, plus browser-sandbox limits |
| 3 — Class A <16ms render loop separated from IPC | ✅ renderer/main split, OffscreenCanvas + Workers proven | ✅ Rust async + WebView main thread split, plus OffscreenCanvas in the WebView | ✅ trivial | 🟡 doable, less OS-level priority control |
| 4 — fullscreen-overlay + windowed + N canvases | ✅ `BrowserWindow` APIs | ✅ `tauri::WebviewWindow` | ✅ direct OS APIs | ❌ no real OS overlay |
| 5 — WebSocket + JSON tree | ✅ | ✅ | ✅ | ✅ |
| 6 — sandbox-safe rendering, HMAC, IPC isolation | ✅ `contextBridge` | ✅ `tauri::command` (slightly cleaner Rust↔WebView boundary) | ✅ | 🟡 browser CSP only |
| 7 — signing, auto-update, direct download | ✅ `electron-builder` + `electron-updater` + notarization, very mature | ✅ `tauri-bundler` + built-in updater, mature but younger | ⚠️ DMG + MSI + AppImage + 3 update pipelines | 🟡 cache-driven updates only |
| 8 — macOS-first, then Windows, then Linux | ✅ identical behavior across OSes | ⚠️ macOS gets WKWebView (the laggiest of the three for editor-class APIs) | 🟡 macOS-only is cheap, cross-platform is expensive | 🟡 |
| 11 — local ops catalog (incl. magic-wand, 16-bit pixel ops) | 🟡 JS + WASM, possibly Native modules; performant but JS-GC risk | ✅ Rust-WASM or Rust-via-IPC for hot paths is a natural fit | ✅ direct native | ⚠️ JS + WASM only, no native fallback |
| 12 — fast SHA-256 over multi-MB buffers | ✅ Node `crypto` in the main process, or WASM-SIMD in the renderer | ✅ Rust `sha2` in the core, called via IPC | ✅ | 🟡 SubtleCrypto + WASM |

---

## Excluded candidates with reasons

- **PWA** — fails Requirement 4 (no OS-overlay fullscreen). Cannot ship the
  "Win-3-in-DOS workspace" experience. Browser-sandbox limits make the
  editor catalog (Requirement 11) unreliable. **Reserved as a future second
  channel plugin** per concept § Channel ↔ Tier-2 Routing.
- **Native per OS** — 2–3× build cost (SwiftUI + WinUI + GTK/Qt). Each
  primitive, each local op, each composition idiom needs three
  implementations. Untenable for a small team. Reasonable only if the
  strategy collapses to "macOS forever", which the concept does not commit
  to.
- **Flutter Desktop** — own renderer eliminates engine divergence (a plus),
  but the entire primitive + composition + ecosystem prior art lives in the
  web stack. Text rendering on desktop is still a known weak spot; the
  desktop track is less production-tested than the mobile one. Reinventing
  the 24 primitives outside the web stack costs more than it saves.
- **Wails (Go) / Neutralino** — same WebView-divergence problem as Tauri but
  with significantly smaller ecosystems for desktop tooling, updaters, and
  signing. Strictly dominated by Tauri.

---

## Recommendation

### Use **Electron** for the v1 Host App.

Two arguments carry the recommendation. The first dominates if Omadia UI is
maintained by the same team as omadia core, which is the planned reality.

### 1. Type-system continuity with omadia core (decisive)

omadia core is a TypeScript / Node ≥ 20 / npm monorepo (`byte5ai/omadia/middleware/packages/`):
`@omadia/channel-sdk`, `@omadia/plugin-api`, `harness-orchestrator`,
twenty-odd plugin packages — all TypeScript, all ES modules, all built with
`tsc`. Every channel plugin (Teams, Slack, Telegram, …) imports the same
SDK types: `ChannelPlugin`, `CoreApi`, `IncomingTurn`, `SemanticAnswer`, the
`ChatStreamEvent` union (which the concept extends with the new
`surface_*` event family). Stability contract: *additive within a major*.

The Omadia UI Host App is, by the concept's definition, a Tier-1 client
that consumes exactly those types over a WebSocket:

- `surface_snapshot`, `surface_patch`, `surface_local_action`,
  `surface_data_ref_created` / `surface_data_ref_invalidated`,
  `surface_action_result`, `surface_error` — the new `ChatStreamEvent`
  members.
- `IncomingTurn` with the new `tenantId` and `canvas-activate` action types.
- `DataRef` shape, sentinel envelopes, `omadia-canvas-protocol/1.0`
  handshake messages.

**Electron lets the Host App import these types directly** from the same
package the orchestrator publishes (via npm link in-monorepo, or a
versioned internal dependency). The TS type graph is shared end-to-end: a
single source of truth for the wire format. Schema-validating an incoming
tree becomes literally type-narrowing the SDK's discriminated unions.
Bumping the protocol from 1.0 to 1.1 is one type-version bump shared by
both sides.

**Tauri makes this awkward.** The Rust core cannot import TypeScript types.
Three options, all bad:

- **Duplicate the SDK types in Rust** — every additive change in
  `@omadia/channel-sdk` requires a manual Rust translation. Drift risk is
  permanent; a missed field in the surface event family causes silent
  bugs.
- **Generate Rust types from TS via tooling** (`ts-rs`, `ts2rs`, …) — adds
  a pipeline that still produces a second source of truth that must be
  rebuilt; tooling has rough edges on advanced TS unions and brand types.
- **Keep all SDK consumption in the Tauri WebView's JS context** and use
  the Rust core only for window management + a few WASM hot paths —
  technically possible, but you're paying Tauri's complexity tax for
  nearly no gain, since Rust isn't doing the load-bearing work anymore.

The same argument also rules out Flutter (Dart, not TS) and Native per OS
(Swift / C# / C++, not TS, three duplicates).

### 2. Engine parity for editor workloads (secondary, still load-bearing)

Even setting type-continuity aside, **engine parity for editor-class
workloads** is the next-strongest technical argument:

- The Class A latency budget (<16ms brush stroke, magic-wand on a 4K
  `canvas-region`, frame-precise video scrub) depends on browser-engine
  APIs that diverge across WebView implementations.
- macOS WKWebView lags Chromium on WebGPU, WebCodecs, OffscreenCanvas
  semantics, and 16-bit canvas color depth. Tauri ships against WKWebView
  on macOS, WebView2 on Windows, WebKitGTK on Linux — three engines, three
  test surfaces, three potential bug profiles.
- Electron bundles a single Chromium build per release, so editor behavior
  is identical across all three target OSes. The same reason Figma
  Desktop, VS Code, Slack, Discord, Notion, Linear, and Loom all ship
  Electron-class stacks rather than system-WebView wrappers.

### Supporting

- **Local Ops Catalog as WASM**: image processing, magic-wand flood-fill,
  SHA-256 over multi-MB buffers — all natural WASM workloads. Electron
  embeds the same Chromium WASM runtime everywhere; Rust→WASM is available
  here too if a specific hot path needs it. Tauri's "Rust core" advantage
  for hot paths is mostly addressable inside Electron via WASM, without
  taking on the Rust core for everything else.
- **Distribution maturity**: `electron-builder` + `electron-updater` +
  notarization with `notarytool` is the most battle-tested chain in the
  candidate field.
- **Forward-compat (shared canvases v2+)** is server-side per the
  concept's Forward-Compatibility section. No Electron-vs-Tauri pressure
  here.

### Repo-shape implication

Since Omadia UI is maintained by the omadia core team, the natural shape is
either:

- a sibling repo (`byte5ai/omadia-ui`, current setup) that imports
  `@omadia/channel-sdk` as a versioned dep, with the Host App as the
  top-level Electron app and the renderer as a subpackage; or
- ultimately, a workspace package inside `byte5ai/omadia/middleware/`
  (e.g. `middleware/packages/omadia-ui-host-app/`) sharing the monorepo's
  `tsconfig`, eslint, and CI pipelines.

Both shapes work under Electron. Neither works cleanly under Tauri without
adding a Rust toolchain to the omadia monorepo or maintaining a separate
build system for the Host App. **The lowest-friction path for a single
team is "more of the same TypeScript".**

### What is given up

- ~80–130 MB more disk footprint than Tauri.
- ~80–180 MB more memory baseline than Tauri.
- Slightly slower cold start.
- Need to rebuild and re-release on Chromium security CVEs (~6–8× per year).

These are real costs. They are paid in install size and laptop fans, not
in the user-facing latency budget the concept defends.

### When the recommendation would flip

The recommendation **flips away from Electron** only under conjunctions of
the following — single conditions are insufficient given the
type-continuity argument:

- omadia core itself rewrites to Rust (or a non-TS language). Then
  type-continuity stops favouring Electron and the secondary engine-parity
  argument moves into first position. Not on any roadmap.
- The Host App is forked off into a separately maintained codebase by a
  different team. Then "fit with omadia core" stops being a constraint and
  the choice is decided on engine-parity + bundle size alone.
- Bundle-size becomes a hard distribution gate (corporate deploy policies,
  embedded contexts) **and** the editor catalog is descoped from v1 (so
  engine parity stops being load-bearing). Then Tauri's small binary
  outweighs the lost SDK-type sharing.

None of these are stated today.

---

## Risks of the recommendation

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Electron bundle / RAM raises "this app is bloat" perception | Medium | Low | Ship polished, fast Electron (VS Code is the proof point); enable Process Sandbox; use `contextBridge` strictly; share a single renderer process across canvases instead of N `BrowserWindow`s |
| Chromium security CVE forces emergency re-release | Medium | Low | Automated CI release pipeline; auto-update via `electron-updater`; rebuild on Chromium stable tag |
| Memory grows with the number of open canvases | High | Medium | Use one renderer process for the surface, render N canvases as views/tabs within it; lazy-instantiate editor-heavy primitives |
| Startup time creeps up | Low | Low | Show a chrome shell instantly; defer WebSocket handshake; defer non-essential preload |
| The "Tauri would have been cheaper" critique surfaces a year in | Medium | Low | Documented decision (this file) + falsification criteria above; Spike Plan validates editor-parity claims empirically before locking in |
| Local Ops Catalog perf below the <16ms budget under Electron | Low | High | Spike Plan measures this explicitly; if the budget is violated, WASM-SIMD or Native Node-addon paths are available before reconsidering the stack |

---

## Reversibility — what if the recommendation is wrong after 3 months

The frontend is intentionally portable. The Tier 1 implementation is, by
the concept's own design:

- A **primitive renderer** (HTML + CSS + a component framework — likely
  React or Solid).
- A **schema validator** (TypeScript types + a JSON schema lib, types
  imported from `@omadia/channel-sdk`).
- A **WebSocket client** for surface events.
- A **local ops catalog implementation** (TypeScript + WASM for hot paths).

None of those four pieces are Electron-specific. They are all valid
ingredients in a Tauri front-end as well. The Electron-specific surface to
rewrite would be:

- `electron-builder` config → `tauri.conf.json`
- `main.ts` (`BrowserWindow` setup, IPC handlers) → `src-tauri/main.rs` +
  `tauri::command` handlers
- `preload.ts` (`contextBridge`) → Tauri JS API bindings
- `electron-updater` wiring → Tauri updater
- Notarization workflow → Tauri's notarization wrapper

**The new cost a Tauri move would add: SDK-type duplication.** If
`@omadia/channel-sdk` continues to evolve (and it must — the concept lists
nine SDK changes against omadia core), every change requires a Rust-side
mirror or a generation step. The "rewrite is mechanical" statement holds
for the shell, but the type bridge becomes a permanent maintenance
liability.

Estimated rewrite of the shell: **4–8 weeks of focused work**, mostly
mechanical, with little to no churn in the renderer code. The type bridge
is an *ongoing* cost on top.

**Reversibility verdict: moderate, not high.** The shell is portable
cheap; the SDK-type bridge is permanently expensive. A stack switch at
month 3 costs the shell rewrite *plus* a commitment to maintain
TS↔Rust type drift forever after.

The truly expensive lock-in would be the **Native per OS** path. That one
is intentionally not on the table.

---

## Spike plan skeleton

Purpose: empirically validate the editor-class latency claim before
broader implementation. Roughly two weeks, two milestones.

### Spike Milestone 1 — Walkthrough 1 skeleton (data-aggregation primitives)

Target: render the surface from Walkthrough 1
(`docs/walkthroughs.md`) end-to-end against a stub server. Validates the
chrome stack but not the risky path.

Scope:

- App shell: Electron main process, single `BrowserWindow`, fullscreen +
  windowed mode toggle, ⌘1 / ⌘2 / ⌘3 canvas hotkeys (no real multi-canvas
  yet).
- WebSocket client + handshake (`handshake_offer` → `handshake_select` →
  `handshake_ack`) against a stub server that replays a pre-recorded
  Walkthrough 1 event sequence.
- Schema validator for the primitive whitelist (JSON Schema, fast path:
  Ajv-like).
- Render the primitives needed for Walkthrough 1: `container`, `heading`,
  `text`, `table`, `toolbar`, `status`, `button`, `list`, `divider`.
- `surface_snapshot` + `surface_patch` applied; reject unknown trait /
  unknown primitive hard.
- `treeRevision` discipline: snapshot resets, patches require matching
  `basedOnRevision`, gaps trigger a snapshot request.

Falsifies if: the Walkthrough 1 skeleton cannot be reproduced visually at
the latency the concept claims (Tier-2-routed responses sub-second from a
stubbed local server).

### Spike Milestone 2 — Walkthrough 2 Class-A brush + selected catalog ops (editor primitives)

Target: 60 fps brush stroke and a working magic-wand on `canvas-region`,
plus frame-precise video scrub. Validates the riskiest claim.

Scope:

- `canvas-region` primitive with RGBA8 (stretch goal: RGBA16) pixel buffer;
  size up to 4K.
- Brush stroke handler off the main thread (OffscreenCanvas + Worker);
  measure frame time on macOS first, then Windows, then Linux (in that
  order — Linux is a best-effort gate, not a blocker).
- Implement three local ops with their `effect` class:
  - `brush` (durable) — proves the Class-A hot path under user gesture.
  - `blur` (durable, with `preview-blur` variant) — proves a non-trivial
    pixel op + the preview/durable split.
  - `select-magic-wand` (durable) — proves the WASM flood-fill cost is
    real (and exercises the catalog-completeness gate from Walkthrough 2
    step 12).
- `media` primitive with audio playback + scrubbing (Web Audio API + `<audio>`).
- WebCodecs experiment: load a 1080p H.264 clip, scrub frame-precisely with
  `VideoDecoder`. Document the fallback path if WebCodecs is absent (older
  Electron versions or constrained environments).
- `DataRef` SHA-256 hashing over the brush-edited buffer off the main
  thread (WASM-SIMD or `crypto.subtle`); measure budget vs. Class A.

Measurements to capture and persist in the spike report:

- Frame time during a continuous brush stroke (95th percentile).
- Magic-wand wall-clock on a 4K image (worst-case region size).
- Hashing wall-clock on the same buffer (must not block the render loop).
- Bundle size produced by `electron-builder` (DMG + ZIP on macOS, then
  Windows MSI later).
- Cold start time on a clean Mac, on a developer machine, and on a
  reasonable mid-tier laptop.
- Memory baseline of the process tree at idle and during a brush stroke.

Falsifies if: the brush-stroke 95th-percentile frame time on macOS does not
clear the <16ms gate, or the magic-wand on a 4K image cannot complete in a
sub-second budget. In that case re-evaluate: native Node-addon path,
WebGPU path, or stack change.

### Spike deliverable

- A working binary (signed for macOS, using the `high5` Apple Dev assets)
  demonstrating Milestones 1 + 2.
- A measurements report in `docs/spike-report.md`.
- A go / no-go on Electron — if no-go, the report includes the falsifying
  evidence and the alternative path (Tauri with hard commitment to per-OS
  validation, or rescoping the editor catalog).
