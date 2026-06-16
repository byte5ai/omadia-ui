import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { PrimitiveNode, type PrimitiveAction, type PrimitiveJson } from '../PrimitiveNode.js';
import { validateLumen } from '../../validate/validator.js';
import { validateLumenSemantics } from '../../lx/validate.js';
import { useLumen } from './useLumen.js';
import { matchTransition, type LumenSpec } from './lumenRuntime.js';

/**
 * omadia-canvas-protocol/1.1 — the `lumen` primitive renderer (lumens-spec.md §1).
 *
 * Validates the Lumen (structural whitelist + semantic layer), then runs it on
 * Tier 1 via useLumen: the evaluated `view` renders through the ordinary
 * PrimitiveNode pipeline (so a Lumen composes scenes + primitives), and child
 * actions are translated into Tier-1 events that drive the Lumen's transitions.
 * A Lumen that fails validation or halts (gas/bounds) renders an error chip and
 * never partially renders (§1) — and never takes down the canvas (§0.2).
 */
interface LumenProps {
  node: { type: string; [key: string]: unknown };
  /** escalation hook to the host (Tier 2) for capability events, beams, etc. */
  onAction: (action: PrimitiveAction) => void;
}

export function LumenNode({ node, onAction }: LumenProps): ReactNode {
  const validation = useMemo(() => {
    const structural = validateLumen(node);
    if (!structural.ok) return { ok: false, error: structural.errors ?? 'invalid Lumen' };
    const semantic = validateLumenSemantics(node);
    if (!semantic.ok) return { ok: false, error: semantic.errors.join('; ') };
    return { ok: true, error: null };
  }, [node]);

  if (!validation.ok) {
    return (
      <div className="lume-unknown" role="alert" data-lumen-error>
        invalid Lumen: {validation.error}
      </div>
    );
  }
  return <LiveLumen lumen={node as unknown as LumenSpec} onAction={onAction} />;
}

function LiveLumen({ lumen, onAction }: { lumen: LumenSpec; onAction: (a: PrimitiveAction) => void }): ReactNode {
  const { tree, dispatch, error } = useLumen(lumen);
  const rootRef = useRef<HTMLDivElement>(null);

  // declared key events → Tier-1 key dispatch (touch equivalents come via taps).
  const hasKeyEvent = useMemo(() => lumen.events.some((e) => e.on === 'key'), [lumen]);
  useEffect(() => {
    if (!hasKeyEvent) return;
    const el = rootRef.current;
    if (!el) return;
    const onKey = (e: KeyboardEvent): void => {
      dispatch({ on: 'key', key: e.key, payload: { key: e.key } });
    };
    el.addEventListener('keydown', onKey);
    return () => el.removeEventListener('keydown', onKey);
  }, [hasKeyEvent, dispatch]);

  // child primitive/scene actions → Tier-1 events that drive transitions.
  const handleChildAction = (action: PrimitiveAction): void => {
    if (action.type === 'scene-hit') {
      const payload = (action.payload ?? {}) as { nodeId?: string; x?: number; y?: number };
      dispatch({ on: 'tap', targetId: payload.nodeId, payload: { id: payload.nodeId ?? '', x: payload.x ?? 0, y: payload.y ?? 0 } });
      return;
    }
    // a button/choice/etc. inside the Lumen view is a tap on its source id —
    // but only if the Lumen declares a matching binding. Anything it does not
    // consume bubbles to the host (Tier 2) for capability/host handling (§6).
    if (matchTransition(lumen.events, { on: 'tap', targetId: action.sourceId }) !== null) {
      dispatch({ on: 'tap', targetId: action.sourceId, payload: { value: (action.payload ?? null) as never } });
    } else {
      onAction(action);
    }
  };

  if (error !== null) {
    return (
      <div className="lume-unknown" role="alert" data-lumen-error>
        Lumen halted: {error}
      </div>
    );
  }

  return (
    <div ref={rootRef} className="lume-lumen" tabIndex={hasKeyEvent ? 0 : undefined} data-lumen-id={lumen.id}>
      {tree !== null && <PrimitiveNode node={tree as PrimitiveJson} onAction={handleChildAction} />}
    </div>
  );
}
