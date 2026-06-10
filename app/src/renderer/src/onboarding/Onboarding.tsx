import { useState } from 'react';
import type { AppSettings, ConnectionStatus } from '../../../shared/ipc.js';

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

/** server setup — stays open until the first successful connect; field-level
 *  errors per visual-spec §7.4, button-in-flight per §7.3 (verb + dots). */
export function Onboarding({ defaults, status, busy, canCancel, onSubmit, onCancel }: OnboardingProps) {
  const [url, setUrl] = useState(defaults.serverUrl);
  const [useAuth, setUseAuth] = useState(defaults.useAuth);
  const [loginUrl, setLoginUrl] = useState(defaults.loginUrl ?? '');
  const [error, setError] = useState('');

  const connecting = busy && status.state !== 'failed';
  const failed = busy && status.state === 'failed';

  const submit = () => {
    if (connecting) return;
    const trimmedUrl = url.trim();
    const trimmedLogin = loginUrl.trim();
    if (!WS_PATTERN.test(trimmedUrl)) {
      setError('Enter a ws:// or wss:// server URL.');
      return;
    }
    if (useAuth && trimmedLogin && !HTTP_PATTERN.test(trimmedLogin)) {
      setError('Login URL must be http:// or https://.');
      return;
    }
    onSubmit({
      serverUrl: trimmedUrl,
      useAuth,
      ...(useAuth && trimmedLogin ? { loginUrl: trimmedLogin } : {}),
    });
  };

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
          disabled={connecting}
          placeholder="ws://127.0.0.1:8080/omadia-ui/canvas"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            setError('');
          }}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
        {error && <div className="lume-field-error">{error}</div>}
        <label className="lume-check-row">
          <input
            type="checkbox"
            checked={useAuth}
            disabled={connecting}
            onChange={(e) => setUseAuth(e.target.checked)}
          />
          Sign in before connecting (session cookie)
        </label>
        {useAuth && (
          <>
            <label className="lume-field-label lume-login-label" htmlFor="login-url">
              Login URL <span className="lume-field-optional">(optional — defaults to the server origin)</span>
            </label>
            <input
              id="login-url"
              className="lume-input lume-onboarding-input"
              spellCheck={false}
              disabled={connecting}
              placeholder="http://127.0.0.1:3333/login"
              value={loginUrl}
              onChange={(e) => {
                setLoginUrl(e.target.value);
                setError('');
              }}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
            />
          </>
        )}
        {failed && (
          <div className="lume-field-error">
            Connection failed{status.detail ? `: ${status.detail}` : '.'}
          </div>
        )}
        <div className="lume-toolbar lume-onboarding-actions">
          {canCancel && (
            <button className="lume-button" disabled={connecting} onClick={onCancel}>
              Cancel
            </button>
          )}
          <button className="lume-button lume-button-primary" disabled={connecting} onClick={submit}>
            {connecting ? <span className="lume-busy-verb">Connecting</span> : 'Connect'}
          </button>
        </div>
      </div>
    </div>
  );
}
