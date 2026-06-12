# Plan: Kontext-Turn-Latenz + Choice-Polish (2026-06-10)

Beobachtungen aus dem Live-Test (User):
1. Nach Klick auf eine Kontext-Aktion ist der Delay bis zum nächsten Turn zu hoch.
2. Der Kontext kommt nicht sauber an (Agent fragt „kein konkreter Kurs ausgewählt")
   und das Multi-Choice-Element ist nicht Lume-like (Beams/Abstände).

## Befund (verifiziert)

- `orchestratorDispatcher.ts:108` (omadia): `input.target` wird NUR in
  `ChatTurnInput.action.target` gethreadet, wenn `metadata.action` existiert.
  Suggested-Action-Klicks senden **Text-Turns** mit `target` → das Target wird
  am Dispatcher verworfen → der Agent kennt die angeklickte Zeile nicht →
  Disambiguierungs-Choice (Bild 5) → **ein kompletter Extra-Turn = der Delay**.
- `plugin.ts` (ui-orchestrator): `composeSkeleton` (gemessen 1.9–3.2 s) läuft
  strikt VOR dem Main-Turn — sequenziell, obwohl unabhängig.
- Choice-CSS: Frage-Label klebt am Rand, Optionen volle Breite, native
  Radio-Dots, kein checked/pending-Feedback.

## P1 — Row-Kontext durchreichen (größter Hebel, kleinster Eingriff)

- **1a Client (quick win):** Agent-Action-Klick hängt kompakten Zeilenkontext
  an den Prompt-Text (`… (courseName: …, rowKey …)`) — exakt wie es das
  generische `showRowDetails` schon tut. `App.tsx`, ~5 Zeilen.
- **1b Server (sauber):** `ChatTurnInput.target?: unknown` als typisiertes
  Feld; Dispatcher threadet `input.target` IMMER (nicht nur mit action);
  ui-orchestrator hängt `[canvas-target]`-Block (TargetRef-JSON) an den
  Main-Turn mit Instruktion „das ist der referenzierte Datensatz — nicht
  nachfragen". Tests: orchestratorDispatcher + uiOrchestratorPlugin;
  danach `npm run build -w @omadia/channel-sdk` (dist-Typen!).
- **Effekt:** Kontext-Klick → direkt der richtige Detail-Turn, keine
  Rückfrage. Spart ~15–25 s (einen ganzen Turn).

## P2 — Skeleton parallel zum Main-Turn

- **2a:** `composeSkeleton` und `base.chatStream` parallel starten; Events des
  Main-Turns puffern, bis der Skeleton-Snapshot emittiert ist (surfaceSeq-
  Ordnung bleibt korrekt). `plugin.ts` + Ordering-Test. ~3 s vom kritischen
  Pfad.
- **2b Client:** Sofort-Feedback nach Kontext-Klick — lokales Pending-Skeleton
  (Analogie `LOCAL_PENDING_TREE` beim Cold Start) statt eingefrorener alter
  Ansicht, Beam-Pin pulsiert weiter.
- **2c (später):** deterministische Skeleton-Templates für bekannte Idiome
  (Detail-Pane aus letzten dataRequirements) ganz ohne Haiku-Call.

## P3 — Choice-Element Lume-like

- **3a:** Frage-Label als eigene Zeile (structural font, text-secondary,
  margin-bottom 8 px) — nicht mehr randbündig gequetscht.
- **3b:** Optionen: max-width ~720 px, radius-md, padding 10–12/16 px, gap 8 px;
  nativen Radio-Input verstecken → custom Accent-Dot; checked: Accent-Border +
  `--lume-accent-subtle`-Fill + dezenter Glow (§3.2-Rezept); Hover wie
  Secondary-Button; §8-Focus-Ring bleibt.
- **3c:** Nach Auswahl Optionen disablen + gewählte Option mit Beam-Puls
  (Analogie `lume-row-beamed`) bis der Turn resolved — verhindert Doppelklicks
  und gibt das fehlende „es passiert was"-Feedback.
- **3d Server:** `composeChoicePatch` hängt das Choice in einen eigenen
  `container` (mit Padding/Hierarchie) statt nackt an die Root.

## P4 — Verifikation & Deploy

- E2E: Kursliste → „Teilnehmerliste anzeigen" → Detail OHNE Rückfrage;
  Composer-Timing-Logs gegenprüfen; Choice-Restyle über alle Paletten (⌥⌘P).
- Deploy: PR #277 push → `docker compose -p omadia-test build middleware &&
  up -d middleware` (Boot-Log: beide Producer-Tools) → `npm run dist` → App
  neu starten.

**Reihenfolge:** P1a+1b → P3 → P2a+2b → P4. P2c nur bei Bedarf danach.
