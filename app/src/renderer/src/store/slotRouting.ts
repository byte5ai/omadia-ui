import type { ServerMessage } from '../../../shared/protocol.js';
import {
  applyServerMessage,
  initialCanvasState,
  interruptTurn,
  type ApplyResult,
  type CanvasState,
} from './canvasStore.js';

/**
 * Advance one canvas slot's state.
 *
 * `activeState` is the ref holding the VISIBLE slot's state. It is advanced
 * synchronously here, not on the next React render: a turn ends with a burst
 * (surface_snapshot, surface_patch, agent_text_delta…, turn_complete) that
 * arrives as separate IPC messages, often before React re-renders. Building
 * each message on the render-time ref made every one of them start from the
 * same stale state, so the last write won and the patch filling the skeleton
 * was silently lost (the table stayed loading forever).
 */
function updateSlot<R extends { state: CanvasState }>(
  slotKey: string,
  activeSlotId: string | null,
  activeState: { current: CanvasState },
  slotStates: Map<string, CanvasState>,
  step: (prev: CanvasState) => R,
): R & { prev: CanvasState; active: boolean } {
  const active = slotKey === activeSlotId;
  const prev = active ? activeState.current : (slotStates.get(slotKey) ?? initialCanvasState);
  const result = step(prev);
  slotStates.set(slotKey, result.state);
  if (active) activeState.current = result.state;
  return { ...result, prev, active };
}

/** Apply one server message to the canvas slot it belongs to. */
export function routeServerMessage(
  slotKey: string,
  msg: ServerMessage,
  activeSlotId: string | null,
  activeState: { current: CanvasState },
  slotStates: Map<string, CanvasState>,
): ApplyResult & { prev: CanvasState; active: boolean } {
  return updateSlot(slotKey, activeSlotId, activeState, slotStates, (prev) =>
    applyServerMessage(prev, msg),
  );
}

/**
 * The slot's socket left `ready` (dropped, reconnecting, failed): end its
 * in-flight turn, if any (see `interruptTurn`). Every slot owns its socket, so
 * each slot's status event interrupts exactly that slot — active or background.
 * `interrupted` is false when nothing was pending (state left untouched).
 */
export function interruptSlotTurn(
  slotKey: string,
  turnId: string | undefined,
  activeSlotId: string | null,
  activeState: { current: CanvasState },
  slotStates: Map<string, CanvasState>,
): { state: CanvasState; interrupted: boolean; prev: CanvasState; active: boolean } {
  const active = slotKey === activeSlotId;
  const current = active ? activeState.current : slotStates.get(slotKey);
  // nothing in flight (or an unknown/deleted slot) → touch nothing
  if (!current?.turnPending) {
    const state = current ?? initialCanvasState;
    return { state, interrupted: false, prev: state, active };
  }
  return updateSlot(slotKey, activeSlotId, activeState, slotStates, (prev) => ({
    state: interruptTurn(prev, turnId),
    interrupted: true,
  }));
}
