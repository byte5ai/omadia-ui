import type { ReactNode } from 'react';
import type { PrimitiveJson } from './PrimitiveNode.js';

/** chartPoint cells are open (`additionalProperties: true`); the composition
 *  idiom puts the display name in `label` and the magnitude in `value`/`y`. */
interface ChartDatum {
  key: string;
  label: string;
  value: number;
}

const chartData = (node: PrimitiveJson): ChartDatum[] =>
  ((node['points'] as Array<Record<string, unknown>>) ?? []).map((p) => ({
    key: String(p['pointKey']),
    label: typeof p['label'] === 'string' ? p['label'] : String(p['pointKey']),
    value: Number(p['value'] ?? p['y'] ?? 0) || 0,
  }));

function BarChart({ data }: { data: ChartDatum[] }): ReactNode {
  const max = Math.max(...data.map((d) => Math.abs(d.value)), 1);
  return (
    <div className="lume-chart-bars">
      {data.map((d) => (
        <div key={d.key} className="lume-chart-bar-row" title={`${d.label}: ${d.value}`}>
          <span className="lume-chart-bar-label">{d.label}</span>
          <span className="lume-chart-bar-track">
            <span className="lume-chart-bar-fill" style={{ width: `${(Math.abs(d.value) / max) * 100}%` }} />
          </span>
          <span className="lume-chart-bar-value">{d.value}</span>
        </div>
      ))}
    </div>
  );
}

function LineChart({ data }: { data: ChartDatum[] }): ReactNode {
  const max = Math.max(...data.map((d) => d.value), 1);
  const min = Math.min(...data.map((d) => d.value), 0);
  const span = max - min || 1;
  const step = data.length > 1 ? 100 / (data.length - 1) : 0;
  const pts = data.map((d, i) => `${i * step},${40 - ((d.value - min) / span) * 36 - 2}`).join(' ');
  return (
    <svg className="lume-chart-line" viewBox="0 0 100 40" preserveAspectRatio="none" role="img">
      <polyline points={pts} fill="none" />
    </svg>
  );
}

function PieChart({ data }: { data: ChartDatum[] }): ReactNode {
  const total = data.reduce((s, d) => s + Math.max(d.value, 0), 0) || 1;
  let angle = -Math.PI / 2;
  return (
    <svg className="lume-chart-pie" viewBox="-1.1 -1.1 2.2 2.2" role="img">
      {data.map((d, i) => {
        const slice = (Math.max(d.value, 0) / total) * 2 * Math.PI;
        const x1 = Math.cos(angle);
        const y1 = Math.sin(angle);
        angle += slice;
        const x2 = Math.cos(angle);
        const y2 = Math.sin(angle);
        const large = slice > Math.PI ? 1 : 0;
        return (
          <path
            key={d.key}
            d={`M 0 0 L ${x1} ${y1} A 1 1 0 ${large} 1 ${x2} ${y2} Z`}
            className={`lume-chart-slice-${i % 6}`}
          >
            <title>{`${d.label}: ${d.value}`}</title>
          </path>
        );
      })}
    </svg>
  );
}

export function ChartNode({ node }: { node: PrimitiveJson }): ReactNode {
  const data = chartData(node);
  if (data.length === 0) {
    // a chart skeleton must be VISIBLE while its data is fetched — an empty
    // canvas reads as broken. Pulse bars, same loading language as tables.
    if (node['loading'] === 'skeleton') {
      return (
        <figure className="lume-chart lume-chart-skeleton" data-id={node['id'] as string}>
          {[0, 1, 2].map((i) => (
            <span key={i} className="lume-skeleton-cell" />
          ))}
        </figure>
      );
    }
    return (
      <figure className="lume-chart lume-chart-empty" data-id={node['id'] as string}>
        <span className="lume-chart-empty-note">keine Datenpunkte</span>
      </figure>
    );
  }
  const kind = node['chartType'] as string;
  return (
    <figure className="lume-chart" data-id={node['id'] as string}>
      {kind === 'line' ? <LineChart data={data} /> : kind === 'pie' ? <PieChart data={data} /> : <BarChart data={data} />}
    </figure>
  );
}

interface TreeNodeJson {
  itemKey: string;
  label?: string;
  children?: TreeNodeJson[];
}

function TreeBranch({ nodes }: { nodes: TreeNodeJson[] }): ReactNode {
  return (
    <ul className="lume-tree-branch">
      {nodes.map((n) =>
        n.children && n.children.length > 0 ? (
          <li key={n.itemKey} data-item-key={n.itemKey}>
            <details open>
              <summary>{n.label ?? n.itemKey}</summary>
              <TreeBranch nodes={n.children} />
            </details>
          </li>
        ) : (
          <li key={n.itemKey} data-item-key={n.itemKey}>
            {n.label ?? n.itemKey}
          </li>
        ),
      )}
    </ul>
  );
}

export function TreePrimitiveNode({ node }: { node: PrimitiveJson }): ReactNode {
  const nodes = (node['nodes'] as TreeNodeJson[]) ?? [];
  return (
    <div className="lume-tree" data-id={node['id'] as string}>
      <TreeBranch nodes={nodes} />
    </div>
  );
}
