# CDP probes — live verification against the packaged app

Launch the packaged app with a debug port, then drive/inspect it headlessly:

```sh
"dist/mac-arm64/Omadia UI.app/Contents/MacOS/Omadia UI" --remote-debugging-port=9223 &
node tools/cdp/cdp-probe.mjs     # mount/palette/visible-text snapshot + console errors
node tools/cdp/cdp-sidebar.mjs   # sidebar slots, active title, add button
node tools/cdp/cdp-turn2.mjs     # fire a real turn on the active slot, watch surface events
node tools/cdp/cdp-tiling.mjs    # split a pane, verify layout persistence, close again
```

Notes:
- The scripts use the multi-socket renderer API: `sendTurn(slotKey, turn)`,
  `onServerMessage((slotKey, msg) => …)` — slot ids come from
  `localStorage['omadia.ui-prefs.canvases']`.
- Plain Node ≥ 22 (built-in `fetch`/`WebSocket`), no dependencies.
- These drive the REAL app against the REAL kernel — they are verification
  probes, not unit tests. Don't run them against a session you care about
  mid-turn; cdp-turn2 fires an actual turn.
