import { useState, type JSX, type ReactNode } from 'react';

/** A validated primitive-tree node. The Ajv whitelist runs BEFORE render;
 *  this component trusts the shape but still fails soft on the unexpected. */
export type PrimitiveJson = { type: string; [key: string]: unknown };

export interface PrimitiveAction {
  type: string;
  payload?: unknown;
  sourceId?: string;
}

/** right-click on a data row — the host opens the Lume context menu. */
export interface RowMenuRequest {
  tableId: string;
  rowKey: string;
  cells: Record<string, unknown>;
  x: number;
  y: number;
}

interface Props {
  node: PrimitiveJson;
  onAction: (action: PrimitiveAction) => void;
  onRowMenu?: (req: RowMenuRequest) => void;
}

const styleClasses = (node: PrimitiveJson): string => {
  const style = Array.isArray(node['style']) ? (node['style'] as string[]) : [];
  return [
    style.includes('prose') ? 'lume-prose' : '',
    style.includes('mono') ? 'lume-mono' : '',
    style.includes('accent') ? 'lume-accent' : '',
    style.includes('compact') ? 'lume-compact' : '',
  ]
    .filter(Boolean)
    .join(' ');
};

const children = (
  node: PrimitiveJson,
  onAction: Props['onAction'],
  onRowMenu?: Props['onRowMenu'],
): ReactNode =>
  Array.isArray(node['children'])
    ? (node['children'] as PrimitiveJson[]).map((c, i) => (
        <PrimitiveNode key={(c['id'] as string) ?? i} node={c} onAction={onAction} onRowMenu={onRowMenu} />
      ))
    : null;

/** `tabs` keeps its active index client-side (view state, not canvas state). */
function TabsNode({ node, onAction, onRowMenu }: Props): ReactNode {
  const tabs = (node['tabs'] as Array<{ label: string; child: PrimitiveJson }>) ?? [];
  const initial = Math.min(Math.max(Number(node['activeStep'] ?? 0), 0), Math.max(tabs.length - 1, 0));
  const [active, setActive] = useState(initial);
  if (tabs.length === 0) return null;
  const current = tabs[Math.min(active, tabs.length - 1)];
  return (
    <div className="lume-tabs" data-id={node['id'] as string}>
      <div className="lume-tabs-bar">
        {tabs.map((t, i) => (
          <button
            key={i}
            type="button"
            className={`lume-tab${i === active ? ' lume-tab-active' : ''}`}
            onClick={() => setActive(i)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {current && <PrimitiveNode node={current.child} onAction={onAction} onRowMenu={onRowMenu} />}
    </div>
  );
}

export function PrimitiveNode({ node, onAction, onRowMenu }: Props): ReactNode {
  switch (node.type) {
    case 'container':
      return (
        <section className={`lume-container ${styleClasses(node)}`} data-id={node['id'] as string}>
          {typeof node['title'] === 'string' && (
            <div className="lume-container-title">{node['title']}</div>
          )}
          <div className={`lume-layout-${(node['layout'] as string) ?? 'stack'}`}>
            {children(node, onAction, onRowMenu)}
          </div>
        </section>
      );

    case 'pane':
      return (
        <section className="lume-pane" data-id={node['id'] as string}>
          {typeof node['title'] === 'string' && <div className="lume-container-title">{node['title']}</div>}
          {node['container'] !== undefined && (
            <PrimitiveNode node={node['container'] as PrimitiveJson} onAction={onAction} onRowMenu={onRowMenu} />
          )}
          {children(node, onAction, onRowMenu)}
        </section>
      );

    case 'tabs':
      return <TabsNode node={node} onAction={onAction} onRowMenu={onRowMenu} />;

    case 'heading': {
      const level = Math.min(Math.max(Number(node['level'] ?? 2), 1), 6);
      const Tag = `h${level}` as keyof JSX.IntrinsicElements;
      return <Tag className="lume-heading">{node['content'] as string}</Tag>;
    }

    case 'text':
      return <p className={`lume-text ${styleClasses(node)}`}>{(node['content'] as string) ?? ''}</p>;

    case 'table': {
      const cols = (node['columns'] as Array<{ fieldKey: string; label: string }>) ?? [];
      const rows = (node['rows'] as Array<{ rowKey: string; cells: Record<string, unknown> }>) ?? [];
      const skeleton = node['loading'] === 'skeleton';
      return (
        <table className={`lume-table ${skeleton ? 'lume-skeleton' : ''}`} data-id={node['id'] as string}>
          <thead>
            <tr>
              {cols.map((c) => (
                <th key={c.fieldKey}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {skeleton && rows.length === 0
              ? [0, 1, 2].map((i) => (
                  <tr key={i}>
                    {cols.map((c) => (
                      <td key={c.fieldKey}>
                        <span className="lume-skeleton-cell" />
                      </td>
                    ))}
                  </tr>
                ))
              : rows.map((r) => (
                  <tr
                    key={r.rowKey}
                    data-row-key={r.rowKey}
                    className={onRowMenu ? 'lume-row-interactive' : undefined}
                    onContextMenu={(e) => {
                      if (!onRowMenu) return;
                      e.preventDefault();
                      onRowMenu({
                        tableId: (node['id'] as string) ?? '',
                        rowKey: r.rowKey,
                        cells: r.cells,
                        x: e.clientX,
                        y: e.clientY,
                      });
                    }}
                  >
                    {cols.map((c) => (
                      <td key={c.fieldKey}>{String(r.cells[c.fieldKey] ?? '')}</td>
                    ))}
                  </tr>
                ))}
          </tbody>
        </table>
      );
    }

    case 'list': {
      const items = (node['items'] as Array<{ itemKey: string; label?: string }>) ?? [];
      return (
        <ul className="lume-list" data-id={node['id'] as string}>
          {items.map((i) => (
            <li key={i.itemKey} data-item-key={i.itemKey}>
              {i.label ?? i.itemKey}
            </li>
          ))}
        </ul>
      );
    }

    case 'toolbar':
      return (
        <div className="lume-toolbar" data-id={node['id'] as string}>
          {children(node, onAction, onRowMenu)}
        </div>
      );

    case 'button': {
      const action = node['action'] as { type?: string; payload?: unknown } | undefined;
      return (
        <button
          type="button"
          className={`lume-button ${styleClasses(node)}`}
          onClick={() =>
            action?.type &&
            onAction({ type: action.type, payload: action.payload, sourceId: node['id'] as string })
          }
        >
          {node['label'] as string}
        </button>
      );
    }

    case 'status':
      return (
        <div className="lume-status" data-id={node['id'] as string}>
          {(node['text'] as string) ?? ''}
        </div>
      );

    case 'divider':
      return <hr className="lume-divider" />;

    default:
      // Unreachable for validated trees — defensive, never throws mid-render.
      return <div className="lume-unknown">unsupported primitive: {node.type}</div>;
  }
}
