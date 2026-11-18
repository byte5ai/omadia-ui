# Mockups

Clickable mockups for design discussions. They show how omadia UI will look
and feel from the user's side. They are mockups, not implementations: all data
is fictional and all logic runs inside the page.

Every `docs/mockups/*.html` file is published on the docs site at
`https://byte5ai.github.io/omadia-ui/mockups/<file>.html`.
`docs-site/scripts/generate.mjs` copies the files, and
`.github/workflows/docs.yml` deploys them on every push to `main` that touches
`docs/mockups/`.

## Agentic desktop

[`agentic-desktop.html`](agentic-desktop.html), live at
<https://byte5ai.github.io/omadia-ui/mockups/agentic-desktop.html>

omadia UI as the whole desktop of a thin client. The host OS only boots it.
Every application on it is generated for the task from primitives and Lumens
and works on live data through omadia core and its plugins. Three requests on
Home produce three different applications:

| Space | What it shows | Concept |
|---|---|---|
| Service day, team north | Order queue, map Lumen and day timeline, wired to one selection. Drag orders onto technicians; route, km and overtime follow live. Publishing the plans asks first; later edits show as unpublished changes and go out as an update to the technicians affected. | Lumens, ports and wires, `scene` |
| Solar quote, Müller GmbH | Roof editor scene (Paint adds modules, Erase removes them) driving yield, price, chart and quote lines. Sending asks first; later changes go out as a revision with a list of what changed. | `scene`, form primitives, external effects |
| Lobby kiosk, AURA launch | A touch kiosk Lumen in the AURA brand colours inside omadia chrome. The visitor preview shows the full screen; X-ray tags every region with its render cadence. | colorMode brand, render cadence, kiosk ladder |

### Things to try

- Pick a request on Home and watch the application assemble.
- Right-click or long-press any element for its action panel: direct actions,
  suggestions, and a beam field. A question gets an answer card and changes
  nothing. An explicit change request patches the element in place, for
  example "Show travel time on each stop" on the timeline, "Add a maintenance
  contract for 5 years" on the quote, or "Add a German version" on the kiosk.
- Close a Space with ×. It waits under Recent work with every change, and
  asking again resumes it. Pin an application to keep it as a personal tool;
  sharing it with a team asks first. The dispatch tool starts Wednesday's plan
  on new data.
- Press ⌘K or Ctrl K for the command layer, for example "Make it warmer".
- X-ray shows what each canvas is made of and where the instance came from:
  generated, resumed, started from a tool, or restored after a restart.
- Trace lists prompts, beams, answers, actions and external effects, for the
  current Space or for all Spaces.

### Links and state

| URL | Opens |
|---|---|
| `agentic-desktop.html` | the boot sequence of the thin client, then Home |
| `agentic-desktop.html?noboot` | Home directly |
| `agentic-desktop.html#dispatch`, `#solar`, `#kiosk` | that Space; it is generated on first use |

The mockup keeps its state in the browser (localStorage). A reload or "Replay
boot" brings back your Spaces, Recent work and tools. "Reset demo", in the
guide (press `?`) or in the command layer, clears it.

### Where it comes from in the docs

- Canvas, Spaces, command layer, context-invoke, beam and Trace:
  [`CONCEPT.md`](../../CONCEPT.md), "Interaction Model" and "Multiple
  Canvases (Spaces-style)".
- Lumens, `scene`, ports and wires, presets, render cadence and the kiosk
  ladder: [`interactivity-concept.md`](../interactivity-concept.md) and
  [`lumens-spec.md`](../lumens-spec.md).
- Lume material, palettes and condensation:
  [`visual-spec.md`](../visual-spec.md), with §4.13 for Lumens.

## Kiosk Lumen, AURA

[`kiosk-lumen-aura.html`](kiosk-lumen-aura.html), live at
<https://byte5ai.github.io/omadia-ui/mockups/kiosk-lumen-aura.html>

A single kiosk Lumen on its own, full screen, as the reference for
[`visual-spec.md`](../visual-spec.md) §4.13. Tap the feature chips; the
cadence overlay (bottom right) shows which regions are static, reactive or
tick. The lobby kiosk Space of the agentic desktop shows a kiosk Lumen of the
same kind inside the desktop.
