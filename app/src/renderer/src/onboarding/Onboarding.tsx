import { useEffect, useState } from 'react';
import type {
  AppSettings,
  AuthDiscovery,
  ConnectOptions,
  ConnectionStatus,
  DiscoveredHost,
} from '../../../shared/ipc.js';

const WS_PATTERN = /^wss?:\/\/\S+$/;
const HTTP_PATTERN = /^https?:\/\/\S+$/;
const CANVAS_SUFFIX = '/omadia-ui/canvas';

/** A full canvas transport URL the user pasted directly (manual fallback) —
 *  anything else is treated as a human address to run discovery against. */
const isCanvasUrl = (v: string): boolean =>
  WS_PATTERN.test(v) && v.replace(/\/+$/, '').endsWith(CANVAS_SUFFIX);

export interface OnboardingProps {
  defaults: AppSettings;
  /** live connection status — the card closes only on the first 'ready' */
  status: ConnectionStatus;
  /** a submitted connect attempt is in flight */
  busy: boolean;
  /** settings already persisted → user may back out without changes */
  canCancel: boolean;
  onSubmit: (settings: AppSettings) => void;
  onCancel: () => void;
}

const LOGIN_ERRORS: Record<string, string> = {
  invalid_credentials: 'Email or password is incorrect.',
  unknown_provider: 'This sign-in method is not available on the server.',
  unreachable: 'The server could not be reached.',
  cancelled: 'Sign-in was cancelled.',
};

/** server setup — stays open until the first successful connect; field-level
 *  errors per visual-spec §7.4, button-in-flight per §7.3 (verb + dots).
 *  With auth enabled the card grows a native sign-in step (issue #7): a
 *  vaulted session skips it entirely, password providers get a Lume-styled
 *  credential pane, OIDC/legacy kernels fall back to the web window. */
export function Onboarding({ defaults, status, busy, canCancel, onSubmit, onCancel }: OnboardingProps) {
  const [url, setUrl] = useState(defaults.serverUrl);
  const [useAuth, setUseAuth] = useState(defaults.useAuth);
  const [loginUrl, setLoginUrl] = useState(defaults.loginUrl ?? '');
  const [error, setError] = useState('');
  // native sign-in step (issue #7)
  const [step, setStep] = useState<'server' | 'signin'>('server');
  const [discovery, setDiscovery] = useState<AuthDiscovery | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  // friction-free pairing (#293): resolving a human address → canvas wsUrl
  const [discovering, setDiscovering] = useState(false);
  // LAN mDNS picker (Scenario A) — hosts found on the network
  const [lanHosts, setLanHosts] = useState<DiscoveredHost[]>([]);

  const connecting = busy && status.state !== 'failed';
  const failed = busy && status.state === 'failed';

  // Browse `_omadia._tcp` while the server step is open; tear the responder
  // down once we leave it / start connecting (one-shot per visit).
  useEffect(() => {
    if (step !== 'server' || connecting) return;
    const stop = window.omadiaCanvas.pairingScan(setLanHosts);
    return stop;
  }, [step, connecting]);

  /** Validate an already-resolved canvas URL into settings. `serverUrl` is the
   *  resolved `ws(s)://…/omadia-ui/canvas` (discovery output or manual paste). */
  const validateSettings = (serverUrl: string): AppSettings | null => {
    const trimmedLogin = loginUrl.trim();
    if (!WS_PATTERN.test(serverUrl)) {
      setError('Enter a server address, or a ws:// canvas URL.');
      return null;
    }
    // the canvas endpoint path is protocol-fixed — a typo here persists and
    // 404s every canvas connect while the auth API (origin-only) still works
    if (!serverUrl.replace(/\/+$/, '').endsWith(CANVAS_SUFFIX)) {
      setError(`The server URL must end with ${CANVAS_SUFFIX}.`);
      return null;
    }
    if (useAuth && trimmedLogin && !HTTP_PATTERN.test(trimmedLogin)) {
      setError('Login URL must be http:// or https://.');
      return null;
    }
    return {
      serverUrl,
      useAuth,
      ...(useAuth && trimmedLogin ? { loginUrl: trimmedLogin } : {}),
    };
  };

  /** Re-validate the current (resolved) URL — used by the sign-in step where
   *  `url` already holds the discovered canvas URL. */
  const candidate = (): AppSettings | null => validateSettings(url.trim());

  /** Resolve whatever the user typed into a canvas URL: a pasted transport URL
   *  is used verbatim, anything else (https://host, bare host, .local) goes
   *  through server-owned discovery. Returns the resolved URL, or null on a
   *  miss (error already surfaced). */
  const resolveServerUrl = async (override?: string): Promise<string | null> => {
    const typed = (override ?? url).trim();
    if (override !== undefined) setUrl(override);
    if (isCanvasUrl(typed)) return typed;
    setDiscovering(true);
    try {
      const descriptor = await window.omadiaCanvas.pairingDiscover(typed);
      if (!descriptor) {
        setError(
          'No Omadia server found at that address. Check it, or paste the full ws:// canvas URL.',
        );
        return null;
      }
      // Surface the resolved transport URL so it is what gets persisted.
      setUrl(descriptor.wsUrl);
      return descriptor.wsUrl;
    } finally {
      setDiscovering(false);
    }
  };

  const toConnectOptions = (s: AppSettings): ConnectOptions => ({
    url: s.serverUrl,
    useAuth: s.useAuth,
    ...(s.loginUrl ? { loginUrl: s.loginUrl } : {}),
  });

  /** web-window fallback — OIDC tenants and kernels without discovery */
  // For a discovered OIDC provider the login window must open the provider's
  // START endpoint (302 → IdP → callback sets the session cookie) — the bare
  // server origin is an API host with no login page ("Cannot GET /"). An
  // explicit loginUrl override (the setup field) still wins.
  const oidcStartUrl = (settings: AppSettings, providerId: string): string | undefined => {
    if (settings.loginUrl) return undefined;
    try {
      const u = new URL(settings.serverUrl);
      u.protocol = u.protocol === 'wss:' ? 'https:' : 'http:';
      return `${u.origin}/api/v1/auth/login/${encodeURIComponent(providerId)}/start`;
    } catch {
      return undefined;
    }
  };

  const browserLogin = async (settings: AppSettings, oidcProviderId?: string) => {
    const start = oidcProviderId ? oidcStartUrl(settings, oidcProviderId) : undefined;
    const res = await window.omadiaCanvas.authLoginBrowser({
      ...toConnectOptions(settings),
      ...(start ? { loginUrl: start } : {}),
    });
    if (res.ok) onSubmit(settings);
    else setAuthError(LOGIN_ERRORS[res.error ?? 'cancelled'] as string);
  };

  const submit = async (override?: string) => {
    if (connecting || authBusy || discovering) return;
    setError('');
    const serverUrl = await resolveServerUrl(override);
    if (!serverUrl) return;
    const settings = validateSettings(serverUrl);
    if (!settings) return;
    if (!settings.useAuth) {
      onSubmit(settings);
      return;
    }
    setAuthBusy(true);
    setAuthError('');
    try {
      // a still-valid vaulted session skips every login UI (issue #7 §3)
      const session = await window.omadiaCanvas.authSession(toConnectOptions(settings));
      if (session.valid) {
        onSubmit(settings);
        return;
      }
      const disc = await window.omadiaCanvas.authDiscover(toConnectOptions(settings));
      if (disc?.providers.some((p) => p.kind === 'password')) {
        setDiscovery(disc);
        setStep('signin');
        return;
      }
      await browserLogin(settings);
      if (disc) setDiscovery(disc);
      setStep('signin'); // surface a retry surface if the window was cancelled
    } finally {
      setAuthBusy(false);
    }
  };

  const signIn = async () => {
    if (connecting || authBusy) return;
    const settings = candidate();
    if (!settings) return;
    const provider = discovery?.providers.find((p) => p.kind === 'password');
    if (!provider) {
      await browserLogin(settings);
      return;
    }
    if (!email.trim() || !password) {
      setAuthError('Enter email and password.');
      return;
    }
    setAuthBusy(true);
    setAuthError('');
    try {
      const res = await window.omadiaCanvas.authLogin(
        toConnectOptions(settings),
        provider.id,
        email,
        password,
      );
      if (res.ok) onSubmit(settings);
      else setAuthError(LOGIN_ERRORS[res.error ?? 'unreachable'] as string);
    } finally {
      setAuthBusy(false);
    }
  };

  const passwordProvider = discovery?.providers.find((p) => p.kind === 'password');
  const oidcProviders = discovery?.providers.filter((p) => p.kind === 'oidc') ?? [];
  const serverHost = (() => {
    try {
      return new URL(url.trim()).host;
    } catch {
      return url.trim();
    }
  })();

  if (step === 'signin') {
    return (
      <div className="lume-onboarding">
        <div className="lume-card">
          <h2 className="lume-heading lume-onboarding-title">Sign in to Omadia</h2>
          <p className="lume-onboarding-hint">
            {serverHost} requires a sign-in. Your session is stored encrypted on this machine.
          </p>
          {passwordProvider && (
            <>
              <label className="lume-field-label" htmlFor="auth-email">
                Email
              </label>
              <input
                id="auth-email"
                className={`lume-input lume-onboarding-input${authError ? ' lume-input-error' : ''}`}
                type="email"
                autoFocus
                spellCheck={false}
                disabled={authBusy || connecting}
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setAuthError('');
                }}
                onKeyDown={(e) => e.key === 'Enter' && void signIn()}
              />
              <label className="lume-field-label lume-login-label" htmlFor="auth-password">
                Password
              </label>
              <input
                id="auth-password"
                className={`lume-input lume-onboarding-input${authError ? ' lume-input-error' : ''}`}
                type="password"
                disabled={authBusy || connecting}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setAuthError('');
                }}
                onKeyDown={(e) => e.key === 'Enter' && void signIn()}
              />
            </>
          )}
          {authError && <div className="lume-field-error">{authError}</div>}
          {failed && (
            <div className="lume-field-error">
              Connection failed{status.detail ? `: ${status.detail}` : '.'}
            </div>
          )}
          {oidcProviders.map((p) => (
            <button
              key={p.id}
              className="lume-button lume-auth-browser"
              disabled={authBusy || connecting}
              onClick={() => {
                const settings = candidate();
                if (settings) void browserLogin(settings, p.id);
              }}
            >
              {`Sign in with ${p.displayName}`}
            </button>
          ))}
          {oidcProviders.length === 0 && !passwordProvider && (
            <button
              className="lume-button lume-auth-browser"
              disabled={authBusy || connecting}
              onClick={() => {
                const settings = candidate();
                if (settings) void browserLogin(settings);
              }}
            >
              Sign in via browser window
            </button>
          )}
          <div className="lume-toolbar lume-onboarding-actions">
            <button
              className="lume-button"
              disabled={authBusy || connecting}
              onClick={() => {
                setStep('server');
                setAuthError('');
              }}
            >
              Back
            </button>
            {passwordProvider && (
              <button
                className="lume-button lume-button-primary"
                disabled={authBusy || connecting}
                onClick={() => void signIn()}
              >
                {authBusy || connecting ? (
                  <span className="lume-busy-verb">Signing in</span>
                ) : (
                  'Sign in'
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="lume-onboarding">
      <div className="lume-card">
        <h2 className="lume-heading lume-onboarding-title">Connect to Omadia</h2>
        <p className="lume-onboarding-hint">
          Pick a server found on your network, or enter its address. We figure out the
          canvas connection for you — it&apos;s stored locally on this machine once connected.
        </p>

        {/* A) On this network — zero-config LAN discovery (mDNS _omadia._tcp).
            Always shown while the server step is open: lists 1-click hosts, or a
            passive "searching" state when none have answered yet. */}
        <span className="lume-field-label">On this network</span>
        <div className="lume-discovered">
          {lanHosts.length > 0 ? (
            lanHosts.map((host) => (
              <button
                key={host.id}
                type="button"
                className="lume-button lume-discovered-host"
                disabled={connecting || authBusy || discovering}
                onClick={() => void submit(`${host.address}:${host.port}`)}
                title={`${host.address}:${host.port}`}
              >
                <span className="lume-discovered-host-name">{host.name}</span>
                {host.authMode && host.authMode !== 'none' ? (
                  <span className="lume-discovered-host-auth">sign-in</span>
                ) : null}
              </button>
            ))
          ) : (
            <div className="lume-discovered-empty">
              <span className="lume-spinner-sm" aria-hidden />
              Searching the local network…
            </div>
          )}
        </div>

        {/* B) Server address (public / remote) — C) or a full canvas URL pasted verbatim */}
        <label className="lume-field-label lume-login-label" htmlFor="server-url">
          Server address
        </label>
        <input
          id="server-url"
          className={`lume-input lume-onboarding-input${error ? ' lume-input-error' : ''}`}
          autoFocus
          spellCheck={false}
          disabled={connecting || authBusy || discovering}
          placeholder="https://omadia.example.com  ·  omadia.local:8080"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            setError('');
          }}
          onKeyDown={(e) => e.key === 'Enter' && void submit()}
        />
        <p className="lume-onboarding-subhint">
          Or paste a full <code>wss://…/omadia-ui/canvas</code> URL directly.
        </p>
        {error && <div className="lume-field-error">{error}</div>}
        <label className="lume-check-row">
          <input
            type="checkbox"
            checked={useAuth}
            disabled={connecting || authBusy}
            onChange={(e) => setUseAuth(e.target.checked)}
          />
          Sign in before connecting (session cookie)
        </label>
        {useAuth && (
          <>
            <label className="lume-field-label lume-login-label" htmlFor="login-url">
              Login URL <span className="lume-field-optional">(optional — only for the browser-window fallback)</span>
            </label>
            <input
              id="login-url"
              className="lume-input lume-onboarding-input"
              spellCheck={false}
              disabled={connecting || authBusy}
              placeholder="http://127.0.0.1:3333/login"
              value={loginUrl}
              onChange={(e) => {
                setLoginUrl(e.target.value);
                setError('');
              }}
              onKeyDown={(e) => e.key === 'Enter' && void submit()}
            />
          </>
        )}
        {authError && <div className="lume-field-error">{authError}</div>}
        {failed && (
          <div className="lume-field-error">
            Connection failed{status.detail ? `: ${status.detail}` : '.'}
          </div>
        )}
        <div className="lume-toolbar lume-onboarding-actions">
          {canCancel && (
            <button
              className="lume-button"
              disabled={connecting || authBusy || discovering}
              onClick={onCancel}
            >
              Cancel
            </button>
          )}
          <button
            className="lume-button lume-button-primary"
            disabled={connecting || authBusy || discovering}
            onClick={() => void submit()}
          >
            {connecting || authBusy || discovering ? (
              <span className="lume-busy-verb">
                {discovering ? 'Finding server' : authBusy ? 'Checking' : 'Connecting'}
              </span>
            ) : (
              'Connect'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
