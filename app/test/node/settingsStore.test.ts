import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createFileSettingsStore } from '../../src/main/settingsStore.js';

describe('settingsStore', () => {
  let dir: string;
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
    store.save({ serverUrl: 'wss://example.com/omadia-ui/canvas', useAuth: true });
    expect(store.load()).toEqual({ serverUrl: 'wss://example.com/omadia-ui/canvas', useAuth: true });
  });

  it('persists across store instances (separate app runs)', () => {
    createFileSettingsStore(dir).save({ serverUrl: 'ws://127.0.0.1:8181/omadia-ui/canvas', useAuth: false });
    expect(createFileSettingsStore(dir).load()).toEqual({
      serverUrl: 'ws://127.0.0.1:8181/omadia-ui/canvas',
      useAuth: false,
    });
  });

  it('round-trips the optional login url', () => {
    const store = createFileSettingsStore(dir);
    store.save({
      serverUrl: 'ws://127.0.0.1:8080/omadia-ui/canvas',
      useAuth: true,
      loginUrl: 'http://127.0.0.1:3333/login',
    });
    expect(store.load()).toEqual({
      serverUrl: 'ws://127.0.0.1:8080/omadia-ui/canvas',
      useAuth: true,
      loginUrl: 'http://127.0.0.1:3333/login',
    });
  });

  it('rejects an invalid login url on save and drops it on load', () => {
    const store = createFileSettingsStore(dir);
    expect(() =>
      store.save({ serverUrl: 'ws://ok/omadia-ui/canvas', useAuth: true, loginUrl: 'ftp://nope' }),
    ).toThrow(/invalid login url/);
    writeFileSync(
      join(dir, 'settings.json'),
      JSON.stringify({ serverUrl: 'ws://ok/omadia-ui/canvas', useAuth: true, loginUrl: 'nope' }),
      'utf8',
    );
    expect(store.load()).toEqual({ serverUrl: 'ws://ok/omadia-ui/canvas', useAuth: true });
  });

  it('rejects non-websocket URLs on save', () => {
    const store = createFileSettingsStore(dir);
    expect(() => store.save({ serverUrl: 'https://example.com', useAuth: false })).toThrow(/invalid server url/);
    expect(store.load()).toBeNull();
  });

  it('returns null for corrupt or invalid persisted data', () => {
    const store = createFileSettingsStore(dir);
    store.save({ serverUrl: 'ws://ok/omadia-ui/canvas', useAuth: false });
    // simulate a hand-edited file with a bad url
    writeFileSync(join(dir, 'settings.json'), JSON.stringify({ serverUrl: 'not-a-url' }), 'utf8');
    expect(store.load()).toBeNull();
  });
});
