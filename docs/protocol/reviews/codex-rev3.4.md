# Codex adversarial review — Lumens spec rev 3.4

> Independent adversarial pass (Codex, gpt-5.5, high reasoning) over
> [`lumens-spec.md`](../lumens-spec.md), [`lumen-walkthroughs.md`](../lumen-walkthroughs.md)
> and [`interactivity-concept.md`](../interactivity-concept.md) at rev 3.4
> (`main` @ `9844b11`). Verbatim findings below; the triage and the resulting
> fixes are **rev 3.5** (see the rev-3.5 note in `lumens-spec.md`).
>
> **Triage summary.** Almost every finding is real. Codex tested *soundness*
> (is the execution model actually total / bounded / deterministic?) where the
> internal passes tested *expressibility* — and found genuine holes at the
> arithmetic / iteration / kernel / effect-replay layer, plus self-contradictions
> and two security findings (free-colour chrome spoofing; the taint claim).
> The one place we filter rather than adopt: the determinism **contract** is made
> normative now, but exact per-kernel algorithms + numeric defaults stay an L0
> schema-spike deliverable (Codex's "specify everything now" overreaches the
> spec's own radical-restraint discipline). rev 3.5 addresses the rest.

---

**Critical**

- `docs/lumens-spec.md` §2.3/§2.4 + `docs/protocol/lumen-walkthroughs.md` A.2/D: static gas is not provable because `range`, `concat`, `flatten`, `split`, string ops, and kernel expression callbacks can allocate/iterate from runtime numeric values, while state `int`/`number` max is optional (`score` has no max). Fix: require finite min/max on all numeric state/const values used in size-producing ops and define per-op output caps in schema.

- `docs/lumens-spec.md` §2.2/§2.3: LX is not total as specified; `/`, `mod`, `pow`, log/time scales, numeric overflow/NaN/Infinity, invalid string indexes/slices, and degenerate kernel inputs have no normative result. Fix: define exact total semantics for every partial operator, or make validation reject inputs that can reach invalid domains.

- `docs/lumens-spec.md` §6.4 + §13.5 implied by §14 + `docs/protocol/lumen-walkthroughs.md` B.3/E: effect replay is underspecified; no deterministic effect id, ordering, result ordering, retry/idempotency key, or recorded replay envelope exists. Fix: assign monotonically ordered effect instance ids per transition evaluation and specify recorded result/error events replayed in that exact order.

- `docs/lumens-spec.md` §6.4: multiple effects from one transition have undefined ordering, and `on:"transition"` plus `{when}` can double-fire for the same state change. Fix: define a total ordering over `effects[]`, and specify whether transition-triggered and predicate-triggered effects are mutually exclusive or both fire with distinct ids.

- `docs/lumens-spec.md` §6.4: `debounceMs` “fire on settle” and `coalesceKey` “latest” depend on wall-clock scheduling and in-flight races, so replay is not deterministic. Fix: make debounce/coalesce operate over recorded logical event times/effect ids, and include the final emitted/suppressed decision in the replay trace.

- `docs/lumens-spec.md` §2.6/§14: native kernels are normative but their signatures, gas schedule, tie-breaks, floating-point model, and degenerate-input results are deferred to a spike. Fix: move per-kernel deterministic algorithms, limits, and exact fallback/error results into the normative schema before claiming total/bounded/deterministic.

- `docs/lumens-spec.md` §2.6: `layoutGraph(..., "force")`, `pathfind`, `sortBy`, `groupBy`, and quantile aggregation are not deterministic without seeded initialization, tie-break rules, float precision, stable ordering, and object-key ordering. Fix: mandate integer/fixed-point or canonical float behavior plus deterministic tie-breaks for every kernel.

- `docs/lumens-spec.md` §2.6/§2.3: `groupBy → record<key,list>`, `keys`, and `values` make JSON object key order observable without defining canonical record ordering. Fix: canonicalize record keys lexicographically or replace dynamic records with ordered list-of-pairs values.

- `docs/lumens-spec.md` §1.2/§14: `const` is “not serialised” and “does not appear in undo/replay”, but transitions depend on it; replay after a const patch can diverge. Fix: include a content hash/version of the full `const` section in every trace/snapshot/replay frame.

- `docs/lumens-spec.md` §6.4 + `docs/protocol/lumen-walkthroughs.md` C/E: effect `args` are specified as LX over post-transition state, but walkthrough effects read `{event:"item"}`/`{event:"dropTarget"}`. Fix: either allow effect args to read the triggering event explicitly, or require transitions to copy needed event fields into state.

**High**

- `docs/lumens-spec.md` §2.8 + `docs/protocol/lumen-walkthroughs.md` B.2/C: spec says `defs` cannot read `state`/`event`, but walkthrough defs `menuRow` and `effStatus` read `state`. Fix: make these walkthroughs pass `menu`/`override` as params, or loosen §2.8 and rework the purity claim.

- `docs/lumens-spec.md` §2.8: acyclic `defs` is underspecified for static analysis; call graph extraction through dead branches, `match`, shadowed names, and invalid arity is not explicitly syntactic. Fix: define cycle detection as a syntactic walk over all reachable AST nodes regardless of branch feasibility, with reserved namespaces for params/defs/std-lib.

- `docs/lumens-spec.md` §2.2/§2.5: multi-field `set` ordering is undefined for overlapping paths (`a` and `a.b`) and duplicate paths in JSON-source generation. Fix: reject duplicate/overlapping set paths and state that all RHS expressions evaluate against pre-transition state.

- `docs/lumens-spec.md` §2.5: “transitions MUST return state” conflicts with “transition result = delta-merge with `set`/`setAt` paths applied”; arbitrary expressions returning full records versus delta nodes are not distinguished. Fix: define transition root type as `StateDelta` only, or allow full-state returns with an explicit discriminator.

- `docs/lumens-spec.md` §4.1: event payload determinism is incomplete; overlapping inflated 44 pt hit areas, equal z-order scene nodes, drag start target, move/end sequencing, and pointer capture are undefined. Fix: specify hit-test order, tie-breaks, capture lifetime, and exact payloads for every drag phase.

- `docs/lumens-spec.md` §4: `captureLongPress` is referenced but not in `EventBinding`, `TargetRef`, or `SceneNode`. Fix: add it to a concrete schema location or delete the exception.

- `docs/lumens-spec.md` §1.1 + `docs/protocol/lumen-walkthroughs.md` B.0: walkthrough declares `"menu": {"type":"dataRef"}` without required `projection`; the reference Lumen is invalid under the spec. Fix: add the projection in B.0 or make projection optional with a defined opaque-handle type.

- `docs/lumens-spec.md` §1.1/§3/§6.1 + `docs/protocol/lumen-walkthroughs.md` E: `dataRef` is overloaded as a projected structured state leaf and as an image/token handle (`tiles[].img`), but the schema only defines the projection form. Fix: split `dataProjectionRef` from `assetRef`/`DataRefHandle`.

- `docs/lumens-spec.md` §1.1/§6.1: `loadData` timing and state interaction are undefined; it is unclear whether projection data counts against the 256 KB state cap, persists in undo, or arrives via patch/event. Fix: define projection lifecycle, empty defaults per type, cap accounting, invalidation, and replay behavior.

- `docs/lumens-spec.md` §6/§6.3/§14: broker egress bounds and session-scoped consent budgets are listed as open tuning items, but they are security-critical to the default-deny claim. Fix: make minimum required rate/quota/max-in-flight/idempotency/consent-budget semantics normative, leaving only numeric defaults tunable.

- `docs/lumens-spec.md` §6/§11: “state/DataRef-derived outbound requests are external-effect unless pre-approved” is not mechanically decidable as written. Fix: define taint rules for LX values flowing into capability args and require grant-time schemas for pre-approved request shapes.

- `docs/lumens-spec.md` §7 + `docs/interactivity-concept.md` §9.1: `PortType` is never defined, and there is no LX node/event form for reading input ports or emitting output ports. Fix: define port types, state binding semantics, propagation order, and conflict handling.

- `docs/lumens-spec.md` §7: `expose` says neighbours may read published fields by shared `DataRef` + stable IDs, but no addressing syntax, privacy boundary, or authorization rule is specified. Fix: require explicit reader declarations or wires, and define the exact lookup/read grammar.

- `docs/lumens-spec.md` §3.1/§11: `colorMode:"free"` permits rendering arbitrary Omadia-looking UI inside the Lumen, enabling consent-modal/chrome spoofing despite the “chrome stays Lume” boundary. Fix: reserve host chrome/consent visual patterns and require an unforgeable Lumen boundary/attribution on external-effect prompts.

**Medium**

- `docs/lumens-spec.md` §2.3: `random()` and `now()` are mentioned but absent from the AST catalog and have no seed/time granularity semantics. Fix: add explicit nodes or std-lib signatures and define whether values are per event, per evaluation, or per call.

- `docs/lumens-spec.md` §2.2: `{var:name, path:"f.g"}` allows paths into records/lists but only static dotted form; list indexing through `path` is ambiguous. Fix: restrict `path` to record fields only and require `at` for list access.

- `docs/lumens-spec.md` §2.3/§2.6: kernel `keyExpr`/predicate callback scope is undefined. Fix: specify binder names, allowed captures, gas accounting, and whether callbacks may call other kernels/apply defs.

- `docs/lumens-spec.md` §5: dirty-tracking “only dependent view branches” is impossible without a defined dependency-analysis model for arbitrary LX. Fix: either require whole-view reevaluation or define static dependency extraction and fallback behavior.

- `docs/lumens-spec.md` §12/§13: `surface_capability_request/result` are named but no wire payload schema, correlation fields, or relation to `surface_action_result` is defined. Fix: add concrete event schemas with effect ids, capability name, args hash, result/error payload, and revision semantics.

- `docs/lumens-spec.md` §13: `capabilityClasses?: CapabilityName[]` in client handshake conflates client support with Tier-2/user grants. Fix: rename to `brokeredCapabilitySupport` and keep grants exclusively in the Lumen manifest/grant state.

- `docs/interactivity-concept.md` §3 vs `docs/lumens-spec.md` §2.2: concept still describes `map`/`filter`/`fold` as std-lib, while spec makes them AST binder nodes. Fix: update concept language to avoid implementers exposing higher-order std-lib functions.

- `docs/interactivity-concept.md` §13 vs `docs/lumens-spec.md` §14: core parameters are called “research items, not unspecified holes” while the normative spec depends on them for safety. Fix: classify gas schedules, kernel limits, broker egress, and consent budgets as blocking normative deliverables.
