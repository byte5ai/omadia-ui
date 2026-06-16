<div align="center">

# omadia-ui

### The canvas where your agents build the interface — live, deterministic, yours.

Omadia UI is the desktop surface for the [omadia](https://github.com/byte5ai/omadia)
agentic OS: agents synthesise real UI — tables, forms, charts, wizards, editor
regions — over a wire protocol, and the host renders it instantly in one
coherent material system. Persistent, multi-canvas, stateful. The interface is
no longer a chat log; it is a workspace the agent composes for the task at hand.

[![License: MIT](https://img.shields.io/badge/License-MIT-black.svg)](#license)
[![Status: in development](https://img.shields.io/badge/status-in%20development-orange.svg)](#status)
[![TypeScript](https://img.shields.io/badge/built%20with-TypeScript-3178C6.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Electron](https://img.shields.io/badge/desktop-Electron-47848F.svg?logo=electron&logoColor=white)](app/)

[**Website**](https://omadia.ai) · [**Quickstart**](#-quickstart) · [**Concept**](CONCEPT.md) · [**Protocol**](docs/protocol/1.0.md) · [**Visual spec**](docs/visual-spec.md)

</div>

---

## Why a canvas instead of a chat?

Chat is the "DOS era" of LLM interaction: powerful but linear and text-only.
Omadia UI is the next layer — a desktop application where the agent
**materialises live UI** as it orchestrates a request across source systems
(Jira, ERP, HR, …):

- 🧱 **24 primitives, one protocol.** The wire format
  (`omadia-canvas-protocol/1.0`) composes anything from a TUI-style list to a
  Photoshop-class workspace — all rendered against a single validated,
  CSP-safe whitelist.
- ⚡ **Deterministic where it matters.** Known flows get known UI: plugins
  publish fixed canvas trees, navigation and refresh run LLM-free, and the
  static app menu survives error states — the user is never stranded.
- 💡 **One material: Lume.** Light-as-material design system with hard rules
  (surface-nesting ladder, chrome budget, three user-bindable palettes) —
  enforced by the renderer for every tree, no per-plugin skinning.
- 🗂️ **A real workspace.** Multiple live canvases with their own server
  sessions, tiling split panes, named desktops, a canvas library — all synced
  through the omadia registry and restored on restart.
- 🎮 **Live, safe interactivity (Lumens).** A planned additive extension lets
  the agent generate self-contained interactive units — a game, an interactive
  workflow, an unusual visualisation, a live map — as **declarative,
  deterministic data** run by a bounded Tier-1 interpreter (no arbitrary code),
  with capabilities mediated through Tiers 2/3. Shareable, presettable. See
  [`docs/interactivity-concept.md`](docs/interactivity-concept.md) +
  [`docs/lumens-spec.md`](docs/lumens-spec.md).

## ⚡ Quickstart

**Download:** grab the installer for your OS from the
[latest release](https://github.com/byte5ai/omadia-ui/releases) — macOS
(dmg, arm64/x64), Windows (NSIS) and Linux (AppImage) are built and attached
automatically for every release.

**Build from source:**

```sh
git clone https://github.com/byte5ai/omadia-ui.git
cd omadia-ui/app
npm ci
npm run dev          # electron-vite dev against your omadia server
npm run dist         # packaged installers into app/dist
```

On first start, point the app at your running
[omadia](https://github.com/byte5ai/omadia) server (WebSocket URL + login).

## How it works

Three tiers, split across client × server:

| Tier | Latency | What lives there |
|---|---|---|
| **1 — deterministic** | instant | This host app + `omadia-ui-channel`: rendering, validation, local operations, deterministic actions |
| **2 — small LLM** | sub-second | `omadia-ui-orchestrator`: composition, style inference, action routing |
| **3 — heavy LLM + tools** | seconds+ | omadia plugins: data, AI services, long-running operations |

See [`docs/architecture-3tier.svg`](docs/architecture-3tier.svg) and
[`CONCEPT.md`](CONCEPT.md) for the full architecture, security surface and
forward-compatibility constraints (shared canvases land in v2 without a wire
refactor).

## Documents

| File | Purpose |
|---|---|
| [`CONCEPT.md`](CONCEPT.md) | Architecture, primitives, protocol, security, identity, SDK extension plan |
| [`docs/interactivity-concept.md`](docs/interactivity-concept.md) | **Live Interactivity (Lumens)** — concept/rationale: Tier-1-fast, agent-generated, safe interactivity (games, workflows, maps) |
| [`docs/lumens-spec.md`](docs/lumens-spec.md) | **Lumens** — normative definition: LX, `scene`, events/touch, capabilities, ports/wires, presets (`omadia-canvas-protocol/1.1` draft) |
| [`docs/visual-spec.md`](docs/visual-spec.md) | Lume material system — tokens, rules, composition idioms (v0.5) |
| [`docs/protocol/1.0.md`](docs/protocol/1.0.md) | Protocol specification + machine-validatable JSON Schemas |
| [`docs/walkthroughs.md`](docs/walkthroughs.md) | Use-case walkthroughs — multi-source comparison + editor micro-task |
| [`docs/tech-stack.md`](docs/tech-stack.md) | Tech-stack decision for the host app (Electron), with reasoning |
| [`app/`](app/) | The host application — Electron, strict TypeScript, vitest |

## Relationship to omadia core

Omadia UI rides on [`byte5ai/omadia`](https://github.com/byte5ai/omadia). The
protocol contract (`@omadia/canvas-core`: schemas + canonical fixtures) is
synced from the monorepo at build time — no vendored copy, no drift; a parity
test validates every canonical fixture against this renderer.

## Status

The host app is **implemented and in active development**: full 24-primitive
renderer, Lume v0.4 as renderer law, multi-canvas workspace (tiling, desktops,
library), deterministic refresh/actions/navigation, native login, streaming
plugin UI (X Studio as reference). Releases are cut automatically — every PR
merged to `main` produces a semantic version with generated notes and
installers for macOS, Windows and Linux.

macOS signing/notarization is intentionally deferred to the GA pipeline.

## License

MIT — Copyright © 2026 byte5 GmbH.

Maintained by [byte5 GmbH](https://byte5.de) under the GitHub organisation
[`byte5ai`](https://github.com/byte5ai).
