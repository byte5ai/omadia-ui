import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import type { AppSettings } from "../shared/ipc";

const DEFAULTS: AppSettings = {
  servers: [],
  activeServerId: null,
  mode: "system",
  temperature: 4500,
  translucent: true,
  devTurnLog: false,
};

export interface SettingsStore {
  get(): AppSettings;
  save(patch: Partial<AppSettings>): AppSettings;
}

function sanitize(raw: unknown): AppSettings {
  if (typeof raw !== "object" || raw === null) return { ...DEFAULTS };
  const o = raw as Partial<AppSettings>;
  const servers = Array.isArray(o.servers)
    ? o.servers.filter(
        (s) =>
          typeof s?.id === "string" &&
          typeof s.name === "string" &&
          typeof s.wsUrl === "string" &&
          /^wss?:\/\/\S+$/.test(s.wsUrl),
      )
    : [];
  const activeServerId =
    typeof o.activeServerId === "string" &&
    servers.some((s) => s.id === o.activeServerId)
      ? o.activeServerId
      : (servers[0]?.id ?? null);
  return {
    servers,
    activeServerId,
    mode:
      o.mode === "night" || o.mode === "day" || o.mode === "system"
        ? o.mode
        : DEFAULTS.mode,
    temperature:
      o.temperature === 2700 || o.temperature === 6500 ? o.temperature : 4500,
    translucent: o.translucent !== false,
    devTurnLog: o.devTurnLog === true,
  };
}

export function createSettingsStore(userDataDir: string): SettingsStore {
  const file = join(userDataDir, "settings.json");
  let current = (() => {
    try {
      return sanitize(JSON.parse(readFileSync(file, "utf8")));
    } catch {
      return { ...DEFAULTS };
    }
  })();

  return {
    get: () => current,
    save(patch) {
      current = sanitize({ ...current, ...patch });
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, JSON.stringify(current, null, 2), "utf8");
      return current;
    },
  };
}
