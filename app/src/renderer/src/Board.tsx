import {
  useRef,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type WheelEvent,
} from 'react';
import {
  moveApp,
  panBy,
  resizeApp,
  zoomAt,
  type AppGeom,
  type BoardState,
} from './store/boardStore.js';

interface BoardApp {
  slotId: string;
  title: string;
  color: number;
}

interface Props {
  board: BoardState;
  setBoard: (updater: (b: BoardState) => BoardState) => void;
  apps: BoardApp[];
  activeSlotId: string;
  busySlotIds: ReadonlySet<string>;
  /** false when only one app remains — the last app cannot be deleted away */
  canDelete: boolean;
  /** per-app chrome (back/refresh), rendered in the frame title bar */
  paneBarExtras?: (slotId: string) => ReactNode;
  /** the existing per-canvas body: primitive tree, hoisted menu, beam target */
  renderApp: (slotId: string) => ReactNode;
  onFocus: (slotId: string) => void;
  /** create a new app; anchor is a board-space point (double-click) or absent */
  onAddApp: (anchor?: { x: number; y: number }) => void;
  onDeleteApp: (slotId: string) => void;
}

/** The fluid Board (Miro idiom): one infinite, pannable, zoomable surface that
 *  replaces the Sidebar + Desktops + split-tree tiling. Every app is a free-
 *  floating frame placed in board space and projected through a single
 *  translate()/scale() transform. Pan/zoom/drag/resize are pure Tier-1 view-
 *  state — they never emit a turn (CONCEPT Authority Model, Class A). */
export function Board(props: Props): ReactNode {
  const { board, setBoard } = props;
  const surfaceRef = useRef<HTMLDivElement>(null);
  // live drag bookkeeping kept in a ref so a pan/move/resize gesture does not
  // re-render every pointermove — only the board-state setter does.
  const drag = useRef<{ mode: 'pan' | 'move' | 'resize'; slotId?: string; lastX: number; lastY: number } | null>(null);

  /** screen point relative to the board element (for zoom-toward-cursor). */
  const screenPoint = (clientX: number, clientY: number): { x: number; y: number } => {
    const rect = surfaceRef.current?.getBoundingClientRect();
    return { x: clientX - (rect?.left ?? 0), y: clientY - (rect?.top ?? 0) };
  };

  /** convert a screen point to a board-space coordinate. */
  const toBoard = (clientX: number, clientY: number): { x: number; y: number } => {
    const s = screenPoint(clientX, clientY);
    return { x: s.x / board.zoom + board.pan.x, y: s.y / board.zoom + board.pan.y };
  };

  const endDrag = (): void => {
    drag.current = null;
    window.removeEventListener('pointermove', onWindowMove);
    window.removeEventListener('pointerup', endDrag);
  };

  const onWindowMove = (e: PointerEvent): void => {
    const d = drag.current;
    if (!d) return;
    const dxScreen = e.clientX - d.lastX;
    const dyScreen = e.clientY - d.lastY;
    d.lastX = e.clientX;
    d.lastY = e.clientY;
    if (d.mode === 'pan') {
      setBoard((b) => panBy(b, dxScreen, dyScreen));
    } else if (d.mode === 'move' && d.slotId) {
      setBoard((b) => moveApp(b, d.slotId as string, dxScreen / b.zoom, dyScreen / b.zoom));
    } else if (d.mode === 'resize' && d.slotId) {
      setBoard((b) => resizeApp(b, d.slotId as string, dxScreen / b.zoom, dyScreen / b.zoom));
    }
  };

  const beginDrag = (mode: 'pan' | 'move' | 'resize', e: ReactPointerEvent, slotId?: string): void => {
    drag.current = { mode, slotId, lastX: e.clientX, lastY: e.clientY };
    window.addEventListener('pointermove', onWindowMove);
    window.addEventListener('pointerup', endDrag);
  };

  // background press → pan (only when the press lands on the surface itself,
  // never on a frame — frames stop propagation for their own gestures).
  const onSurfacePointerDown = (e: ReactPointerEvent): void => {
    if (e.button !== 0) return;
    if (e.target !== e.currentTarget) return;
    beginDrag('pan', e);
  };

  const onSurfaceDoubleClick = (e: ReactMouseEvent): void => {
    if (e.target !== e.currentTarget) return;
    props.onAddApp(toBoard(e.clientX, e.clientY));
  };

  const onWheel = (e: WheelEvent): void => {
    if (e.ctrlKey || e.metaKey) {
      // pinch-zoom / ⌘-wheel → zoom toward the cursor (deliberate gesture,
      // works anywhere on the board including over a frame).
      const factor = Math.exp(-e.deltaY * 0.0015);
      setBoard((b) => zoomAt(b, factor, screenPoint(e.clientX, e.clientY)));
      return;
    }
    // Plain wheel INSIDE an app frame's body scrolls that box natively — the
    // board must NEVER pan along (scrolling a box must not move the canvas).
    // Only pan when the wheel is over the bare board surface.
    if ((e.target as HTMLElement)?.closest?.('.lume-app-frame-body')) return;
    setBoard((b) => panBy(b, -e.deltaX, -e.deltaY));
  };

  const frameStyle = (g: AppGeom): React.CSSProperties => ({
    transform: `translate(${g.x}px, ${g.y}px)`,
    width: g.w,
    height: g.h,
  });

  return (
    <div
      ref={surfaceRef}
      className="lume-board"
      onPointerDown={onSurfacePointerDown}
      onDoubleClick={onSurfaceDoubleClick}
      onWheel={onWheel}
    >
      <div
        className="lume-board-content"
        style={{ transform: `translate(${-board.pan.x * board.zoom}px, ${-board.pan.y * board.zoom}px) scale(${board.zoom})` }}
      >
        {props.apps.map((app) => {
          const g = board.apps[app.slotId];
          if (!g) return null;
          const focused = app.slotId === props.activeSlotId;
          const busy = props.busySlotIds.has(app.slotId);
          return (
            <section
              key={app.slotId}
              className={`lume-app-frame${focused ? ' lume-app-frame-focused' : ''}`}
              style={frameStyle(g)}
              // focus on any press inside the frame (mirrors the old pane), but
              // DRAG only via the title bar so beams/long-press stay intact.
              onPointerDownCapture={() => {
                if (!focused) props.onFocus(app.slotId);
              }}
            >
              <header
                className={`lume-app-frame-bar${busy ? ' lume-app-frame-busy' : ''}`}
                onPointerDown={(e) => {
                  if (e.button !== 0) return;
                  e.stopPropagation();
                  beginDrag('move', e, app.slotId);
                }}
              >
                <span className={`lume-sidebar-dot lume-canvas-dot-${app.color}`} aria-hidden />
                <span className="lume-app-frame-title" title={app.title}>
                  {app.title}
                </span>
                <span className="lume-app-frame-actions" onPointerDown={(e) => e.stopPropagation()}>
                  {props.paneBarExtras?.(app.slotId)}
                  {props.canDelete && (
                    <button
                      type="button"
                      title="App schließen (Canvas löschen)"
                      onClick={() => props.onDeleteApp(app.slotId)}
                    >
                      ✕
                    </button>
                  )}
                </span>
              </header>
              <div className="lume-app-frame-body">{props.renderApp(app.slotId)}</div>
              <div
                className="lume-app-frame-resize"
                title="Größe ändern"
                onPointerDown={(e) => {
                  if (e.button !== 0) return;
                  e.stopPropagation();
                  beginDrag('resize', e, app.slotId);
                }}
              />
            </section>
          );
        })}
      </div>
      {/* floating new-app affordance — discoverable without the double-click */}
      <button
        type="button"
        className="lume-board-add"
        title="Neue App (oder Doppelklick auf die Fläche)"
        onClick={() => props.onAddApp()}
      >
        +
      </button>
    </div>
  );
}
