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

  it('renders a defensive error box for an unknown type (validator is the real gate)', () => {
    const html = renderToStaticMarkup(<PrimitiveNode node={{ type: 'iframe' }} onAction={() => {}} />);
    expect(html).toContain('lume-unknown');
  });
});
