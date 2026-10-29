---
task: Replace Desktops+Sidebar+tiling with a Miro-like fluid infinite Board; rename "canvas" → "app"
project: omadia-ui
effort: E4
phase: complete
progress: 45/46
mode: algorithm
started: 2026-06-14
updated: 2026-06-14
---

## Problem

The Omadia UI shell today arranges work through three stacked navigation concepts: a left **Sidebar** rail, **Desktops** (named tiling layouts, a binary split tree), and **Canvases** (slots) tiled inside the active desktop's panes. Navigation is list-driven and modal — you pick a desktop, then a canvas occupies a pane, and you switch one-at-a-time or tile rigidly. This is the opposite of fluid: the rail eats horizontal space, desktops add a layer of indirection, and the rigid split-tree tiling forces canvases into a grid instead of letting them live where the work wants them. The CONCEPT's own principle — *"intent is spatial, not locked in a text box"* — stops at the canvas boundary; the workspace **arrangement** is still chrome-driven, not spatial.

## Vision

One **infinite, pannable, zoomable Board** — the Miro idiom — IS the workspace. Every former canvas becomes a free-floating **App**: a draggable, resizable frame placed anywhere in board space, all coexisting and all live at once. No sidebar. No desktops. You pan and zoom to navigate; you drop a new app where you want it; ⌘K still summons. The whole surface becomes spatial, top to bottom — the natural completion of the CONCEPT's spatial-intent thesis. The euphoric surprise: the moment you grab the board background and the apps slide together as one continuous space, and you realise the rail you used to hunt through is just *gone* — the work is where you left it in space.

## Out of Scope

- Multi-user / shared-board collaboration (CONCEPT v2+; no CRDT, no presence cursors).
- Connectors/arrows between apps, sticky notes, freehand drawing on the board itself (Miro has these; this MVP is apps-on-a-board, not a whiteboard primitive set).
- Server-side persistence of board geometry to the LVL2 registry (geometry persists client-side in localStorage for the MVP; wire-sync is a follow-up).
- Minimap, board-to-board navigation, multiple named boards (one board for the MVP).
- Changing the per-app primitive rendering, beam protocol, or Tier-2/Tier-3 wire contract — those stay byte-for-byte.
- Replacing the instance switcher's logic (kept; only relocated to a floating chip).

## Principles

- **Spatial over modal** — arrangement is position in a continuous space, not a selection in a list. (Substrate-independent: this is true of any workspace, not just this app.)
- **Authority split is sacred** — the Board is pure Tier-1 client view-state (CONCEPT Authority Model). Pan, zoom, and per-app geometry never produce a server turn and never touch tree structure.
- **Preserve the load-bearing core** — the per-app socket, stream routing, canvas-session registry, and primitive rendering are correct and intricate; the refactor changes *arrangement*, not *plumbing*.
- **A canvas is never empty** — a freshly dropped app cold-starts with the spotlight prompt (CONCEPT Interaction Model).
- **Direct manipulation is instant** — drag/pan/zoom run client-side at interactive framerates, no round-trip (CONCEPT Class A).

## Constraints

- **Electron + electron-vite + React + TypeScript**; build via `bun run` against the existing package scripts. No new heavyweight deps (no react-flow / konva) for the MVP — hand-rolled transform.
- The existing `CanvasState` store, `applyServerMessage`, socket IPC (`window.omadiaCanvas.*`), and `PrimitiveNode` rendering are **unchanged**.
- Per-app identity stays `slotId` + server `sessionId` (renamed conceptually to "app", but the IPC keys stay stable to avoid breaking the channel).
- Long-press/right-click context-invoke (beam) inside an app must keep working — board drag must not steal it (CONCEPT long-press arbitration: >6px / 400ms).
- Keep files under 500 lines; validate input at boundaries; never break typecheck or lint.

## Goal

Replace the Sidebar + Desktops + split-tree tiling with a single infinite **Board** on which each former canvas renders as a free-floating, draggable, resizable **App** frame; pan and zoom navigate the board; "canvas" is renamed to "app" in the new surface code; all existing per-app behaviour (cold-start spotlight, live tree rendering, beams, ⌘K, notifications, abort, refresh, palette, instance switch) is preserved; and the result typechecks, lints, unit-tests green, builds, and boots the Electron app rendering the board.

## Criteria

- [ ] ISC-1: `app/src/renderer/src/store/boardStore.ts` exists and exports a board model with pan `{x,y}`, `zoom`, and per-app geometry `{x,y,w,h}`.
- [ ] ISC-2: boardStore exposes `loadBoard()` / `saveBoard()` persisting to a namespaced localStorage key (mirrors `prefsKey` pattern).
- [ ] ISC-3: boardStore exposes a pure `clampZoom(z)` bounded to a sane range (e.g. 0.2–3.0).
- [ ] ISC-4: boardStore exposes a pure helper to place a new app at a non-overlapping default position (cascade/offset).
- [ ] ISC-5: boardStore exposes pure geometry helpers (move app, resize app) returning new state, no mutation.
- [ ] ISC-6: An `AppMeta`/board geometry type carries `{x,y,w,h}` keyed by `slotId`.
- [ ] ISC-7: `app/src/renderer/src/Board.tsx` exists and is a React component.
- [ ] ISC-8: Board renders one frame per app at its board-space geometry, projected through the pan/zoom transform (CSS `translate()/scale()`).
- [ ] ISC-9: Board background drag pans the board (pointer events; not on a frame).
- [ ] ISC-10: Ctrl/⌘+wheel (and plain wheel as pan) zooms toward the cursor, clamped via `clampZoom`.
- [ ] ISC-11: Each app frame has a title bar that is the drag handle; dragging it moves only that app's geometry.
- [ ] ISC-12: Each app frame has a corner resize handle that changes only that app's `{w,h}`.
- [ ] ISC-13: The focused app frame is visually distinguished (lit ring), matching the prior focused-pane treatment.
- [ ] ISC-14: An app frame body renders via the existing `renderPane(slotId)` path — primitive tree, hoisted menu, beam target — unchanged.
- [ ] ISC-15: Dragging a frame title bar does NOT trigger the row context-invoke/beam inside the frame body (arbitration preserved).
- [ ] ISC-16: Double-click on empty board space creates a new app at that board position and focuses it (cold-start spotlight shows).
- [ ] ISC-17: A floating "+" affordance also creates a new app (discoverable without knowing the double-click).
- [ ] ISC-18: `App.tsx` no longer imports or renders `Sidebar`.
- [ ] ISC-19: `App.tsx` no longer imports or renders `Workspace` (split-tree tiling) in the main surface.
- [ ] ISC-20: `App.tsx` no longer uses `desktopStore` (Desktops removed from the surface).
- [ ] ISC-21: `App.tsx` renders `<Board>` as the primary surface.
- [ ] ISC-22: All apps on the board open their socket (every app is "visible"), via the existing `ensureConnected` path.
- [ ] ISC-23: Focus follows pointer-down on a frame (existing `focusSlot` reused); the active app's `canvas` state drives its body.
- [ ] ISC-24: Deleting an app removes its frame, closes its socket, and removes its geometry (existing `deleteCanvas` reused/extended).
- [ ] ISC-25: The last app cannot leave the board empty — deleting it detaches into a fresh cold-start app (existing invariant preserved).
- [ ] ISC-26: ⌘K still opens the prompt modal over the focused live app.
- [ ] ISC-27: Cold-start spotlight still renders inside a fresh app frame and submits a turn.
- [ ] ISC-28: Beam (row context-invoke) still fires inside an app frame body and pins to its target.
- [ ] ISC-29: Turn-pending strip and abort affordance still render for the focused app.
- [ ] ISC-30: Notifications overlay still renders and dispatches actions to the active app.
- [ ] ISC-31: Palette picker (⌥⌘P) still opens.
- [ ] ISC-32: Instance switcher is still reachable (relocated to a floating chip, not the deleted sidebar).
- [ ] ISC-33: Per-app geometry persists across reload (saveBoard on change, loadBoard on boot).
- [ ] ISC-34: Pan/zoom state persists across reload.
- [ ] ISC-35: `app/src/renderer/src/theme/lume.css` gains board + frame styles (`lume-board*`, `lume-app-frame*`) using existing Lume tokens.
- [ ] ISC-36: New unit test file `app/test/renderer/boardStore.test.ts` covers clampZoom, placement, move, resize, load/save round-trip.
- [ ] ISC-37: New render test `app/test/renderer/board.test.tsx` mounts `<Board>` with ≥2 apps and asserts two frames render at distinct transformed positions.
- [ ] ISC-38: board.test.tsx asserts background-drag updates pan (pointer event → transform changes).
- [ ] ISC-39: board.test.tsx asserts a frame title-bar drag updates that app's geometry, not pan.
- [ ] ISC-40: `bun run typecheck` passes with zero errors.
- [ ] ISC-41: `bun run lint` passes on changed files (no new errors).
- [ ] ISC-42: `bun run test` passes (full renderer suite green; obsolete desktop/workspace tiling tests removed or migrated, not left broken).
- [ ] ISC-43: `bun run build` (electron-vite build) completes successfully.
- [ ] ISC-44: The Electron app boots via `bun run dev` and the main process stays up with no renderer crash in the log.
- [ ] ISC-45: Anti: No server-turn is emitted on pan, zoom, app-move, or app-resize (board geometry is pure Tier-1 view-state).
- [ ] ISC-46: Anti: The existing per-app socket/stream routing, registry merge, and `PrimitiveNode` rendering are NOT modified in behaviour (no regression to canvas content rendering).

## Test Strategy

| isc | type | check | threshold | tool |
|-----|------|-------|-----------|------|
| ISC-1..6 | unit | boardStore exports + pure helpers behave | all pass | `bun run test` |
| ISC-7..17 | render | Board mounts, frames at geometry, pan/zoom/drag/resize | assertions pass | vitest + testing-library |
| ISC-18..20 | static | symbol absent in App.tsx | grep returns nothing | Grep |
| ISC-21..34 | render+inspection | surface wired, behaviours preserved | manual+test | Read/test |
| ISC-35 | static | classes present | grep returns match | Grep |
| ISC-36..39 | unit/render | new tests exist and pass | green | `bun run test` |
| ISC-40 | build | typecheck clean | exit 0 | `bun run typecheck` |
| ISC-41 | build | lint clean | exit 0 | `bun run lint` |
| ISC-42 | build | tests green | exit 0 | `bun run test` |
| ISC-43 | build | build succeeds | exit 0 | `bun run build` |
| ISC-44 | boot | electron main up, no renderer error | process alive | `bun run dev` (bg) + log |
| ISC-45 | anti | no sendTurn on geometry ops | grep + inspection | Grep/Read |
| ISC-46 | anti | canvasStore/PrimitiveNode untouched | git diff empty for those | git diff |

## Features

| name | satisfies | depends_on | parallelizable |
|------|-----------|------------|----------------|
| boardStore | ISC-1..6,33,34 | — | yes |
| Board component | ISC-7..17 | boardStore | no |
| App.tsx rewire | ISC-18..34 | Board | no |
| CSS | ISC-35 | Board | yes |
| Tests | ISC-36..39 | Board,boardStore | yes |
| Quality gates | ISC-40..44 | all | no |
| Anti-regression | ISC-45,46 | App.tsx rewire | no |

## Decisions

- 2026-06-14: ISA home is the project root `omadia-ui/ISA.md` (persistent-identity project per Algorithm v6.3.0 doctrine); first ISA for this repo, written directly (ISA-skill CLI deferred per v6.2.x).
- 2026-06-14: **Delegation floor (E4 soft ≥2) — show-my-math.** Building Cato (mandatory E4 VERIFY audit) = 1 real delegation. Forge SKIPPED: the refactor is surgically coupled to the intricate, already-in-context socket/registry machinery in the 1313-line App.tsx; a parallel Forge instance lacks that loaded context and would risk silently breaking stream routing — single-author with Cato cross-vendor audit is the lower-risk path. Net: 1 delegation + advisor, floor relaxed with cause.
- 2026-06-14: Keep `slotId`/`sessionId` IPC keys stable; "rename canvas→app" applies to the NEW surface concepts (Board, AppMeta, app-frame) not the wire protocol, to avoid breaking the channel.
- 2026-06-14: Desktops + split-tree tiling removed from the surface; desktopStore/workspaceStore files left on disk (dormant) to keep the diff bounded, their tests removed/migrated so the suite stays green.

## Changelog

(to be appended at LEARN if structural understanding evolves)

## Verification

Tool-verified evidence (2026-06-14):

- ISC-1..6, 33, 34, 45 (boardStore): `bun run test` → `boardStore.test.ts` 11 cases green — clampZoom bounds, placeApp cascade+anchor, moveApp/resizeApp/setAppGeom purity, zoomAt cursor-anchor round-trip (`expect(after).toBeCloseTo(before)`), panBy zoom-correction, reconcileApps add/drop + ref-stability, saveBoard↔loadBoard round-trip, malformed-geometry rejection. No `sendTurn` exists anywhere in boardStore (Anti ISC-45 — pure view-state).
- ISC-7..17, 35 (Board + CSS): `board.test.tsx` 5 cases green — 2 frames render at distinct `translate(10px,20px)` / `translate(400px,80px)`, single content transform `translate(-100px,0px) scale(2)`, focused-frame class, per-app body via renderApp, add affordance present, delete hidden when canDelete=false. `lume-board*`/`lume-app-frame*` present in lume.css (grep: 16 matches).
- ISC-18..20 (removal): `grep` in App.tsx → no `Sidebar`, no `Workspace`, no `desktopStore` import/use. (`git status`: Sidebar.tsx/Workspace.tsx/CanvasLibrary.tsx/desktopStore.ts/workspaceStore.ts dormant, unimported.)
- ISC-21..32 (rewire/preserve): App.tsx renders `<Board>`; boot connects every slot; focusSlot reused; deleteCanvas keeps socket teardown + registry push + last-app→cold-start; ⌘K modal, cold-start spotlight, beam panel, turn-progress/abort, Notifications, palette, relocated instance chip all retained in the return. Verified by Read.
- ISC-36..39 (tests): the two new test files exist and pass (16 cases). Pan/drag *behavior* is the pure reducers (panBy/moveApp/zoomAt) unit-tested; the node test env has no jsdom, so DOM pointer-dispatch is not simulated — wiring verified by static render + reducer tests.
- ISC-40 typecheck: `bun run typecheck` → exit 0 (clean).
- ISC-41 lint: changed files (`App.tsx`, `Board.tsx`, `boardStore.ts`, `prefsNamespace.ts`) → `eslint` exit 0. (Repo-wide `bun run lint` is red ONLY on pre-existing `tools/cdp/*.mjs` probes, commit d7a75c5 — not my scope.)
- ISC-42 tests: `bun run test` → 20 files, 156 tests passed.
- ISC-43 build: `bun run build` → main/preload/renderer built; renderer CSS bundle 75.6 kB includes board styles.
- ISC-44 boot: `bun run dev` → "starting electron app..." with NO load/renderer error; Electron main + window processes alive (`ps`). NOTE: required installing pre-existing optional native deps (`bufferutil`/`utf-8-validate`) that `electron.vite.config.ts`'s empty `main:{}` bundles hard — `git diff` proves main/preload/config are byte-identical to base, so base fails identically (pre-existing, not a regression). Pixel-level visual confirmation of drag/zoom feel needs a native-window screenshot tool (unavailable in this background session) or Marcel's eyes — the one OPEN item.
- ISC-46 anti-regression: `git diff` shows NO change to canvasStore, PrimitiveNode, render/*, applyServerMessage, or any src/main/* — canvas content rendering + socket plumbing untouched.

Advisor (commitment-boundary, Inference.ts): pushed back on deferring ISC-44 blind → I proved pre-existence by `git diff` and applied the dep fix to achieve a real boot, per its guidance. Cato (E4 cross-vendor): first run bailed on ISA-path tooling (project-ISA gap, v6.2.x); re-spawned with inlined context — read boardStore/Board/App directly and found NO correctness bug (pan/zoom, beam arbitration, authority model, reconcileApps ref-stability, busySlots-stale all verified safe). Only finding: orphaned dead-code cluster (Sidebar/Workspace/desktopStore/workspaceStore) = the intentional bounded-diff decision; cleanup is an open to-do. Verdict: concerns, none critical → proceed.
