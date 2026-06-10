import type { ReactNode } from 'react';
import type { PrimitiveJson } from './PrimitiveNode.js';

/** chartPoint cells are open (`additionalProperties: true`); the composition
 *  idiom puts the display name in `label` and the magnitude in `value`/`y`. */
interface ChartDatum {
  key: string;
  label: string;
  value: number;
}

const fmtValue = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 });
const fmtTick = new Intl.NumberFormat('de-DE', { notation: 'compact', maximumFractionDigits: 1 });

const chartData = (node: PrimitiveJson): ChartDatum[] =>
  ((node['points'] as Array<Record<string, unknown>>) ?? []).map((p) => ({
    key: String(p['pointKey']),
    label: typeof p['label'] === 'string' ? p['label'] : String(p['pointKey']),
    value: Number(p['value'] ?? p['y'] ?? 0) || 0,
  }));

/** evenly-rounded axis ticks (1/2/5 ladder) spanning [min, max] */
function niceTicks(min: number, max: number, count: number): number[] {
  const span = max - min || 1;
  const rawStep = span / count;
  const mag = 10 ** Math.floor(Math.log10(rawStep));
  const norm = rawStep / mag;
  const step = (norm < 1.5 ? 1 : norm < 3.5 ? 2 : norm < 7.5 ? 5 : 10) * mag;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-6; v += step) out.push(v);
  return out;
}

function BarChart({ data }: { data: ChartDatum[] }): ReactNode {
  const max = Math.max(...data.map((d) => Math.abs(d.value)), 1);
  return (
    <div className="lume-chart-bars">
      {data.map((d) => (
        <div key={d.key} className="lume-chart-bar-row" title={`${d.label}: ${fmtValue.format(d.value)}`}>
          <span className="lume-chart-bar-label">{d.label}</span>
          <span className="lume-chart-bar-track">
            <span className="lume-chart-bar-fill" style={{ width: `${(Math.abs(d.value) / max) * 100}%` }} />
          </span>
          <span className="lume-chart-bar-value">{fmtValue.format(d.value)}</span>
        </div>
      ))}
    </div>
  );
}

/** line chart with axes, gridlines, point markers and thinned x-labels —
 *  fixed 640×260 coordinate space, scales with the container width. */
function LineChart({ data }: { data: ChartDatum[] }): ReactNode {
  const W = 640;
  const H = 260;
  const M = { top: 14, right: 18, bottom: 30, left: 54 };
  const values = data.map((d) => d.value);
  const dataMax = Math.max(...values);
  const dataMin = Math.min(...values, 0);
  const ticks = niceTicks(dataMin, dataMax, 4);
  const yMin = Math.min(dataMin, ticks[0] ?? dataMin);
  const yMax = Math.max(dataMax, ticks.at(-1) ?? dataMax);
  const span = yMax - yMin || 1;
  const innerW = W - M.left - M.right;
  const x = (i: number): number => (data.length > 1 ? M.left + (i * innerW) / (data.length - 1) : M.left + innerW / 2);
  const y = (v: number): number => M.top + (H - M.top - M.bottom) * (1 - (v - yMin) / span);
  const pts = data.map((d, i) => `${x(i)},${y(d.value)}`).join(' ');
  const area = `${x(0)},${y(yMin)} ${pts} ${x(data.length - 1)},${y(yMin)}`;
  const labelEvery = Math.ceil(data.length / 8);
  return (
    <svg className="lume-chart-line" viewBox={`0 0 ${W} ${H}`} role="img">
      {ticks.map((t) => (
        <g key={t}>
          <line className="lume-chart-grid" x1={M.left} x2={W - M.right} y1={y(t)} y2={y(t)} />
          <text className="lume-chart-axis" x={M.left - 8} y={y(t) + 4} textAnchor="end">
            {fmtTick.format(t)}
          </text>
        </g>
      ))}
      <polygon className="lume-chart-area" points={area} />
      <polyline className="lume-chart-stroke" points={pts} fill="none" />
      {data.map((d, i) => (
        <circle key={d.key} className="lume-chart-dot" cx={x(i)} cy={y(d.value)} r={3.5}>
          <title>{`${d.label}: ${fmtValue.format(d.value)}`}</title>
        </circle>
      ))}
      {data.map((d, i) =>
        i % labelEvery === 0 ? (
          <text key={d.key} className="lume-chart-axis" x={x(i)} y={H - 8} textAnchor="middle">
            {d.label}
          </text>
        ) : null,
      )}
    </svg>
  );
}

/** pie with a value legend — chips mirror the chroma-reduced slice opacities */
function PieChart({ data }: { data: ChartDatum[] }): ReactNode {
  const total = data.reduce((s, d) => s + Math.max(d.value, 0), 0) || 1;
  let angle = -Math.PI / 2;
  return (
    <div className="lume-chart-pie-wrap">
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
              <title>{`${d.label}: ${fmtValue.format(d.value)}`}</title>
            </path>
          );
        })}
      </svg>
      <ul className="lume-chart-legend">
        {data.map((d, i) => (
          <li key={d.key}>
            <span className={`lume-chart-legend-chip lume-chart-chip-${i % 6}`} />
            <span className="lume-chart-legend-label">{d.label}</span>
            <span className="lume-chart-legend-value">
              {fmtValue.format(d.value)} ({Math.round((Math.max(d.value, 0) / total) * 100)} %)
            </span>
          </li>
        ))}
      </ul>
    </div>
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
