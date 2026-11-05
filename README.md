# omadia UI 2

The desktop surface for omadia, rebuilt from scratch on the design
**"Licht als Interface"** (claude.ai design canvas "omadia UI").
Electron, React 19, strict TypeScript. It speaks the same
`omadia-canvas-protocol/1.0` as the old `omadia-ui` and needs no change in
omadia core.

> What stands in the light has the attention. There is no accent colour:
> emphasis is light, colour is status. The dot is omadia.

## Quickstart

```sh
npm install --legacy-peer-deps
npm run dev            # electron-vite dev with hot reload
npm run build          # out/ (main, preload, renderer)
npm start              # run the built app
```

On first start enter the server address (for a local core:
`localhost:8080`). The app discovers the canvas socket through
`/.well-known/omadia-ui` and signs in natively (password provider) or through
a sign-in window (OIDC).

Local dev credentials for the core admin created after the DB reset live in
`.env.dev.local` (gitignored).

## Checks

```sh
npm run typecheck
npm run lint
npm test
```

## Architecture

| Layer | Where | What |
|---|---|---|
| Main | `src/main` | settings, encrypted session vault, discovery + LAN scan, native/OIDC login, one WebSocket per canvas (`canvas/canvas-connection.ts`) |
| Preload | `src/preload` | the typed `window.omadia` bridge (`src/shared/ipc.ts`) |
| Protocol | `src/shared/canvas-core.ts` | the browser-safe part of `@omadia/canvas-core` straight from `../omadia-core` (precompiled validators, reducer, patches, handshake). No vendored copy, no drift. |
| State | `src/renderer/src/state` | canvases (runtime per slot), desktops + tiling, notifications, session, local + server persistence (`canvas_list`, `desktop_list`) |
| Primitives | `src/renderer/src/primitives` | all 24 canvas primitives and their traits |
| Chrome | `src/renderer/src/components`, `screens` | sidebar, panes, ⌘K command, action panel, library, settings, notifications, arrival screens, agent dot |
| Design tokens | `src/renderer/src/styles/tokens.css` | night and day room, light temperature (2700/4500/6500 K) |

### Building a new canvas

A turn that builds a canvas from nothing (`forging` in the runtime) shows no
panel. `components/canvas-forge.tsx` keeps the tile as ground, and the dot
draws the outline of the view there (`lib/forge-engine.ts`): a faint guess
first, then the real layout from the snapshot (`lib/forge-layout.ts`).
Regions that are filled rise to surface. When the turn ends, the panel fades in.

That is the "Werkbank" variant. The "Fokus" variant (`components/canvas-focus.tsx`,
the default) gathers everything in the middle of the tile: a line icon that
flows into the next step (`lib/forge-glyphs.ts`, `lib/glyph-player.ts`; the dot
runs along it), a rotating word for the phase, omadia's latest sentence, and a
bar that only moves forward (`lib/forge-phase.ts`). The light is live
(`lib/forge-light.ts`, WebGL): a cone from a slit at the top edge, at the
light's fixed angle, aimed at the middle. By night the air in it glows (fog);
by day the room dims away from the slit (ink veil, at most 9 %) and the light
lands as a patch in the light temperature (`--cone-patch`), sharp at the slit
and soft at its end.
A theme switch blends the medium over 400 ms; the cone stays. The slit opens with the progress;
text and icon are material in the half-dark and turn to ink only where the
cone falls on them (a lit copy, masked to the cone). Every streamed sentence,
snapshot and patch sends a pulse down the beam. Without WebGL the still cone
stays and everything is lit. ⌘K "Aufbau-Animation: …" switches the two;
the choice is kept per device.

### The agent dot

`components/agent-dot.tsx` renders exactly one dot. It rests in the logo and
moves in straight lines to where omadia works: the command field while you
type, the spot a view is about to appear (glowing while omadia computes), the
node a patch touches, the question it waits on, or the sidebar entry of a
canvas working in the background. Errors tint it briefly, then it is neutral
again.

## Dev helpers

- Settings → "Entwicklungsmodus" shows the turn log and adds two commands to
  ⌘K: the canonical primitive gallery from canvas-core and the
  "Team-Auslastung" screen from the design, plus "Aufbau simulieren",
  which replays a build turn locally (stream, skeleton snapshot,
  patches) so the build state can be seen without a model.
- `scripts/probe-turn.mjs "<prompt>"` sends one turn to the core and dumps
  every frame.
- `scripts/cdp.mjs eval|shot` drives a running app started with
  `--remote-debugging-port=9333`.

## Text and clocks

- The canvas is the answer: omadia's streamed text is not shown. Only errors
  appear below the canvas, plus suggested actions as buttons.
- Time-zone values (`UTC+9:30`, `GMT-3`, `Europe/Berlin`) in a time column, or
  as a card of a zone heading and an empty/time value, render as live clocks.
  A table with a zone column and no time column gets an "Uhrzeit" column.

## Workaround for omadia-core's claude-cli provider

The core spawns the Claude CLI with `--tools ''`. In CLI 2.1.x MCP tools
connect late and are loaded through ToolSearch, which that flag also removes,
so the model never gets the omadia tools and writes its `canvas_publish_rows`
calls as text. `src/renderer/src/lib/recover-tool-calls.ts` reads those calls
back on `turn_complete` and fills the containers the skeleton promised (rows
and KPI `fields`, the same mapping as the server). Remove it once the core
fixes the spawn, for example by setting `MCP_CONNECTION_NONBLOCKING=false` for
the CLI child (the env allowlist in `cliSpawnGate.ts` currently drops it).

## Known limits

- Media, canvas-region, timeline and vector-path render as display surfaces;
  local editing operations are not implemented (`localOperations` is empty).
- Lumens / `scene` (protocol 1.1 draft) are not rendered yet.
- No packaging config yet (electron-builder, signing).
