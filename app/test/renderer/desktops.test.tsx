import { describe, expect, it, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Sidebar } from '../../src/renderer/src/Sidebar.js';
import {
  allDesktopSlotIds,
  loadDesktops,
  newDesktop,
  saveDesktops,
} from '../../src/renderer/src/store/desktopStore.js';
import { leaf, splitLeaf } from '../../src/renderer/src/store/workspaceStore.js';

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

describe('desktopStore', () => {
  beforeEach(() => {
    globalThis.localStorage = memStorage();
  });

  it('persists desktops, prunes vanished canvases, clamps name/color', () => {
    const d1 = newDesktop(0, splitLeaf(leaf('s1'), 's1', 'columns', 's2'));
    const d2 = { ...newDesktop(1, leaf('s3')), name: 'X'.repeat(99), color: 99 };
    saveDesktops([d1, d2], d2.desktopId);
    const loaded = loadDesktops(new Set(['s1', 's3']));
    expect(loaded).not.toBeNull();
    expect(loaded?.desktops).toHaveLength(2);
    expect(loaded?.activeId).toBe(d2.desktopId);
    // s2 vanished → d1's split collapses to leaf s1
    expect(loaded?.desktops[0]?.layout).toEqual(leaf('s1'));
    expect(loaded?.desktops[1]?.name.length).toBeLessThanOrEqual(48);
    expect(loaded?.desktops[1]?.color).toBeLessThanOrEqual(5);
    expect([...allDesktopSlotIds(loaded?.desktops ?? [])].sort()).toEqual(['s1', 's3']);
  });

  it('migrates the legacy single workspace into Desktop 1', () => {
    localStorage.setItem(
      'omadia.ui-prefs.workspace',
      JSON.stringify(splitLeaf(leaf('s1'), 's1', 'rows', 's2')),
    );
    const loaded = loadDesktops(new Set(['s1', 's2']));
    expect(loaded?.desktops).toHaveLength(1);
    expect(loaded?.desktops[0]?.name).toBe('Desktop 1');
    expect(allDesktopSlotIds(loaded?.desktops ?? []).size).toBe(2);
  });

  it('returns null when nothing valid is stored', () => {
    expect(loadDesktops(new Set(['nope']))).toBeNull();
  });
});

describe('Sidebar with desktop + canvas sections', () => {
  it('renders both categories, desktop dot/color and rename affordance', () => {
    const d = { ...newDesktop(0, leaf('s1')), name: 'Vertrieb', color: 3 };
    const html = renderToStaticMarkup(
      <Sidebar
        desktops={[d]}
        activeDesktopId={d.desktopId}
        onSelectDesktop={() => {}}
        onAddDesktop={() => {}}
        onRenameDesktop={() => {}}
        onDesktopColor={() => {}}
        slots={[{ slotId: 's1', title: 'Monatsumsatz', color: 1 }]}
        activeSlotId="s1"
        busySlotIds={new Set()}
        onSelect={() => {}}
        onAdd={() => {}}
        onDelete={() => {}}
        onLibrary={() => {}}
      />,
    );
    expect(html).toContain('Desktops');
    expect(html).toContain('Canvases');
    expect(html).toContain('Vertrieb');
    expect(html).toContain('lume-canvas-dot-3');
    expect(html).toContain('+ Neuer Desktop');
    expect(html).toContain('Doppelklick zum Umbenennen');
    expect(html).toContain('Farbe wechseln');
    expect(html).toContain('Monatsumsatz');
  });
});
