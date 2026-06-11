/**
 * omadia-canvas-protocol/1.0 — client-side wire types.
 * Server counterpart: byte5ai/omadia middleware/packages/omadia-ui-channel/src/protocol.ts.
 * Where this file and docs/protocol/schema/ disagree, the schema wins.
 */

// ── server → client ──
export interface HandshakeOffer {
  type: 'handshake_offer';
  handshakeId: string;
  protocolVersions: string[];
  opsCatalogVersions: string[];
  serverFeatures?: string[];
}

export interface HandshakeErrorMsg {
  type: 'handshake_error';
  handshakeId: string;
  reason: 'protocol-version-unsupported' | 'ops-catalog-version-unsupported' | 'local-ops-incomplete';
  supported: { protocolVersions: string[]; opsCatalogVersions: string[] };
}

export interface HandshakeAck {
  type: 'handshake_ack';
  handshakeId: string;
  canvasSessionId: string;
}

export interface AgentTextDelta {
  type: 'agent_text_delta';
  forTurn: string;
  text: string;
}

export interface TurnComplete {
  type: 'turn_complete';
  forTurn: string;
}

export interface TurnError {
  type: 'turn_error';
  forTurn?: string;
  message: string;
}

/** One entry of the per-user canvas registry (multi-canvas sidebar sync).
 *  `tree`/`revision` materialise the canvas on app start across installs —
 *  the last server-authoritative snapshot state, replaced by the next turn. */
export interface CanvasListEntry {
  sessionId: string;
  title: string;
  color: number;
  tree?: unknown;
  revision?: string;
}

/** server → client: the user's persisted canvas list (answer to canvas_list_get). */
export interface CanvasListMsg {
  type: 'canvas_list';
  canvases: CanvasListEntry[];
}

// ── notifications (issue #15) — out-of-band from surface_* ──

export type NotificationSeverity = 'info' | 'success' | 'warning' | 'error';

/** server → client: a user-facing notification (middleware NotificationRouter
 *  fan-out). Structured and server-authoritative. Severity maps to a FIXED
 *  UI element: info/success → toast (auto-dismiss), warning/error → banner
 *  (persists until dismissed); everything lands in the bell history. */
export interface NotificationMsg {
  type: 'notification';
  id: string;
  severity: NotificationSeverity;
  title: string;
  body?: string;
  source?: string;
  action?: { type: string; payload?: unknown; label?: string };
  dedupeKey?: string;
  ttlMs?: number;
  scope?: string;
}

/** client → server: the user saw/dismissed a notification. */
export interface ClientNotificationAck {
  type: 'notification_ack';
  id: string;
}

export type SurfaceEventType =
  | 'surface_snapshot'
  | 'surface_patch'
  | 'surface_data_ref_created'
  | 'surface_data_ref_invalidated'
  | 'surface_action_result'
  | 'surface_local_action'
  | 'surface_error'
  | 'surface_mutation_resolved';

export const SURFACE_EVENT_TYPES: ReadonlySet<string> = new Set<SurfaceEventType>([
  'surface_snapshot',
  'surface_patch',
  'surface_data_ref_created',
  'surface_data_ref_invalidated',
  'surface_action_result',
  'surface_local_action',
  'surface_error',
  'surface_mutation_resolved',
]);

/** Envelope-typed surface event; the full shape is enforced by the Ajv validator, not TS. */
export interface SurfaceEvent {
  type: SurfaceEventType;
  canvasSessionId: string;
  surfaceSeq: number;
  [key: string]: unknown;
}

export type ServerMessage =
  | HandshakeOffer
  | HandshakeErrorMsg
  | HandshakeAck
  | AgentTextDelta
  | TurnComplete
  | TurnError
  | CanvasListMsg
  | NotificationMsg
  | DesktopListMsg
  | SurfaceEvent;

// ── client → server ──
export interface HandshakeSelect {
  type: 'handshake_select';
  handshakeId: string;
  protocolVersion: string;
  opsCatalogVersion: string;
  clientFeatures?: string[];
  localOperations?: string[];
  canvasSessionId?: string;
}

export interface ClientTurn {
  type: 'turn';
  turnId?: string;
  text?: string;
  /** structured UI action (button click, choice pick, row-click). Carried to
   *  Tier 2 via IncomingTurn.metadata.action and threaded into the typed
   *  ChatTurnInput.action field (with the turn's target) by the dispatcher. */
  action?: { type: string; payload?: unknown };
  target?: unknown;
  viewState?: unknown;
  viewStateTruncated?: boolean;
}

/** client → server: fetch / replace the user's persisted canvas list. */
export interface ClientCanvasListGet {
  type: 'canvas_list_get';
}
export interface ClientCanvasListPut {
  type: 'canvas_list_put';
  canvases: CanvasListEntry[];
}

// ── desktops (multi-desktop workspaces) — sessionId-keyed so they travel ──

export type DesktopLayoutWire =
  | { kind: 'leaf'; sessionId: string }
  | { kind: 'split'; dir: 'columns' | 'rows'; ratio: number; a: DesktopLayoutWire; b: DesktopLayoutWire };

/** One persisted desktop; `updatedAt` drives last-write-wins merging. */
export interface DesktopListEntry {
  desktopId: string;
  name: string;
  color: number;
  updatedAt: number;
  layout: DesktopLayoutWire;
}

/** server → client: the user's persisted desktops (answer to desktop_list_get). */
export interface DesktopListMsg {
  type: 'desktop_list';
  desktops: DesktopListEntry[];
}

export interface ClientDesktopListGet {
  type: 'desktop_list_get';
}
export interface ClientDesktopListPut {
  type: 'desktop_list_put';
  desktops: DesktopListEntry[];
}

/** client → server: deterministic refresh (protocol 1.1 additive, issue #5) —
 *  re-resolve the data behind the current tree's containers; the server
 *  answers with ordinary surface_patch events (first publish per container
 *  REPLACES its rows) and turn_complete/turn_error signal completion. */
export interface ClientCanvasRefresh {
  type: 'canvas_refresh';
  turnId?: string;
  /** the revision the client's tree is at — refresh patches build on it */
  basedOnRevision: string;
  /** the client's current canvas tree (Tier 2 is stateless across turns) */
  currentTree: unknown;
  /** optional containerId — refresh one table/chart instead of the surface */
  scope?: string;
}

/** client → server: abort the named in-flight turn (issue #13, additive) —
 *  the server stops the stream immediately and answers turn_error 'aborted';
 *  surface events already applied stay (the canvas keeps what rendered). */
export interface ClientTurnAbort {
  type: 'turn_abort';
  forTurn: string;
}

export type ClientMessage =
  | HandshakeSelect
  | ClientTurn
  | ClientCanvasListGet
  | ClientCanvasListPut
  | ClientCanvasRefresh
  | ClientTurnAbort
  | ClientNotificationAck
  | ClientDesktopListGet
  | ClientDesktopListPut;

const NON_SURFACE_SERVER_TYPES: ReadonlySet<string> = new Set([
  'handshake_offer',
  'handshake_error',
  'handshake_ack',
  'agent_text_delta',
  'turn_complete',
  'turn_error',
  'canvas_list',
  'notification',
  'desktop_list',
]);

/** Tolerant parse of a raw server frame; null for non-JSON / unknown type. */
export function parseServerMessage(raw: string): ServerMessage | null {
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return null;
  const type = (obj as { type?: unknown }).type;
  if (typeof type !== 'string') return null;
  if (NON_SURFACE_SERVER_TYPES.has(type) || SURFACE_EVENT_TYPES.has(type)) {
    return obj as ServerMessage;
  }
  return null;
}
