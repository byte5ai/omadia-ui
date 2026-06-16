import { useCallback, useEffect, useMemo, useState } from 'react';
import type { LxValue, StateValue } from '../../lx/index.js';
import { LxError } from '../../lx/index.js';
import { applyEvent, evalView, initState, tickRate, type EventInput, type LumenSpec } from './lumenRuntime.js';

/** Stable, deterministic per-Lumen seed (FNV-1a over the id) so `random()`
 *  replays identically for the same Lumen (§0.3). */
function seedFromId(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export interface LumenHandle {
  /** the current evaluated primitive/scene tree, or null while halted on error. */
  tree: LxValue | null;
  /** dispatch a Tier-1 event → runs its transition → re-renders. */
  dispatch: (input: EventInput) => void;
  /** surface_error message if the Lumen halted (gas/type/bounds), else null. */
  error: string | null;
}

/** Drives a Lumen on Tier 1: holds state, evaluates the view reactively, runs
 *  transitions on events, and schedules a `tick` cadence via rAF (and only
 *  while ticking — at rest the Lumen costs ~0% CPU, §5). */
export function useLumen(lumen: LumenSpec): LumenHandle {
  const seed = useMemo(() => seedFromId(lumen.id), [lumen.id]);
  const [state, setState] = useState<StateValue>(() => initState(lumen.state));
  const [error, setError] = useState<string | null>(null);

  // re-init when the Lumen identity changes (a different Lumen mounted here).
  useEffect(() => {
    setState(initState(lumen.state));
    setError(null);
  }, [lumen]);

  const now = useCallback(() => (typeof performance !== 'undefined' ? performance.now() : Date.now()), []);

  const dispatch = useCallback(
    (input: EventInput) => {
      setState((prev) => {
        try {
          return applyEvent(lumen, prev, input, { now: now(), seed });
        } catch (e) {
          setError(e instanceof LxError ? `${e.code}: ${e.message}` : String(e));
          return prev;
        }
      });
    },
    [lumen, seed, now],
  );

  // tick cadence — rAF loop with a timestamp accumulator to hit the declared Hz.
  const rate = tickRate(lumen);
  useEffect(() => {
    if (rate === null || error !== null) return;
    const periodMs = 1000 / rate;
    let raf = 0;
    let last = now();
    let acc = 0;
    const frame = (): void => {
      const t = now();
      acc += t - last;
      last = t;
      // run at most a few catch-up ticks to avoid a death spiral after a stall.
      let budget = 4;
      while (acc >= periodMs && budget-- > 0) {
        acc -= periodMs;
        dispatch({ on: 'tick' });
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [rate, error, dispatch, now]);

  const tree = useMemo<LxValue | null>(() => {
    if (error !== null) return null;
    try {
      return evalView(lumen, state, { now: now(), seed });
    } catch (e) {
      // a bad view halts the Lumen, never the canvas (§0.2).
      queueMicrotask(() => setError(e instanceof LxError ? `${e.code}: ${e.message}` : String(e)));
      return null;
    }
  }, [lumen, state, error, seed, now]);

  return { tree, dispatch, error };
}
