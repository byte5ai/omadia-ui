import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { AppSettings } from '../shared/ipc.js';

export interface SettingsStore {
  load(): AppSettings | null;
  save(settings: AppSettings): void;
}

function isWsUrl(value: unknown): value is string {
  return typeof value === 'string' && /^wss?:\/\/\S+$/.test(value);
}

function isHttpUrl(value: unknown): value is string {
  return typeof value === 'string' && /^https?:\/\/\S+$/.test(value);
}

/** onboarding server config in userData — null until the first successful connect. */
export function createFileSettingsStore(userDataDir: string): SettingsStore {
  const file = join(userDataDir, 'settings.json');
  return {
    load(): AppSettings | null {
      try {
        const parsed = JSON.parse(readFileSync(file, 'utf8')) as Partial<AppSettings>;
        if (!isWsUrl(parsed.serverUrl)) return null;
        return {
          serverUrl: parsed.serverUrl,
          useAuth: parsed.useAuth === true,
          ...(isHttpUrl(parsed.loginUrl) ? { loginUrl: parsed.loginUrl } : {}),
        };
      } catch {
        return null;
      }
    },
    save(settings: AppSettings): void {
      if (!isWsUrl(settings.serverUrl)) throw new Error(`invalid server url: ${settings.serverUrl}`);
      if (settings.loginUrl !== undefined && !isHttpUrl(settings.loginUrl)) {
        throw new Error(`invalid login url: ${settings.loginUrl}`);
      }
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(
        file,
        JSON.stringify({
          serverUrl: settings.serverUrl,
          useAuth: settings.useAuth === true,
          ...(settings.loginUrl !== undefined ? { loginUrl: settings.loginUrl } : {}),
        }),
        'utf8',
      );
    },
  };
}
