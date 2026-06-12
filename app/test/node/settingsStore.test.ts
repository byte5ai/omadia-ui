import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createFileSettingsStore } from '../../src/main/settingsStore.js';

describe('settingsStore', () => {
  let dir: string;

  function settingsFile(): string {
    return join(dir, 'settings.json');
  }

  function instance(
    id: string,
    serverUrl: string,
    useAuth: boolean,
    name = id,
    loginUrl?: string,
  ): {
    id: string;
    name: string;
    serverUrl: string;
    useAuth: boolean;
    loginUrl?: string;
  } {
    return {
      id,
      name,
      serverUrl,
      useAuth,
      ...(loginUrl !== undefined ? { loginUrl } : {}),
    };
  }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'omadia-settings-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns null before onboarding', () => {
    expect(createFileSettingsStore(dir).load()).toBeNull();
  });

  it('round-trips saved settings', () => {
    const store = createFileSettingsStore(dir);
    store.save({
      serverUrl: 'ws://ignored/omadia-ui/canvas',
      useAuth: false,
      instances: [instance('standard', 'wss://example.com/omadia-ui/canvas', true, 'Standard')],
      activeInstanceId: 'standard',
    });
    expect(store.load()).toEqual({
      serverUrl: 'wss://example.com/omadia-ui/canvas',
      useAuth: true,
      instances: [instance('standard', 'wss://example.com/omadia-ui/canvas', true, 'Standard')],
      activeInstanceId: 'standard',
    });
  });

  it('persists across store instances (separate app runs)', () => {
    createFileSettingsStore(dir).save({
      serverUrl: 'ws://ignored/omadia-ui/canvas',
      useAuth: true,
      instances: [instance('local', 'ws://127.0.0.1:8181/omadia-ui/canvas', false, 'Local')],
      activeInstanceId: 'local',
    });
    expect(createFileSettingsStore(dir).load()).toEqual({
      serverUrl: 'ws://127.0.0.1:8181/omadia-ui/canvas',
      useAuth: false,
      instances: [instance('local', 'ws://127.0.0.1:8181/omadia-ui/canvas', false, 'Local')],
      activeInstanceId: 'local',
    });
  });

  it('round-trips the optional login url', () => {
    const store = createFileSettingsStore(dir);
    store.save({
      serverUrl: 'ws://ignored/omadia-ui/canvas',
      useAuth: false,
      instances: [
        instance(
          'docker',
          'ws://127.0.0.1:8080/omadia-ui/canvas',
          true,
          'Docker',
          'http://127.0.0.1:3333/login',
        ),
      ],
      activeInstanceId: 'docker',
    });
    expect(store.load()).toEqual({
      serverUrl: 'ws://127.0.0.1:8080/omadia-ui/canvas',
      useAuth: true,
      loginUrl: 'http://127.0.0.1:3333/login',
      instances: [
        instance(
          'docker',
          'ws://127.0.0.1:8080/omadia-ui/canvas',
          true,
          'Docker',
          'http://127.0.0.1:3333/login',
        ),
      ],
      activeInstanceId: 'docker',
    });
  });

  it('migrates legacy settings, writes them back, and keeps the generated id stable', () => {
    const store = createFileSettingsStore(dir);
    writeFileSync(
      settingsFile(),
      JSON.stringify({
        serverUrl: 'ws://legacy.example.com/omadia-ui/canvas',
        useAuth: true,
        loginUrl: 'http://legacy.example.com/login',
      }),
      'utf8',
    );

    const firstLoad = store.load();
    expect(firstLoad).not.toBeNull();
    expect(firstLoad).toMatchObject({
      serverUrl: 'ws://legacy.example.com/omadia-ui/canvas',
      useAuth: true,
      loginUrl: 'http://legacy.example.com/login',
      activeInstanceId: expect.any(String),
      instances: [
        {
          name: 'Standard',
          serverUrl: 'ws://legacy.example.com/omadia-ui/canvas',
          useAuth: true,
          loginUrl: 'http://legacy.example.com/login',
        },
      ],
    });

    const persisted = JSON.parse(readFileSync(settingsFile(), 'utf8')) as unknown;
    expect(persisted).toMatchObject({
      serverUrl: 'ws://legacy.example.com/omadia-ui/canvas',
      useAuth: true,
      loginUrl: 'http://legacy.example.com/login',
      activeInstanceId: firstLoad?.activeInstanceId,
      instances: [
        {
          id: firstLoad?.activeInstanceId,
          name: 'Standard',
          serverUrl: 'ws://legacy.example.com/omadia-ui/canvas',
          useAuth: true,
          loginUrl: 'http://legacy.example.com/login',
        },
      ],
    });

    const secondLoad = store.load();
    expect(secondLoad?.activeInstanceId).toBe(firstLoad?.activeInstanceId);
    expect(secondLoad?.instances?.[0]?.id).toBe(firstLoad?.instances?.[0]?.id);
  });

  it('keeps the top-level mirror fields aligned with the active instance on save', () => {
    const store = createFileSettingsStore(dir);
    store.save({
      serverUrl: 'ws://caller.example.com/omadia-ui/canvas',
      useAuth: false,
      loginUrl: 'http://caller.example.com/login',
      instances: [
        instance('alpha', 'ws://alpha.example.com/omadia-ui/canvas', false, 'Alpha'),
        instance('beta', 'wss://beta.example.com/omadia-ui/canvas', true, 'Beta', 'https://beta.example.com/login'),
      ],
      activeInstanceId: 'beta',
    });

    expect(store.load()).toEqual({
      serverUrl: 'wss://beta.example.com/omadia-ui/canvas',
      useAuth: true,
      loginUrl: 'https://beta.example.com/login',
      instances: [
        instance('alpha', 'ws://alpha.example.com/omadia-ui/canvas', false, 'Alpha'),
        instance('beta', 'wss://beta.example.com/omadia-ui/canvas', true, 'Beta', 'https://beta.example.com/login'),
      ],
      activeInstanceId: 'beta',
    });
  });

  it('validates multi-instance settings on save', () => {
    const store = createFileSettingsStore(dir);
    expect(() =>
      store.save({
        serverUrl: 'ws://ignored/omadia-ui/canvas',
        useAuth: false,
        instances: [],
        activeInstanceId: 'missing',
      }),
    ).toThrow('instances must not be empty');
    expect(() =>
      store.save({
        serverUrl: 'ws://ignored/omadia-ui/canvas',
        useAuth: false,
        instances: [
          instance('dup', 'ws://one.example.com/omadia-ui/canvas', false, 'One'),
          instance('dup', 'ws://two.example.com/omadia-ui/canvas', true, 'Two'),
        ],
        activeInstanceId: 'dup',
      }),
    ).toThrow('duplicate instance id: dup');
    expect(() =>
      store.save({
        serverUrl: 'ws://ignored/omadia-ui/canvas',
        useAuth: false,
        instances: [instance('alpha', 'ws://alpha.example.com/omadia-ui/canvas', false, 'Alpha')],
        activeInstanceId: 'missing',
      }),
    ).toThrow('invalid active instance id: missing');
    expect(() =>
      store.save({
        serverUrl: 'ws://ignored/omadia-ui/canvas',
        useAuth: false,
        instances: [instance('alpha', 'https://alpha.example.com', false, 'Alpha')],
        activeInstanceId: 'alpha',
      }),
    ).toThrow('invalid server url: https://alpha.example.com');
    expect(() =>
      store.save({
        serverUrl: 'ws://ignored/omadia-ui/canvas',
        useAuth: false,
        instances: [instance('alpha', 'ws://alpha.example.com/omadia-ui/canvas', false, '   ')],
        activeInstanceId: 'alpha',
      }),
    ).toThrow('invalid instance name:    ');
    expect(() =>
      store.save({
        serverUrl: 'ws://ignored/omadia-ui/canvas',
        useAuth: false,
        instances: [
          instance(
            'alpha',
            'ws://alpha.example.com/omadia-ui/canvas',
            false,
            'Alpha',
            'ftp://alpha.example.com/login',
          ),
        ],
        activeInstanceId: 'alpha',
      }),
    ).toThrow('invalid login url: ftp://alpha.example.com/login');
  });

  it('drops corrupt instances on load and repairs the active instance id', () => {
    writeFileSync(
      settingsFile(),
      JSON.stringify({
        serverUrl: 'ws://stale.example.com/omadia-ui/canvas',
        useAuth: false,
        loginUrl: 'http://stale.example.com/login',
        instances: [
          instance('alpha', 'ws://alpha.example.com/omadia-ui/canvas', false, 'Alpha'),
          { id: '', name: 'Missing id', serverUrl: 'ws://bad.example.com/omadia-ui/canvas', useAuth: false },
          { id: 'beta', name: '   ', serverUrl: 'ws://beta.example.com/omadia-ui/canvas', useAuth: true },
          {
            id: 'gamma',
            name: 'Gamma',
            serverUrl: 'https://gamma.example.com',
            useAuth: true,
          },
          instance('delta', 'wss://delta.example.com/omadia-ui/canvas', true, 'Delta', 'https://delta.example.com/login'),
          instance('alpha', 'ws://duplicate.example.com/omadia-ui/canvas', true, 'Duplicate alpha'),
        ],
        activeInstanceId: 'gamma',
      }),
      'utf8',
    );

    expect(createFileSettingsStore(dir).load()).toEqual({
      serverUrl: 'ws://alpha.example.com/omadia-ui/canvas',
      useAuth: false,
      instances: [
        instance('alpha', 'ws://alpha.example.com/omadia-ui/canvas', false, 'Alpha'),
        instance('delta', 'wss://delta.example.com/omadia-ui/canvas', true, 'Delta', 'https://delta.example.com/login'),
      ],
      activeInstanceId: 'alpha',
    });
  });

  it('round-trips two instances while switching the active instance', () => {
    const store = createFileSettingsStore(dir);
    const alpha = instance('alpha', 'ws://alpha.example.com/omadia-ui/canvas', false, 'Alpha');
    const beta = instance('beta', 'wss://beta.example.com/omadia-ui/canvas', true, 'Beta', 'https://beta.example.com/login');

    store.save({
      serverUrl: 'ws://ignored/omadia-ui/canvas',
      useAuth: true,
      loginUrl: 'http://ignored.example.com/login',
      instances: [alpha, beta],
      activeInstanceId: 'alpha',
    });
    expect(store.load()).toEqual({
      serverUrl: 'ws://alpha.example.com/omadia-ui/canvas',
      useAuth: false,
      instances: [alpha, beta],
      activeInstanceId: 'alpha',
    });

    store.save({
      serverUrl: 'ws://still-ignored/omadia-ui/canvas',
      useAuth: false,
      instances: [alpha, beta],
      activeInstanceId: 'beta',
    });
    expect(store.load()).toEqual({
      serverUrl: 'wss://beta.example.com/omadia-ui/canvas',
      useAuth: true,
      loginUrl: 'https://beta.example.com/login',
      instances: [alpha, beta],
      activeInstanceId: 'beta',
    });
  });

  it('returns null when neither surviving instances nor legacy fields are valid', () => {
    const store = createFileSettingsStore(dir);
    writeFileSync(
      settingsFile(),
      JSON.stringify({
        serverUrl: 'not-a-url',
        instances: [{ id: 'broken', name: 'Broken', serverUrl: 'also-not-a-url', useAuth: false }],
      }),
      'utf8',
    );
    expect(store.load()).toBeNull();
  });
});
