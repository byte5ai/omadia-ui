import { type ReactElement, useEffect, useMemo, useRef, useState } from "react";

import { useStore } from "../lib/create-store";
import {
  galleryTree,
  revenueTree,
  utilisationProse,
  utilisationTree,
} from "../lib/dev-fixtures";
import {
  canvasStore,
  createCanvas,
  openLocalTree,
  refresh,
  sendPrompt,
} from "../state/canvases";
import { simulateBuild } from "../state/dev-build";
import { forgeStyleStore, toggleForgeStyle } from "../state/forge-style";
import { saveSettings, sessionStore } from "../state/session";
import {
  activeDesktop,
  closeOverlay,
  createDesktop,
  openOverlay,
  showCanvas,
  splitPane,
  workspaceStore,
} from "../state/workspace";
import { Icon, type IconName } from "./icons";
import { OmadiaMark } from "./logo";

interface Entry {
  id: string;
  group: "Aktion" | "Canvas" | "Befehl";
  label: string;
  hint?: string;
  icon?: IconName;
  mark?: boolean;
  run(): void;
}

/** ⌘K: every path starts here. The dot sits at the start of the field. */
export function CommandPalette({
  closing,
}: {
  closing: boolean;
}): ReactElement {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const metas = useStore(canvasStore, (s) => s.metas);
  const order = useStore(canvasStore, (s) => s.order);
  const runtime = useStore(canvasStore, (s) => s.runtime);
  const settings = useStore(sessionStore, (s) => s.settings);
  const desktop = useStore(workspaceStore, (s) => activeDesktop(s));
  const focused = desktop?.focused;
  const focusedEmpty = focused ? runtime[focused]?.canvas.tree == null : true;

  useEffect(() => inputRef.current?.focus(), []);

  const forgeStyle = useStore(forgeStyleStore, (s) => s);
  const entries = useMemo<Entry[]>(() => {
    const q = query.trim();
    const out: Entry[] = [];
    const ask = (target: "here" | "new"): void => {
      closeOverlay();
      let slot = focused;
      if (target === "new" || !slot) {
        slot = createCanvas();
        showCanvas(slot);
      }
      void sendPrompt(slot, q);
    };
    if (q) {
      if (focused && !focusedEmpty) {
        out.push({
          id: "ask-here",
          group: "Aktion",
          label: q,
          hint: `in ${metas[focused]?.title ?? "diesem Canvas"}`,
          mark: true,
          run: () => ask("here"),
        });
        out.push({
          id: "ask-new",
          group: "Aktion",
          label: q,
          hint: "als neuer Canvas",
          mark: true,
          run: () => ask("new"),
        });
      } else {
        out.push({
          id: "ask-here",
          group: "Aktion",
          label: q,
          hint: "Frag omadia",
          mark: true,
          run: () => ask("here"),
        });
      }
    }
    const lower = q.toLowerCase();
    for (const k of order) {
      const title = metas[k]?.title ?? "";
      if (lower && !title.toLowerCase().includes(lower)) continue;
      out.push({
        id: `canvas-${k}`,
        group: "Canvas",
        label: title,
        run: () => {
          closeOverlay();
          showCanvas(k);
        },
      });
      if (out.filter((e) => e.group === "Canvas").length >= 5) break;
    }
    const commands: Entry[] = [
      {
        id: "new-canvas",
        group: "Befehl",
        label: "Neuer Canvas",
        icon: "plus",
        hint: "⌘N",
        run: () => {
          closeOverlay();
          showCanvas(createCanvas());
        },
      },
      {
        id: "split",
        group: "Befehl",
        label: "Spalte teilen",
        icon: "splitColumns",
        hint: "⌘D",
        run: () => {
          closeOverlay();
          if (focused) splitPane(focused, "columns", createCanvas());
        },
      },
      {
        id: "new-desktop",
        group: "Befehl",
        label: "Neuer Desktop",
        icon: "desktop",
        run: () => {
          closeOverlay();
          createDesktop(undefined, createCanvas());
        },
      },
      {
        id: "library",
        group: "Befehl",
        label: "Bibliothek öffnen",
        icon: "library",
        hint: "⌘L",
        run: () => openOverlay({ kind: "library" }),
      },
      {
        id: "refresh",
        group: "Befehl",
        label: "Canvas aktualisieren",
        icon: "refresh",
        hint: "⌘R",
        run: () => {
          closeOverlay();
          if (focused) void refresh(focused);
        },
      },
      {
        id: "night",
        group: "Befehl",
        label: "Nacht",
        icon: "moon",
        run: () => {
          closeOverlay();
          void saveSettings({ mode: "night" });
        },
      },
      {
        id: "day",
        group: "Befehl",
        label: "Tag",
        icon: "sun",
        run: () => {
          closeOverlay();
          void saveSettings({ mode: "day" });
        },
      },
      {
        id: "temp",
        group: "Befehl",
        label: `Lichttemperatur (${settings?.temperature ?? 4500} K)`,
        icon: "sun",
        run: () => openOverlay({ kind: "settings" }),
      },
      {
        id: "forge-style",
        group: "Befehl",
        label:
          forgeStyle === "focus"
            ? "Aufbau-Animation: Werkbank statt Fokus"
            : "Aufbau-Animation: Fokus statt Werkbank",
        icon: "wand",
        run: () => {
          closeOverlay();
          toggleForgeStyle();
        },
      },
    ];
    if (settings?.devTurnLog) {
      const openLocal = (
        title: string,
        tree: unknown,
        prose?: string,
        prompt?: string,
      ): void => {
        closeOverlay();
        const slot = openLocalTree(title, tree, prose, prompt);
        if (slot) showCanvas(slot);
      };
      commands.push(
        {
          id: "dev-gallery",
          group: "Befehl",
          label: "DEV: Primitive-Galerie",
          icon: "bolt",
          run: () => openLocal("Primitive-Galerie", galleryTree),
        },
        {
          id: "dev-revenue",
          group: "Befehl",
          label: "DEV: Jahresumsatz aus Odoo (Vorschau)",
          icon: "bolt",
          run: () =>
            openLocal(
              "Jahresumsatz 2021 bis 2026",
              revenueTree,
              "",
              "Wie sehen unsere jährlichen Umsatzzahlen aus?",
            ),
        },
        {
          id: "dev-forge",
          group: "Befehl",
          label: "DEV: Aufbau simulieren",
          icon: "bolt",
          run: () => {
            closeOverlay();
            showCanvas(
              simulateBuild(
                "Team-Auslastung, KW 41",
                "Zeig offene Jira-Tickets nach Owner, daneben das Restbudget aus dem ERP, und markier alle unter 8 Stunden.",
                utilisationTree,
              ),
            );
          },
        },
        {
          id: "dev-utilisation",
          group: "Befehl",
          label: "DEV: Team-Auslastung (Demo)",
          icon: "bolt",
          run: () =>
            openLocal(
              "Team-Auslastung, KW 41",
              utilisationTree,
              utilisationProse,
              "Zeig offene Jira-Tickets nach Owner, daneben das Restbudget aus dem ERP, und markier alle unter 8 Stunden.",
            ),
        },
      );
    }
    out.push(
      ...commands.filter(
        (c) => !lower || c.label.toLowerCase().includes(lower),
      ),
    );
    return out;
  }, [
    query,
    order,
    metas,
    focused,
    focusedEmpty,
    settings?.temperature,
    forgeStyle,
  ]);

  useEffect(() => setIndex(0), [query]);
  const current = entries[Math.min(index, entries.length - 1)];

  return (
    <div
      className={`overlay-scrim${closing ? " closing" : ""}`}
      inert={closing}
      onMouseDown={closeOverlay}
    >
      <div
        className="palette panel"
        role="dialog"
        aria-label="Befehl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="palette-input">
          <span className="palette-beam" aria-hidden="true">
            <span className="beam" />
            <span
              className="dot-anchor-inline"
              data-dot-anchor="command"
              data-dot-size={6}
            />
          </span>
          <label htmlFor="palette-q" className="sr-only">
            Frag omadia
          </label>
          <input
            id="palette-q"
            ref={inputRef}
            value={query}
            placeholder="Beschreib die Ansicht"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setIndex((i) => Math.min(entries.length - 1, i + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setIndex((i) => Math.max(0, i - 1));
              } else if (e.key === "Enter") {
                e.preventDefault();
                current?.run();
              } else if (e.key === "Escape") {
                closeOverlay();
              }
            }}
          />
          <span className="kbd">⌘K</span>
        </div>
        <div className="palette-list" role="listbox" aria-label="Ergebnisse">
          {entries.map((e, i) => {
            const showGroup = i === 0 || entries[i - 1]?.group !== e.group;
            return (
              <div key={e.id}>
                {showGroup ? <p className="menu-heading">{e.group}</p> : null}
                <button
                  type="button"
                  role="option"
                  aria-selected={e === current}
                  className={`menu-item${e === current ? " active" : ""}`}
                  onMouseEnter={() => setIndex(i)}
                  onClick={() => e.run()}
                >
                  {e.mark ? (
                    <OmadiaMark size={14} />
                  ) : e.icon ? (
                    <Icon name={e.icon} />
                  ) : (
                    <span style={{ width: 16 }} />
                  )}
                  <span className="grow">{e.label}</span>
                  {e.hint ? <span className="t-small">{e.hint}</span> : null}
                  {e === current ? <span className="kbd">↵</span> : null}
                </button>
              </div>
            );
          })}
        </div>
        <footer className="palette-foot">
          <span>
            <span className="kbd">↵</span> ausführen
          </span>
          <span>
            <span className="kbd">esc</span> schließen
          </span>
        </footer>
      </div>
    </div>
  );
}
