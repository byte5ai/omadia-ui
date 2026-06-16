# Lumen reference walkthroughs — the §14 acceptance gate

> **Purpose.** Hand-author the reference Lumens in **real LX-AST** and trace each
> transition against the [`lumens-spec.md`](../lumens-spec.md) grammar — the
> cheapest test that the spec holds against non-trivial artifacts *before*
> implementation budget (L0–L9) is committed (`lumens-spec.md` §14). This is a
> **manual** trace: there is no interpreter yet (L1 unbuilt), so "validates" means
> "every node form exists in the grammar, types resolve, it is total/bounded, and
> it computes the intended result". Where a node form is **missing**, it is marked
> 🔴 GAP; ergonomic friction is 🟡; confirmed-working is ✅.
>
> Two Lumens, chosen to stress the two orthogonal axes:
> - **A — falling-blocks arcade** (`colorMode: theme`): the compute axis —
>   gameloop, collision, lock, line-clear, spawn, input, scene render.
> - **B — kiosk ordering flow** (`colorMode: brand`): the capability axis —
>   local-first cart, kernel aggregation, the single `external-effect` commit.
>
> **Headline result.** Both are expressible *in shape*, and rev 3.x (binders,
> `var`, `at`/`setAt`, `const`, `idx`, `flatten`, kernels, colour authority) holds
> up. Writing them **complete** (not fragments, as in the earlier passes) surfaced
> **two load-bearing gaps the fragment passes missed**: no author-defined function
> abstraction (§Findings G1), and no specified mechanism for a *pure* transition
> to *invoke* a capability (§Findings G2). Both are now fixed in the spec
> (`defs`/`apply` §2.8; effect bindings §6.4).

---

## A — Falling-blocks arcade Lumen

### A.0 State, const, invariants

`board` is a **`list<list>`** (not `grid`) so line-clear is a clean
`filter`/`concat` (`lumens-spec.md` §2.2 guidance); the piece is `(type, rot, x,
y)` as indices into a `const` shape table.

```jsonc
"state": {
  "board": { "type":"list", "maxLen":20,
             "of":{ "type":"list", "maxLen":10, "of":{ "type":"int","min":0,"max":7 } },
             "init":[[0,0,0,0,0,0,0,0,0,0], /* …20 empty rows… */] },
  "pType": { "type":"int","min":0,"max":6,"init":0 },
  "pRot":  { "type":"int","min":0,"max":3,"init":0 },
  "pX":    { "type":"int","min":-2,"max":11,"init":4 },
  "pY":    { "type":"int","min":-2,"max":21,"init":0 },
  "score": { "type":"int","min":0,"max":9999999,"init":0 },   // rev 3.5 §2.9: a numeric needs max if it can feed a size op
  "frame": { "type":"int","min":0,"init":0 },
  "over":  { "type":"bool","init":false }
}
```

The shape table — declared **once** in `const` (the §1.2 fix; without it this
112-cell table would be re-inlined into every transition that reads it):

```jsonc
"const": {
  "shapes": {
    "type":"list","maxLen":7,
    "of":{ "type":"list","maxLen":4,
           "of":{ "type":"list","maxLen":4,
                  "of":{ "type":"record","fields":{
                           "dx":{"type":"int","min":-2,"max":2},
                           "dy":{"type":"int","min":-2,"max":2} } } } },
    "value": [
      /* piece 0 (O), all 4 rots identical */
      [ [{"dx":0,"dy":0},{"dx":1,"dy":0},{"dx":0,"dy":1},{"dx":1,"dy":1}], /* …×4… */ ],
      /* piece 1 (I) rot 0 */
      [ [{"dx":-1,"dy":0},{"dx":0,"dy":0},{"dx":1,"dy":0},{"dx":2,"dy":0}], /* rot1,2,3… */ ]
      /* pieces 2–6 (T,S,Z,J,L) — mechanical, elided; they stress nothing new */
    ]
  }
}
```

✅ **§1.2 `const` validated** — the nested `list<list<list<record>>>` is
expressible in the typed-leaf grammar and carries the table once.
🟡 **G3 (StateLeaf undefined):** §1.1 references `StateLeaf` in `list`/`grid`
`of` but never defines it. The board (`list<list>`) and this table
(`list<list<list<record>>>`) only validate if `StateLeaf` includes **nested
`list`/`record`**. The spec must say so explicitly (see Findings).

Invariants (§2.7) — turn off-by-one generation bugs into loud errors:

```jsonc
"invariants": [
  { ">=":[ {"state":"score"}, {"lit":0} ] },
  { "==":[ {"call":"len","args":[{"state":"board"}]}, {"lit":20} ] }   // board never loses a row
]
```

### A.1 The shared helpers — and the gap that forced them

Collision is needed from **four** transitions (gravity, move-left, move-right,
rotate), each against a *different* candidate `(x,y,rot)`. There is **no way to
define `collides(...)` once** in the rev-3.1 grammar — `let` binds a *value*, not
a *parameterised function*, and a transition cannot call another transition. The
only rev-3.1 option is to **inline the whole collision fold four times** with
shifted coordinates — bloat, and four chances for an inconsistent off-by-one.

🔴 **G1 — no author-defined function abstraction.** Fixed by adding `defs` +
`{apply}` (`lumens-spec.md` §2.8). With it:

```jsonc
"defs": {
  "cellsOf": { "params":["t","r"], "body":
    { "at":{ "at":{"const":"shapes"}, "index":[{"var":"t"}], "default":{"lit":[]} },
      "index":[{"var":"r"}], "default":{"lit":[]} } },

  "collides": { "params":["board","t","px","py","pr"], "body":
    { "fold":{ "apply":"cellsOf", "args":[{"var":"t"},{"var":"pr"}] },
      "as":"c", "acc":"hit", "init":{"lit":false},
      "body":
        { "let":{ "bx":{ "+":[{"var":"px"},{"var":"c","path":"dx"}] } }, "in":
          { "let":{ "by":{ "+":[{"var":"py"},{"var":"c","path":"dy"}] } }, "in":
            { "or":[
                {"var":"hit"},
                { "<":[{"var":"bx"},{"lit":0}] },
                { ">":[{"var":"bx"},{"lit":9}] },
                { ">":[{"var":"by"},{"lit":19}] },
                { "and":[
                    { ">=":[{"var":"by"},{"lit":0}] },
                    { "!=":[
                        { "at":{ "at":{"var":"board"},"index":[{"var":"by"}],"default":{"lit":[]} },
                          "index":[{"var":"bx"}], "default":{"lit":0} },
                        {"lit":0} ] } ] }
            ] } } } } }
}
```

✅ `cellsOf`/`collides` read **only their params + `const`** (not `state`) — pure,
so a caller can pass either `{state:"board"}` *or* an in-flight computed board
(critical for the game-over test in A.2, which must check the *cleared* board, not
the stale state board). This purity rule is part of the G1 fix.
✅ **`at` totality** (every nested access carries a `default`) makes the
above-board region (`by < 0`) read as empty — collision stays total.

### A.2 `tick` — gravity, lock, clear, spawn, game-over

```jsonc
"tick": {
  "if": {"state":"over"},
  "then": { "set":{} },                                  // ← no-op: return state unchanged (G4)
  "else":
    { "let":{ "f2":{ "+":[{"state":"frame"},{"lit":1}] } }, "in":
      { "if": { "!=":[ {"call":"mod","args":[{"var":"f2"},{"apply":"gravity","args":[{"state":"score"}]}]}, {"lit":0} ] },
        "then": { "set":{ "frame":{"var":"f2"} } },       // not a gravity frame: only advance the counter
        "else":
          { "if": { "not":{ "apply":"collides","args":[
                      {"state":"board"},{"state":"pType"},{"state":"pX"},
                      { "+":[{"state":"pY"},{"lit":1}] },{"state":"pRot"} ] } },
            "then": { "set":{ "frame":{"var":"f2"}, "pY":{ "+":[{"state":"pY"},{"lit":1}] } } },   // fall one
            "else":                                       // landed → lock + clear + spawn
              { "let":{ "locked":{ "apply":"lockPiece","args":[
                          {"state":"board"},{"state":"pType"},{"state":"pX"},{"state":"pY"},{"state":"pRot"}] } }, "in":
                { "let":{ "kept":{ "filter":{"var":"locked"}, "as":"row",
                            "body":{ "not":{ "fold":{"var":"row"},"as":"cell","acc":"full","init":{"lit":true},
                                       "body":{ "and":[{"var":"full"},{"!=":[{"var":"cell"},{"lit":0}]}] } } } } }, "in":
                  { "let":{ "nClear":{ "-":[{"lit":20},{"call":"len","args":[{"var":"kept"}]}] } }, "in":
                    { "let":{ "cleared":{ "concat":[
                                { "map":{"call":"range","args":[{"var":"nClear"}]}, "as":"_",
                                  "body":{"lit":[0,0,0,0,0,0,0,0,0,0]} },
                                {"var":"kept"} ] } }, "in":
                      { "set":{
                          "board":  {"var":"cleared"},
                          "score":  { "+":[{"state":"score"},{"apply":"lineScore","args":[{"var":"nClear"}]}] },
                          "pType":  { "call":"mod","args":[{ "+":[{"state":"pType"},{"lit":1}]},{"lit":7}] },  // demo spawn
                          "pRot":0, "pX":4, "pY":0, "frame":{"var":"f2"},
                          "over":   { "apply":"collides","args":[
                                       {"var":"cleared"},
                                       { "call":"mod","args":[{ "+":[{"state":"pType"},{"lit":1}]},{"lit":7}] },
                                       {"lit":4},{"lit":0},{"lit":0} ] }
                      } } } } } } } } } } }
}
```

✅ **Line-clear** (`filter` full rows out, `concat` empty rows on top) — clean,
~12 nodes, **no kernel needed**. ✅ **`map(range)`** builds the empty rows. ✅
**multi-field `set`** writes 7 fields from shared `let`s in one shot. ✅ The
game-over check calls `collides` against the **computed** `cleared` board — only
possible because `defs` are pure-in-params (A.1).
🟡 **G4 (transition return semantics):** `{set:{}}` is used for "unchanged". The
spec must state normatively that a transition returns **current state with
`set`/`setAt` applied** (delta-merge), and that `{set:{}}` is the no-op — without
this rule, "return unchanged" and "change only pX" have no defined meaning.
🟡 **G5 (multi-field `set`):** `{set:{a:…,b:…}}` (a map of several paths) is used
heavily; §2.2 showed only the single-key form. Must be explicitly allowed.

`lockPiece` (folds `setAt` over the 4 cells — the rev-3.1 `setAt`-on-`list<list>`
fix) and the tiny `gravity`/`lineScore`/`bag` defs are mechanical; elided.

### A.3 Input & view

```jsonc
"moveLeft": { "if": { "not":{ "apply":"collides","args":[
                  {"state":"board"},{"state":"pType"},
                  { "-":[{"state":"pX"},{"lit":1}] },{"state":"pY"},{"state":"pRot"} ] } },
              "then": { "set":{ "pX":{ "-":[{"state":"pX"},{"lit":1}] } } },
              "else": { "set":{} } },

"events": [
  { "on":"tick", "rate":60, "run":"tick" },
  { "on":"key", "key":"ArrowLeft",  "run":"moveLeft" },
  { "on":"key", "key":"ArrowRight", "run":"moveRight" },
  { "on":"key", "key":"ArrowUp",    "run":"rotate" },
  { "on":"swipe", "run":"moveLeft" }                       // touch equivalent (§4)
]
```

`view` renders the board with the `idx` binder (rev 3.1) + `flatten` instead of
the old `map(range)+at`/`fold`+`concat` detour:

```jsonc
"view": { "type":"scene", "id":"b", "width":200, "height":400, "draw":
  { "call":"flatten","args":[
    { "map":{"state":"board"}, "as":"row", "idx":"y", "body":
      { "filter":
        { "map":{"var":"row"}, "as":"cell", "idx":"x", "body":
          { "record":{ "kind":{"lit":"rect"},
              "x":{ "*":[{"var":"x"},{"lit":20}] }, "y":{ "*":[{"var":"y"},{"lit":20}] },
              "w":{"lit":20}, "h":{"lit":20},
              "fill":{ "apply":"tokenOf","args":[{"var":"cell"}] },   // 0→bg, 1–7→accent tints (theme)
              "id":{ "call":"fmt","args":[{"lit":"c-{}-{}"},{"var":"x"},{"var":"y"}] } } } },
        "as":"n", "body":{ "!=":[{"var":"n","path":"fill"},{"lit":"transparent"}] } } } ]
  } }
```

✅ **`idx` binder + `flatten`** (rev 3.1) collapse the hot render path to a
readable nested map. ✅ token colour via a `tokenOf` def (theme mode — a falling
game is accent-tinted; the 7-distinct-colours limitation noted earlier stands for
`theme`, and is exactly what `colorMode:'free'` lifts when the author wants it).

---

## B — Kiosk ordering Lumen (capability axis)

### B.0 State, brand palette, capabilities

```jsonc
"colorMode": "brand",
"palette": { "primary":"#DA291C", "ink":"#FFFFFF", "surface":"#1A1A1A", "pop":"#FFC72C" },
"state": {
  "menu":  { "type":"dataRef", "projection":{ "type":"list","maxLen":200,
               "of":{"type":"record","fields":{
                       "sku":{"type":"string","maxLength":32},
                       "name":{"type":"string","maxLength":80},
                       "price":{"type":"int","min":0,"max":100000} } } } },   // loadData projection (rev 3.5: projection required)
  "cart":  { "type":"list","maxLen":50,
             "of":{ "type":"record","fields":{
                      "sku":{"type":"string","maxLength":32},
                      "qty":{"type":"int","min":0,"max":99} } }, "init":[] },
  "stage": { "type":"enum","values":["browse","review","placing","done","failed"], "init":"browse" },
  "orderId": { "type":"string","maxLength":64,"init":"" }
},
"capabilities": [
  { "cap":"loadData",  "scope":{ "dataRef":"menu" } },
  { "cap":"writeData", "scope":{ "target":"orders", "writeCapabilities":["create"] } }
],
"invariants": [ { "<=":[ {"call":"len","args":[{"state":"cart"}]}, {"lit":50} ] } ]
```

✅ **§3.1 colour authority** — `brand` + declared `palette`; this Lumen's content
renders in the customer's red/gold, Omadia chrome stays Lume.

### B.1 Cart edits — pure `state`, zero capabilities (the §6.3 proof)

`addItem` increments an existing line or appends — using `fold`+**`idx`** to find
the line by `sku` (there is no `findIndex`-by-predicate; the `idx` binder makes
the fold do it):

```jsonc
"addItem": {
  "let":{ "i":{ "fold":{"state":"cart"}, "as":"it", "idx":"k", "acc":"f", "init":{"lit":-1},
            "body":{ "if":{ "==":[{"var":"it","path":"sku"},{"event":"sku"}] },
                     "then":{"var":"k"}, "else":{"var":"f"} } } }, "in":
  { "if": { ">=":[{"var":"i"},{"lit":0}] },
    "then": { "set":{ "cart":{ "setAt":{"state":"cart"}, "index":[{"var":"i"}], "to":
                { "record":{ "sku":{"event":"sku"},
                    "qty":{ "+":[ { "at":{"state":"cart"},"index":[{"var":"i"}],"default":{"record":{"qty":{"lit":0}}} ,"path":"qty"... }
```

🟡 **G6 (`at` + `path` composition):** reading `cart[i].qty` wants
`at`-then-field. `{var:…,path:…}` reads a field of a *binder*; `at` reads an
*index*. Composing index-then-field needs either nesting (`{"at":…}` wrapped so a
`path` applies to its result) or letting `at` take an optional `path`. The
grammar doesn't say which. Resolved here by binding the row first:

```jsonc
"addItem": {
  "let":{ "i": /* …fold-find as above… */ }, "in":
  { "if": { ">=":[{"var":"i"},{"lit":0}] },
    "then":
      { "let":{ "row":{ "at":{"state":"cart"}, "index":[{"var":"i"}], "default":{"lit":{"sku":"","qty":0}} } }, "in":
        { "set":{ "cart":{ "setAt":{"state":"cart"}, "index":[{"var":"i"}], "to":
            { "record":{ "sku":{"var":"row","path":"sku"}, "qty":{ "+":[{"var":"row","path":"qty"},{"lit":1}] } } } } } } },
    "else":
      { "set":{ "cart":{ "concat":[ {"state":"cart"},
          { "list":[ { "record":{ "sku":{"event":"sku"}, "qty":{"lit":1} } } ] } ] } } } }
}
```

✅ **The entire cart flow touches *no* capability** — `addItem`, `setQty`,
`removeItem`, browse navigation are pure `state`, `reactive`, **zero modals**.
This is the §6.3 "local-first, commit-once" claim, validated concretely: the "20
taps" never cross a gate.

### B.2 Review view — the `aggregate` kernel + cart↔menu join

```jsonc
"defs": {
  "menuRow": { "params":["sku"], "body":
    { "fold":{"state":"menu"}, "as":"m", "acc":"r", "init":{"lit":{"name":"?","price":0}},
      "body":{ "if":{ "==":[{"var":"m","path":"sku"},{"var":"sku"}] }, "then":{"var":"m"}, "else":{"var":"r"} } } },
  "lineItems": { "params":["cart"], "body":
    { "map":{"var":"cart"}, "as":"it", "body":
      { "let":{ "mr":{ "apply":"menuRow","args":[{"var":"it","path":"sku"}] } }, "in":
        { "record":{ "name":{"var":"mr","path":"name"},
            "qty":{"var":"it","path":"qty"},
            "lineTotal":{ "*":[{"var":"it","path":"qty"},{"var":"mr","path":"price"}] } } } } } }
}
```

Total via the kernel (the rev-3 native-kernel mechanism, in its home use case):

```jsonc
"total": { "kernel":"aggregate",
           "args":[ {"apply":"lineItems","args":[{"state":"cart"}]}, {"record":{"op":{"lit":"sum"},"field":{"lit":"lineTotal"}}} ] }
```

✅ **`aggregate` kernel + `menuRow` def** — the join-by-sku is one reusable def
(reinforcing G1's value beyond the arcade), the sum is one kernel call. Note again
`defs` purity: `menuRow` reads `state.menu` here only because menu is fixed for
the turn — but to stay strictly pure-in-params it should take `menu` as an arg;
the spec rule (G1 fix) allows reading `state` only when the value is stable for
the evaluation. *Recommend menu passed as a param for cleanliness.*

### B.3 Checkout — the single `external-effect`, and the gap it exposed

The user taps "place order". The transition is **pure**: it can flip `stage` to
`placing` (optimistic), but **how does a pure transition actually fire the
`writeData` capability?** Nothing in §6/§6.3 defines the *trigger primitive* — §6
describes the wire event (`surface_capability_request`) and §9.1 *gestures* at "a
Lumen output wired to a `writeData` capability", but no authoring form exists.

🔴 **G2 — capability invocation from a pure transition is unspecified.** Fixed by
adding **effect bindings** (`lumens-spec.md` §6.4): the Lumen declares, like
`events` but in the output direction, "when transition X fires, broker capability
C with args `<LX over state>`, and feed the result to transition `then`". Purity
and determinism are preserved (the result re-enters as a recorded input, §13.5).

```jsonc
"placeOrder": { "set":{ "stage":{"lit":"placing"} } },     // pure: just the optimistic flip

"effects": [
  { "on":"placeOrder",                                     // trigger = a transition firing
    "call":"writeData",
    "args":{ "record":{ "target":{"lit":"orders"},
                        "op":{"lit":"create"},
                        "lines":{ "apply":"lineItems","args":[{"state":"cart"}] } } },
    "onResult":"orderPlaced", "onError":"orderFailed" } 
],

"orderPlaced": { "set":{ "stage":{"lit":"done"},  "orderId":{"event":"id"} } },   // result re-enters as event
"orderFailed": { "set":{ "stage":{"lit":"failed"} } }                              // optimistic rollback
```

✅ With §6.4, the whole flow is: pure local cart → one `placeOrder` (optimistic
`placing`) → declared effect brokers the **single `external-effect`** (one consent
gate, §6.3) → `orderPlaced`/`orderFailed` patch the terminal state. Server stays
authoritative; determinism intact (replay re-feeds the recorded result).

---

---

## C — Interactive workflow Lumen (Kanban triage)

Stresses: **data-driven** view from `loadData`, **optimistic overlay** (loadData
is read-only), drag-and-drop, write-back via `effects` (§6.4). View is **ordinary
primitives**, not `scene` — confirming `view → primitive tree` (§1).

`loadData` hands a **read-only** projection, so a card's status **cannot** be
mutated in place. The canonical pattern: keep edits in a **separate local overlay**
and merge them in the view (the §6.3 optimistic+reconcile idiom, made concrete).

```jsonc
"capabilities": [
  { "cap":"loadData",  "scope":{ "dataRef":"cards" } },
  { "cap":"writeData", "scope":{ "target":"issues", "writeCapabilities":["update"] } }
],
"state": {
  "cards":    { "type":"dataRef", "projection":{ "type":"list","maxLen":500,
                  "of":{"type":"record","fields":{
                          "id":{"type":"string","maxLength":32},
                          "title":{"type":"string","maxLength":120},
                          "status":{"type":"string","maxLength":16} } } } },   // ← R2: projection shape
  "override": { "type":"list","maxLen":500,
                "of":{"type":"record","fields":{
                        "id":{"type":"string","maxLength":32},
                        "status":{"type":"string","maxLength":16} } }, "init":[] }   // local optimistic edits
},
"const": { "columns": { "type":"list","of":{"type":"string","maxLength":16},"value":["todo","doing","done"] } }
```

`effectiveStatus(id, fallback)` — overlay first, else the loaded value. It must
look up `override` by `id`; **records have no dynamic-key access**, so the lookup
is a `fold`-find over a list of pairs (R3):

```jsonc
"defs": {
  "effStatus": { "params":["id","fallback"], "body":
    { "fold":{"state":"override"}, "as":"o", "acc":"r", "init":{"var":"fallback"},
      "body":{ "if":{ "==":[{"var":"o","path":"id"},{"var":"id"}] }, "then":{"var":"o","path":"status"}, "else":{"var":"r"} } } }
}
```

`moveCard` — a **drag-and-drop**: drag card `id` onto a column. This needs the
**dropped item** and the **drop target** from the event payload — neither is
defined in §4 (R1). Written here against the payload R1 *adds*:

```jsonc
"moveCard": {                                    // event payload: {item:<cardId>, dropTarget:<columnId>}
  "set":{ "override":
    { "concat":[
        { "filter":{"state":"override"}, "as":"o", "body":{ "!=":[{"var":"o","path":"id"},{"event":"item"}] } },  // drop old entry
        { "list":[ { "record":{ "id":{"event":"item"}, "status":{"event":"dropTarget"} } } ] } ] } }              // add new
},
"effects": [
  { "on":"moveCard", "call":"writeData",
    "args":{ "record":{ "target":{"lit":"issues"}, "op":{"lit":"update"},
                       "id":{"event":"item"}, "status":{"event":"dropTarget"} } },
    "onResult":"moveConfirmed", "onError":"moveReverted" } 
]
```

✅ `effects` (§6.4) carries the optimistic write; `onError` reverts the overlay.
✅ `view` is primitives: a `row` of `column`s, each a `filter` of cards whose
`effStatus` matches, mapped to `card` primitives (drag-source bound).
🔴 **R1 (pointer-event payload undefined):** `moveCard` reads `{event:"item"}`
and `{event:"dropTarget"}` — but §4 never says a `drag`/`drop` event carries them.
🟡 **R2 (loadData projection shape):** used `"projection":{…}` on the `dataRef`
leaf and read `{state:"cards"}` as the list directly — neither is in §1.1/§6.
🟡 **R3 (no dynamic map access):** `effStatus` is an O(n) `fold`-find because a
`record` has no dynamic-key read.

## D — Defrag-style visualisation Lumen

Stresses: `loadData` → `scene` grid, a `tick` animation cursor, many-colour fills.

```jsonc
"capabilities": [ { "cap":"loadData", "scope":{ "dataRef":"extents" } } ],
"colorMode": "free",                              // a defrag map wants many distinct block colours (R-colour validated)
"state": {
  "cells":  { "type":"list","maxLen":4096, "of":{"type":"int","min":0,"max":255}, "init":[] },  // cell → fileIndex (0=free)
  "cursor": { "type":"int","min":0,"max":4096,"init":0 },
  "extents":{ "type":"dataRef", "projection":{ "type":"list","of":{"type":"record","fields":{
                "file":{"type":"int"},"blocks":{"type":"int"} } } } }                            // R2 again
},
"defs": {
  "firstGap":  { "params":["cells","upto"], "body":
    { "fold":{ "call":"range","args":[{"var":"upto"}] }, "as":"i", "acc":"g", "init":{"var":"upto"},
      "body":{ "if":{ "and":[{ "==":[{"var":"g"},{"var":"upto"}] },
                             { "==":[{ "at":{"var":"cells"},"index":[{"var":"i"}],"default":{"lit":1} },{"lit":0}] }] },
               "then":{"var":"i"}, "else":{"var":"g"} } } }
}
```

`tick` compacts one block per frame: move the highest used block into the first
gap (both are `fold` scans — bounded, no kernel):

```jsonc
"tick": {
  "let":{ "g":{ "apply":"firstGap","args":[{"state":"cells"},{"state":"cursor"}] } }, "in":
  { "if":{ ">=":[{"var":"g"},{"state":"cursor"}] },
    "then":{ "set":{} },                                              // compacted: no-op
    "else":
      { "let":{ "src":{ "apply":"lastUsed","args":[{"state":"cells"},{"state":"cursor"}] } }, "in":
        { "set":{
            "cells":{ "setAt":
              { "setAt":{"state":"cells"}, "index":[{"var":"g"}],
                "to":{ "at":{"state":"cells"},"index":[{"var":"src"}],"default":{"lit":0} } },
              "index":[{"var":"src"}], "to":{"lit":0} },               // two functional writes, nested
            "cursor":{ "+":[{"var":"g"},{"lit":1}] } } } } }
}
```

✅ `setAt` nested (move = write dest then clear src), `fold`-scan helpers via
`defs`, `tick` cadence, `free` colour for many distinct file blocks.
🟡 **R2** recurs (the `extents` projection drives the initial `cells` layout).
✅ Otherwise fully expressible — gas trivial (two 4096-bounded folds per frame is
the worst case; well under budget).

## E — Interactive map Lumen

Stresses: `tiles` + `loadData` capabilities via **`effects`**, `scene` sprites,
camera pan/zoom, marker hit-testing, `persist`.

```jsonc
"capabilities": [
  { "cap":"tiles",    "scope":{ "provider":"osm" } },
  { "cap":"loadData", "scope":{ "dataRef":"places" } },
  { "cap":"persist",  "scope":{ "key":"viewport" } }
],
"state": {
  "view":   { "type":"record","fields":{ "cx":{"type":"number"},"cy":{"type":"number"},"z":{"type":"int","min":1,"max":19} },
              "init":{"cx":0,"cy":0,"z":4} },
  "tiles":  { "type":"list","maxLen":64, "of":{"type":"record","fields":{
                "x":{"type":"int"},"y":{"type":"int"},"img":{"type":"assetRef","kind":"tile"} } }, "init":[] },  // rev 3.5: assetRef, not dataRef
  "places": { "type":"dataRef", "projection":{ "type":"list","of":{"type":"record","fields":{
                "id":{"type":"string","maxLength":32},"lat":{"type":"number"},"lon":{"type":"number"} } } } },
  "sel":    { "type":"string","maxLength":32,"init":"" }
},
"transitions": {
  "pan":    { "set":{ "view":{ "record":{ "cx":{ "+":[{"state":"view","path":"cx"},{"event":"dx"}] },
                                          "cy":{ "+":[{"state":"view","path":"cy"},{"event":"dy"}] },
                                          "z":{"state":"view","path":"z"} } } } },          // R1: drag payload dx/dy
  "selectMarker": { "set":{ "sel":{"event":"hitId"} } }                                     // R1: tap payload hitId
},
"events": [
  { "on":"drag",  "run":"pan" },
  { "on":"pinch", "run":"zoom" },
  { "on":"tap",   "run":"selectMarker" }            // payload.hitId = topmost scene node hit (§3) — R1
],
"effects": [
  { "on":"pan",  "call":"tiles",   "args":{ "apply":"tileRange","args":[{"state":"view"}] }, "onResult":"tilesReady" },
  { "on":"pan",  "call":"persist", "args":{"state":"view"}, "debounceMs":500 }              // R4: coalesce hot effect
]
```

✅ **`effects` validated in a second context** (tiles fetch on pan; result patched
into `state.tiles`). ✅ scene `sprite` tiles + marker hit-testing → `{event:"hitId"}`
→ `sel`. ✅ `tileRange(view)` is a `def` doing the z/x/y arithmetic (fiddly but
pure LX — `floor`/`pow`/`mod`; no kernel needed).
🔴 **R1** again — `pan` reads `{event:"dx/dy"}`, `selectMarker` reads
`{event:"hitId"}`; the payloads must be defined (§4).
🟡 **R4 (hot-effect coalescing):** `persist`-on-`pan` would fire every drag frame;
needs a declarative `debounceMs` (broker rate-limiting catches egress, but
debounce is the clean authoring form).

---

## Findings — what the full test changed

| # | Finding | Sev | Status |
|---|---|---|---|
| **G1** | No author-defined function abstraction — `collides`/`menuRow` needed from many sites; `let` binds values, transitions can't call transitions. Forced inlining = bloat + LLM-reliability risk + patch-divergence. | 🔴 high | **fixed** — `defs` + `{apply}`, non-recursive (DAG), pure-in-params, §2.8 |
| **G2** | A **pure transition cannot invoke a capability** — §6 defined the wire event + policy but never the authoring trigger. Blocks every write-back / fetch / generateAsset. | 🔴 high | **fixed** — **effect bindings** (`effects: [{on,call,args,onResult,onError}]`), §6.4 |
| **G3** | `StateLeaf` referenced (list/grid `of`) but never defined; `list<list>` boards and nested `const` tables depend on it. | 🟡 | **fixed** — §1.1 defines `StateLeaf` incl. nested `list`/`record` |
| **G4** | Transition **return semantics** unstated — full state vs delta-merge; how to express "no change". | 🟡 | **fixed** — §2 states delta-merge; `{set:{}}` = no-op |
| **G5** | Multi-field `{set:{a,b,…}}` used everywhere; §2.2 showed only single-key. | 🟡 | **fixed** — §2.2 allows a path→expr map |
| **G6** | `at`-then-field composition (`cart[i].qty`) undefined; bind-the-row works but is verbose. | 🟢 | noted; bind-row idiom documented, optional `at.path` later |
| **R1** | **Pointer-event payload schema undefined** — §4 declares event *types* but not the *fields* each carries (`tap`→hit node id + coords, `drag`/`drop`→source + drop-target + delta, `pinch`→scale/focus). `{event:field}` had no defined fields. Surfaced by every interactive Lumen (kanban drop, map pan/tap). | 🔴 high | **fixed** — §4.1 per-event payload schema |
| **R2** | **`loadData` projection read shape** — a `dataRef`/loadData state leaf is a "handle"; how LX reads it as a value, and its declared shape, were unstated. Every data-driven Lumen needs it. | 🟡 | **fixed** — §1.1 `dataRef` carries a `projection` schema; `{state:field}` yields the read-only value (empty until resolved); §6 |
| **R3** | **No dynamic map/dict access** — a `record` has only static-path read, so `override[id]`/`menu[sku]` lookups are O(n) `fold`-finds. | 🟡 | **fixed** — `lookup` std-lib (assoc-find over a list-of-pairs by key) §2.3; idiom documented |
| **R4** | **Hot-effect coalescing** — `persist`-on-`pan` fires every drag frame; broker rate-limiting catches egress but a declarative debounce is the clean authoring form. | 🟢 | **fixed** — optional `debounceMs`/`coalesceKey` on `EffectBinding` §6.4 |

**What held (rev 3.x validated by the complete trace):** the `map`/`filter`/`fold`
binder nodes + `{var}` (every transition), `at`/`setAt` over `list<list>` (lock,
cart, defrag move), `const` table (shapes/columns), `idx` + `flatten` (render),
native `aggregate` kernel (total), `colorMode` `theme`/`brand`/`free` (arcade /
kiosk / defrag), `defs` + `{apply}` and `effects` from rev 3.3 (every later
Lumen leans on them), `view`→**primitives** (kanban) as well as `scene` (map,
defrag), invariants, §6.3 local-first + optimistic overlay. **Gas was never the
constraint** across all five.

**Verdict.** All five reference Lumens are expressible. The two compute/capability
axes (rev 3.3: `defs`, `effects`) were the deep gaps; the workflow/defrag/map pass
added only **interaction-surface** specifics — event payloads (R1), the data-read
shape (R2), a dict-lookup helper (R3), effect debounce (R4) — none touching the
core model. This is the expected **convergence**: each pass finds shallower things
(structural → naming → abstraction → payload/IO detail). The standing risk is
unchanged and unprovable on paper: **can an LLM emit valid LX reliably** — to be
measured on a built L1 interpreter, with `defs`/invariants/golden-trace as the
net. An independent adversarial pass (Codex, as for rev 2) is the recommended
next check before implementation budget.

## Addendum — the independent Codex pass (rev 3.5)

That recommended pass was run ([`reviews/codex-rev3.4.md`](reviews/codex-rev3.4.md))
and it earned its keep: where this trace tested **expressibility**, Codex tested
**soundness** and found a real layer the internal passes missed — totality (÷0,
overflow, `NaN`), the static-bound hole (`range`/`pad` on un-`max`'d numerics —
this doc's `score` among them, now fixed), determinism (record-key order, effect
replay ordering, `const`-in-replay), plus self-contradictions (`defs` reading
`state`; effect `args` reading `{event}`; `menu` missing its `projection`;
`dataRef` overloaded with asset handles) and two security findings (free-colour
chrome spoofing; the taint claim). All are addressed in **rev 3.5** of
`lumens-spec.md` (§2.9 totality/bounds/determinism, §6.4 effect determinism,
§13.5 replay, §1.1 `assetRef` split, §3.1 anti-spoofing, §6 taint walk). The
examples in this doc are updated to the rev-3.5 grammar. The standing risk is
unchanged: **LLM emit-valid-LX reliability**, measurable only on a built L1
interpreter.
