import { type ReactElement, useEffect, useState } from "react";

import type {
  AuthDiscovery,
  FoundServer,
  PairingDescriptor,
} from "../../../shared/ipc";
import { Icon } from "../components/icons";
import { LightCone } from "../components/light-cone";
import { Logo } from "../components/logo";

interface ConnectProps {
  initial?: string;
  error?: string;
  onPaired(descriptor: PairingDescriptor, input: string): void;
  onCancel?: () => void;
}

/** Arrive: type an address or pick a server omadia found in your network. */
export function ConnectScreen({
  initial = "",
  error: initialError,
  onPaired,
  onCancel,
}: ConnectProps): ReactElement {
  const [address, setAddress] = useState(initial);
  const [found, setFound] = useState<FoundServer[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialError);

  useEffect(() => {
    const off = window.omadia.onPairingFound((s) =>
      setFound((list) =>
        list.some((x) => x.address === s.address && x.port === s.port)
          ? list
          : [...list, s],
      ),
    );
    void window.omadia.pairingScanStart();
    return () => {
      off();
      void window.omadia.pairingScanStop();
    };
  }, []);

  const pair = async (input: string): Promise<void> => {
    if (!input.trim()) return;
    setBusy(true);
    setError(undefined);
    const descriptor = await window.omadia
      .pairingDiscover(input)
      .then((d) => d)
      .catch(() => null);
    setBusy(false);
    if (!descriptor) {
      setError("Unter dieser Adresse antwortet kein omadia.");
      return;
    }
    onPaired(descriptor, input);
  };

  return (
    <Arrival>
      <form
        className="arrive-card panel"
        onSubmit={(e) => {
          e.preventDefault();
          void pair(address);
        }}
      >
        <Logo size={26} withDot wordmark={false} />
        <h1 className="arrive-title">Mit omadia verbinden</h1>
        <div className="field">
          <label htmlFor="server-address">Server-Adresse</label>
          <input
            id="server-address"
            className={`input${error ? " invalid" : ""}`}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="https://omadia.firma.de"
            autoFocus
            spellCheck={false}
          />
          {error ? <p className="field-error">{error}</p> : null}
        </div>
        {found.length ? (
          <>
            <p className="t-label">
              Oder wähle einen Server aus deinem Netzwerk
            </p>
            <div className="found-list">
              {found.map((s) => (
                <button
                  key={`${s.address}:${s.port}`}
                  type="button"
                  className="found"
                  onClick={() => void pair(`${s.address}:${s.port}`)}
                >
                  <Icon name="server" />
                  <span className="grow">{s.name}</span>
                  <span className="t-small">im Netzwerk gefunden</span>
                </button>
              ))}
            </div>
          </>
        ) : null}
        <div className="arrive-actions">
          {onCancel ? (
            <button type="button" className="btn ghost" onClick={onCancel}>
              Abbrechen
            </button>
          ) : null}
          <button
            type="submit"
            className="btn primary"
            disabled={busy || !address.trim()}
          >
            {busy ? "Suche omadia …" : "Verbinden"}
          </button>
        </div>
      </form>
    </Arrival>
  );
}

interface SignInProps {
  host: string;
  wsUrl: string;
  discovery: AuthDiscovery | null;
  onSignedIn(email?: string): void;
  onBack(): void;
}

export function SignInScreen({
  host,
  wsUrl,
  discovery,
  onSignedIn,
  onBack,
}: SignInProps): ReactElement {
  const password = discovery?.providers.find((p) => p.kind === "password");
  const oidc = discovery?.providers.filter((p) => p.kind === "oidc") ?? [];
  const [email, setEmail] = useState("");
  const [secret, setSecret] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState(false);

  const loginPassword = async (): Promise<void> => {
    if (!password) return;
    setBusy(true);
    setError(undefined);
    const result = await window.omadia
      .authLogin(wsUrl, password.id, email, secret)
      .then((r) => r)
      .catch(() => ({ ok: false as const, error: "unreachable" as const }));
    setBusy(false);
    if (result.ok) {
      onSignedIn(result.email);
      return;
    }
    setError(
      result.error === "invalid_credentials"
        ? "E-Mail oder Passwort stimmen nicht."
        : result.error === "unknown_provider"
          ? "Diese Anmeldung kennt der Server nicht."
          : "Der Server antwortet gerade nicht.",
    );
  };

  const loginBrowser = async (providerId?: string): Promise<void> => {
    setWaiting(true);
    const result = await window.omadia
      .authLoginBrowser(wsUrl, providerId)
      .then((r) => r)
      .catch(() => ({ ok: false as const, error: "cancelled" as const }));
    setWaiting(false);
    if (result.ok) onSignedIn();
  };

  if (waiting) {
    return (
      <Arrival>
        <div className="arrive-card panel">
          <h1 className="arrive-title">Anmeldung</h1>
          <p className="waiting">
            <span
              className="dot-anchor-inline"
              data-dot-anchor="signin"
              data-dot-size={6}
            />
            Warte auf deine Anmeldung im Browser
          </p>
          <p className="arrive-text">
            Das Anmeldefenster ist offen. Hier geht es automatisch weiter.
          </p>
          <div className="arrive-actions start">
            <button
              type="button"
              className="btn ghost sm"
              onClick={() => void window.omadia.authCancelBrowser()}
            >
              Abbrechen
            </button>
          </div>
        </div>
      </Arrival>
    );
  }

  return (
    <Arrival>
      <form
        className="arrive-card panel"
        onSubmit={(e) => {
          e.preventDefault();
          void loginPassword();
        }}
      >
        <Logo size={26} withDot wordmark={false} />
        <h1 className="arrive-title">Bei {host} anmelden</h1>
        {password ? (
          <>
            <div className="field">
              <label htmlFor="login-email">E-Mail</label>
              <input
                id="login-email"
                className="input"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoFocus
              />
            </div>
            <div className="field">
              <label htmlFor="login-password">Passwort</label>
              <input
                id="login-password"
                className={`input${error ? " invalid" : ""}`}
                type="password"
                autoComplete="current-password"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
              />
              {error ? <p className="field-error">{error}</p> : null}
            </div>
          </>
        ) : null}
        {discovery?.setupRequired ? (
          <p className="status warning">
            Dieser Server ist noch nicht eingerichtet. Lege den ersten Admin in
            der Admin-Oberfläche an.
          </p>
        ) : null}
        <div className="arrive-actions">
          <button type="button" className="btn ghost" onClick={onBack}>
            Server wechseln
          </button>
          <span className="grow" />
          {oidc.map((p) => (
            <button
              key={p.id}
              type="button"
              className="btn"
              onClick={() => void loginBrowser(p.id)}
            >
              {p.displayName}
            </button>
          ))}
          {!password && oidc.length === 0 ? (
            <button
              type="button"
              className="btn primary"
              onClick={() => void loginBrowser()}
            >
              Im Browser anmelden
            </button>
          ) : null}
          {password ? (
            <button
              type="submit"
              className="btn primary"
              disabled={busy || !email || !secret}
            >
              {busy ? "Anmelden …" : "Anmelden"}
            </button>
          ) : null}
        </div>
      </form>
    </Arrival>
  );
}

interface UnreachableProps {
  host: string;
  since?: number;
  onRetry(): void;
  onSwitch(): void;
}

export function UnreachableScreen({
  host,
  since,
  onRetry,
  onSwitch,
}: UnreachableProps): ReactElement {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);
  const minutes = since
    ? Math.max(1, Math.round((Date.now() - since) / 60_000))
    : 0;
  return (
    <Arrival>
      <div className="arrive-card panel" role="alert">
        <h1 className="arrive-title">Server nicht erreichbar</h1>
        <p className="arrive-text">
          {host} antwortet{" "}
          {minutes ? `seit ${minutes} Minute${minutes === 1 ? "" : "n"} ` : ""}
          nicht. Deine Canvases sind lokal gespeichert.
        </p>
        <div className="arrive-actions start">
          <button type="button" className="btn primary" onClick={onRetry}>
            Erneut versuchen
          </button>
          <button type="button" className="btn ghost" onClick={onSwitch}>
            Server wechseln
          </button>
        </div>
      </div>
    </Arrival>
  );
}

function Arrival({ children }: { children: React.ReactNode }): ReactElement {
  return (
    <div className="arrival">
      <div className="drag-region" />
      <LightCone />
      <div className="arrival-inner">{children}</div>
    </div>
  );
}
