import { useState, type JSX, type ReactNode } from 'react';

/** A validated primitive-tree node. The Ajv whitelist runs BEFORE render;
 *  this component trusts the shape but still fails soft on the unexpected. */
export type PrimitiveJson = { type: string; [key: string]: unknown };

export interface PrimitiveAction {
  type: string;
  payload?: unknown;
  sourceId?: string;
}

/** agent-pre-supplied suggestion (protocol commonTraits.suggestedActions) —
 *  surfaced in the context-invoke panel; `prompt` pre-fills the beam field. */
export interface SuggestedActionJson {
  id: string;
  label: string;
  target: unknown;
  prompt?: string;
}

/** right-click on a data row — the host opens the context-invoke action
 *  panel (deterministic affordances + suggestedActions + beam field). */
export interface RowMenuRequest {
  tableId: string;
  rowKey: string;
  cells: Record<string, unknown>;
  x: number;
  y: number;
  suggestedActions: SuggestedActionJson[];
}

/** the target a pending beam is pinned to (concept §Beam lifecycle) */
export interface BeamTarget {
  containerId: string;
  rowKey: string;
}

/** visual-spec §3.5/§6.1: which nodes a patch touched — they condense in */
export interface CondenseInfo {
  ids: ReadonlySet<string>;
  revision: string;
  rapid: boolean;
}

interface Props {
  node: PrimitiveJson;
  onAction: (action: PrimitiveAction) => void;
  onRowMenu?: (req: RowMenuRequest) => void;
  condense?: CondenseInfo;
  beamTarget?: BeamTarget | null;
}

/** schema style-trait enum → Lume theme classes (clipped — tokens only) */
const styleClasses = (node: PrimitiveJson): string => {
  const style = Array.isArray(node['style']) ? (node['style'] as string[]) : [];
  return [
    style.includes('prose') ? 'lume-prose' : '',
    style.includes('mono') ? 'lume-mono' : '',
    style.includes('accent') ? 'lume-accent' : '',
    style.includes('no-accent') ? 'lume-no-accent' : '',
    style.includes('compact') ? 'lume-compact' : '',
    style.includes('spacious') ? 'lume-spacious' : '',
    style.includes('center-glyph') ? 'lume-center-glyph' : '',
  ]
    .filter(Boolean)
    .join(' ');
};

const children = (node: PrimitiveJson, ctx: Omit<Props, 'node'>): ReactNode =>
  Array.isArray(node['children'])
    ? (node['children'] as PrimitiveJson[]).map((c, i) => (
        <PrimitiveNode key={(c['id'] as string) ?? i} node={c} {...ctx} />
      ))
    : null;

/** `tabs` keeps its active index client-side (view state, not canvas state). */
function TabsNode({ node, ...ctx }: Props): ReactNode {
  const tabs = (node['tabs'] as Array<{ label: string; child: PrimitiveJson }>) ?? [];
  const initial = Math.min(Math.max(Number(node['activeStep'] ?? 0), 0), Math.max(tabs.length - 1, 0));
  const [active, setActive] = useState(initial);
  if (tabs.length === 0) return null;
  const current = tabs.at(Math.min(active, tabs.length - 1));
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
      {current && <PrimitiveNode node={current.child} {...ctx} />}
    </div>
  );
}

function renderNode(node: PrimitiveJson, ctx: Omit<Props, 'node'>): ReactNode {
  const { onAction, onRowMenu, beamTarget } = ctx;
  switch (node.type) {
    case 'container':
      return (
        <section className={`lume-container ${styleClasses(node)}`} data-id={node['id'] as string}>
          {typeof node['title'] === 'string' && (
            <div className="lume-container-title">{node['title']}</div>
          )}
          <div className={`lume-layout-${(node['layout'] as string) ?? 'stack'}`}>
            {children(node, ctx)}
          </div>
        </section>
      );

    case 'pane':
      return (
        <section className="lume-pane" data-id={node['id'] as string}>
          {typeof node['title'] === 'string' && <div className="lume-container-title">{node['title']}</div>}
          {node['container'] !== undefined && (
            <PrimitiveNode node={node['container'] as PrimitiveJson} {...ctx} />
          )}
          {children(node, ctx)}
        </section>
      );

    case 'tabs':
      return <TabsNode node={node} {...ctx} />;

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
      const tableId = (node['id'] as string) ?? '';
      const suggestedActions = Array.isArray(node['suggestedActions'])
        ? (node['suggestedActions'] as SuggestedActionJson[])
        : [];
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
              : rows.map((r) => {
                  // a pending beam sticks visibly to its target row
                  const beamed =
                    beamTarget !== null &&
                    beamTarget !== undefined &&
                    beamTarget.containerId === tableId &&
                    beamTarget.rowKey === r.rowKey;
                  const rowClass = [
                    onRowMenu ? 'lume-row-interactive' : '',
                    beamed ? 'lume-row-beamed' : '',
                  ]
                    .filter(Boolean)
                    .join(' ');
                  return (
                    <tr
                      key={r.rowKey}
                      data-row-key={r.rowKey}
                      className={rowClass === '' ? undefined : rowClass}
                      onContextMenu={(e) => {
                        if (!onRowMenu) return;
                        e.preventDefault();
                        onRowMenu({
                          tableId,
                          rowKey: r.rowKey,
                          cells: r.cells,
                          x: e.clientX,
                          y: e.clientY,
                          suggestedActions,
                        });
                      }}
                    >
                      {cols.map((c) => (
                        <td key={c.fieldKey}>{String(r.cells[c.fieldKey] ?? '')}</td>
                      ))}
                    </tr>
                  );
                })}
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
          {children(node, ctx)}
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

export function PrimitiveNode({ node, ...ctx }: Props): ReactNode {
  const rendered = renderNode(node, ctx);
  const id = node['id'];
  // §3.5 patch-condensation: nodes a patch touched condense into existence.
  // The revision-derived key remounts only the changed subtree, so the
  // animation re-triggers per patch while untouched siblings keep their state.
  if (ctx.condense && typeof id === 'string' && ctx.condense.ids.has(id)) {
    return (
      <div
        key={`condense-${ctx.condense.revision}`}
        className={`lume-condense${ctx.condense.rapid ? ' lume-condense-fast' : ''}`}
      >
        {rendered}
      </div>
    );
  }
  return rendered;
}
