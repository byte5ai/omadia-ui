import { useRef, useState, type JSX, type ReactNode } from 'react';
import { ChoiceNode, InputNode, ToggleNode } from './controlNodes.js';
import { ChartNode, TreePrimitiveNode } from './dataNodes.js';
import { CanvasRegionNode, MediaNode, TimelineNode, VectorPathNode } from './editorNodes.js';
import { CanvasFormContext, createCanvasFormStore, useCanvasForm } from './formContext.js';
import { SceneNode } from './SceneNode.js';
import { LumenNode } from './lumen/LumenNode.js';

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
  /** visual-spec §2.13/§2.14 (v0.4): tree root inside a pane. The pane
   *  already IS the content's surface — the first container renders
   *  frameless, and its identity slot yields to the pane-bar (slot rule,
   *  never string comparison). Not inherited by children; propagated only
   *  through non-surface wrappers (tabs). */
  root?: boolean;
  /** §2.15 root-toolbar hoisting: id of the root toolbar the host renders
   *  as the static pane menu — its inline copy is suppressed at root level */
  hoistedMenuId?: string;
}

/** protocol §2: canvas content is PLAIN TEXT — agents still leak markdown
 *  emphasis into values. Strip the inline markers defensively, keep the text. */
const stripMd = (s: string): string =>
  s
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1');

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

/** schema `tone` severity hint → Lume status-colour class. neutral/absent → none. */
const toneClass = (node: PrimitiveJson): string => {
  const tone = node['tone'];
  return typeof tone === 'string' && tone !== 'neutral' ? `lume-tone-${tone}` : '';
};

/** Combine style tokens + tone into a single className fragment. */
const presentationClasses = (node: PrimitiveJson): string =>
  [styleClasses(node), toneClass(node)].filter(Boolean).join(' ');

const children = (node: PrimitiveJson, ctx: Omit<Props, 'node'>): ReactNode =>
  Array.isArray(node['children'])
    ? (node['children'] as PrimitiveJson[]).map((c, i) => (
        <PrimitiveNode key={(c['id'] as string) ?? i} node={c} {...ctx} />
      ))
    : null;

/** §2.13 page-surface descent: inside a frameless container, a LONE
 *  container/pane child whose siblings are all chrome (toolbar/tabs/
 *  status/divider) is still "the first container" — frameless, identity
 *  suppressed. Content siblings make it a card and stop the descent. */
const CHROME_SIBLINGS = new Set(['toolbar', 'tabs', 'status', 'divider']);
const pageSurfaceChild = (node: PrimitiveJson): PrimitiveJson | null => {
  if (!Array.isArray(node['children'])) return null;
  let page: PrimitiveJson | null = null;
  for (const c of node['children'] as PrimitiveJson[]) {
    if (c.type === 'container' || c.type === 'pane') {
      if (page !== null) return null; // two surfaces → cards, keep frames
      page = c;
    } else if (!CHROME_SIBLINGS.has(c.type)) {
      return null; // content sibling → the container is a card
    }
  }
  return page;
};

/** children of a frameless root container — the page-surface child (if any)
 *  inherits root, every other child renders normally. The hoisted app menu
 *  (§2.15) is skipped: the host already renders it as static pane chrome. */
const rootChildren = (node: PrimitiveJson, ctx: Omit<Props, 'node'>): ReactNode => {
  const page = pageSurfaceChild(node);
  return Array.isArray(node['children'])
    ? (node['children'] as PrimitiveJson[])
        .filter((c) => !(ctx.hoistedMenuId !== undefined && c['id'] === ctx.hoistedMenuId))
        .map((c, i) => (
          <PrimitiveNode key={(c['id'] as string) ?? i} node={c} {...ctx} root={c === page} />
        ))
    : null;
};

/** `tabs` keeps its active index client-side (view state, not canvas state). */
function TabsNode({ node, root, ...ctx }: Props): ReactNode {
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
      {current && <PrimitiveNode node={current.child} {...ctx} root={root} />}
    </div>
  );
}

/** `form` collects descendant control values for a single submit action. */
function FormNode({ node, ...ctx }: Props): ReactNode {
  const store = useRef(createCanvasFormStore()).current;
  return (
    <CanvasFormContext.Provider value={store}>
      <form
        className="lume-form"
        data-id={node['id'] as string}
        onSubmit={(e) => e.preventDefault()}
      >
        {typeof node['title'] === 'string' && (
          <div className="lume-container-title">{node['title']}</div>
        )}
        {children(node, ctx)}
      </form>
    </CanvasFormContext.Provider>
  );
}

/** `button` keeps standalone turn semantics, or submits the nearest form snapshot. */
function ButtonNode({ node, onAction }: Pick<Props, 'node' | 'onAction'>): ReactNode {
  const form = useCanvasForm();
  const action = node['action'] as { type?: string; payload?: unknown } | undefined;
  return (
    <button
      type="button"
      className={`lume-button ${styleClasses(node)}`}
      onClick={() => {
        if (!action?.type) return;
        if (form) {
          onAction({
            type: action.type,
            payload: { ...(action.payload as object), fields: form.collect() },
            sourceId: node['id'] as string,
          });
          return;
        }
        onAction({ type: action.type, payload: action.payload, sourceId: node['id'] as string });
      }}
    >
      {node['label'] as string}
    </button>
  );
}

function renderNode(node: PrimitiveJson, ctx: Omit<Props, 'node' | 'root'>, root: boolean): ReactNode {
  const { onAction, onRowMenu, beamTarget } = ctx;
  switch (node.type) {
    case 'container':
      // §2.13 frameless-first: the top-level container paints no frame of
      // its own — the pane is its surface. §2.14 chrome budget: its
      // identity slot is suppressed; the pane-bar owns the identity.
      return (
        <section
          className={`lume-container${root ? ' lume-container--frameless' : ''} ${styleClasses(node)}`}
          data-id={node['id'] as string}
        >
          {!root && typeof node['title'] === 'string' && (
            <div className="lume-container-title">{node['title']}</div>
          )}
          <div className={`lume-layout-${(node['layout'] as string) ?? 'stack'}`}>
            {root ? rootChildren(node, ctx) : children(node, ctx)}
          </div>
        </section>
      );

    case 'pane':
      return (
        <section
          className={`lume-pane${root ? ' lume-container--frameless' : ''} ${presentationClasses(node)}`.trim()}
          data-id={node['id'] as string}
        >
          {!root && typeof node['title'] === 'string' && (
            <div className="lume-container-title">{node['title']}</div>
          )}
          {node['container'] !== undefined && (
            <PrimitiveNode node={node['container'] as PrimitiveJson} {...ctx} />
          )}
          {children(node, ctx)}
        </section>
      );

    case 'tabs':
      // tabs is a non-surface wrapper — root passes through to the active child.
      return <TabsNode node={node} {...ctx} root={root} />;

    case 'heading': {
      const level = Math.min(Math.max(Number(node['level'] ?? 2), 1), 6);
      const Tag = `h${level}` as keyof JSX.IntrinsicElements;
      return <Tag className="lume-heading">{stripMd((node['content'] as string) ?? '')}</Tag>;
    }

    case 'text':
      return <p className={`lume-text ${styleClasses(node)}`}>{stripMd((node['content'] as string) ?? '')}</p>;

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
                        <td key={c.fieldKey}>{stripMd(String(r.cells[c.fieldKey] ?? ''))}</td>
                      ))}
                    </tr>
                  );
                })}
          </tbody>
        </table>
      );
    }

    case 'list': {
      const items =
        (node['items'] as Array<{ itemKey: string; label?: string; tone?: string }>) ?? [];
      return (
        <ul className={`lume-list ${presentationClasses(node)}`.trim()} data-id={node['id'] as string}>
          {items.map((i) => (
            <li
              key={i.itemKey}
              data-item-key={i.itemKey}
              className={i.tone && i.tone !== 'neutral' ? `lume-tone-${i.tone}` : undefined}
            >
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

    case 'button':
      return <ButtonNode node={node} onAction={onAction} />;

    case 'choice':
      return <ChoiceNode node={node} onAction={onAction} />;

    case 'input':
      return <InputNode node={node} onAction={onAction} />;

    case 'toggle':
      return <ToggleNode node={node} onAction={onAction} />;

    case 'form':
      return <FormNode node={node} {...ctx} />;

    case 'menubar': {
      const items = (node['items'] as Array<Record<string, unknown>>) ?? [];
      return (
        <div className="lume-menubar" data-id={node['id'] as string}>
          {items.map((item, i) => {
            const action = item['action'] as { type?: string; payload?: unknown } | undefined;
            return (
              <button
                key={(item['id'] as string) ?? i}
                type="button"
                className="lume-menubar-item"
                onClick={() =>
                  action?.type &&
                  onAction({ type: action.type, payload: action.payload, sourceId: node['id'] as string })
                }
              >
                {(item['label'] as string) ?? String(item['id'] ?? i)}
              </button>
            );
          })}
        </div>
      );
    }

    case 'tree':
      return <TreePrimitiveNode node={node} />;

    case 'chart':
      return <ChartNode node={node} />;

    case 'image':
      return (
        <img
          className="lume-image"
          data-id={node['id'] as string}
          src={(node['src'] as string) ?? ''}
          alt={(node['altText'] as string) ?? ''}
        />
      );

    case 'progress': {
      if (node['indeterminate'] === true) {
        return (
          <div className="lume-progress lume-progress-indeterminate" data-id={node['id'] as string}>
            <span className="lume-progress-bar" />
          </div>
        );
      }
      const raw = Number(node['value'] ?? 0);
      const pct = Math.min(Math.max(raw <= 1 ? raw * 100 : raw, 0), 100);
      return (
        <div className="lume-progress" data-id={node['id'] as string}>
          <span className="lume-progress-bar" style={{ width: `${pct}%` }} />
        </div>
      );
    }

    case 'media':
      return <MediaNode node={node} />;

    case 'canvas-region':
      return <CanvasRegionNode node={node} />;

    case 'timeline':
      return <TimelineNode node={node} />;

    case 'vector-path':
      return <VectorPathNode node={node} />;

    case 'status':
      return (
        <div className={`lume-status ${presentationClasses(node)}`.trim()} data-id={node['id'] as string}>
          {(node['text'] as string) ?? ''}
        </div>
      );

    case 'divider':
      return <hr className="lume-divider" />;

    // omadia-canvas-protocol/1.1 — the `scene` primitive (Lumens, §3).
    case 'scene':
      return <SceneNode node={node} onAction={onAction} />;

    // omadia-canvas-protocol/1.1 — the `lumen` primitive (Live Interactivity, §1).
    case 'lumen':
      return <LumenNode node={node} onAction={onAction} />;

    default:
      // Unreachable for validated trees — defensive, never throws mid-render.
      return <div className="lume-unknown">unsupported primitive: {node.type}</div>;
  }
}

export function PrimitiveNode({ node, root, ...ctx }: Props): ReactNode {
  const rendered = renderNode(node, ctx, root === true);
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
