/**
 * omadia-canvas-protocol/1.0 — client-side wire types.
 * Server counterpart: byte5ai/omadia middleware/packages/omadia-ui-channel/src/protocol.ts.
 * Where this file and docs/protocol/schema/ disagree, the schema wins.
 */

// ── agents (omadia-canvas-protocol/1.1 additive, issue #52) ──
// Wire copies of the server's `AgentSpeaker` / `SystemSpeaker`
// (omadia-ui-support `@omadia/ui-channel` protocol.ts, from `@omadia/plugin-api`
// speaker.ts). The server stamps the speaker; the client only renders it.

/** Feature id negotiated in `serverFeatures` / `clientFeatures`. */
export const AGENTS_FEATURE = 'agents';

/** An agent speaking as itself. */
export interface AgentSpeaker {
  kind: 'agent';
  agentId: string;
  slug: string;
  displayName: string;
  avatarUrl?: string;
}

/** The management layer — a notice, never an agent. */
export interface SystemSpeaker {
  kind: 'system';
}

export type Speaker = AgentSpeaker | SystemSpeaker;

/** One agent of the directory the user may address here, as the client uses
 *  it. `id` is what a turn carries as `agentId`. */
export interface AgentDirectoryEntry {
  id: string;
  slug: string;
  displayName: string;
  avatarUrl?: string;
  description?: string;
  archetype?: string;
}

/** An agent as it arrives on the wire. The canvas channel sends the camelCase
 *  form above; the kernel's `GET /api/v1/agents/directory?channel=web` sends
 *  snake_case with the agent's `id` (kernel main 4ff997d20; earlier kernels
 *  sent none, the slug then stands in). Untrusted — read through
 *  `speakerView.agentDirectoryView`. */
export interface AgentDirectoryEntryWire {
  id?: string;
  slug?: string;
  displayName?: string;
  display_name?: string;
  avatarUrl?: string | null;
  avatar_url?: string | null;
  description?: string | null;
  short_description?: string | null;
  archetype?: string | null;
}

/** What an unaddressed message reaches here: the default agent, or none (the
 *  notice code says why). The kernel's `default_agent`, camelCase on this wire. */
export type DefaultAgentWire = { slug: string } | { slug: null; notice?: string };

/** server → client: the agents available to this user in this channel (after
 *  the handshake, and as the answer to `agents_get`). Mirrors the kernel's
 *  directory `{channel, agents, default_agent}` (`defaultAgent` here). */
export interface AgentsMsg {
  type: 'agents';
  agents: AgentDirectoryEntryWire[];
  /** the agent the picker preselects; the user can still choose another
   *  before the first turn */
  defaultAgent?: DefaultAgentWire;
}

/** Why the management layer spoke — the kernel's `SYSTEM_NOTICE_CODES`
 *  (`@omadia/plugin-api` speaker.ts). The kernel adds codes additively: an
 *  unknown code is still rendered through its `text`. */
export type SystemNoticeCode =
  | 'agent_disabled'
  | 'agent_deleted'
  | 'agent_unknown'
  | 'agent_not_available'
  | 'no_agent'
  | 'agent_selected'
  | 'agent_selection_cleared'
  | 'agent_directory'
  | 'agent_error'
  | 'missing_grant'
  | 'quota_exceeded'
  | 'identity_guard_blocked'
  | 'identity_guard_unavailable';

/** A management-layer notice naming the agent it is about (kernel
 *  `SystemNotice`). Untrusted input — read through
 *  `speakerView.systemNoticeView`. */
export interface SystemNoticeWire {
  code: string;
  text: string;
  locale?: string;
  agent?: { slug?: string; displayName?: string; agentId?: string };
}

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
  /** when the session behind the socket expires (Unix epoch seconds); the
   *  server then closes with 4401 (4403 on revocation). Absent on servers
   *  that predate the session-lifetime contract. */
  sessionExpiresAt?: number;
}

export interface AgentTextDelta {
  type: 'agent_text_delta';
  forTurn: string;
  text: string;
  /** who the text is from — absent on servers that predate agents; untrusted,
   *  read through `speakerView` */
  speaker?: Speaker;
}

/** The kernel took back the last `chars` characters of the streamed prose
 *  (`text_retract`: a withheld answer, a sentence-gate preamble). Counted in
 *  UTF-16 code units like `String.length`; untrusted — a count that is not a
 *  finite positive number is ignored. Server: `AgentTextRetract` in
 *  omadia-ui-channel protocol.ts (ui-channel 0.4.0). */
export interface AgentTextRetract {
  type: 'agent_text_retract';
  forTurn: string;
  chars: number;
  speaker?: Speaker;
}

export interface TurnComplete {
  type: 'turn_complete';
  forTurn: string;
  speaker?: Speaker;
  /** what a decision model (TypeSafe Jev, …) decided for the turn. Absent
   *  when none decided; untrusted — read through `decisionView`. */
  decision?: TurnDecision;
}

/** Server: `TurnDecision` in omadia-ui-channel protocol.ts. */
export interface TurnDecision {
  provider: string;
  model?: string;
  verdict: 'data' | 'model';
  route?: 'simple' | 'complex';
  tool?: string;
  confidence: number;
  ms: number;
  direct?: true;
  answered?: true;
  fallback?: true;
  steps?: Array<{ task: string; choice: string; confidence: number; ms: number }>;
  ui?: { skeleton: 'plan' | 'cache' | 'simple' | 'composer'; layout?: 'table' | 'bar' | 'line' | 'pie' };
}

export interface TurnError {
  type: 'turn_error';
  forTurn?: string;
  message: string;
  /** `system` for a refused or failed turn */
  speaker?: Speaker;
  /** typed reason when the management layer refused or failed the turn */
  code?: string;
  /** the notice naming the agent (rendered, localized) */
  systemNotice?: SystemNoticeWire;
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
  /** the agent of this canvas, fixed when it was chosen — travels with the
   *  registry so every install of the user talks to the same agent */
  agentId?: string;
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
  /** `system` — a notification is the management layer, never an agent */
  speaker?: Speaker;
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
  | AgentTextRetract
  | TurnComplete
  | TurnError
  | CanvasListMsg
  | NotificationMsg
  | DesktopListMsg
  | AgentsMsg
  | SurfaceEvent;

// ── client → server ──
export interface HandshakeSelect {
  type: 'handshake_select';
  handshakeId: string;
  protocolVersion: string;
  opsCatalogVersion: string;
  clientFeatures?: string[];
  localOperations?: string[];
  /** UI language of this client — the language of the server's `system`
   *  notices */
  locale?: string;
  canvasSessionId?: string;
}

export interface ClientTurn {
  type: 'turn';
  turnId?: string;
  /** the agent of this canvas, chosen by the user and fixed per canvas. The
   *  server refuses a turn without it (`no_agent`) — it never picks one. */
  agentId?: string;
  text?: string;
  /** structured UI action (button click, choice pick, row-click). Carried to
   *  Tier 2 via IncomingTurn.metadata.action and threaded into the typed
   *  ChatTurnInput.action field (with the turn's target) by the dispatcher. */
  action?: { type: string; payload?: unknown };
  target?: unknown;
  viewState?: unknown;
  viewStateTruncated?: boolean;
  /** PR-9b-3 in-place action: the client's live tree + the revision it is at,
   *  sent on an ACTION turn so the server patches in place instead of remounting
   *  a fresh skeleton. Same pair as canvas_refresh; both present together or
   *  neither. The server skips skeleton composition and synthesises on top of
   *  currentTree — a plugin status-flip lands as a surface_patch (no remount). */
  basedOnRevision?: string;
  currentTree?: unknown;
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
  /** the agent of the canvas (see `ClientTurn.agentId`) */
  agentId?: string;
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

/** client → server: fetch the agent directory again (the picker opens). */
export interface ClientAgentsGet {
  type: 'agents_get';
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
  | ClientDesktopListPut
  | ClientAgentsGet;

const NON_SURFACE_SERVER_TYPES: ReadonlySet<string> = new Set([
  'handshake_offer',
  'handshake_error',
  'handshake_ack',
  'agent_text_delta',
  'agent_text_retract',
  'turn_complete',
  'turn_error',
  'canvas_list',
  'notification',
  'desktop_list',
  'agents',
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
