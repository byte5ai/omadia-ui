import { createStore } from "../lib/create-store";

/**
 * The moving light (fog, dust, the room that follows the pointer). On by
 * default; off leaves the still cone. Per device, like the build animation,
 * because it costs this machine's GPU, so it stays out of the synced settings.
 */

const STORAGE_KEY = "omadia.effects";

function load(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

export const effectsStore = createStore<boolean>(load());

export function setEffects(on: boolean): void {
  effectsStore.set(on);
  try {
    localStorage.setItem(STORAGE_KEY, on ? "on" : "off");
  } catch {
    // private storage off: the choice lasts this session
  }
}
