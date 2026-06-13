import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { AppSettings, OmadiaInstance } from '../shared/ipc.js';

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

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isNonBlankString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function buildInstance(
  id: string,
  name: string,
  serverUrl: string,
  useAuth: boolean,
  loginUrl?: string,
): OmadiaInstance {
  return {
    id,
    name,
    serverUrl,
    useAuth,
    ...(loginUrl !== undefined ? { loginUrl } : {}),
  };
}

function buildSettings(instances: OmadiaInstance[], activeInstanceId: string): AppSettings {
  const activeInstance = instances.find((instance) => instance.id === activeInstanceId);
  if (!activeInstance) throw new Error(`invalid active instance id: ${activeInstanceId}`);
  return {
    serverUrl: activeInstance.serverUrl,
    useAuth: activeInstance.useAuth,
    ...(activeInstance.loginUrl !== undefined ? { loginUrl: activeInstance.loginUrl } : {}),
    instances,
    activeInstanceId: activeInstance.id,
  };
}

function validateInstance(instance: OmadiaInstance): OmadiaInstance {
  if (!isNonEmptyString(instance.id)) throw new Error(`invalid instance id: ${instance.id}`);
  if (!isNonBlankString(instance.name)) throw new Error(`invalid instance name: ${instance.name}`);
  if (!isWsUrl(instance.serverUrl)) throw new Error(`invalid server url: ${instance.serverUrl}`);
  if (instance.loginUrl !== undefined && !isHttpUrl(instance.loginUrl)) {
    throw new Error(`invalid login url: ${instance.loginUrl}`);
  }
  return buildInstance(
    instance.id,
    instance.name,
    instance.serverUrl,
    instance.useAuth === true,
    instance.loginUrl,
  );
}

function normalizeInstance(value: unknown): OmadiaInstance | null {
  if (!isObject(value)) return null;
  const id = value.id;
  const name = value.name;
  const serverUrl = value.serverUrl;
  const loginUrl = value.loginUrl;
  if (!isNonEmptyString(id) || !isNonBlankString(name) || !isWsUrl(serverUrl)) return null;
  if (loginUrl !== undefined && !isHttpUrl(loginUrl)) return null;
  return buildInstance(id, name, serverUrl, value.useAuth === true, loginUrl);
}

function normalizeInstances(value: unknown): OmadiaInstance[] {
  if (!Array.isArray(value)) return [];
  const instances: OmadiaInstance[] = [];
  const ids = new Set<string>();
  for (const entry of value) {
    const instance = normalizeInstance(entry);
    if (!instance || ids.has(instance.id)) continue;
    ids.add(instance.id);
    instances.push(instance);
  }
  return instances;
}

function migrateLegacySettings(settings: Partial<AppSettings>): AppSettings | null {
  if (!isWsUrl(settings.serverUrl)) return null;
  const instance = buildInstance(
    randomUUID(),
    'Standard',
    settings.serverUrl,
    settings.useAuth === true,
    isHttpUrl(settings.loginUrl) ? settings.loginUrl : undefined,
  );
  return buildSettings([instance], instance.id);
}

function normalizeLoadedSettings(settings: Partial<AppSettings>): AppSettings | null {
  const instances = normalizeInstances(settings.instances);
  if (instances.length === 0) return migrateLegacySettings(settings);
  const firstInstance = instances[0];
  if (!firstInstance) return migrateLegacySettings(settings);
  const activeInstanceId =
    isNonEmptyString(settings.activeInstanceId) && instances.some((instance) => instance.id === settings.activeInstanceId)
      ? settings.activeInstanceId
      : firstInstance.id;
  return buildSettings(instances, activeInstanceId);
}

function validateSavedSettings(settings: AppSettings): AppSettings {
  if (!Array.isArray(settings.instances) || settings.instances.length === 0) {
    throw new Error('instances must not be empty');
  }
  const instances = settings.instances.map(validateInstance);
  const ids = new Set<string>();
  for (const instance of instances) {
    if (ids.has(instance.id)) throw new Error(`duplicate instance id: ${instance.id}`);
    ids.add(instance.id);
  }
  if (!isNonEmptyString(settings.activeInstanceId) || !ids.has(settings.activeInstanceId)) {
    throw new Error(`invalid active instance id: ${settings.activeInstanceId}`);
  }
  return buildSettings(instances, settings.activeInstanceId);
}

function serializeSettings(settings: AppSettings): string {
  return JSON.stringify({
    serverUrl: settings.serverUrl,
    useAuth: settings.useAuth === true,
    ...(settings.loginUrl !== undefined ? { loginUrl: settings.loginUrl } : {}),
    instances: settings.instances,
    activeInstanceId: settings.activeInstanceId,
  });
}

/** onboarding server config in userData — null until the first successful connect. */
export function createFileSettingsStore(userDataDir: string): SettingsStore {
  const file = join(userDataDir, 'settings.json');
  return {
    load(): AppSettings | null {
      try {
        const raw = readFileSync(file, 'utf8');
        const parsedUnknown = JSON.parse(raw) as unknown;
        const parsed = (isObject(parsedUnknown) ? parsedUnknown : {}) as Partial<AppSettings>;
        const settings = normalizeLoadedSettings(parsed);
        if (!settings) return null;
        const serialized = serializeSettings(settings);
        if (serialized !== raw) writeFileSync(file, serialized, 'utf8');
        return settings;
      } catch {
        return null;
      }
    },
    save(settings: AppSettings): void {
      const normalizedSettings = validateSavedSettings(settings);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, serializeSettings(normalizedSettings), 'utf8');
    },
  };
}
