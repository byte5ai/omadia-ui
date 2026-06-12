import { beforeEach, describe, expect, it } from 'vitest';
import {
  ACTIVE_INSTANCE_KEY,
  activeNamespace,
  prefsKey,
  syncNamespace,
} from '../../src/renderer/src/store/prefsNamespace.js';
import { loadSlots, saveSlots } from '../../src/renderer/src/store/canvasSlots.js';

const memStorage = (): Storage => {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  } as unknown as Storage;
};

describe('prefsNamespace — per-instance localStorage keys', () => {
  beforeEach(() => {
    globalThis.localStorage = memStorage();
  });

  it('uses legacy keys until a namespace is recorded', () => {
    expect(activeNamespace()).toBeNull();
    expect(prefsKey('omadia.ui-prefs.canvases')).toBe('omadia.ui-prefs.canvases');
  });

  it('adopts legacy data onto the instance keys on first sync', () => {
    localStorage.setItem('omadia.ui-prefs.canvases', '{"slots":[{"slotId":"a"}],"activeId":"a"}');
    const changed = syncNamespace('inst-1');
    expect(changed).toBe(true);
    expect(localStorage.getItem('omadia.ui-prefs.canvases.inst-1')).toContain('"a"');
    expect(prefsKey('omadia.ui-prefs.canvases')).toBe('omadia.ui-prefs.canvases.inst-1');
  });

  it('is a no-op when the recorded namespace already matches', () => {
    localStorage.setItem(ACTIVE_INSTANCE_KEY, 'inst-1');
    expect(syncNamespace('inst-1')).toBe(false);
  });

  it('switching instances changes the namespace WITHOUT re-adopting legacy data', () => {
    localStorage.setItem('omadia.ui-prefs.canvases', 'legacy');
    syncNamespace('inst-1');
    expect(syncNamespace('inst-2')).toBe(true);
    expect(activeNamespace()).toBe('inst-2');
    // inst-2 starts clean — legacy data belongs to the migrated first instance
    expect(localStorage.getItem('omadia.ui-prefs.canvases.inst-2')).toBeNull();
  });

  it('canvas slots persist per instance and never leak across a switch', () => {
    syncNamespace('inst-1');
    saveSlots([{ slotId: 's1', title: 'Eins', color: 0 }], 's1');
    expect(loadSlots()?.slots[0]?.slotId).toBe('s1');
    syncNamespace('inst-2');
    expect(loadSlots()).toBeNull(); // the other instance's workspace stays invisible
    saveSlots([{ slotId: 's2', title: 'Zwei', color: 1 }], 's2');
    syncNamespace('inst-1');
    expect(loadSlots()?.slots[0]?.slotId).toBe('s1'); // switching back restores it
  });
});
