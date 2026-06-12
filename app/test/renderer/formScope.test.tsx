import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { PrimitiveNode } from '../../src/renderer/src/render/PrimitiveNode.js';
import { createCanvasFormStore } from '../../src/renderer/src/render/formContext.js';

// The renderer test env is node + static (renderToStaticMarkup) — no jsdom /
// react-test-renderer (removed in React 19). So the COLLECTION CORE is unit-
// tested directly, and rendering is asserted statically; the interactive
// collect→onAction(fields) path is verified live (wizard → Generieren).
describe('canvas form-value collection', () => {
  it('createCanvasFormStore set/collect aggregates field values by id (last write wins)', () => {
    const store = createCanvasFormStore();
    store.set('f-channel', 'x');
    store.set('f-source-note', 'release notes');
    store.set('f-channel', 'linkedin');
    expect(store.collect()).toEqual({
      'f-channel': 'linkedin',
      'f-source-note': 'release notes',
    });
    // this object is exactly what a ButtonNode inside a form submits under `fields`.
  });

  it('renders a form with controls + a submit button without crashing', () => {
    const tree = {
      type: 'form',
      id: 'wizard-form',
      title: 'Konfiguration',
      children: [
        {
          type: 'choice',
          id: 'f-channel',
          label: 'Kanal',
          variant: 'dropdown',
          value: 'x',
          options: [{ value: 'x', label: 'X' }],
        },
        { type: 'input', id: 'f-source-note', label: 'Quelle', placeholder: '…' },
        {
          type: 'button',
          id: 'wizard-generate',
          label: 'Varianten generieren',
          action: { type: 'x_studio_generate_variants', payload: { form: 'wizard-form' } },
        },
      ],
    };
    const html = renderToStaticMarkup(<PrimitiveNode node={tree} onAction={() => {}} />);
    expect(html).toContain('lume-form');
    expect(html).toContain('Varianten generieren');
    expect(html).toContain('data-id="f-channel"');
    expect(html).toContain('data-id="f-source-note"');
  });

  it('a standalone button (no form) still renders', () => {
    const html = renderToStaticMarkup(
      <PrimitiveNode
        node={{ type: 'button', id: 'b', label: 'Go', action: { type: 'noop' } }}
        onAction={() => {}}
      />,
    );
    expect(html).toContain('lume-button');
    expect(html).toContain('Go');
  });
});
