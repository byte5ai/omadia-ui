# Use-Case Walkthroughs

Two narrative traces of an Omadia UI session against the architecture in [`../CONCEPT.md`](../CONCEPT.md). Purpose: validate that the wire format, tier responsibilities, and event grammar carry real work end-to-end. Where a step has an architectural risk, it is called out.

Walkthrough 1 exercises the **data-aggregation lane** (multi-source comparison). Walkthrough 2 exercises the **editor lane**, covering both the Tier-1 local operations catalog and a Tier-3 AI service.

---

## Walkthrough 1 — Multi-Source Comparison

**Scenario:** User opens Omadia UI on a Monday morning and types:

> "Show me all open Jira tickets grouped by owner, the remaining ERP hour budget per person next to it, and flag everyone under 8 hours."

| Step | Actor | Event / Action | Tier | Latency class |
|---|---|---|---|---|
| 1 | Host App starts | WebSocket open to `omadia-ui-channel` | Tier 1 Client → Tier 1 Server | — |
| 2 | Channel plugin | `handshake_offer { protocolVersions: ["1.0"], opsCatalogVersions: ["1.0"], handshakeId }` | Tier 1 Server → Tier 1 Client | — |
| 3 | Host App | `handshake_select { protocolVersion: "1.0", opsCatalogVersion: "1.0", localOperations: [<full v1.0 baseline>] }` | Tier 1 Client → Tier 1 Server | — |
| 4 | Channel plugin | `handshake_ack` — streaming phase active | Tier 1 Server → Tier 1 Client | — |
| 5 | User types request | `IncomingTurn { tenantId, userId, conversationId, canvasSessionId, text: "Show me…" }` | Tier 1 Client → Tier 1 Server → Tier 2 (`canvasChatAgent@1`) | D (content-bound) |
| 6 | Tier 2 acquires session mutex, loads canvas state + user prefs (`ui-prefs/<tenantId>/<userId>/default`) | reads from `memoryStore@1` | Tier 2 server-internal | <100ms |
| 7 | Tier 2 decides "content-bound", delegates to `chatAgent@1` with the Jira + ERP sub-agents | Tier 3 sub-agent calls in parallel | Tier 2 → Tier 3 | D |
| 8 | While Tier 3 works: Tier 2 emits initial skeleton | `surface_snapshot { producesRevision: 1, tree: { type: "container", title: "Pulling tickets and budgets…", children: [ skeleton-table ] } }` | Tier 2 → Tier 1 Client | ~500ms |
| 9 | Host App renders the skeleton table; user can scroll/hover (all Class A) | — | Tier 1 Client local | <16ms |
| 10 | Jira sub-agent returns first | `_pendingStructuredPayload { prose: "12 open tickets", data: { rows: [...] }, dataRefId: "jira-q1" }` | Tier 3 → Tier 2 (sentinel parse, origin-gated) | seconds |
| 11 | Tier 2 begins composing the merged table | emits `surface_data_ref_created { revision: 1, DataRef: { id: "jira-q1", signedToken, expiresAt }, schema, sizeHint }` | Tier 2 → Tier 1 Client | <100ms |
| 12 | Tier 2 emits incremental rows as ERP sub-agent returns budgets | `surface_patch { basedOnRevision: 1, producesRevision: 2, patches: [ append-rows ] }` repeated | Tier 2 → Tier 1 Client | several seconds |
| 13 | Tier 2 applies the business rule (budget < 8h), emits | `surface_patch { basedOnRevision: 2, producesRevision: 3, patches: [ highlight-rows: ["anna","bernd","cara"] ] }` | Tier 2 → Tier 1 Client | <500ms |
| 14 | Parallel `text_delta` for prose narration | "Three people are under budget: Anna, Bernd, Cara." | Tier 2 → Tier 1 Client | streamed |
| 15 | User clicks Anna's row | Host App captures Class-A gesture, sends `IncomingTurn { canvasSessionId, action: { type: "row-click", rowId: "anna" } }` | Tier 1 Client → Tier 1 Server → Tier 2 | B (routed) |
| 16 | Tier 2 reads canvas state, knows Anna's row is in the current tree, decides "expand inline" — emits | `surface_patch { basedOnRevision: 3, producesRevision: 4, patches: [ expand-row: anna with detail-list ] }` | Tier 2 → Tier 1 Client | <500ms |
| 17 | User types follow-up: "okay, which of them are on vacation?" | `IncomingTurn { text: "okay, which of them are on vacation?" }` | Tier 1 Client → Tier 2 | D |
| 18 | Tier 2 resolves "of them" against `canvas-state` (current tree includes anna/bernd/cara highlight), calls HR sub-agent through `chatAgent@1` | Tier 3 | seconds |
| 19 | HR sub-agent returns structured vacation data | `_pendingStructuredPayload` | Tier 3 → Tier 2 | — |
| 20 | Tier 2 emits column-add patch | `surface_patch { basedOnRevision: 4, producesRevision: 5, patches: [ add-column: { id: "vacation", label: "Out", data: [...] } ] }` — note the previous highlight + expansion state survives | Tier 2 → Tier 1 Client | <500ms |

### Risk points exercised

- **Skeleton latency** (step 8): can we hit ~500ms? Empirically verifiable in spike. Falsifies if Haiku-class is too slow for initial tree synthesis.
- **Sentinel origin gating** (step 10): the Jira sub-agent must declare the `canvas-output` tool capability or Tier 2 rejects the structured payload. Tested by inserting an un-declared sub-agent.
- **Referential continuity** (step 17–18): "of them" must resolve against the current canvas state, not get rebuilt as a new table. Tested by inspecting the emitted patch shape — if it is `surface_snapshot`, consistency is broken.
- **Patch composition** (step 20): adding a column must preserve highlight and expansion state. Tested visually.

---

## Walkthrough 2 — Photo Edit Micro-Task

**Scenario:** User opens Omadia UI, drags a photo into the canvas, and types:

> "Crop this to 16:9, apply a slight blur to the background, and remove the lamp post in the upper right."

This exercises Class A (brush stroke), Class B (Tier-2-routed crop + blur), and Class D (Tier-3 AI lamp-post removal).

| Step | Actor | Event / Action | Tier | Latency class |
|---|---|---|---|---|
| 1–4 | Same handshake as Walkthrough 1 — Host App `localOperations` includes pixel ops, selection ops, layer ops | — | — | — |
| 5 | User drags image file onto the canvas | Host App captures the drop, computes a local `DataRef` (uploads bytes via signed pre-flight, gets `{id, signedToken, expiresAt}`), then sends `IncomingTurn { canvasSessionId, action: { type: "image-dropped", dataRef } }` | Tier 1 Client → Tier 2 | C (composition) |
| 6 | Tier 2 loads canvas state, decides on a Photoshop-workspace composition | emits `surface_snapshot { producesRevision: 1, tree: { type: "container", children: [ canvas-region (with image as dataRef), toolbar (tools), form (inspector, context-bound to selection), tree (layer-stack: "Background") ] } }` | Tier 2 → Tier 1 Client | C |
| 7 | User types: "Crop this to 16:9, apply a slight blur to the background, and remove the lamp post in the upper right." | `IncomingTurn { text: "…" }` | Tier 1 Client → Tier 2 | mixed |
| 8 | Tier 2 plans three operations: `crop` (durable, local), `blur` (durable, local), `remove-object` (Tier 3, AI) | — | Tier 2 internal | <500ms |
| 9 | Tier 2 emits | `surface_local_action { revision: 1, effect: "durable", operation: "crop", params: { aspect: "16:9", anchor: "centre" }, target: "<canvas-region-id>" }` | Tier 2 → Tier 1 Client | B |
| 10 | Host App looks up `crop` in its local catalog (declared in handshake), executes locally on the pixel buffer | — | Tier 1 Client local | <16ms |
| 11 | Tier 2 follows up with the revisioned patch (durable contract) | `surface_patch { basedOnRevision: 1, producesRevision: 2, patches: [ set canvas-region dimensions to 16:9 with new dataRef from the cropped buffer ] }` | Tier 2 → Tier 1 Client | B |
| 12 | Tier 2 needs to know "the background" — emits a select operation first | `surface_local_action { revision: 2, effect: "durable", operation: "select-magic-wand", params: { invertFrom: "lamp-post-area" }, target: "<canvas-region-id>" }` | Tier 2 → Tier 1 Client | B |
| 13 | Host App executes selection locally, captures selection-region trait | — | Tier 1 Client local | <16ms |
| 14 | Tier 2 follows with revisioned patch capturing the selection | `surface_patch { basedOnRevision: 2, producesRevision: 3, patches: [ canvas-region.selection = <lasso-region> ] }` | Tier 2 → Tier 1 Client | B |
| 15 | Tier 2 emits the blur op against the inverted selection | `surface_local_action { revision: 3, effect: "durable", operation: "blur", params: { radius: 4, target: "selection" }, target: "<canvas-region-id>" }` | Tier 2 → Tier 1 Client | B |
| 16 | Host App applies blur locally to the pixel buffer | — | Tier 1 Client local | <16ms |
| 17 | Tier 2 follows up | `surface_patch { basedOnRevision: 3, producesRevision: 4, patches: [ canvas-region.dataRef = new buffer hash ] }` | Tier 2 → Tier 1 Client | B |
| 18 | For lamp-post removal, Tier 2 calls Tier 3 AI tool `remove_object` (via `chatAgent@1`) with a region descriptor | Tier 3 | D |
| 19 | While Tier 3 works: Tier 2 emits a loading hint on the canvas-region | `surface_patch { basedOnRevision: 4, producesRevision: 5, patches: [ canvas-region.loading = "spinner" with overlay message "Removing object…" ] }` | Tier 2 → Tier 1 Client | <500ms |
| 20 | User can keep working (e.g. pan/zoom the partial result — Class A) — other parts of the canvas stay responsive | — | Tier 1 Client local | <16ms |
| 21 | Tier 3 returns processed buffer with `_pendingStructuredPayload { data: { newDataRefId, …}, prose: "removed the lamp post" }` | Tier 3 → Tier 2 | seconds |
| 22 | Tier 2 emits final patch | `surface_patch { basedOnRevision: 5, producesRevision: 6, patches: [ canvas-region.dataRef = newBufferRef, canvas-region.loading = "none" ] }` | Tier 2 → Tier 1 Client | <500ms |

### Risk points exercised

- **Class B preview vs. durable** (steps 9, 12, 15): each is `effect: "durable"`, each is followed by a revisioned patch from Tier 2. This is what makes the editor lane shared-canvas-safe by construction (forward-compat hook).
- **Local catalog completeness** (step 10, 13, 16): if the Host App declared `localOperations` does not include `crop` / `select-magic-wand` / `blur`, Tier 2 falls back to a Tier-3 tool — much slower. Test: drop one op from the handshake, observe fallback behaviour.
- **Canvas-region buffer integrity** (step 11, 17, 22): each durable op produces a new `DataRef` (signed, owner-bound). The dataRef lifecycle and content-hashing is non-trivial — design needs spike-level confirmation.
- **Class A responsiveness during Tier-3 work** (step 20): the pan/zoom must work while the AI service is running. Tests the responsiveness boundary — if the Tier-1 render loop is on the same queue as the WebSocket handler, this breaks.
- **`select-magic-wand` as catalog op** (step 12): magic-wand is a non-trivial algorithm. Tier 1 implements it natively. If a simpler client doesn't support it (declared in `handshake_select.localOperations`), Tier 2 falls back to a Tier-3 tool — the magic-wand becomes seconds-slow but still works.

---

## What both walkthroughs validate

| Concern | Validated by |
|---|---|
| Three-tier latency split is real | Each walkthrough lists per-step latency class; no Class-A step round-trips the server, no Class-D step blocks the canvas |
| `treeRevision` discipline | Every durable mutation produces a revisioned patch; preview-only operations never bump the revision |
| Wire-format completeness | Every step uses only events and traits defined in CONCEPT.md — no inventions |
| Editor lane has real Tier-1 work | Walkthrough 2 makes pixel buffers, selection regions, and local catalog operations concrete |
| Forward-compatibility for shared canvases | Walkthrough 2 step 20 demonstrates the Class-A responsiveness that v2 multi-cast must preserve |

## What the walkthroughs do **not** validate

- Concrete UI design (visual mockups are separate work).
- Schema specification of each primitive (JSON Schemas are built during spike).
- Tech-stack-specific concerns (Tauri vs. Electron vs. native vs. PWA).
- Real-world latency numbers (need spike telemetry).
