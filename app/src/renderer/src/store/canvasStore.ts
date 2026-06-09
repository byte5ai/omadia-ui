import { SURFACE_EVENT_TYPES, type ServerMessage, type SurfaceEvent } from '../../../shared/protocol.js';
import { applyTreePatches } from '../../../shared/treePatch.js';
import { validateSurfaceEvent, validateTree } from '../validate/validator.js';

export interface CanvasState {
  tree: unknown | null;
  /** opaque RevisionId — equality-only comparisons (protocol §0) */
  revision: string | null;
  lastSurfaceSeq: number | null;
  prose: string;
  turnPending: boolean;
  connection: 'disconnected' | 'connecting' | 'ready' | 'failed';
  /** debug/UX strip: errors, rejections, not-yet-rendered event kinds */
  notices: string[];
}

export const initialCanvasState: CanvasState = {
  tree: null,
  revision: null,
  lastSurfaceSeq: null,
  prose: '',
  turnPending: false,
  connection: 'disconnected',
  notices: [],
};

export interface ApplyResult {
  state: CanvasState;
  /** true → the host must reconnect + re-handshake with the same canvasSessionId */
  resync: boolean;
}

const noticed = (state: CanvasState, notice: string): CanvasState => ({
  ...state,
  notices: [...state.notices.slice(-19), notice],
});

function applySurfaceEvent(state: CanvasState, ev: SurfaceEvent): ApplyResult {
  const valid = validateSurfaceEvent(ev);
  if (!valid.ok) {
    return { state: noticed(state, `surface event rejected: ${valid.errors}`), resync: false };
  }
  // surfaceSeq is the transport tie-breaker — a gap means we missed frames.
  if (state.lastSurfaceSeq !== null && ev.surfaceSeq !== state.lastSurfaceSeq + 1) {
    return {
      state: noticed(state, `surfaceSeq gap (${state.lastSurfaceSeq} → ${ev.surfaceSeq})`),
      resync: true,
    };
  }
  const seen = { ...state, lastSurfaceSeq: ev.surfaceSeq };

  switch (ev.type) {
    case 'surface_snapshot': {
      const tree = ev['tree'];
      const treeValid = validateTree(tree);
      if (!treeValid.ok) {
        return { state: noticed(seen, `snapshot tree rejected: ${treeValid.errors}`), resync: false };
      }
      return {
        state: { ...seen, tree, revision: String(ev['producesRevision']) },
        resync: false,
      };
    }
    case 'surface_patch': {
      if (state.revision === null || String(ev['basedOnRevision']) !== state.revision) {
        return { state: noticed(seen, 'patch basedOnRevision mismatch'), resync: true };
      }
      try {
        const next = applyTreePatches(state.tree, ev['patches'] as unknown[]);
        const treeValid = validateTree(next);
        if (!treeValid.ok) {
          return { state: noticed(seen, `post-patch tree invalid: ${treeValid.errors}`), resync: true };
        }
        return {
          state: { ...seen, tree: next, revision: String(ev['producesRevision']) },
          resync: false,
        };
      } catch (err) {
        return {
          state: noticed(seen, `patch failed: ${err instanceof Error ? err.message : String(err)}`),
          resync: true,
        };
      }
    }
    case 'surface_error':
      return { state: noticed(seen, `surface_error: ${String(ev['message'])}`), resync: false };
    default:
      // data_ref_* / action_result / local_action / mutation_resolved:
      // not rendered in the M1 slice — record so nothing fails silently.
      return { state: noticed(seen, `unhandled ${ev.type}`), resync: false };
  }
}

export function applyServerMessage(state: CanvasState, msg: ServerMessage): ApplyResult {
  if (SURFACE_EVENT_TYPES.has(msg.type)) {
    return applySurfaceEvent(state, msg as SurfaceEvent);
  }
  switch (msg.type) {
    case 'agent_text_delta':
      return { state: { ...state, prose: state.prose + msg.text }, resync: false };
    case 'turn_complete':
      return { state: { ...state, turnPending: false }, resync: false };
    case 'turn_error':
      return {
        state: { ...noticed(state, `turn_error: ${msg.message}`), turnPending: false },
        resync: false,
      };
    default:
      return { state, resync: false }; // handshake frames are the socket layer's business
  }
}
