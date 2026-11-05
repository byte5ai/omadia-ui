import {
  applyServerMessage,
  type CanvasState,
  goBack,
  initialCanvasState,
  type ServerMessage,
  validateTree11,
} from "../../../shared/canvas-core";
import type { SocketStatus } from "../../../shared/ipc";
import { createStore } from "../lib/create-store";
import { recoverPublishedRows } from "../lib/recover-tool-calls";
import {
  deriveTitle,
  firstLoadingId,
  type Node,
  openQuestion,
  rootToolbar,
  settleLoading,
  treeSize,
} from "../lib/tree";
import { clearSelection } from "../primitives/render-context";
import { notify, type Severity } from "./notifications";
import { activeServer } from "./session";

/**
 * Every canvas is a slot: local metadata plus, while open, its own socket to
 * omadia-ui-channel. The server is authoritative for the tree; this module
 * applies its events through canvas-core's reducer and keeps what the light
 * and the agent dot need to know.
 */

export interface CanvasMeta {
  slotKey: string;
  sessionId?: string;
  title: string;
  /** a title the user typed wins over the derived one */
  titleLocked?: boolean;
  color: number;
  createdAt: number;
  updatedAt: number;
  /** ids of omadia's questions you answered (or talked past) */
  answered?: string[];
}

/** What omadia is doing on this canvas (the agent dot reads this). */
export type Activity = "idle" | "thinking" | "working";

export interface TurnLogEntry {
  at: number;
  tier: "T1" | "T2" | "T3";
  text: string;
}

export interface CanvasRuntime {
  canvas: CanvasState;
  status: SocketStatus;
  connected: boolean;
  activity: Activity;
  /** node id the dot sits on while working; undefined = the canvas centre */
  workingOn?: string;
  turnId?: string;
  prompt?: string;
  /** this turn builds the canvas from nothing: the forge stands in for it */
  forging?: boolean;
  /** hoisted root toolbar: sticky across revisions */
  menu?: unknown[];
  refreshable: string[];
  /** button / element ids whose action was sent this revision */
  sent: string[];
  log: TurnLogEntry[];
  /** last flash for the dot: colour only as status, only for a moment */
  flash?: { tone: "verified" | "masked" | "blocked"; at: number };
}

export interface CanvasesState {
  metas: Record<string, CanvasMeta>;
  order: string[];
  runtime: Record<string, CanvasRuntime>;
}

export const MAX_TREE_CHARS = 250_000;

const freshRuntime = (): CanvasRuntime => ({
  canvas: initialCanvasState,
  status: { state: "disconnected" },
  connected: false,
  activity: "idle",
  refreshable: [],
  sent: [],
  log: [],
});

export const canvasStore = createStore<CanvasesState>({
  metas: {},
  order: [],
  runtime: {},
});

const newKey = (): string =>
  `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const newTurnId = (): string => crypto.randomUUID();

/** A canvas nobody has asked anything yet: not worth listing or keeping. */
export function isBlank(s: CanvasesState, slotKey: string): boolean {
  const rt = s.runtime[slotKey];
  const meta = s.metas[slotKey];
  return (
    !!meta &&
    meta.title === "Neuer Canvas" &&
    (rt?.canvas.tree ?? null) === null &&
    !rt?.prompt &&
    !(rt?.canvas.turnPending ?? false)
  );
}

export const runtimeOf = (slotKey: string): CanvasRuntime =>
  canvasStore.get().runtime[slotKey] ?? freshRuntime();

function patchRuntime(
  slotKey: string,
  fn: (rt: CanvasRuntime) => CanvasRuntime,
): void {
  canvasStore.set((s) => ({
    ...s,
    runtime: {
      ...s.runtime,
      [slotKey]: fn(s.runtime[slotKey] ?? freshRuntime()),
    },
  }));
}

export function patchMeta(slotKey: string, patch: Partial<CanvasMeta>): void {
  canvasStore.set((s) => {
    const meta = s.metas[slotKey];
    if (!meta) return s;
    return {
      ...s,
      metas: {
        ...s.metas,
        [slotKey]: { ...meta, ...patch, updatedAt: Date.now() },
      },
    };
  });
  onLocalChange();
}

const log = (slotKey: string, tier: TurnLogEntry["tier"], text: string): void =>
  patchRuntime(slotKey, (rt) => ({
    ...rt,
    log: [...rt.log.slice(-199), { at: Date.now(), tier, text }],
  }));

// ── lifecycle ──

export function createCanvas(init?: Partial<CanvasMeta>): string {
  const slotKey = init?.slotKey ?? newKey();
  const now = Date.now();
  const s = canvasStore.get();
  const meta: CanvasMeta = {
    slotKey,
    title: "Neuer Canvas",
    color: s.order.length % 6,
    createdAt: now,
    updatedAt: now,
    ...init,
  };
  canvasStore.set({
    metas: { ...s.metas, [slotKey]: meta },
    order: [slotKey, ...s.order.filter((k) => k !== slotKey)],
    runtime: { ...s.runtime, [slotKey]: s.runtime[slotKey] ?? freshRuntime() },
  });
  onLocalChange();
  return slotKey;
}

/** Work in a canvas moves it to the front of the list; looking at it does
 *  not, so the sidebar stays where your eyes left it. */
function bringForward(slotKey: string): void {
  const s = canvasStore.get();
  if (s.order[0] === slotKey || !s.metas[slotKey]) return;
  canvasStore.set({
    ...s,
    order: [slotKey, ...s.order.filter((k) => k !== slotKey)],
  });
  onLocalChange();
}

/** Restore a canvas tree from the registry without opening a socket. */
export function materialize(
  slotKey: string,
  tree: unknown,
  revision?: string,
): boolean {
  if (!validateTree11(tree).ok) return false;
  patchRuntime(slotKey, (rt) => ({
    ...rt,
    canvas: {
      ...rt.canvas,
      tree,
      revision: revision ?? null,
      snapshotRevision: revision ?? null,
      lastApply: null,
    },
    menu: rootToolbar(tree)
      ? (rootToolbar(tree)?.children as unknown[])
      : rt.menu,
  }));
  return true;
}

export function restoreVoice(
  slotKey: string,
  prompt?: string,
  prose?: string,
): void {
  if (!prompt && !prose) return;
  patchRuntime(slotKey, (rt) => ({
    ...rt,
    ...(prompt ? { prompt } : {}),
    canvas: { ...rt.canvas, prose: prose ?? "" },
  }));
}

/** Dev mode: open a local tree as a canvas, with an optional voice line. */
export function openLocalTree(
  title: string,
  tree: unknown,
  prose = "",
  prompt?: string,
): string | null {
  const slotKey = createCanvas({ title, titleLocked: true });
  if (!materialize(slotKey, tree)) {
    deleteCanvas(slotKey);
    return null;
  }
  patchRuntime(slotKey, (rt) => ({
    ...rt,
    ...(prompt ? { prompt } : {}),
    activity: "idle",
    canvas: { ...rt.canvas, prose },
  }));
  return slotKey;
}

export async function ensureConnected(slotKey: string): Promise<void> {
  const server = activeServer();
  const meta = canvasStore.get().metas[slotKey];
  if (!server || !meta) return;
  const rt = runtimeOf(slotKey);
  if (rt.connected) return;
  patchRuntime(slotKey, (r) => ({ ...r, connected: true }));
  await window.omadia
    .connect({
      slotKey,
      wsUrl: server.wsUrl,
      ...(meta.sessionId ? { canvasSessionId: meta.sessionId } : {}),
    })
    .then(() => undefined)
    .catch((e: unknown) => {
      patchRuntime(slotKey, (r) => ({
        ...r,
        connected: false,
        status: { state: "failed", detail: String(e) },
      }));
    });
}

export async function disconnect(slotKey: string): Promise<void> {
  patchRuntime(slotKey, (rt) => ({ ...rt, connected: false }));
  await window.omadia
    .disconnect(slotKey)
    .then(() => undefined)
    .catch(() => undefined);
}

/** Removes the canvas everywhere: locally, in the server registry, its socket. */
export function deleteCanvas(slotKey: string): void {
  void disconnect(slotKey);
  canvasStore.set((s) => {
    const metas = { ...s.metas };
    const runtime = { ...s.runtime };
    delete metas[slotKey];
    delete runtime[slotKey];
    return { metas, runtime, order: s.order.filter((k) => k !== slotKey) };
  });
  onLocalChange(true);
}

// ── sending ──

function send(slotKey: string, message: Record<string, unknown>): void {
  window.omadia.send(slotKey, message);
}

const hasServerTree = (rt: CanvasRuntime): boolean =>
  rt.canvas.tree !== null &&
  rt.canvas.revision !== null &&
  treeSize(rt.canvas.tree) <= MAX_TREE_CHARS;

export interface PromptOptions {
  target?: unknown;
  viewState?: unknown;
}

export async function sendPrompt(
  slotKey: string,
  text: string,
  opts: PromptOptions = {},
): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) return;
  // A new request answers an open question too: it does not come back.
  const open = openQuestion(
    runtimeOf(slotKey).canvas.tree,
    canvasStore.get().metas[slotKey]?.answered,
  );
  if (open) markAnswered(slotKey, open.id as string);
  bringForward(slotKey);
  await ensureConnected(slotKey);
  const turnId = newTurnId();
  patchRuntime(slotKey, (rt) => ({
    ...rt,
    turnId,
    prompt: trimmed,
    forging: rt.canvas.tree === null,
    activity: "thinking",
    workingOn: undefined,
    sent: [],
    canvas: { ...rt.canvas, prose: "", turnPending: true, turnError: null },
  }));
  const meta = canvasStore.get().metas[slotKey];
  if (meta && !meta.titleLocked && meta.title === "Neuer Canvas") {
    patchMeta(slotKey, {
      title: trimmed.length > 48 ? `${trimmed.slice(0, 47)}…` : trimmed,
    });
  }
  log(slotKey, "T1", `turn ${trimmed.slice(0, 40)}`);
  whenReady(slotKey, () =>
    send(slotKey, {
      type: "turn",
      turnId,
      text: trimmed,
      ...(opts.target ? { target: opts.target } : {}),
      ...(opts.viewState ? { viewState: opts.viewState } : {}),
    }),
  );
}

export interface ActionInput {
  type: string;
  payload?: unknown;
  effect?: string;
}

function markAnswered(slotKey: string, questionId: string): void {
  const answered = canvasStore.get().metas[slotKey]?.answered ?? [];
  if (answered.includes(questionId)) return;
  patchMeta(slotKey, { answered: [...answered, questionId].slice(-20) });
}

/** Your pick for omadia's question goes back as the choice's action. */
export function answerQuestion(
  slotKey: string,
  question: Node,
  option: { value: string; label: string },
): void {
  const id = question.id as string;
  markAnswered(slotKey, id);
  const own = question.action as ActionInput | undefined;
  const base =
    own && typeof own.type === "string" ? own : { type: "choice_select" };
  const payload =
    base.payload && typeof base.payload === "object" ? base.payload : {};
  void sendAction(
    slotKey,
    {
      ...base,
      payload: {
        ...payload,
        value: option.value,
        label: option.label,
        ...(typeof question.label === "string"
          ? { question: question.label }
          : {}),
      },
    },
    id,
  );
}

/** A primitive's action (button, choice, toggle…): patched in place. */
export async function sendAction(
  slotKey: string,
  action: ActionInput,
  sourceId?: string,
): Promise<void> {
  bringForward(slotKey);
  await ensureConnected(slotKey);
  const rt = runtimeOf(slotKey);
  const turnId = newTurnId();
  patchRuntime(slotKey, (r) => ({
    ...r,
    turnId,
    activity: "working",
    workingOn: sourceId,
    sent: sourceId ? [...r.sent, sourceId] : r.sent,
    canvas: { ...r.canvas, prose: "", turnPending: true, turnError: null },
  }));
  log(slotKey, "T1", `action ${action.type}${sourceId ? ` @${sourceId}` : ""}`);
  whenReady(slotKey, () =>
    send(slotKey, {
      type: "turn",
      turnId,
      action: {
        type: action.type,
        ...(action.payload !== undefined ? { payload: action.payload } : {}),
      },
      ...(sourceId ? { target: { kind: "element", elementId: sourceId } } : {}),
      ...(hasServerTree(rt)
        ? { basedOnRevision: rt.canvas.revision, currentTree: rt.canvas.tree }
        : {}),
    }),
  );
}

let lastRefresh = 0;

export async function refresh(slotKey: string, scope?: string): Promise<void> {
  const rt = runtimeOf(slotKey);
  if (!hasServerTree(rt)) return;
  if (Date.now() - lastRefresh < 3000) {
    notify({
      severity: "info",
      title: "Einen Moment, die letzte Aktualisierung läuft noch",
    });
    return;
  }
  lastRefresh = Date.now();
  bringForward(slotKey);
  await ensureConnected(slotKey);
  const turnId = newTurnId();
  patchRuntime(slotKey, (r) => ({
    ...r,
    turnId,
    activity: "working",
    workingOn: scope,
    canvas: { ...r.canvas, turnPending: true, turnError: null },
  }));
  log(slotKey, "T1", `canvas_refresh${scope ? ` ${scope}` : ""}`);
  whenReady(slotKey, () =>
    send(slotKey, {
      type: "canvas_refresh",
      turnId,
      basedOnRevision: rt.canvas.revision,
      currentTree: rt.canvas.tree,
      ...(scope ? { scope } : {}),
    }),
  );
}

export function abort(slotKey: string): void {
  const rt = runtimeOf(slotKey);
  if (!rt.turnId || !rt.canvas.turnPending) return;
  send(slotKey, { type: "turn_abort", forTurn: rt.turnId });
}

export function back(slotKey: string): void {
  patchRuntime(slotKey, (rt) => ({ ...rt, canvas: goBack(rt.canvas) }));
}

/** Messages wait for the handshake; the socket may still be connecting. */
const queued = new Map<string, Array<() => void>>();

function whenReady(slotKey: string, fn: () => void): void {
  if (runtimeOf(slotKey).status.state === "ready") {
    fn();
    return;
  }
  queued.set(slotKey, [...(queued.get(slotKey) ?? []), fn]);
}

// ── receiving ──

const CONNECTION_LOST =
  "Die Verbindung ist abgerissen, die Anfrage wurde abgebrochen.";

/** The server restarts surfaceSeq at 0 for an in-place action or a refresh
 *  and patches the live tree without a snapshot first. canvas-core's reducer
 *  only lets a snapshot open a run, so it reads that patch as a gap and
 *  resyncs, which closes the socket and with it the turn. Revision equality
 *  is the integrity guard here, as in the old omadia-ui. */
function opensPatchRun(
  canvas: CanvasState,
  msg: Record<string, unknown>,
): boolean {
  return (
    msg.type === "surface_patch" &&
    msg.surfaceSeq === 0 &&
    canvas.revision !== null &&
    String(msg.basedOnRevision) === canvas.revision
  );
}

export function handleStatus(slotKey: string, status: SocketStatus): void {
  const prev = runtimeOf(slotKey);
  patchRuntime(slotKey, (rt) => ({
    ...rt,
    status,
    canvas: {
      ...rt.canvas,
      connection:
        status.state === "unauthenticated" || status.state === "forbidden"
          ? "failed"
          : status.state,
    },
  }));
  if (status.state === "ready") {
    if (status.canvasSessionId) {
      const meta = canvasStore.get().metas[slotKey];
      if (meta && meta.sessionId !== status.canvasSessionId) {
        patchMeta(slotKey, { sessionId: status.canvasSessionId });
      }
    }
    log(
      slotKey,
      "T1",
      `handshake_ack ${status.canvasSessionId?.slice(0, 8) ?? ""}`,
    );
    const pending = queued.get(slotKey) ?? [];
    queued.delete(slotKey);
    for (const fn of pending) fn();
    statusListeners.forEach((l) => l(slotKey, status, prev.status));
    return;
  }
  // The server aborts a socket's turn when the socket closes, so a turn
  // cannot finish once its socket is gone; let the dot come home and say so.
  if (prev.canvas.turnPending && prev.status.state === "ready") {
    patchRuntime(slotKey, (rt) => ({
      ...rt,
      activity: "idle",
      workingOn: undefined,
      flash: { tone: "blocked", at: Date.now() },
      canvas: {
        ...rt.canvas,
        turnPending: false,
        turnError: CONNECTION_LOST,
        tree:
          rt.canvas.revision !== null
            ? settleLoading(rt.canvas.tree)
            : rt.canvas.tree,
      },
    }));
    log(slotKey, "T2", "turn lost with its socket");
  }
  statusListeners.forEach((l) => l(slotKey, status, prev.status));
}

type StatusListener = (
  slotKey: string,
  next: SocketStatus,
  prev: SocketStatus,
) => void;
const statusListeners = new Set<StatusListener>();
export const onSocketStatus = (l: StatusListener): (() => void) => {
  statusListeners.add(l);
  return () => statusListeners.delete(l);
};

type RawListener = (slotKey: string, msg: Record<string, unknown>) => void;
const rawListeners = new Set<RawListener>();
/** Registry/desktop/notification frames go to whoever subscribes. */
export const onRawMessage = (l: RawListener): (() => void) => {
  rawListeners.add(l);
  return () => rawListeners.delete(l);
};

const severityOf = (s: unknown): Severity =>
  s === "success" || s === "warning" || s === "error" ? s : "info";

export function handleServerMessage(slotKey: string, raw: unknown): void {
  if (typeof raw !== "object" || raw === null) return;
  const msg = raw as Record<string, unknown> & { type: string };
  rawListeners.forEach((l) => l(slotKey, msg));

  if (msg.type === "notification") {
    notify({
      id: String(msg.id),
      severity: severityOf(msg.severity),
      title: String(msg.title ?? ""),
      ...(typeof msg.body === "string" ? { body: msg.body } : {}),
      ...(typeof msg.source === "string" ? { source: msg.source } : {}),
      scope: typeof msg.scope === "string" ? msg.scope : slotKey,
      ...(typeof msg.dedupeKey === "string"
        ? { dedupeKey: msg.dedupeKey }
        : {}),
      ...(typeof msg.ttlMs === "number" ? { ttlMs: msg.ttlMs } : {}),
      ...(msg.action && typeof msg.action === "object"
        ? { action: msg.action as { type: string } }
        : {}),
    });
    window.omadia.send(slotKey, { type: "notification_ack", id: msg.id });
    return;
  }
  if (msg.type === "canvas_list" || msg.type === "desktop_list") return;

  if (msg.type === "surface_data_ref_created") {
    const ref = msg.dataRef as
      { refreshable?: boolean; containerId?: string } | undefined;
    if (ref?.refreshable && ref.containerId) {
      const id = ref.containerId;
      patchRuntime(slotKey, (rt) => ({
        ...rt,
        refreshable: rt.refreshable.includes(id)
          ? rt.refreshable
          : [...rt.refreshable, id],
      }));
    }
  }

  const before = runtimeOf(slotKey);
  const { state, resync } = applyServerMessage(
    opensPatchRun(before.canvas, msg)
      ? { ...before.canvas, lastSurfaceSeq: null }
      : before.canvas,
    msg as unknown as ServerMessage,
    Date.now(),
    // this client renders Lumens: its trees may carry scene and lumen nodes
    { lumens: true },
  );
  logFrame(slotKey, msg);
  let next: CanvasRuntime = { ...before, canvas: state };

  switch (msg.type) {
    case "surface_snapshot": {
      // A new view: your old selection points at rows that are gone.
      clearSelection(slotKey);
      const toolbar = rootToolbar(state.tree);
      next = {
        ...next,
        activity: before.canvas.turnPending ? "working" : before.activity,
        workingOn: firstLoadingId(state.tree),
        sent: [],
        ...(toolbar ? { menu: toolbar.children as unknown[] } : {}),
      };
      break;
    }
    case "surface_patch": {
      const changed = state.lastApply?.changedIds[0];
      next = {
        ...next,
        activity: before.canvas.turnPending ? "working" : before.activity,
        workingOn: changed ?? before.workingOn,
      };
      const toolbar = rootToolbar(state.tree);
      if (toolbar) next.menu = toolbar.children as unknown[];
      break;
    }
    case "surface_error": {
      next.flash = { tone: "blocked", at: Date.now() };
      notify({
        severity:
          msg.severity === "warning"
            ? "warning"
            : msg.severity === "error"
              ? "error"
              : "info",
        title: String(msg.message ?? "Fehler im Canvas"),
        scope: slotKey,
      });
      break;
    }
    case "turn_complete": {
      // Rows the model wrote as text instead of publishing (see
      // recover-tool-calls.ts) still belong in the canvas.
      const recovered =
        state.revision !== null
          ? recoverPublishedRows(state.tree, state.prose)
          : null;
      if (recovered) log(slotKey, "T3", "rows recovered from text tool calls");
      next = {
        ...next,
        activity: "idle",
        workingOn: undefined,
        canvas: {
          ...state,
          tree:
            state.revision !== null
              ? settleLoading(recovered ?? state.tree)
              : state.tree,
        },
      };
      break;
    }
    case "turn_error": {
      const aborted = String(msg.message) === "aborted";
      next = {
        ...next,
        activity: "idle",
        workingOn: undefined,
        ...(aborted
          ? {}
          : { flash: { tone: "blocked" as const, at: Date.now() } }),
        canvas: {
          ...state,
          tree:
            state.revision !== null ? settleLoading(state.tree) : state.tree,
        },
      };
      break;
    }
    default:
      break;
  }

  patchRuntime(slotKey, () => next);

  if (
    msg.type === "surface_snapshot" ||
    msg.type === "surface_patch" ||
    msg.type === "turn_complete"
  ) {
    const meta = canvasStore.get().metas[slotKey];
    const derived = deriveTitle(next.canvas.tree);
    if (meta && !meta.titleLocked && derived && derived !== meta.title) {
      patchMeta(slotKey, { title: derived });
    } else if (msg.type === "turn_complete") {
      onLocalChange();
    }
  }
  if (resync) {
    log(slotKey, "T1", "resync");
    window.omadia.resync(slotKey);
  }
}

function logFrame(slotKey: string, msg: Record<string, unknown>): void {
  switch (msg.type) {
    case "surface_snapshot":
      log(
        slotKey,
        "T2",
        `surface_snapshot rev ${String(msg.producesRevision)}`,
      );
      break;
    case "surface_patch":
      log(
        slotKey,
        "T2",
        `canvas.patch rev ${String(msg.producesRevision)}, ${(msg.patches as unknown[]).length} ops`,
      );
      break;
    case "surface_data_ref_created":
      log(
        slotKey,
        "T3",
        `data_ref ${String((msg.dataRef as { containerId?: string })?.containerId ?? "")}`,
      );
      break;
    case "turn_complete":
      log(slotKey, "T2", "turn_complete");
      break;
    case "turn_error":
      log(slotKey, "T2", `turn_error ${String(msg.message)}`);
      break;
    case "surface_error":
      log(slotKey, "T2", `surface_error ${String(msg.message)}`);
      break;
    default:
      break;
  }
}

// ── local change fan-out (registry sync hooks in here) ──

type ChangeListener = (urgent: boolean) => void;
const changeListeners = new Set<ChangeListener>();
export const onCanvasesChanged = (l: ChangeListener): (() => void) => {
  changeListeners.add(l);
  return () => changeListeners.delete(l);
};
function onLocalChange(urgent = false): void {
  changeListeners.forEach((l) => l(urgent));
}

export function resetCanvases(): void {
  queued.clear();
  canvasStore.set({ metas: {}, order: [], runtime: {} });
}
