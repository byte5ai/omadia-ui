import type {
  AppSettings,
  ColorMode,
  LightTemperature,
  ServerEntry,
} from "../../../shared/ipc";
import { createStore } from "../lib/create-store";

/**
 * Where the app stands with its server: onboarding, signing in, connected,
 * or unreachable. Settings (mode, light temperature) live here too.
 */

export type Phase = "booting" | "connect" | "sign-in" | "ready" | "unreachable";

export interface SessionState {
  phase: Phase;
  settings: AppSettings | null;
  server: ServerEntry | null;
  email?: string;
  sessionExpiresAt?: number;
  /** since when the server has not answered (ms epoch) */
  unreachableSince?: number;
}

export const sessionStore = createStore<SessionState>({
  phase: "booting",
  settings: null,
  server: null,
});

export const activeServer = (): ServerEntry | null => sessionStore.get().server;

export async function loadSettings(): Promise<AppSettings> {
  const settings = await window.omadia
    .settingsGet()
    .then((s) => s)
    .catch(() => null);
  const resolved = settings ?? {
    servers: [],
    activeServerId: null,
    mode: "system" as ColorMode,
    temperature: 4500 as LightTemperature,
    translucent: true,
    devTurnLog: false,
  };
  const server =
    resolved.servers.find((s) => s.id === resolved.activeServerId) ?? null;
  sessionStore.set((s) => ({ ...s, settings: resolved, server }));
  applyAppearance(resolved);
  return resolved;
}

export async function saveSettings(
  patch: Partial<AppSettings>,
): Promise<AppSettings> {
  const next = await window.omadia
    .settingsSave(patch)
    .then((s) => s)
    .catch(() => ({
      ...(sessionStore.get().settings as AppSettings),
      ...patch,
    }));
  const server = next.servers.find((s) => s.id === next.activeServerId) ?? null;
  sessionStore.set((s) => ({ ...s, settings: next, server }));
  applyAppearance(next);
  return next;
}

const media = window.matchMedia("(prefers-color-scheme: dark)");

export function resolvedMode(mode: ColorMode): "night" | "day" {
  if (mode === "system") return media.matches ? "night" : "day";
  return mode;
}

export function applyAppearance(settings: AppSettings): void {
  const root = document.documentElement;
  root.dataset.mode = resolvedMode(settings.mode);
  root.dataset.temp = String(settings.temperature);
  root.classList.toggle(
    "vibrant",
    window.omadia.platform === "darwin" && settings.translucent,
  );
}

media.addEventListener("change", () => {
  const settings = sessionStore.get().settings;
  if (settings) applyAppearance(settings);
});

export const temperatureLabel: Record<LightTemperature, string> = {
  2700: "Warm",
  4500: "Neutral",
  6500: "Kühl",
};
