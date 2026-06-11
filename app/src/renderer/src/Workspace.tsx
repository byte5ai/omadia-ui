import { useRef, type ReactNode } from 'react';
import { clampRatio, type SplitDir, type WorkspaceNode } from './store/workspaceStore.js';

interface Props {
  layout: WorkspaceNode;
  activeSlotId: string;
  busySlotIds: ReadonlySet<string>;
  /** false when the layout is a single leaf — the last pane cannot close */
  canClose: boolean;
  paneTitle: (slotId: string) => string;
  renderPane: (slotId: string) => ReactNode;
  onFocus: (slotId: string) => void;
  onSplit: (slotId: string, dir: SplitDir) => void;
  onClose: (slotId: string) => void;
  onRatioChange: (path: string, ratio: number) => void;
}

/** Tiling workspace (issue #14): renders the binary split tree as nested
 *  flex rows/columns with draggable dividers. Every pane is an independent
 *  canvas; the FOCUSED pane (lit ring) is where turns and beam input go. */
export function Workspace(props: Props): ReactNode {
  return <Node node={props.layout} path="" {...props} />;
}

function Node({ node, path, ...props }: Props & { node: WorkspaceNode; path: string }): ReactNode {
  const splitRef = useRef<HTMLDivElement>(null);

  if (node.kind === 'leaf') {
    const { slotId } = node;
    const focused = slotId === props.activeSlotId;
    return (
      <section
        className={`lume-workspace-pane${focused ? ' lume-workspace-pane-focused' : ''}`}
        onMouseDownCapture={() => {
          if (!focused) props.onFocus(slotId);
        }}
      >
        <header className="lume-pane-bar">
          <span
            className={`lume-pane-bar-title${
              props.busySlotIds.has(slotId) ? ' lume-pane-bar-busy' : ''
            }`}
          >
            {props.paneTitle(slotId)}
          </span>
          <span className="lume-pane-bar-actions">
            <button type="button" title="Neue Spalte (Canvas rechts daneben)" onClick={() => props.onSplit(slotId, 'columns')}>
              ◫
            </button>
            <button type="button" title="Neue Zeile (Canvas darunter)" onClick={() => props.onSplit(slotId, 'rows')}>
              ⊟
            </button>
            {props.canClose && (
              <button type="button" title="Pane schließen" onClick={() => props.onClose(slotId)}>
                ✕
              </button>
            )}
          </span>
        </header>
        <div className="lume-workspace-pane-body">{props.renderPane(slotId)}</div>
      </section>
    );
  }

  const horizontal = node.dir === 'columns';
  const onDividerPointerDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    const container = splitRef.current;
    if (!container) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const rect = container.getBoundingClientRect();
    const move = (ev: PointerEvent): void => {
      const ratio = horizontal
        ? (ev.clientX - rect.left) / rect.width
        : (ev.clientY - rect.top) / rect.height;
      props.onRatioChange(path, clampRatio(ratio));
    };
    const up = (): void => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <div
      ref={splitRef}
      className="lume-workspace-split"
      style={{ flexDirection: horizontal ? 'row' : 'column' }}
    >
      <div className="lume-workspace-cell" style={{ flexBasis: `${node.ratio * 100}%` }}>
        <Node node={node.a} path={`${path}a`} {...props} />
      </div>
      <div
        className={`lume-workspace-divider lume-workspace-divider-${node.dir}`}
        onPointerDown={onDividerPointerDown}
      />
      <div className="lume-workspace-cell" style={{ flexBasis: `${(1 - node.ratio) * 100}%` }}>
        <Node node={node.b} path={`${path}b`} {...props} />
      </div>
    </div>
  );
}
