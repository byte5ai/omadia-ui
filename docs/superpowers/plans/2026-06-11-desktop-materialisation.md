# Plan: Desktop-Materialisierung auf LVL2 (2026-06-11)

Desktops (benannte, eingefärbte Tiling-Layouts, Client e214c7a) existieren
bisher nur clientseitig (localStorage). Ziel: **pro eingeloggtem User auf
LVL2 persistieren und beim App-Start syncen** — wie die Canvas-Registry, damit
Desktops auf jeder Installation identisch erscheinen.

## P1 — Wire + Registry (ui-channel, additive v1.1)

- Neues Message-Paar, symmetrisch zur Canvas-Registry:
  `desktop_list_get` / `desktop_list_put` (client→server) ↔ `desktop_list`
  (server→client) auf dem authentifizierten Canvas-WS.
- Entry-Shape: `{ desktopId, name, color, updatedAt, layout }` + top-level
  `activeDesktopId`. **`layout` referenziert `canvasSessionId`s, NICHT
  slotIds** — slotIds sind client-lokal und tragen nicht über Installs.
- Persistenz im Plugin-Memory-Store (`desktops/<subject>.json`), gleicher
  volatiler Fallback wie die Canvas-Registry.
- Server-Sanitize: max 24 Desktops, Name ≤ 48, color 0–5, Layout strukturell
  validiert (kind/dir/ratio/sessionId-Strings), Gesamtgröße gecappt.

## P2 — Client-Sync

- Bei jedem `ready`: `desktop_list_get`; Push debounced NACH dem ersten Merge
  (Tombstone-Schutz wie `deletedSessions`).
- **Mapping beim Put:** Layout-Leaves slotId → sessionId übersetzen (Slots
  ohne sessionId — frische Chooser-Panes — als Leaf prunen oder den Put bis
  zur Session-Ack verzögern).
- **Mapping beim Merge:** sessionId → vorhandener Slot; unbekannte Session →
  Slot anlegen (die Canvas-Registry materialisiert Titel/Tree dazu); Session
  weder lokal noch in der Canvas-Registry → Leaf prunen (Split kollabiert).
- Konfliktstrategie: last-write-wins per `updatedAt` pro Desktop (Desktops
  sind rein nutzergepflegt — kein Auto-Titel-Vorrang nötig).

## P3 — Lifecycle-Lücken schließen

- **Desktop-Delete** fehlt noch im Client (Sidebar ×, Two-Step-Confirm wie
  Canvases; letzter Desktop nicht löschbar). Delete → Tombstone-Set +
  sofortiger Put (Carrier-Muster aus deleteCanvas).
- Reihenfolge bei Canvas-Delete: erst `canvas_list_put` (Tombstones), dann
  `desktop_list_put` (geprunte Layouts) über denselben Carrier-Socket.

## P4 — Verifikation

- Zwei-Install-Test (oder zweites userData-Verzeichnis): Desktop auf A
  anlegen/umbenennen/einfärben/splitten → B zeigt nach Start denselben
  Desktop inkl. Ratios; Canvas-Delete auf A kollabiert die Pane auf B.
- Channel-Tests: get/put-Roundtrip, Sanitize-Grenzen, Subject-Scoping,
  Tombstone-Verhalten. Client-Tests: slotId↔sessionId-Mapping, Merge-LWW.

**Aufwand:** Server klein (Message-Paar + Store analog `canvas_list`),
Client mittel — der sessionId↔slotId-Übersetzer ist das eigentliche Stück
Arbeit. Kein Protokoll-Bruch (additiv); alte Clients ignorieren die Messages.
