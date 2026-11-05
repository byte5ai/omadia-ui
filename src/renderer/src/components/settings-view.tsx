import type { ReactElement } from "react";

import type { ColorMode, LightTemperature } from "../../../shared/ipc";
import { useStore } from "../lib/create-store";
import { canvasStore } from "../state/canvases";
import { saveSettings, sessionStore, temperatureLabel } from "../state/session";
import {
  activeDesktop,
  closeOverlay,
  workspaceStore,
} from "../state/workspace";
import { Icon } from "./icons";
import { hostOf } from "./sidebar";

interface Props {
  onSwitchServer(): void;
  onSignOut(): void;
}

const TEMPS: LightTemperature[] = [2700, 4500, 6500];
const TEMP_COLOR: Record<LightTemperature, string> = {
  2700: "#FFE3C2",
  4500: "var(--ink)",
  6500: "#E3ECFF",
};
const MODES: Array<[ColorMode, string]> = [
  ["night", "Nacht"],
  ["day", "Tag"],
  ["system", "Wie das System"],
];

/** Light temperature replaces the palette picker: it only tints the light. */
export function SettingsView({
  onSwitchServer,
  onSignOut,
}: Props): ReactElement {
  const session = useStore(sessionStore, (s) => s);
  const settings = session.settings;
  return (
    <div className="overlay-scrim" onMouseDown={closeOverlay}>
      <section
        className="settings panel"
        role="dialog"
        aria-label="Einstellungen"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="settings-head">
          <h2 className="t-title">Einstellungen</h2>
          <span className="grow" />
          <button
            type="button"
            className="icon-btn"
            aria-label="Schließen"
            onClick={closeOverlay}
          >
            <Icon name="close" />
          </button>
        </header>

        <div className="settings-group">
          <p className="t-label">Raum</p>
          <div role="radiogroup" aria-label="Modus" className="segmented">
            {MODES.map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                role="radio"
                aria-checked={settings?.mode === mode}
                aria-selected={settings?.mode === mode}
                onClick={() => void saveSettings({ mode })}
              >
                {label}
              </button>
            ))}
          </div>
          {window.omadia.platform === "darwin" ? (
            <label className="choice-row">
              <button
                type="button"
                role="switch"
                className="switch"
                aria-checked={settings?.translucent ?? true}
                onClick={() =>
                  void saveSettings({
                    translucent: !(settings?.translucent ?? true),
                  })
                }
              />
              Durchscheinendes Fenster
            </label>
          ) : null}
        </div>

        <div className="settings-group">
          <p className="t-label">Lichttemperatur</p>
          <div className="temps" role="radiogroup" aria-label="Lichttemperatur">
            {TEMPS.map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={settings?.temperature === t}
                className={`temp${settings?.temperature === t ? " on" : ""}`}
                onClick={() => void saveSettings({ temperature: t })}
              >
                <span
                  className="temp-cone"
                  style={{ ["--cone" as string]: TEMP_COLOR[t] }}
                />
                <span className="temp-label">
                  <span>{temperatureLabel[t]}</span>
                  <span className="num">{t} K</span>
                </span>
              </button>
            ))}
          </div>
          <p className="t-small">
            Färbt nur das Licht: Kegel, Auswahl, Fokus. Text und Status bleiben
            gleich.
          </p>
        </div>

        <div className="settings-group">
          <p className="t-label">Server</p>
          <div className="settings-server">
            <span className="grow">
              <span className="server-host">
                {session.server ? hostOf(session.server.wsUrl) : "Kein Server"}
              </span>
              {session.email ? (
                <span className="t-small"> · {session.email}</span>
              ) : null}
            </span>
            <button type="button" className="btn sm" onClick={onSwitchServer}>
              Server wechseln
            </button>
            <button type="button" className="btn ghost sm" onClick={onSignOut}>
              <Icon name="logout" />
              Abmelden
            </button>
          </div>
        </div>

        <div className="settings-group">
          <label className="choice-row">
            <button
              type="button"
              role="switch"
              className="switch"
              aria-checked={settings?.devTurnLog ?? false}
              onClick={() =>
                void saveSettings({
                  devTurnLog: !(settings?.devTurnLog ?? false),
                })
              }
            />
            Entwicklungsmodus, Turn-Log anzeigen
          </label>
        </div>
      </section>
    </div>
  );
}

/** DEV: what crossed the wire for the focused canvas. */
export function TurnLog(): ReactElement | null {
  const desktop = useStore(workspaceStore, (s) => activeDesktop(s));
  const log = useStore(canvasStore, (s) =>
    desktop?.focused ? s.runtime[desktop.focused]?.log : undefined,
  );
  return (
    <aside className="turn-log panel" aria-label="Turn-Log">
      <header>
        <span className="kbd">DEV</span>
        <span className="t-small">Turn-Log</span>
      </header>
      <ol className="mono">
        {(log ?? []).slice(-14).map((e, i) => (
          <li key={i}>
            <span className="meta">
              {new Date(e.at).toLocaleTimeString("de-DE")}
            </span>{" "}
            <span className="tier">{e.tier}</span> {e.text}
          </li>
        ))}
      </ol>
    </aside>
  );
}
