import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Workspace } from '../../src/renderer/src/Workspace.js';
import {
  collectSlotIds,
  leaf,
  loadWorkspace,
  removeLeaf,
  replaceLeaf,
  saveWorkspace,
  setRatioAt,
  splitLeaf,
  type WorkspaceNode,
} from '../../src/renderer/src/store/workspaceStore.js';

describe('workspaceStore (issue #14 split tree)', () => {
  it('splits a leaf into columns/rows, keeps the original on side A', () => {
    let l: WorkspaceNode = leaf('s1');
    l = splitLeaf(l, 's1', 'columns', 's2');
    expect(l).toMatchObject({ kind: 'split', dir: 'columns', ratio: 0.5 });
    l = splitLeaf(l, 's2', 'rows', 's3');
    expect(collectSlotIds(l)).toEqual(['s1', 's2', 's3']);
  });

  it('removeLeaf collapses the split; removing the last leaf returns null', () => {
    let l: WorkspaceNode = splitLeaf(leaf('s1'), 's1', 'columns', 's2');
    const collapsed = removeLeaf(l, 's2');
    expect(collapsed).toEqual(leaf('s1'));
    expect(removeLeaf(leaf('s1'), 's1')).toBeNull();
    l = splitLeaf(splitLeaf(leaf('s1'), 's1', 'columns', 's2'), 's1', 'rows', 's3');
    expect(collectSlotIds(removeLeaf(l, 's1') as WorkspaceNode)).toEqual(['s3', 's2']);
  });

  it('replaceLeaf swaps the pane content; setRatioAt clamps', () => {
    const l = splitLeaf(leaf('s1'), 's1', 'columns', 's2');
    expect(collectSlotIds(replaceLeaf(l, 's2', 's9'))).toEqual(['s1', 's9']);
    const tight = setRatioAt(l, '', 0.01);
    expect((tight as { ratio: number }).ratio).toBeGreaterThanOrEqual(0.15);
  });

  it('persists and prunes leaves whose canvas no longer exists', () => {
    // the node test environment has no DOM — back localStorage with a Map
    const store = new Map<string, string>();
    globalThis.localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
      key: () => null,
      length: 0,
    } as unknown as Storage;
    const l = splitLeaf(splitLeaf(leaf('s1'), 's1', 'columns', 's2'), 's2', 'rows', 's3');
    saveWorkspace(l);
    const pruned = loadWorkspace(new Set(['s1', 's3']));
    expect(pruned).not.toBeNull();
    expect(collectSlotIds(pruned as WorkspaceNode)).toEqual(['s1', 's3']);
    expect(loadWorkspace(new Set(['nope']))).toBeNull();
  });
});

describe('Workspace component', () => {
  it('renders panes with focus ring, busy title, dividers and split/close affordances', () => {
    const layout = splitLeaf(leaf('s1'), 's1', 'columns', 's2');
    const html = renderToStaticMarkup(
      <Workspace
        layout={layout}
        activeSlotId="s2"
        busySlotIds={new Set(['s1'])}
        canClose={true}
        paneTitle={(id) => (id === 's1' ? 'Umsätze' : 'Kurse')}
        renderPane={(id) => <div>pane:{id}</div>}
        onFocus={() => {}}
        onSplit={() => {}}
        onClose={() => {}}
        onRatioChange={() => {}}
      />,
    );
    expect(html).toContain('pane:s1');
    expect(html).toContain('pane:s2');
    expect(html).toContain('lume-workspace-divider-columns');
    expect(html).toContain('lume-workspace-pane-focused');
    expect(html).toContain('lume-pane-bar-busy');
    expect(html).toContain('Umsätze');
    expect(html.match(/Neue Spalte/g)?.length).toBe(2);
    expect(html).toContain('Pane schließen');
  });

  it('hides the close affordance on the last pane', () => {
    const html = renderToStaticMarkup(
      <Workspace
        layout={leaf('s1')}
        activeSlotId="s1"
        busySlotIds={new Set()}
        canClose={false}
        paneTitle={() => 'Canvas 1'}
        renderPane={() => <div>solo</div>}
        onFocus={() => {}}
        onSplit={() => {}}
        onClose={() => {}}
        onRatioChange={() => {}}
      />,
    );
    expect(html).toContain('solo');
    expect(html).not.toContain('Pane schließen');
  });
});
