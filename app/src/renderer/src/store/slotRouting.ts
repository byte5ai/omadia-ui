import type { ServerMessage } from '../../../shared/protocol.js';
import { applyServerMessage, initialCanvasState, type ApplyResult, type CanvasState } from './canvasStore.js';

/**
 * Apply one server message to the canvas slot it belongs to.
 *
 * `activeState` is the ref holding the VISIBLE slot's state. It is advanced
 * synchronously here, not on the next React render: a turn ends with a burst
 * (surface_snapshot, surface_patch, agent_text_delta…, turn_complete) that
 * arrives as separate IPC messages, often before React re-renders. Building
 * each message on the render-time ref made every one of them start from the
 * same stale state, so the last write won and the patch filling the skeleton
 * was silently lost (the table stayed loading forever).
 */
export function routeServerMessage(
  slotKey: string,
  msg: ServerMessage,
  activeSlotId: string | null,
  activeState: { current: CanvasState },
  slotStates: Map<string, CanvasState>,
): ApplyResult & { prev: CanvasState; active: boolean } {
  const active = slotKey === activeSlotId;
  const prev = active ? activeState.current : (slotStates.get(slotKey) ?? initialCanvasState);
  const result = applyServerMessage(prev, msg);
  slotStates.set(slotKey, result.state);
  if (active) activeState.current = result.state;
  return { ...result, prev, active };
}
