import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Board } from '../../src/renderer/src/Board.js';
import type { BoardState } from '../../src/renderer/src/store/boardStore.js';

const BOARD: BoardState = {
  pan: { x: 50, y: 0 },
  zoom: 2,
  apps: {
    a: { x: 10, y: 20, w: 300, h: 200 },
    b: { x: 400, y: 80, w: 360, h: 260 },
  },
};

const baseProps = {
  board: BOARD,
  setBoard: () => undefined,
  apps: [
    { slotId: 'a', title: 'Alpha', color: 0 },
    { slotId: 'b', title: 'Beta', color: 1 },
  ],
  activeSlotId: 'a',
  busySlotIds: new Set<string>(),
  canDelete: true,
  renderApp: (slotId: string) => <div className={`body-${slotId}`}>content {slotId}</div>,
  onFocus: () => undefined,
  onAddApp: () => undefined,
  onDeleteApp: () => undefined,
};

describe('Board — fluid Miro-like surface', () => {
  it('renders one frame per app at its board-space position', () => {
    const html = renderToStaticMarkup(<Board {...baseProps} />);
    expect(html).toContain('translate(10px, 20px)'); // app a geometry
    expect(html).toContain('translate(400px, 80px)'); // app b geometry — distinct
    expect(html).toContain('lume-app-frame');
  });

  it('projects every frame through one pan/zoom content transform', () => {
    const html = renderToStaticMarkup(<Board {...baseProps} />);
    // content layer: translate(-pan.x*zoom, -pan.y*zoom) scale(zoom) = -100px, scale(2)
    expect(html).toContain('translate(-100px, 0px) scale(2)');
    expect(html).toContain('lume-board-content');
  });

  it('marks the focused app and renders each app body via renderApp', () => {
    const html = renderToStaticMarkup(<Board {...baseProps} />);
    expect(html).toContain('lume-app-frame-focused'); // app a is active
    expect(html).toContain('content a');
    expect(html).toContain('content b');
  });

  it('exposes a new-app affordance and per-app delete when more than one app', () => {
    const html = renderToStaticMarkup(<Board {...baseProps} />);
    expect(html).toContain('lume-board-add');
    expect(html).toContain('App schließen');
  });

  it('hides the delete affordance when only one app remains (last app stays)', () => {
    const html = renderToStaticMarkup(
      <Board
        {...baseProps}
        canDelete={false}
        apps={[{ slotId: 'a', title: 'Alpha', color: 0 }]}
        board={{ pan: { x: 0, y: 0 }, zoom: 1, apps: { a: { x: 0, y: 0, w: 300, h: 200 } } }}
      />,
    );
    expect(html).not.toContain('App schließen');
  });
});
