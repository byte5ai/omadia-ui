import { useState } from 'react';
import type {
  AppSettings,
  AuthDiscovery,
  ConnectOptions,
  ConnectionStatus,
} from '../../../shared/ipc.js';

const WS_PATTERN = /^wss?:\/\/\S+$/;
const HTTP_PATTERN = /^https?:\/\/\S+$/;

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

  const connecting = busy && status.state !== 'failed';
  const failed = busy && status.state === 'failed';

  const candidate = (): AppSettings | null => {
    const trimmedUrl = url.trim();
    const trimmedLogin = loginUrl.trim();
    if (!WS_PATTERN.test(trimmedUrl)) {
      setError('Enter a ws:// or wss:// server URL.');
      return null;
    }
    // the canvas endpoint path is protocol-fixed — a typo here persists and
    // 404s every canvas connect while the auth API (origin-only) still works
    if (!trimmedUrl.endsWith('/omadia-ui/canvas')) {
      setError('The server URL must end with /omadia-ui/canvas.');
      return null;
    }
    if (useAuth && trimmedLogin && !HTTP_PATTERN.test(trimmedLogin)) {
      setError('Login URL must be http:// or https://.');
      return null;
    }
    return {
      serverUrl: trimmedUrl,
      useAuth,
      ...(useAuth && trimmedLogin ? { loginUrl: trimmedLogin } : {}),
    };
  };

  const toConnectOptions = (s: AppSettings): ConnectOptions => ({
    url: s.serverUrl,
    useAuth: s.useAuth,
    ...(s.loginUrl ? { loginUrl: s.loginUrl } : {}),
  });

  /** web-window fallback — OIDC tenants and kernels without discovery */
  const browserLogin = async (settings: AppSettings) => {
    const res = await window.omadiaCanvas.authLoginBrowser(toConnectOptions(settings));
    if (res.ok) onSubmit(settings);
    else setAuthError(LOGIN_ERRORS[res.error ?? 'cancelled'] as string);
  };

  const submit = async () => {
    if (connecting || authBusy) return;
    const settings = candidate();
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
          {(oidcProviders.length > 0 || !passwordProvider) && (
            <button
              className="lume-button lume-auth-browser"
              disabled={authBusy || connecting}
              onClick={() => {
                const settings = candidate();
                if (settings) void browserLogin(settings);
              }}
            >
              {oidcProviders.length > 0
                ? `Sign in with ${oidcProviders.map((p) => p.displayName).join(' / ')}`
                : 'Sign in via browser window'}
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
          Enter the canvas endpoint of your Omadia server. It is stored locally on this machine
          once the connection succeeds.
        </p>
        <label className="lume-field-label" htmlFor="server-url">
          Server URL
        </label>
        <input
          id="server-url"
          className={`lume-input lume-onboarding-input${error ? ' lume-input-error' : ''}`}
          autoFocus
          spellCheck={false}
          disabled={connecting || authBusy}
          placeholder="ws://127.0.0.1:8080/omadia-ui/canvas"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            setError('');
          }}
          onKeyDown={(e) => e.key === 'Enter' && void submit()}
        />
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
            <button className="lume-button" disabled={connecting || authBusy} onClick={onCancel}>
              Cancel
            </button>
          )}
          <button
            className="lume-button lume-button-primary"
            disabled={connecting || authBusy}
            onClick={() => void submit()}
          >
            {connecting || authBusy ? (
              <span className="lume-busy-verb">{authBusy ? 'Checking' : 'Connecting'}</span>
            ) : (
              'Connect'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
