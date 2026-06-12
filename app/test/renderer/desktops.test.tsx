import { describe, expect, it, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Sidebar } from '../../src/renderer/src/Sidebar.js';
import {
  allDesktopSlotIds,
  desktopsToWire,
  loadDesktops,
  mergeWireDesktops,
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

  it('persists desktops, keeps layouts intact across load, clamps name/color', () => {
    const d1 = newDesktop(0, splitLeaf(leaf('s1'), 's1', 'columns', 's2'));
    const d2 = { ...newDesktop(1, leaf('s3')), name: 'X'.repeat(99), color: 99 };
    saveDesktops([d1, d2], d2.desktopId);
    const loaded = loadDesktops();
    expect(loaded).not.toBeNull();
    expect(loaded?.desktops).toHaveLength(2);
    expect(loaded?.activeId).toBe(d2.desktopId);
    // layouts are preserved verbatim — NOT pruned against a (possibly transient)
    // known-slot set, which previously destroyed desktops on a partial load
    expect(loaded?.desktops[0]?.layout).toEqual(d1.layout);
    expect(loaded?.desktops[1]?.name.length).toBeLessThanOrEqual(48);
    expect(loaded?.desktops[1]?.color).toBeLessThanOrEqual(5);
    expect([...allDesktopSlotIds(loaded?.desktops ?? [])].sort()).toEqual(['s1', 's2', 's3']);
  });

  it('migrates the legacy single workspace into Desktop 1', () => {
    localStorage.setItem(
      'omadia.ui-prefs.workspace',
      JSON.stringify(splitLeaf(leaf('s1'), 's1', 'rows', 's2')),
    );
    const loaded = loadDesktops();
    expect(loaded?.desktops).toHaveLength(1);
    expect(loaded?.desktops[0]?.name).toBe('Desktop 1');
    expect(allDesktopSlotIds(loaded?.desktops ?? []).size).toBe(2);
  });

  it('returns null when nothing valid is stored (invalid layout shapes dropped)', () => {
    localStorage.setItem(
      'omadia.ui-prefs.desktops',
      JSON.stringify({ desktops: [{ desktopId: 'd', layout: { kind: 'bogus' } }] }),
    );
    expect(loadDesktops()).toBeNull();
  });
});

describe('desktop LVL2 wire mapping (sessionId ↔ slotId)', () => {
  const slots = [
    { slotId: 's1', title: 'A', color: 0, sessionId: 'cs-1' },
    { slotId: 's2', title: 'B', color: 1, sessionId: 'cs-2' },
    { slotId: 's3', title: 'fresh chooser', color: 2 }, // no session yet
  ];

  it('translates layouts to sessionIds, pruning sessionless panes', () => {
    const d = { ...newDesktop(0, splitLeaf(leaf('s1'), 's1', 'columns', 's3')), updatedAt: 5 };
    const wire = desktopsToWire([d], slots);
    expect(wire).toHaveLength(1);
    // the sessionless chooser pane prunes — the split collapses to the leaf
    expect(wire[0]?.layout).toEqual({ kind: 'leaf', sessionId: 'cs-1' });
    // a desktop with ONLY sessionless panes is skipped entirely
    expect(desktopsToWire([newDesktop(1, leaf('s3'))], slots)).toHaveLength(0);
  });

  it('merges last-write-wins, maps unknown sessions away, honors tombstones', () => {
    const local = { ...newDesktop(0, leaf('s1')), desktopId: 'd1', name: 'Lokal', updatedAt: 200 };
    const wire = [
      { desktopId: 'd1', name: 'Älter', color: 4, updatedAt: 100, layout: { kind: 'leaf' as const, sessionId: 'cs-2' } },
      {
        desktopId: 'd2',
        name: 'Vom Server',
        color: 3,
        updatedAt: 300,
        layout: {
          kind: 'split' as const,
          dir: 'rows' as const,
          ratio: 0.4,
          a: { kind: 'leaf' as const, sessionId: 'cs-2' },
          b: { kind: 'leaf' as const, sessionId: 'cs-unbekannt' },
        },
      },
      { desktopId: 'd3', name: 'Tot', color: 0, updatedAt: 999, layout: { kind: 'leaf' as const, sessionId: 'cs-1' } },
    ];
    const merged = mergeWireDesktops([local], wire, slots, new Set(['d3']));
    expect(merged.map((d) => d.desktopId).sort()).toEqual(['d1', 'd2']);
    expect(merged.find((d) => d.desktopId === 'd1')?.name).toBe('Lokal'); // local newer wins
    const d2 = merged.find((d) => d.desktopId === 'd2');
    expect(d2?.layout).toEqual(leaf('s2')); // unknown session pruned, split collapsed
    expect(d2?.name).toBe('Vom Server');
  });

  it('does NOT overwrite a local desktop with a lossy wire mapping (incomplete slots)', () => {
    // local desktop spanning two canvases; the server has a NEWER version, but
    // this device only knows cs-1 yet (canvas list mid-sync → cs-2 unmappable).
    const local = {
      ...newDesktop(0, splitLeaf(leaf('s1'), 's1', 'columns', 's2')),
      desktopId: 'd1',
      name: 'Kurs',
      updatedAt: 100,
    };
    const wire = [
      {
        desktopId: 'd1',
        name: 'Kurs (Server)',
        color: 0,
        updatedAt: 500, // newer — would normally win
        layout: {
          kind: 'split' as const,
          dir: 'columns' as const,
          ratio: 0.5,
          a: { kind: 'leaf' as const, sessionId: 'cs-1' },
          b: { kind: 'leaf' as const, sessionId: 'cs-2' },
        },
      },
    ];
    const partialSlots = [{ slotId: 's1', title: 'A', color: 0, sessionId: 'cs-1' }];
    const merged = mergeWireDesktops([local], wire, partialSlots, new Set());
    const d1 = merged.find((d) => d.desktopId === 'd1');
    // the lossy server mapping (cs-2 would drop) must NOT collapse the local
    // desktop — local is kept verbatim until the next, complete sync.
    expect(d1?.layout).toEqual(local.layout);
    expect(d1?.name).toBe('Kurs');
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
        onDeleteDesktop={() => {}}
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
