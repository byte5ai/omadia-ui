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
});
