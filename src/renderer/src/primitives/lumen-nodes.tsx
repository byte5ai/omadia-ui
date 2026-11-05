import {
  type KeyboardEvent,
  type MouseEvent,
  type ReactElement,
  type Ref,
  type SVGProps,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  evaluate,
  type LxNode,
  type LxValue,
  runTransition,
  type StateValue,
  validateLumenFull,
} from "../../../shared/canvas-core";
import { arr, isNode, type Node, num, str } from "../lib/tree";
import { PrimitiveNode } from "./primitive-node";

/**
 * Lumens (omadia-canvas-protocol/1.1, lumens-spec.md): a self-contained
 * interactive unit — typed state, pure LX transitions, a view that is a pure
 * function of the state, and declared input bindings. Everything runs here,
 * on the client, through canvas-core's bounded interpreter: no server round
 * trip per interaction.
 *
 * Supported: the `view` as any primitive tree or a `scene`; `tap`, `key`,
 * `tick` and `timer` bindings. Not yet: drag/swipe/pinch/longPress/
 * pointerMove/wire, capabilities, ports, sprites (assets).
 */

type Binding = {
  on: string;
  run: string;
  key?: string;
  rate?: number;
  everyMs?: number;
  target?: { kind?: string; elementId?: string };
};

type StateLeaf = Record<string, unknown> & { type?: string; init?: unknown };

/** The smallest timer period a Lumen may ask for. */
const MIN_TIMER_MS = 100;
/** tick rate cap (lumens-spec.md §5). */
const MAX_TICK_HZ = 60;

/** A leaf's initial value: its `init`, else built from its shape. */
function initOf(leaf: StateLeaf): LxValue {
  if (leaf.init !== undefined) return structuredClone(leaf.init) as LxValue;
  switch (leaf.type) {
    case "record": {
      const fields = (leaf.fields ?? {}) as Record<string, StateLeaf>;
      return Object.fromEntries(
        Object.entries(fields).map(([k, f]) => [k, initOf(f)]),
      );
    }
    case "grid": {
      const w = num(leaf.w) ?? 0;
      const h = num(leaf.h) ?? 0;
      const cell = initOf((leaf.of ?? {}) as StateLeaf);
      return Array.from({ length: h }, () =>
        Array.from({ length: w }, () => structuredClone(cell)),
      );
    }
    case "list":
      return [];
    case "bool":
      return false;
    case "string":
    case "enum":
      return "";
    default:
      return 0;
  }
}

export function initialState(schema: unknown): StateValue {
  const s = (schema ?? {}) as Record<string, StateLeaf>;
  return Object.fromEntries(Object.entries(s).map(([k, l]) => [k, initOf(l)]));
}

/** A stable seed per Lumen id, so `random()` replays the same. */
function seedOf(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** `Space` for the space bar, as declared in bindings (lumens-spec.md §4). */
const keyName = (e: KeyboardEvent): string => (e.key === " " ? "Space" : e.key);

export function LumenNode({ node }: { node: Node }): ReactElement {
  const id = str(node.id) ?? "lumen";
  // the spec, not the identity: a patch that resends the same Lumen keeps
  // its state; a changed Lumen starts over
  const spec = JSON.stringify([
    node.state,
    node.transitions,
    node.view,
    node.events,
  ]);
  const verdict = useMemo(() => validateLumenFull(node), [spec]);
  const [state, setState] = useState<StateValue>(() =>
    initialState(node.state),
  );
  // the state transitions run on — always the latest, also for timers
  const current = useRef(state);
  const [fault, setFault] = useState<string | null>(null);
  useEffect(() => {
    const fresh = initialState(node.state);
    current.current = fresh;
    setState(fresh);
    setFault(null);
  }, [spec]);

  const transitions = (node.transitions ?? {}) as Record<string, LxNode>;
  const bindings = arr(node.events) as Binding[];
  const seed = seedOf(id);

  /** Run one transition on the latest state; a fault stops the Lumen. */
  const fire = useCallback(
    (run: string, event: Record<string, LxValue>) => {
      const body = transitions[run];
      if (!body) return;
      try {
        const next = runTransition(body, {
          state: current.current,
          event,
          seed,
          now: Date.now(),
        });
        current.current = next;
        setState(next);
      } catch (err) {
        setFault(err instanceof Error ? err.message : String(err));
      }
    },
    [spec, seed],
  );

  // the host clock: tick (≤60 Hz) and timer (≥100 ms) bindings
  useEffect(() => {
    if (!verdict.ok || fault) return;
    const timers: ReturnType<typeof setInterval>[] = [];
    for (const b of bindings) {
      const period =
        b.on === "tick" && b.rate
          ? 1000 / Math.min(b.rate, MAX_TICK_HZ)
          : b.on === "timer" && b.everyMs
            ? Math.max(b.everyMs, MIN_TIMER_MS)
            : undefined;
      if (period === undefined) continue;
      let last = Date.now();
      let seq = 0;
      timers.push(
        setInterval(() => {
          const now = Date.now();
          fire(b.run, { dtMs: now - last, seq: seq++ });
          last = now;
        }, period),
      );
    }
    return () => timers.forEach(clearInterval);
  }, [spec, verdict.ok, fault]);

  const view = useMemo((): { tree?: Node; error?: string } => {
    if (!verdict.ok || fault) return {};
    try {
      const v = evaluate(node.view as LxNode, {
        state,
        seed,
        now: Date.now(),
      });
      return isNode(v)
        ? { tree: v }
        : { error: "die Ansicht ist kein Element" };
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  }, [spec, state, verdict.ok, fault]);

  const svgRef = useRef<SVGSVGElement | null>(null);

  const onClick = (e: MouseEvent<HTMLDivElement>): void => {
    const taps = bindings.filter((b) => b.on === "tap");
    if (taps.length === 0) return;
    const el = (e.target as Element).closest("[data-hit-id],[data-node-id]");
    const hitId =
      el?.getAttribute("data-hit-id") ?? el?.getAttribute("data-node-id") ?? "";
    // buffer-native coordinates when the tap lands on a scene
    let x = 0;
    let y = 0;
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (svg && ctm && svg.contains(e.target as globalThis.Node)) {
      const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(
        ctm.inverse(),
      );
      x = Math.round(p.x);
      y = Math.round(p.y);
    }
    for (const b of taps) {
      if (b.target?.elementId !== undefined && b.target.elementId !== hitId)
        continue;
      // `id` mirrors `hitId` for Lumens the server builds (datasetLumen.ts)
      fire(b.run, { hitId, id: hitId, x, y });
    }
  };

  const keyBindings = bindings.filter((b) => b.on === "key");
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    const hits = keyBindings.filter((b) => b.key === keyName(e));
    if (hits.length === 0) return;
    e.preventDefault();
    for (const b of hits) fire(b.run, { key: keyName(e) });
  };

  if (!verdict.ok) {
    return (
      <div className="p-lumen-error" role="alert">
        <span className="status danger">Lumen ungültig</span>
        <code>{verdict.errors}</code>
      </div>
    );
  }
  const problem = fault ?? view.error;
  return (
    <div
      className="p-lumen"
      data-node-id={id}
      tabIndex={keyBindings.length > 0 ? 0 : undefined}
      onClick={onClick}
      onKeyDown={keyBindings.length > 0 ? onKeyDown : undefined}
    >
      {problem ? (
        <div className="p-lumen-error" role="alert">
          <span className="status danger">Lumen angehalten</span>
          <code>{problem}</code>
        </div>
      ) : view.tree?.type === "scene" ? (
        <SceneNode node={view.tree} svgRef={svgRef} />
      ) : view.tree ? (
        <PrimitiveNode node={view.tree} />
      ) : null}
    </div>
  );
}

/** Scene colour tokens (scene.schema.json) → this client's theme. */
const COLOR: Record<string, string> = {
  accent: "var(--ink)",
  "accent.glow": "var(--light)",
  "accent.glow-soft": "var(--focus-ring)",
  "accent.glow-core": "var(--light)",
  surface: "var(--surface)",
  "surface-raised": "var(--lit)",
  "surface-sunken": "var(--ground)",
  text: "var(--ink)",
  "text-muted": "var(--text)",
  "text-faint": "var(--dim)",
  neutral: "var(--meta)",
  info: "var(--ink)",
  success: "var(--verified)",
  warning: "var(--masked)",
  danger: "var(--blocked)",
  transparent: "transparent",
};

const color = (v: unknown, fallback = "none"): string =>
  (typeof v === "string" ? COLOR[v] : undefined) ?? fallback;

const FONT: Record<string, string> = {
  mono: "var(--mono)",
  prose: "var(--font)",
  display: "var(--font)",
};

/** A scene: a declarative draw-list, rendered as SVG in buffer coordinates. */
export function SceneNode({
  node,
  svgRef,
}: {
  node: Node;
  svgRef?: Ref<SVGSVGElement>;
}): ReactElement {
  const width = num(node.width) ?? 100;
  const height = num(node.height) ?? 100;
  const camera = (node.camera ?? {}) as {
    x?: number;
    y?: number;
    zoom?: number;
  };
  const zoom = camera.zoom ?? 1;
  return (
    <svg
      ref={svgRef}
      className="p-scene"
      viewBox={`0 0 ${width} ${height}`}
      style={{ maxWidth: width }}
      data-node-id={str(node.id)}
      role="img"
    >
      <g
        transform={`scale(${zoom}) translate(${-(camera.x ?? 0)} ${-(camera.y ?? 0)})`}
      >
        {arr(node.draw).map((d, i) => (
          <SceneShape key={i} shape={d as Record<string, unknown>} />
        ))}
      </g>
    </svg>
  );
}

function SceneShape({
  shape: s,
}: {
  shape: Record<string, unknown>;
}): ReactElement | null {
  const hit = str(s.id);
  const common: SVGProps<SVGElement> & { "data-hit-id"?: string } = hit
    ? { "data-hit-id": hit, style: { cursor: "pointer" } }
    : {};
  const stroke = color(s.stroke);
  const strokeWidth = num(s.strokeW) ?? (s.stroke ? 1 : 0);
  switch (s.kind) {
    case "rect":
      return (
        <rect
          {...(common as SVGProps<SVGRectElement>)}
          x={num(s.x)}
          y={num(s.y)}
          width={num(s.w)}
          height={num(s.h)}
          rx={num(s.r)}
          fill={color(s.fill)}
          stroke={stroke}
          strokeWidth={strokeWidth}
        />
      );
    case "circle":
      return (
        <circle
          {...(common as SVGProps<SVGCircleElement>)}
          cx={num(s.cx)}
          cy={num(s.cy)}
          r={num(s.r)}
          fill={color(s.fill)}
          stroke={stroke}
          strokeWidth={strokeWidth}
        />
      );
    case "line":
      return (
        <line
          {...(common as SVGProps<SVGLineElement>)}
          x1={num(s.x1)}
          y1={num(s.y1)}
          x2={num(s.x2)}
          y2={num(s.y2)}
          stroke={color(s.stroke, "var(--ink)")}
          strokeWidth={num(s.strokeW) ?? 1}
        />
      );
    case "path": {
      const pts = arr(s.points).filter(
        (p): p is [number, number] => Array.isArray(p) && p.length === 2,
      );
      if (pts.length === 0) return null;
      const d =
        pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x} ${y}`).join(" ") +
        (s.closed === true ? " Z" : "");
      return (
        <path
          {...(common as SVGProps<SVGPathElement>)}
          d={d}
          fill={color(s.fill)}
          stroke={stroke}
          strokeWidth={strokeWidth}
        />
      );
    }
    case "text":
      return (
        <text
          {...(common as SVGProps<SVGTextElement>)}
          x={num(s.x)}
          y={num(s.y)}
          fontSize={num(s.size) ?? 13}
          fontWeight={num(s.weight)}
          fontFamily={FONT[str(s.register) ?? "prose"] ?? "var(--font)"}
          fill={color(s.fill, "var(--ink)")}
        >
          {str(s.text) ?? ""}
        </text>
      );
    case "group": {
      const t = (s.transform ?? {}) as {
        x?: number;
        y?: number;
        scale?: number;
        rotate?: number;
      };
      return (
        <g
          {...(common as SVGProps<SVGGElement>)}
          transform={`translate(${t.x ?? 0} ${t.y ?? 0}) rotate(${t.rotate ?? 0}) scale(${t.scale ?? 1})`}
        >
          {arr(s.children).map((c, i) => (
            <SceneShape key={i} shape={c as Record<string, unknown>} />
          ))}
        </g>
      );
    }
    case "sprite":
      // assets (§6.1) are not loaded yet: keep the footprint visible
      return (
        <rect
          {...(common as SVGProps<SVGRectElement>)}
          x={num(s.x)}
          y={num(s.y)}
          width={num(s.w)}
          height={num(s.h)}
          fill="var(--line)"
        />
      );
    default:
      return null;
  }
}
