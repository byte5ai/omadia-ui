import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  candidateOrigins,
  discoverPairing,
  isCanvasTransportUrl,
  type PairingDescriptor,
} from '../../src/main/discovery.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function stubFetch(
  routes: Record<string, { status?: number; json?: unknown } | 'reject'>,
): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const entry = routes[url];
      if (!entry || entry === 'reject') {
        throw new Error(`no route for ${url}`);
      }
      return {
        ok: (entry.status ?? 200) >= 200 && (entry.status ?? 200) < 300,
        status: entry.status ?? 200,
        json: async () => entry.json,
      } as Response;
    }),
  );
}

describe('isCanvasTransportUrl', () => {
  it('accepts a full wss canvas URL', () => {
    expect(isCanvasTransportUrl('wss://h.example/omadia-ui/canvas')).toBe(true);
    expect(isCanvasTransportUrl('ws://127.0.0.1:8080/omadia-ui/canvas')).toBe(
      true,
    );
  });
  it('rejects bare hosts and non-canvas URLs', () => {
    expect(isCanvasTransportUrl('https://h.example')).toBe(false);
    expect(isCanvasTransportUrl('h.example')).toBe(false);
    expect(isCanvasTransportUrl('wss://h.example/other')).toBe(false);
  });
});

describe('candidateOrigins', () => {
  it('honours an explicit https scheme', () => {
    expect(candidateOrigins('https://omadia.example.com/some/path')).toEqual([
      'https://omadia.example.com',
    ]);
  });
  it('defaults a public bare host to https then http', () => {
    expect(candidateOrigins('omadia.example.com')).toEqual([
      'https://omadia.example.com',
      'http://omadia.example.com',
    ]);
  });
  it('uses http for localhost / LAN / .local hosts', () => {
    expect(candidateOrigins('localhost:8080')).toEqual(['http://localhost:8080']);
    expect(candidateOrigins('omadia.local')).toEqual(['http://omadia.local']);
    expect(candidateOrigins('192.168.1.50:8080')).toEqual([
      'http://192.168.1.50:8080',
    ]);
  });
  it('strips a pasted path off a bare host', () => {
    expect(candidateOrigins('box.local/omadia-ui/canvas')).toEqual([
      'http://box.local',
    ]);
  });
});

describe('discoverPairing', () => {
  it('short-circuits a pasted canvas transport URL (no fetch)', async () => {
    const spy = vi.fn();
    vi.stubGlobal('fetch', spy);
    const d = await discoverPairing('wss://h.example/omadia-ui/canvas');
    expect(d).toEqual<PairingDescriptor>({
      wsUrl: 'wss://h.example/omadia-ui/canvas',
      protocolVersion: '1.0',
      auth: { mode: 'unknown' },
    });
    expect(spy).not.toHaveBeenCalled();
  });

  it('reads the canonical .well-known descriptor', async () => {
    stubFetch({
      'https://omadia.example.com/.well-known/omadia-ui': {
        json: {
          name: 'Acme',
          protocolVersion: '1.0',
          wsUrl: 'wss://omadia.example.com/omadia-ui/canvas',
          auth: {
            mode: 'password',
            providers: [{ id: 'local', displayName: 'Password', kind: 'password' }],
            loginStartUrl: 'https://omadia.example.com/api/v1/auth',
          },
        },
      },
    });
    const d = await discoverPairing('omadia.example.com');
    expect(d?.wsUrl).toBe('wss://omadia.example.com/omadia-ui/canvas');
    expect(d?.name).toBe('Acme');
    expect(d?.auth.mode).toBe('password');
    expect(d?.auth.loginStartUrl).toBe('https://omadia.example.com/api/v1/auth');
  });

  it('honours an absolute wsUrl that points at a different host (split deploy)', async () => {
    stubFetch({
      'https://operator.example.com/.well-known/omadia-ui': {
        json: {
          protocolVersion: '1.0',
          wsUrl: 'wss://middleware.example.com/omadia-ui/canvas',
          auth: {
            mode: 'oidc',
            loginStartUrl: 'https://operator.example.com/bot-api/v1/auth',
          },
        },
      },
    });
    const d = await discoverPairing('https://operator.example.com');
    expect(d?.wsUrl).toBe('wss://middleware.example.com/omadia-ui/canvas');
    expect(d?.auth.loginStartUrl).toBe(
      'https://operator.example.com/bot-api/v1/auth',
    );
  });

  it('falls back to legacy /omadia-ui/info and absolutises a relative path', async () => {
    stubFetch({
      'http://localhost:8080/.well-known/omadia-ui': { status: 404 },
      'http://localhost:8080/omadia-ui/info': {
        json: {
          protocolVersions: ['1.0'],
          websocket: '/omadia-ui/canvas',
          transport: 'websocket',
        },
      },
    });
    const d = await discoverPairing('localhost:8080');
    expect(d).toEqual<PairingDescriptor>({
      wsUrl: 'ws://localhost:8080/omadia-ui/canvas',
      protocolVersion: '1.0',
      auth: { mode: 'unknown' },
    });
  });

  it('prefers the absolute wsUrl from a newer /omadia-ui/info', async () => {
    stubFetch({
      'http://localhost:8080/.well-known/omadia-ui': 'reject',
      'http://localhost:8080/omadia-ui/info': {
        json: {
          protocolVersions: ['1.0'],
          websocket: '/omadia-ui/canvas',
          wsUrl: 'ws://localhost:8080/omadia-ui/canvas',
        },
      },
    });
    const d = await discoverPairing('localhost:8080');
    expect(d?.wsUrl).toBe('ws://localhost:8080/omadia-ui/canvas');
  });

  it('falls through https → http for a public bare host', async () => {
    stubFetch({
      // https candidate is unreachable …
      'https://omadia.example.com/.well-known/omadia-ui': 'reject',
      'https://omadia.example.com/omadia-ui/info': 'reject',
      // … http answers.
      'http://omadia.example.com/.well-known/omadia-ui': {
        json: {
          protocolVersion: '1.0',
          wsUrl: 'ws://omadia.example.com/omadia-ui/canvas',
          auth: { mode: 'none' },
        },
      },
    });
    const d = await discoverPairing('omadia.example.com');
    expect(d?.wsUrl).toBe('ws://omadia.example.com/omadia-ui/canvas');
    expect(d?.auth.mode).toBe('none');
  });

  it('returns null when nothing answers', async () => {
    stubFetch({});
    expect(await discoverPairing('nope.example.com')).toBeNull();
  });
});
