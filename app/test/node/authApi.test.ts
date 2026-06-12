import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  discoverProviders,
  loginWithPassword,
  validateSession,
  wsToHttpOrigin,
} from '../../src/main/authApi.js';

const VALID_COOKIE = 'omadia_session=jwt-token-abc';

let server: Server;
let origin: string;

beforeAll(async () => {
  server = createServer((req, res) => {
    const json = (status: number, body: unknown, headers: Record<string, string> = {}) => {
      res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
      res.end(JSON.stringify(body));
    };
    if (req.method === 'GET' && req.url === '/api/v1/auth/providers') {
      json(200, {
        providers: [
          { id: 'local', displayName: 'Email & Password', kind: 'password' },
          { id: 'entra', displayName: 'Microsoft Entra', kind: 'oidc' },
          { id: 'bogus', displayName: 42, kind: 'password' }, // malformed — must be dropped
        ],
        setup_required: false,
      });
      return;
    }
    if (req.method === 'POST' && req.url === '/api/v1/auth/login/local') {
      let raw = '';
      req.on('data', (c: Buffer) => (raw += String(c)));
      req.on('end', () => {
        const body = JSON.parse(raw) as { email?: string; password?: string };
        if (body.email === 'user@example.com' && body.password === 'secret') {
          json(
            200,
            { ok: true, user: { email: body.email } },
            { 'Set-Cookie': `${VALID_COOKIE}; Max-Age=14400; Path=/; HttpOnly; SameSite=Lax` },
          );
        } else {
          json(401, { code: 'auth.invalid_credentials' });
        }
      });
      return;
    }
    if (req.method === 'POST' && req.url?.startsWith('/api/v1/auth/login/')) {
      json(404, { code: 'auth.unknown_provider' });
      return;
    }
    if (req.method === 'GET' && req.url === '/api/v1/auth/me') {
      if (req.headers.cookie === VALID_COOKIE) {
        json(200, { user: { email: 'user@example.com' }, expires_at: 2_000_000_000 });
      } else if (req.headers.cookie === 'omadia_session=legacy-404') {
        // a deployment that predates the endpoint entirely
        json(404, { code: 'not_found' });
      } else if (req.headers.cookie === 'omadia_session=bounced') {
        // a global auth gate bouncing the cookie to its login page
        res.writeHead(302, { Location: '/login?return=%2Fapi%2Fv1%2Fauth%2Fme' });
        res.end();
      } else {
        json(401, { code: 'auth.invalid' });
      }
      return;
    }
    json(404, { code: 'not_found' });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  if (addr === null || typeof addr === 'string') throw new Error('no port');
  origin = `http://127.0.0.1:${addr.port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

describe('wsToHttpOrigin', () => {
  it('maps ws → http and wss → https, dropping the path', () => {
    expect(wsToHttpOrigin('ws://127.0.0.1:8080/omadia-ui/canvas')).toBe('http://127.0.0.1:8080');
    expect(wsToHttpOrigin('wss://omadia.example.com/omadia-ui/canvas')).toBe(
      'https://omadia.example.com',
    );
  });
});

describe('discoverProviders', () => {
  it('returns the advertised providers and drops malformed entries', async () => {
    const disc = await discoverProviders(origin);
    expect(disc).not.toBeNull();
    expect(disc?.setupRequired).toBe(false);
    expect(disc?.providers).toEqual([
      { id: 'local', displayName: 'Email & Password', kind: 'password' },
      { id: 'entra', displayName: 'Microsoft Entra', kind: 'oidc' },
    ]);
  });

  it('returns null for kernels without the endpoint (popup-fallback signal)', async () => {
    expect(await discoverProviders('http://127.0.0.1:1')).toBeNull();
  });
});

describe('loginWithPassword', () => {
  it('lifts the omadia_session cookie and its Max-Age expiry on success', async () => {
    const before = Math.floor(Date.now() / 1000);
    const res = await loginWithPassword(origin, 'local', 'User@Example.com', 'secret');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.cookie).toBe(VALID_COOKIE);
    expect(res.expiresAt).toBeGreaterThanOrEqual(before + 14400);
  });

  it('maps 401 to invalid_credentials', async () => {
    const res = await loginWithPassword(origin, 'local', 'user@example.com', 'wrong');
    expect(res).toMatchObject({ ok: false, error: 'invalid_credentials' });
  });

  it('maps 404 to unknown_provider', async () => {
    const res = await loginWithPassword(origin, 'nope', 'user@example.com', 'secret');
    expect(res).toMatchObject({ ok: false, error: 'unknown_provider' });
  });

  it('maps network failure to unreachable', async () => {
    const res = await loginWithPassword('http://127.0.0.1:1', 'local', 'a@b.c', 'x');
    expect(res).toMatchObject({ ok: false, error: 'unreachable' });
  });
});

describe('validateSession', () => {
  it('confirms a live session with email and expiry', async () => {
    expect(await validateSession(origin, VALID_COOKIE)).toEqual({
      valid: true,
      email: 'user@example.com',
      expiresAt: 2_000_000_000,
    });
  });

  it('reports an expired/invalid session as invalid', async () => {
    expect(await validateSession(origin, 'omadia_session=stale')).toEqual({ valid: false });
  });

  it('returns null when the server is unreachable (cookie must be kept)', async () => {
    expect(await validateSession('http://127.0.0.1:1', VALID_COOKIE)).toBeNull();
  });

  it('keeps the cookie when the deployment has no /auth/me (404 → null)', async () => {
    // an embedded kernel behind its own gate (e.g. the odoo-bot harness)
    // may predate the endpoint — 404 says nothing about the session;
    // clearing the vault here caused a hard login loop after every
    // successful browser sign-in
    expect(await validateSession(origin, 'omadia_session=legacy-404')).toBeNull();
  });

  it('treats an auth-gate redirect as a definite rejection (302 → invalid)', async () => {
    expect(await validateSession(origin, 'omadia_session=bounced')).toEqual({ valid: false });
  });
});
