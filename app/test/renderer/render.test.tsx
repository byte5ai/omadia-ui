import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { PrimitiveNode } from '../../src/renderer/src/render/PrimitiveNode.js';

const TREE = {
  type: 'container',
  id: 'root',
  title: 'T',
  layout: 'stack',
  children: [
    { type: 'heading', id: 'h', content: 'Open tickets', level: 2 },
    { type: 'text', id: 'p', content: 'narration', style: ['prose'] },
    {
      type: 'table',
      id: 't',
      columns: [{ fieldKey: 'owner', label: 'Owner' }],
      rows: [{ rowKey: 'a', cells: { owner: 'Anna' } }],
    },
    { type: 'list', id: 'l', items: [{ itemKey: 'i1', label: 'first' }] },
    { type: 'toolbar', id: 'tb', children: [{ type: 'button', id: 'b', label: 'Go' }] },
    { type: 'status', id: 's', text: 'ready' },
    { type: 'divider', id: 'd' },
  ],
};

describe('PrimitiveNode', () => {
  it('renders the WT1 primitive subset', () => {
    const html = renderToStaticMarkup(<PrimitiveNode node={TREE} onAction={() => {}} />);
    expect(html).toContain('Open tickets');
    expect(html).toContain('Anna');
    expect(html).toContain('lume-table');
    expect(html).toContain('lume-prose');
    expect(html).toContain('ready');
  });

  it('renders skeleton state for loading tables', () => {
    const html = renderToStaticMarkup(
      <PrimitiveNode
        node={{ type: 'table', id: 't', loading: 'skeleton', columns: [], rows: [] }}
        onAction={() => {}}
      />,
    );
    expect(html).toContain('lume-skeleton');
  });

  it('renders choice options as a radio group and as a dropdown', () => {
    const radio = renderToStaticMarkup(
      <PrimitiveNode
        node={{
          type: 'choice',
          id: 'c1',
          label: 'Welcher Kurs?',
          options: [
            { value: 'heinemann', label: 'Manual Handling — Heinemann' },
            { value: 'mukran', label: 'Manual Handling — Mukran' },
          ],
        }}
        onAction={() => {}}
      />,
    );
    expect(radio).toContain('lume-choice-option');
    expect(radio).toContain('Welcher Kurs?');
    expect(radio).toContain('Mukran');

    const dropdown = renderToStaticMarkup(
      <PrimitiveNode
        node={{
          type: 'choice',
          id: 'c2',
          variant: 'dropdown',
          value: 'a',
          options: [{ value: 'a', label: 'A' }],
        }}
        onAction={() => {}}
      />,
    );
    expect(dropdown).toContain('lume-choice-select');
    expect(dropdown).toContain('<option');
  });

  it('renders the full core primitive set (input/toggle/form/menubar/tree/chart/image/progress)', () => {
    const html = renderToStaticMarkup(
      <PrimitiveNode
        node={{
          type: 'container',
          id: 'root',
          children: [
            { type: 'input', id: 'in', label: 'Name', placeholder: 'enter…', value: 'Anna' },
            { type: 'toggle', id: 'tg', label: 'Aktiv', value: true, variant: 'switch' },
            {
              type: 'form',
              id: 'f',
              title: 'Buchung',
              children: [{ type: 'button', id: 'fb', label: 'Speichern' }],
            },
            { type: 'menubar', id: 'mb', items: [{ id: 'm1', label: 'Datei' }] },
            {
              type: 'tree',
              id: 'tr',
              nodes: [{ itemKey: 'n1', label: 'Wurzel', children: [{ itemKey: 'n2', label: 'Blatt' }] }],
            },
            {
              type: 'chart',
              id: 'ch',
              chartType: 'bar',
              points: [{ pointKey: 'p1', label: 'Q1', value: 5 }],
            },
            { type: 'image', id: 'img', src: 'asset.png', altText: 'Bild' },
            { type: 'progress', id: 'pg', value: 0.5 },
          ],
        }}
        onAction={() => {}}
      />,
    );
    expect(html).toContain('lume-input-field');
    expect(html).toContain('lume-switch-track');
    expect(html).toContain('Buchung');
    expect(html).toContain('Datei');
    expect(html).toContain('Blatt');
    expect(html).toContain('lume-chart-bar-fill');
    expect(html).toContain('alt="Bild"');
    expect(html).toContain('width:50%');
  });

  it('renders a chart skeleton while loading instead of nothing', () => {
    const skeleton = renderToStaticMarkup(
      <PrimitiveNode
        node={{ type: 'chart', id: 'c', chartType: 'bar', loading: 'skeleton', points: [] }}
        onAction={() => {}}
      />,
    );
    expect(skeleton).toContain('lume-chart-skeleton');
    const empty = renderToStaticMarkup(
      <PrimitiveNode node={{ type: 'chart', id: 'c', chartType: 'bar', points: [] }} onAction={() => {}} />,
    );
    expect(empty).toContain('lume-chart-empty');
  });

  it('renders line and pie charts as SVG', () => {
    const points = [
      { pointKey: 'a', label: 'A', value: 1 },
      { pointKey: 'b', label: 'B', value: 3 },
    ];
    const line = renderToStaticMarkup(
      <PrimitiveNode node={{ type: 'chart', id: 'c', chartType: 'line', points }} onAction={() => {}} />,
    );
    expect(line).toContain('<polyline');
    const pie = renderToStaticMarkup(
      <PrimitiveNode node={{ type: 'chart', id: 'c', chartType: 'pie', points }} onAction={() => {}} />,
    );
    expect(pie).toContain('lume-chart-slice-1');
  });

  it('renders editor-group shells (media/canvas-region/timeline/vector-path)', () => {
    const html = renderToStaticMarkup(
      <PrimitiveNode
        node={{
          type: 'container',
          id: 'root',
          children: [
            { type: 'media', id: 'm', mediaType: 'audio', dataRef: { refId: 'r1' }, duration: 12300 },
            { type: 'canvas-region', id: 'cr', width: 64, height: 32, pixelFormat: 'rgba8' },
            {
              type: 'timeline',
              id: 'tl',
              tracks: [{ id: 't1', kind: 'video' }],
              timebase: { frameRate: 25 },
              duration: 1000,
              playhead: 500,
            },
            {
              type: 'vector-path',
              id: 'vp',
              points: [
                { x: 0, y: 0 },
                { x: 10, y: 10 },
              ],
              closed: true,
            },
          ],
        }}
        onAction={() => {}}
      />,
    );
    expect(html).toContain('12.3s');
    expect(html).toContain('width="64"');
    expect(html).toContain('lume-timeline-playhead');
    expect(html).toContain('Z');
  });

  it('strips stray markdown emphasis from text, heading and table cells (plain-text protocol)', () => {
    const html = renderToStaticMarkup(
      <PrimitiveNode
        node={{
          type: 'container',
          id: 'root',
          children: [
            { type: 'heading', id: 'h', content: '**Startdatum**' },
            { type: 'text', id: 't', content: '__wichtig__ und `code`' },
            {
              type: 'table',
              id: 'tb',
              columns: [{ fieldKey: 'a', label: 'A' }],
              rows: [{ rowKey: 'r1', cells: { a: '**15.06.2026** 09:00' } }],
            },
          ],
        }}
        onAction={() => {}}
      />,
    );
    expect(html).not.toContain('**');
    expect(html).toContain('Startdatum');
    expect(html).toContain('wichtig und code');
    expect(html).toContain('15.06.2026 09:00');
  });

  it('renders a defensive error box for an unknown type (validator is the real gate)', () => {
    const html = renderToStaticMarkup(<PrimitiveNode node={{ type: 'iframe' }} onAction={() => {}} />);
    expect(html).toContain('lume-unknown');
  });

  // visual-spec v0.4 §2.13/§2.14 — frameless-first + chrome budget
  it('root container renders frameless and suppresses its identity slot (§2.13/§2.14)', () => {
    const html = renderToStaticMarkup(<PrimitiveNode node={TREE} onAction={() => {}} root />);
    expect(html).toContain('lume-container--frameless');
    expect(html).not.toContain('lume-container-title');
    expect(html).not.toContain('>T<'); // the container title text never renders at root
    expect(html).toContain('Open tickets'); // headings are content — never suppressed
  });

  it('non-root containers keep their frame and identity slot', () => {
    const html = renderToStaticMarkup(<PrimitiveNode node={TREE} onAction={() => {}} />);
    expect(html).not.toContain('lume-container--frameless');
    expect(html).toContain('lume-container-title');
    expect(html).toContain('>T<');
  });

  it('root does not leak to children — only the first container is frameless', () => {
    const nested = {
      type: 'container',
      id: 'outer',
      title: 'Outer',
      children: [{ type: 'container', id: 'inner', title: 'Card', children: [] }],
    };
    const html = renderToStaticMarkup(<PrimitiveNode node={nested} onAction={() => {}} root />);
    const frameless = html.match(/lume-container--frameless/g) ?? [];
    expect(frameless.length).toBe(1);
    expect(html).toContain('Card'); // depth-3 card keeps its identity slot
    expect(html).not.toContain('Outer');
  });

  it('root passes through tabs to the active child (non-surface wrapper)', () => {
    const tabbed = {
      type: 'tabs',
      id: 'tabs',
      tabs: [
        {
          label: 'Wizard',
          child: { type: 'container', id: 'wiz', title: 'X Studio', children: [] },
        },
      ],
    };
    const html = renderToStaticMarkup(<PrimitiveNode node={tabbed} onAction={() => {}} root />);
    expect(html).toContain('lume-container--frameless');
    expect(html).not.toContain('X Studio');
  });
});
