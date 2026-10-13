import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { AppSettings, ConnectOptions, ConnectionStatus } from '../../shared/ipc.js';
import { applyServerMessage, goBack, initialCanvasState, type CanvasState } from './store/canvasStore.js';
import { extractRootMenu, loadStoredMenu, storeMenu } from './store/canvasMenu.js';
import { syncNamespace } from './store/prefsNamespace.js';
import { validateTree } from './validate/validator.js';
import {
  PrimitiveNode,
  type BeamTarget,
  type PrimitiveAction,
  type PrimitiveJson,
  type RowMenuRequest,
} from './render/PrimitiveNode.js';
import { Notifications } from './Notifications.js';
import { Onboarding } from './onboarding/Onboarding.js';
import {
  addNotification,
  dismissNotification,
  loadNotifications,
  markAllRead,
  persistNotifications,
  type UiNotification,
} from './store/notificationStore.js';
import {
  autoTitle,
  loadSlots,
  newSlot,
  saveSlots,
  type CanvasSlotMeta,
} from './store/canvasSlots.js';
import { initPalette } from './theme/palette.js';
import { PalettePicker } from './theme/PalettePicker.js';
import { Board } from './Board.js';
import {
  initialBoardState,
  loadBoard,
  placeApp,
  reconcileApps,
  saveBoard,
  type BoardState,
} from './store/boardStore.js';

const DEFAULT_WS_URL: string =
  import.meta.env.VITE_OMADIA_WS_URL ?? 'ws://127.0.0.1:8080/omadia-ui/canvas';
const DEFAULT_USE_AUTH =
  import.meta.env.VITE_OMADIA_USE_AUTH === '1' || DEFAULT_WS_URL.startsWith('wss');

const toConnectOptions = (s: AppSettings): ConnectOptions => ({
  url: s.serverUrl,
  useAuth: s.useAuth,
  ...(s.loginUrl ? { loginUrl: s.loginUrl } : {}),
});

/** Client-local pending canvas, rendered the instant a cold-start prompt is
 *  submitted (<50ms, no server round-trip; spec §7.2 skeleton-pulse, no
 *  spinner). The server's skeleton snapshot replaces it on arrival; the store
 *  drops it again on turn_complete/turn_error if no snapshot ever came. */
const LOCAL_PENDING_TREE = {
  type: 'container',
  id: 'local-pending',
  layout: 'stack',
  children: [
    {
      type: 'table',
      id: 'local-pending-table',
      loading: 'skeleton',
      columns: [
        { fieldKey: 'a', label: ' ' },
        { fieldKey: 'b', label: ' ' },
        { fieldKey: 'c', label: ' ' },
      ],
      rows: [],
    },
  ],
};

export function App() {
  // undefined = settings not loaded yet; null = never connected successfully
  const [settings, setSettings] = useState<AppSettings | null | undefined>(undefined);
  // candidate from the setup card — persisted only on the first 'ready'
  const [pending, setPending] = useState<AppSettings | null>(null);
  const [showSetup, setShowSetup] = useState(false);
  const [canvas, setCanvas] = useState<CanvasState>(initialCanvasState);
  const [status, setStatus] = useState<ConnectionStatus>({ state: 'disconnected' });
  const [draft, setDraft] = useState('');
  // ⌘K prompt modal (live canvas; cold-start uses the spotlight stage)
  const [showPrompt, setShowPrompt] = useState(false);
  // multi-canvas sidebar: metadata persists; inactive TREES stay in memory
  const initialSlots = useRef(loadSlots() ?? { slots: [newSlot(0)], activeId: '' });
  const [slots, setSlots] = useState<CanvasSlotMeta[]>(initialSlots.current.slots);
  const [activeSlotId, setActiveSlotId] = useState<string>(
    initialSlots.current.activeId || (initialSlots.current.slots[0]?.slotId ?? ''),
  );
  // the fluid Board (Miro idiom) replaces Desktops + the split-tree tiling:
  // a pan/zoom viewport + per-app geometry. Pure Tier-1 view-state (CONCEPT
  // Authority Model) — persisted client-side, never a server turn.
  const [board, setBoard] = useState<BoardState>(() => loadBoard() ?? initialBoardState);
  useEffect(() => {
    saveBoard(board);
  }, [board]);
  // every app gets board geometry; a vanished app loses its frame slot. The
  // helper is ref-stable when nothing changed, so React bails out (no loop).
  useEffect(() => {
    setBoard((b) => reconcileApps(b, slots.map((s) => s.slotId)));
  }, [slots]);
  // one canvas state per slot — background slots keep receiving their
  // streams (one socket per slot), so switching mid-turn loses nothing
  const slotStates = useRef(new Map<string, CanvasState>());
  // slots whose socket exists — a switch to a connected slot is a pure view
  // swap, NO reconnect (reconnect would kill the in-flight stream)
  const connectedSlots = useRef(new Set<string>());
  const statusBySlot = useRef(new Map<string, ConnectionStatus>());
  // the in-flight turn per slot — the abort affordance targets it (issue #13)
  const pendingTurnIds = useRef(new Map<string, string>());
  // bump to re-render the sidebar when a BACKGROUND slot's state changes
  const [, setBgTick] = useState(0);
  // true once the server's canvas list arrived — local pushes wait for the
  // merge so a fresh install never clobbers the user's server-side registry
  const canvasListSynced = useRef(false);
  // out-of-band notifications (issue #15) — bell history persists client-side
  const [notifications, setNotifications] = useState<UiNotification[]>(loadNotifications);
  useEffect(() => {
    persistNotifications(notifications);
  }, [notifications]);
  // sessions deleted this run (issue #8) — an in-flight canvas_list merge
  // must never resurrect them before the shrunken registry put lands
  const deletedSessions = useRef(new Set<string>());
  // turn prose is debug-only: hidden behind the bottom-right marker
  const [showTurnLog, setShowTurnLog] = useState(false);
  // ⌥⌘P palette quick-picker (VS-Code-Quick-Pick idiom, §3.6 modal)
  const [showPalettePicker, setShowPalettePicker] = useState(false);
  // floating instance-switcher chip (relocated from the deleted sidebar)
  const [instancesOpen, setInstancesOpen] = useState(false);
  // right-click context-invoke panel (closed on any outside click)
  const [rowMenu, setRowMenu] = useState<RowMenuRequest | null>(null);
  // free-intent text in the panel's beam field
  const [beamDraft, setBeamDraft] = useState('');
  // a pending beam sticks to its target until the turn resolves; on
  // turn_error it carries the message as an inline chip for a few seconds
  const [beam, setBeam] = useState<(BeamTarget & { x: number; y: number; error?: string }) | null>(
    null,
  );
  useEffect(() => {
    if (!rowMenu) return;
    const close = () => setRowMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [rowMenu]);

  // beam lifecycle (concept §Beam lifecycle + Trace): resolve → pin disappears;
  // error → inline chip for a few seconds, then fades without trace.
  useEffect(() => {
    if (!beam || canvas.turnPending) return;
    if (canvas.turnError && !beam.error) {
      setBeam({ ...beam, error: canvas.turnError });
      return;
    }
    const t = setTimeout(() => setBeam(null), beam.error ? 4000 : 0);
    return () => clearTimeout(t);
  }, [beam, canvas.turnPending, canvas.turnError]);
  const slotsRef = useRef(slots);
  slotsRef.current = slots;
  const stateRef = useRef(canvas);
  stateRef.current = canvas;
  const activeSlotIdRef = useRef(activeSlotId);
  activeSlotIdRef.current = activeSlotId;
  // the active slot's state always mirrors `canvas` (local mutations included)
  slotStates.current.set(activeSlotId, canvas);
  const promptRef = useRef<HTMLInputElement>(null);
  const proseRef = useRef<HTMLDivElement>(null);

  // keep the newest text in view while the turn-log panel is open
  useEffect(() => {
    proseRef.current?.scrollTo(0, proseRef.current.scrollHeight);
  }, [canvas.prose, showTurnLog]);

  useEffect(() => {
    const offMsg = window.omadiaCanvas.onServerMessage((slotKey, msg) => {
      // notifications are OUT-OF-BAND from the canvas surface (issue #15)
      if (msg.type === 'notification') {
        setNotifications((l) => addNotification(l, msg, slotKey, Date.now()));
        return;
      }
      // per-user canvas registry (LVL2-persisted): server list is authoritative
      // for known sessions; local-only slots (never connected) are kept.
      if (msg.type === 'canvas_list') {
        canvasListSynced.current = true;
        const server = msg.canvases.filter((e) => !deletedSessions.current.has(e.sessionId));
        if (server.length > 0) {
          setSlots((prev) => {
            const bySession = new Map(
              prev.filter((s) => s.sessionId).map((s) => [s.sessionId as string, s]),
            );
            const merged: CanvasSlotMeta[] = server.map((e) => {
              const existing = bySession.get(e.sessionId);
              // a slot with a LIVE tree has fresher metadata than the registry
              // snapshot — its auto-title wins over the persisted one
              const localFresher = existing
                ? (slotStates.current.get(existing.slotId)?.tree ?? null) !== null
                : false;
              const slot: CanvasSlotMeta = existing
                ? {
                    ...existing,
                    title: localFresher ? existing.title : e.title || existing.title,
                    color: e.color,
                  }
                : {
                    slotId: crypto.randomUUID(),
                    title: e.title || 'Canvas',
                    color: e.color,
                    sessionId: e.sessionId,
                  };
              // materialise the canvas from its persisted snapshot — only if
              // nothing live exists yet, and only when the tree passes the
              // whitelist (the registry blob is data, not trusted shape)
              const live = slotStates.current.get(slot.slotId);
              if (e.tree && (!live || live.tree === null) && validateTree(e.tree).ok) {
                const restored: CanvasState = {
                  ...initialCanvasState,
                  tree: e.tree,
                  revision: e.revision ?? null,
                  snapshotRevision: e.revision ?? 'restored',
                  // §2.15: restored state may be a menu-less view (an error
                  // tree) — fall back to the persisted app menu
                  menu: extractRootMenu(e.tree) ?? loadStoredMenu(e.sessionId),
                };
                slotStates.current.set(slot.slotId, restored);
                if (slot.slotId === activeSlotIdRef.current && stateRef.current.tree === null) {
                  setCanvas(restored);
                }
              }
              return slot;
            });
            const serverIds = new Set(server.map((e) => e.sessionId));
            for (const s of prev) {
              if (!s.sessionId || !serverIds.has(s.sessionId)) merged.push(s);
            }
            return merged;
          });
        }
        return;
      }
      // route by SLOT: background streams land in their slot's state, the
      // active slot additionally re-renders the visible canvas.
      const prev =
        slotKey === activeSlotIdRef.current
          ? stateRef.current
          : (slotStates.current.get(slotKey) ?? initialCanvasState);
      const { state, resync } = applyServerMessage(prev, msg);
      slotStates.current.set(slotKey, state);
      // §2.15: persist the app menu so it survives an app restart that
      // lands on a menu-less server state (e.g. an error tree)
      if (state.menu !== prev.menu) {
        const sess = slotsRef.current.find((s) => s.slotId === slotKey)?.sessionId;
        if (sess) storeMenu(sess, state.menu);
      }
      if (slotKey === activeSlotIdRef.current) {
        setCanvas(state);
      } else {
        setBgTick((t) => t + 1); // sidebar busy/title indicators
      }
      // background canvases name themselves too
      if (state.tree !== null) {
        const title = autoTitle(state.tree);
        if (title) {
          setSlots((p) => p.map((s) => (s.slotId === slotKey && s.title !== title ? { ...s, title } : s)));
        }
      }
      if (resync) window.omadiaCanvas.requestResync(slotKey);
    });
    const offStatus = window.omadiaCanvas.onStatus((slotKey, st) => {
      statusBySlot.current.set(slotKey, st);
      // expired/missing kernel session (issue #7): surface the sign-in card
      // instead of a generic connection error — regardless of which slot hit it
      if (st.state === 'failed' && st.authRequired) setShowSetup(true);
      if (st.state === 'ready') {
        connectedSlots.current.add(slotKey);
        if (st.canvasSessionId) {
          setSlots((p) =>
            p.map((s) =>
              s.slotId === slotKey && s.sessionId !== st.canvasSessionId
                ? { ...s, sessionId: st.canvasSessionId }
                : s,
            ),
          );
        }
        window.omadiaCanvas.requestCanvasList(slotKey);
      }
      if (slotKey === activeSlotIdRef.current) setStatus(st);
    });
    void window.omadiaCanvas.getSettings().then((saved) => {
      // instance switcher: prefs are namespaced per instance. When the
      // recorded namespace differs from the active instance (first run
      // after the update, switch from the setup card, external edit),
      // adopt/record it and reboot the renderer so every store re-reads
      // under the right keys — nothing below has dialed yet.
      if (saved?.activeInstanceId && syncNamespace(saved.activeInstanceId)) {
        window.location.reload();
        return;
      }
      setSettings(saved);
      if (!saved) return;
      // every app on the board is "visible" and live — each dials its own
      // socket on boot (no tiling layout to gate which panes connect).
      for (const slot of initialSlots.current.slots) {
        void window.omadiaCanvas.connect(slot.slotId, {
          ...toConnectOptions(saved),
          ...(slot.sessionId ? { canvasSessionId: slot.sessionId } : { freshSession: true }),
        });
      }
    });
    initPalette();
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        // live canvas → summon the centered prompt modal (§5.3 Spotlight);
        // cold-start → the stage IS the spotlight, just focus it.
        if (stateRef.current.tree !== null) setShowPrompt(true);
        else promptRef.current?.focus();
      }
      // ⌥⌘P opens the palette quick-picker (§2.5.4) — local stand-in until
      // the conversational Tier-2 ui-prefs binding lands; e.code because ⌥
      // remaps e.key on macOS. While the picker is open it owns the keyboard
      // (capture-phase handler), so this never double-fires.
      if ((e.metaKey || e.ctrlKey) && e.altKey && e.code === 'KeyP') {
        e.preventDefault();
        setShowPalettePicker(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      offMsg();
      offStatus();
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  // persist the candidate only once it actually connected (first 'ready')
  useEffect(() => {
    if (pending && status.state === 'ready') {
      void window.omadiaCanvas.saveSettings(pending);
      setSettings(pending);
      setPending(null);
      setShowSetup(false);
      // a setup that changed the ACTIVE instance moves the prefs namespace —
      // reboot the renderer so every store re-reads under the new keys
      if (pending.activeInstanceId && syncNamespace(pending.activeInstanceId)) {
        window.location.reload();
      }
    }
  }, [pending, status]);

  // the canvas_list_put payload — shared by the debounced push below and the
  // immediate push on canvas delete
  const toRegistryEntries = (list: CanvasSlotMeta[]) =>
    list
      .filter((s) => s.sessionId)
      .map((s) => {
        const st = slotStates.current.get(s.slotId);
        const tree =
          st?.tree && (st.tree as { id?: string }).id !== 'local-pending' ? st.tree : undefined;
        return {
          sessionId: s.sessionId as string,
          title: s.title,
          color: s.color,
          ...(tree ? { tree, ...(st?.revision ? { revision: st.revision } : {}) } : {}),
        };
      });

  // push slot metadata + the last server-authoritative tree to the LVL2
  // registry (debounced; only after the first server merge so we never
  // overwrite the registry with a stale local view). The tree is what
  // re-materialises the canvas on the next app start / other installs.
  useEffect(() => {
    if (!canvasListSynced.current) return;
    const t = setTimeout(() => {
      window.omadiaCanvas.saveCanvasList(activeSlotIdRef.current, toRegistryEntries(slots));
    }, 800);
    return () => clearTimeout(t);
  }, [slots, canvas.tree]);

  useEffect(() => {
    saveSlots(slots, activeSlotId);
  }, [slots, activeSlotId]);

  const ensureConnected = (slotId: string) => {
    if (!settings || connectedSlots.current.has(slotId)) return;
    const slot = slots.find((s) => s.slotId === slotId);
    void window.omadiaCanvas.connect(slotId, {
      ...toConnectOptions(settings),
      ...(slot?.sessionId ? { canvasSessionId: slot.sessionId } : { freshSession: true }),
    });
  };

  /** Focus a pane: pure view/state swap — sockets and in-flight streams of
   *  every pane keep running untouched. */
  const focusSlot = (slotId: string) => {
    if (slotId === activeSlotId) return;
    setActiveSlotId(slotId);
    setCanvas(slotStates.current.get(slotId) ?? initialCanvasState);
    setBeam(null);
    setRowMenu(null);
    setShowPrompt(false);
    setDraft('');
    setStatus(statusBySlot.current.get(slotId) ?? { state: 'connecting' });
    ensureConnected(slotId);
  };

  /** New app on the board: a fresh cold-start canvas placed at `anchor`
   *  (double-click point) or cascaded. It dials its own socket and takes
   *  focus; geometry is set here so the anchor is honoured (the reconcile
   *  effect only fills geometry that is still missing). */
  const addCanvas = (anchor?: { x: number; y: number }) => {
    if (!settings) return;
    const slot = newSlot(slots.length);
    setSlots((prev) => [...prev, slot]);
    setBoard((b) => ({
      ...b,
      apps: { ...b.apps, [slot.slotId]: placeApp(b.apps, anchor) },
    }));
    focusSlot(slot.slotId);
  };

  /** Issue #8, pre-sharing v1: deleting a canvas is a COMPLETE delete — the
   *  slot, its parked state, its socket (aborting any in-flight turn) and its
   *  registry entry all go. The list reflecting the removal is the feedback
   *  (no toasts). Grant-aware reference counting arrives with sharing (#6). */
  const deleteCanvas = (slotId: string) => {
    const target = slots.find((s) => s.slotId === slotId);
    if (!target || !settings) return;
    if (target.sessionId) deletedSessions.current.add(target.sessionId);
    const remaining = slots.filter((s) => s.slotId !== slotId);
    // push the shrunken registry NOW, before the doomed socket closes — the
    // debounced push alone would race a reconnect's canvas_list and the
    // tombstone set only guards THIS run. Carrier: the deleted slot's own
    // socket if live (IPC send/invoke stay ordered), else any live socket.
    if (canvasListSynced.current) {
      const carrier = connectedSlots.current.has(slotId)
        ? slotId
        : (remaining.find((s) => connectedSlots.current.has(s.slotId))?.slotId ??
          activeSlotIdRef.current);
      window.omadiaCanvas.saveCanvasList(carrier, toRegistryEntries(remaining));
    }
    void window.omadiaCanvas.disconnect(slotId);
    slotStates.current.delete(slotId);
    connectedSlots.current.delete(slotId);
    statusBySlot.current.delete(slotId);
    if (remaining.length === 0) {
      // a canvas is never empty (concept §Interaction Model) — the last
      // delete detaches into a fresh cold-start slot with its spotlight
      const fresh = newSlot(0);
      setSlots([fresh]);
      setActiveSlotId(fresh.slotId);
      setCanvas(initialCanvasState);
      setBeam(null);
      setRowMenu(null);
      setShowPrompt(false);
      setDraft('');
      setStatus({ state: 'connecting' });
      void window.omadiaCanvas.connect(fresh.slotId, {
        ...toConnectOptions(settings),
        freshSession: true,
      });
      return;
    }
    setSlots(remaining);
    // the deleted app's frame + geometry are dropped by the reconcile effect;
    // if it was focused, fall through to the first remaining app.
    if (slotId === activeSlotId) {
      focusSlot((remaining[0] as CanvasSlotMeta).slotId);
    }
  };

  // bottom-left instance switcher: persist the new active instance (the
  // settings store mirrors serverUrl/useAuth/loginUrl from it), record the
  // prefs namespace, then reboot the renderer — the boot path re-reads the
  // namespaced workspace and re-fetches EVERYTHING from the new server
  // (registry materialisation included).
  const switchInstance = (instanceId: string) => {
    if (!settings?.instances || instanceId === settings.activeInstanceId) return;
    if (!settings.instances.some((i) => i.id === instanceId)) return;
    const next: AppSettings = { ...settings, activeInstanceId: instanceId };
    void window.omadiaCanvas
      .saveSettings(next)
      .then(() => window.omadiaCanvas.disconnectAll())
      .catch(() => undefined)
      .then(() => {
        syncNamespace(instanceId);
        window.location.reload();
      });
  };

  // setup card → multi-instance settings: a known serverUrl updates that
  // instance, a new one is appended (named after its host) and becomes
  // active. Keeps the legacy single-server candidate shape working.
  const withInstance = (candidate: AppSettings): AppSettings => {
    const instances = settings?.instances ? [...settings.instances] : [];
    const existing = instances.find((i) => i.serverUrl === candidate.serverUrl);
    if (existing) {
      const updated = {
        ...existing,
        useAuth: candidate.useAuth,
        ...(candidate.loginUrl !== undefined ? { loginUrl: candidate.loginUrl } : {}),
      };
      return {
        ...candidate,
        instances: instances.map((i) => (i.id === existing.id ? updated : i)),
        activeInstanceId: existing.id,
      };
    }
    const name = (() => {
      try {
        return new URL(candidate.serverUrl.replace(/^ws/, 'http')).host;
      } catch {
        return `Instanz ${instances.length + 1}`;
      }
    })();
    const created = {
      id: crypto.randomUUID(),
      name,
      serverUrl: candidate.serverUrl,
      useAuth: candidate.useAuth,
      ...(candidate.loginUrl !== undefined ? { loginUrl: candidate.loginUrl } : {}),
    };
    return { ...candidate, instances: [...instances, created], activeInstanceId: created.id };
  };

  const submitSetup = (rawCandidate: AppSettings) => {
    const candidate = withInstance(rawCandidate);
    setPending(candidate);
    // optimistic: the last status may still be 'ready' from the old connection.
    // A server change invalidates EVERY slot's socket and parked tree.
    setStatus({ state: 'connecting' });
    setCanvas(initialCanvasState);
    slotStates.current.clear();
    connectedSlots.current.clear();
    statusBySlot.current.clear();
    const redial = (): void => {
      // every app on the board redials against the new server
      for (const slot of slots) {
        void window.omadiaCanvas.connect(slot.slotId, {
          ...toConnectOptions(candidate),
          ...(slot.sessionId ? { canvasSessionId: slot.sessionId } : { freshSession: true }),
        });
      }
    };
    // redial must run even if the teardown invoke rejects — a silently
    // dropped continuation here deadlocked the post-login transition
    void window.omadiaCanvas.disconnectAll().then(redial, redial);
  };

  // safety valve: a pending setup/sign-in that never reaches 'ready' must
  // not trap the user in the busy pane — surface a retryable failure.
  useEffect(() => {
    if (!pending) return;
    const t = setTimeout(() => {
      setPending(null);
      setStatus((s) =>
        s.state === 'ready'
          ? s
          : { state: 'failed', detail: 'Verbindung nach Anmeldung fehlgeschlagen — bitte erneut versuchen.' },
      );
    }, 12_000);
    return () => clearTimeout(t);
  }, [pending]);

  const cancelSetup = () => {
    setShowSetup(false);
    if (pending && settings) {
      // a failed attempt replaced the socket — reconnect to the saved server
      setPending(null);
      setStatus({ state: 'connecting' });
      const active = slots.find((s) => s.slotId === activeSlotIdRef.current);
      void window.omadiaCanvas.connect(activeSlotIdRef.current, {
        ...toConnectOptions(settings),
        ...(active?.sessionId ? { canvasSessionId: active.sessionId } : { freshSession: true }),
      });
    }
  };

  /** Deterministic refresh (issue #5): same canvas, same query, newer data —
   *  no new view is composed. The client sends its current tree + revision;
   *  the server re-resolves the data and answers with patches that REPLACE
   *  the stale rows. Reuses the turn-pending strip; no toasts. */
  const refreshCanvas = (scope?: string) => {
    if (!canvas.tree || canvas.revision === null || canvas.turnPending) return;
    if ((canvas.tree as { id?: string }).id === 'local-pending') return;
    const turnId = crypto.randomUUID();
    pendingTurnIds.current.set(activeSlotId, turnId);
    window.omadiaCanvas.refreshCanvas(activeSlotId, {
      type: 'canvas_refresh',
      turnId,
      basedOnRevision: canvas.revision,
      currentTree: canvas.tree,
      ...(scope ? { scope } : {}),
    });
    setCanvas((c) => ({ ...c, turnPending: true, turnError: null, prose: '' }));
  };

  /** PR-9b-3: on an ACTION turn, hand the server our live tree + revision so it
   *  patches IN PLACE (no skeleton remount) — a status-flip becomes a
   *  surface_patch, a full recompose still snapshots. Only when a real server
   *  tree is rendered; never the local-pending skeleton. Mirrors refreshCanvas. */
  const inPlaceCanvasState = (): { basedOnRevision: string; currentTree: unknown } | undefined => {
    if (!canvas.tree || canvas.revision === null) return undefined;
    if ((canvas.tree as { id?: string }).id === 'local-pending') return undefined;
    return { basedOnRevision: canvas.revision, currentTree: canvas.tree };
  };

  const submitPrompt = () => {
    const text = draft.trim();
    if (!text) return;
    const turnId = crypto.randomUUID();
    pendingTurnIds.current.set(activeSlotId, turnId);
    window.omadiaCanvas.sendTurn(activeSlotId, { type: 'turn', turnId, text });
    setCanvas((c) => ({
      ...c,
      turnPending: true,
      turnError: null,
      prose: '',
      // jump to the canvas immediately on cold start — local skeleton, no wait
      ...(c.tree === null ? { tree: LOCAL_PENDING_TREE } : {}),
    }));
    setDraft('');
  };

  /** Beam-as-prompt (concept §Interaction Model): free intent deterministically
   *  bound to the row's stable TargetRef — `{kind:'item', containerId, itemKey}`,
   *  never view positions. The pin sticks to the row until the turn resolves. */
  const submitBeam = (menu: RowMenuRequest, text: string, target?: unknown) => {
    setRowMenu(null);
    setBeamDraft('');
    const turnId = crypto.randomUUID();
    pendingTurnIds.current.set(activeSlotId, turnId);
    window.omadiaCanvas.sendTurn(activeSlotId, {
      type: 'turn',
      turnId,
      text,
      target: target ?? { kind: 'item', containerId: menu.tableId, itemKey: menu.rowKey },
    });
    setBeam({ containerId: menu.tableId, rowKey: menu.rowKey, x: menu.x, y: menu.y });
    setCanvas((c) => ({ ...c, turnPending: true, turnError: null, prose: '' }));
  };

  const onAction = (action: PrimitiveAction) => {
    const turnId = crypto.randomUUID();
    pendingTurnIds.current.set(activeSlotId, turnId);
    window.omadiaCanvas.sendTurn(activeSlotId, {
      type: 'turn',
      turnId,
      action: { type: action.type, payload: action.payload },
      ...(action.sourceId ? { target: { kind: 'element', elementId: action.sourceId } } : {}),
      // PR-9b-3: hand our live tree so the server patches in place, no remount.
      ...(inPlaceCanvasState() ?? {}),
    });
  };

  // The clicked row, spelled out for the turn text — the agent must never have
  // to guess WHICH record a context action refers to (deterministic context).
  const rowContext = (menu: RowMenuRequest): string => {
    const summary = Object.entries(menu.cells)
      .filter(([, v]) => v !== '' && v !== null && v !== undefined)
      .map(([k, v]) => `${k}: ${String(v)}`)
      .join(', ');
    return `(${summary}; rowKey ${menu.rowKey})`;
  };

  // generic fallback affordance — shown ONLY when the agent supplied no
  // suggestedActions for the container. What "details" means (and which
  // actions fit the current view) is the agent's call, not the client's.
  const showRowDetails = (menu: RowMenuRequest) => {
    submitBeam(
      menu,
      `Zeige die Details zu diesem Datensatz ${rowContext(menu)}. ` +
        `Stelle die Ansicht als Panes dar — eine Übersicht und die zum Datensatz ` +
        `passenden Detail-Tabellen.`,
    );
  };

  // settings load is a local file read — sub-300ms, so no skeleton (spec §7.2)
  if (settings === undefined) return null;
  if (settings === null || showSetup) {
    const defaults = pending ??
      settings ?? { serverUrl: DEFAULT_WS_URL, useAuth: DEFAULT_USE_AUTH };
    return (
      <>
        <Onboarding
          defaults={defaults}
          status={status}
          busy={pending !== null}
          canCancel={settings !== null}
          onSubmit={submitSetup}
          onCancel={cancelSetup}
        />
        {showPalettePicker && <PalettePicker onClose={() => setShowPalettePicker(false)} />}
      </>
    );
  }

  // sidebar busy indicator: every slot with an in-flight turn (active slot
  // reads live state, background slots their parked-but-streaming state)
  const busySlots = new Set<string>();
  slotStates.current.forEach((st, id) => {
    if (st.turnPending) busySlots.add(id);
  });
  if (canvas.turnPending) busySlots.add(activeSlotId);
  else busySlots.delete(activeSlotId);

  // One pane = one independent canvas. The focused pane renders the live
  // `canvas` state; background panes their (still streaming) parked state.
  const renderPane = (slotId: string): ReactNode => {
    const focused = slotId === activeSlotId;
    const st = focused ? canvas : (slotStates.current.get(slotId) ?? initialCanvasState);
    if (st.tree === null) {
      if (!focused) {
        return <div className="lume-pane-empty">Leere App — klicken zum Fokussieren.</div>;
      }
      return (
        // Cold-start: a canvas is never empty (concept §Interaction Model).
        // Spotlight treatment per visual-spec §5.3 — the stage itself glows.
        <div className="lume-spotlight">
          <input
            ref={promptRef}
            className="lume-input lume-spotlight-input"
            autoFocus
            placeholder="Ask omadia…"
            disabled={status.state !== 'ready'}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submitPrompt()}
          />
          {status.state === 'failed' && (
            <div className="lume-canvas-error">
              <span>{status.detail ?? 'Connection failed.'}</span>
              <button
                className="lume-button"
                onClick={() => {
                  setStatus({ state: 'connecting' });
                  const active = slots.find((s) => s.slotId === activeSlotId);
                  void window.omadiaCanvas.connect(activeSlotId, {
                    ...toConnectOptions(settings),
                    ...(active?.sessionId
                      ? { canvasSessionId: active.sessionId }
                      : { freshSession: true }),
                  });
                }}
              >
                Retry
              </button>
              <button className="lume-button" onClick={() => setShowSetup(true)}>
                Change server
              </button>
            </div>
          )}
        </div>
      );
    }
    return (
      <>
        {/* §2.15 static app menu — hoisted root toolbar, sticky across
            revisions: an error tree never strands the user without nav */}
        {st.menu !== null && (
          <nav className="lume-pane-menu">
            <PrimitiveNode node={st.menu as PrimitiveJson} onAction={onAction} />
          </nav>
        )}
        {/* §6.1 motion split: snapshot → crossfade (key per snapshot run);
            patch → per-node condensation via the condense prop. */}
        <div
          key={st.snapshotRevision ?? 'local-pending'}
          className={`lume-canvas-root${st.lastApply?.kind === 'snapshot' ? ' lume-crossfade' : ''}`}
        >
          <PrimitiveNode
            node={st.tree as PrimitiveJson}
            root
            hoistedMenuId={(st.menu?.['id'] as string | undefined) ?? undefined}
            onAction={onAction}
            onRowMenu={(req) => {
              setBeamDraft('');
              setRowMenu(req);
            }}
            condense={
              st.lastApply?.kind === 'patch'
                ? {
                    ids: new Set(st.lastApply.changedIds),
                    revision: st.lastApply.revision,
                    rapid: st.lastApply.rapid,
                  }
                : undefined
            }
            beamTarget={focused ? beam : null}
          />
        </div>
      </>
    );
  };

  // chrome budget (visual-spec §2.14): back navigation + deterministic
  // refresh (issue #5) live IN the pane-bar — one chrome row per pane,
  // never a second row above the canvas tree. Focused pane only.
  const paneBarNav = (slotId: string): ReactNode => {
    if (slotId !== activeSlotId || canvas.tree === null) return null;
    const canBack = canvas.history.length > 0;
    const canRefresh =
      canvas.revision !== null && (canvas.tree as { id?: string }).id !== 'local-pending';
    if (!canBack && !canRefresh) return null;
    return (
      <>
        {canBack && (
          <button type="button" title="Zurück (vorherige Ansicht)" onClick={() => setCanvas((c) => goBack(c))}>
            ←
          </button>
        )}
        {canRefresh && (
          <button
            type="button"
            title="Aktualisieren — gleiche Ansicht, frische Daten"
            disabled={canvas.turnPending || status.state !== 'ready'}
            onClick={() => refreshCanvas()}
          >
            ↻
          </button>
        )}
      </>
    );
  };

  return (
    <div className="lume-shell">
      {/* instant feedback the moment a turn fires — the old view stays
          (back-navigable), the lit strip says "omadia is working" */}
      {canvas.turnPending && (
        <div className="lume-turn-progress" role="progressbar" aria-label="turn pending">
          <span className="lume-turn-progress-bar" />
        </div>
      )}
      {/* abort the in-flight turn (issue #13) — header affordance, rendered
          ONLY while a turn is active; the canvas keeps what already rendered */}
      {canvas.turnPending && (
        <button
          className="lume-turn-abort"
          title="Laufenden Turn abbrechen"
          onClick={() => {
            const id = pendingTurnIds.current.get(activeSlotId);
            if (id) window.omadiaCanvas.abortTurn(activeSlotId, id);
          }}
        >
          ✕ Abbrechen
        </button>
      )}
      <Board
        board={board}
        setBoard={setBoard}
        apps={slots.map((s) => ({ slotId: s.slotId, title: s.title, color: s.color }))}
        activeSlotId={activeSlotId}
        busySlotIds={busySlots}
        canDelete={slots.length > 1}
        paneBarExtras={paneBarNav}
        renderApp={renderPane}
        onFocus={focusSlot}
        onAddApp={addCanvas}
        onDeleteApp={deleteCanvas}
      />
      {rowMenu && (
        // context-invoke action panel: agent-pre-supplied suggestedActions
        // (no turn on open!) own the menu; the generic details affordance is
        // only the fallback when the agent supplied none. Clicks inside must
        // not bubble to the window-closer.
        <div
          className="lume-row-menu"
          style={{ left: rowMenu.x, top: rowMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {rowMenu.suggestedActions.length === 0 && (
            <button className="lume-row-menu-item" onClick={() => showRowDetails(rowMenu)}>
              Details anzeigen
            </button>
          )}
          {/* per-primitive refresh (issue #5): scoped to THIS table — a local
              affordance, present regardless of agent-supplied actions */}
          <button
            className="lume-row-menu-item"
            onClick={() => {
              setRowMenu(null);
              refreshCanvas(rowMenu.tableId);
            }}
          >
            {canvas.dataRefs[rowMenu.tableId]?.refreshable
              ? '↻ Tabelle aktualisieren (sofort)'
              : '↻ Tabelle aktualisieren'}
          </button>
          {rowMenu.suggestedActions.map((a) => (
            <button
              key={a.id}
              className="lume-row-menu-item"
              // fires immediately — prompt + the clicked row spelled out, so the
              // agent never has to disambiguate (no confirm round-trip).
              onClick={() =>
                submitBeam(rowMenu, `${a.prompt?.trim() ? a.prompt : a.label} ${rowContext(rowMenu)}`)
              }
            >
              {a.label}
            </button>
          ))}
          <input
            className="lume-input lume-beam-field"
            placeholder="Beam omadia about this…"
            value={beamDraft}
            onChange={(e) => setBeamDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && beamDraft.trim()) submitBeam(rowMenu, beamDraft.trim());
              if (e.key === 'Escape') setRowMenu(null);
            }}
          />
        </div>
      )}
      {/* beam error chip — inline at the beam origin, fades after a few seconds */}
      {beam?.error && (
        <div className="lume-beam-chip lume-beam-chip-error" style={{ left: beam.x, top: beam.y }}>
          {beam.error}
        </div>
      )}
      {/* The canvas is the surface of record — raw turn prose is debug-only,
          reachable via the small marker bottom-right. */}
      {canvas.prose && (
        <button
          className="lume-debug-marker"
          title="Turn-Log (Debug)"
          onClick={() => setShowTurnLog((v) => !v)}
        >
          {showTurnLog ? '× turn-log' : '· turn-log'}
        </button>
      )}
      {canvas.prose && showTurnLog && (
        <div ref={proseRef} className="lume-debug-panel lume-prose">
          {canvas.prose}
        </div>
      )}
      {/* ⌘K prompt — a centered Spotlight modal over the live canvas: just
          the prompt, no other chrome. Esc / outside click dismisses. */}
      {showPrompt && canvas.tree !== null && (
        <div className="lume-prompt-overlay" onClick={() => setShowPrompt(false)}>
          <div className="lume-prompt-modal" onClick={(e) => e.stopPropagation()}>
            <input
              className="lume-input lume-spotlight-input"
              autoFocus
              placeholder="Ask omadia…"
              disabled={canvas.turnPending || status.state !== 'ready'}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && draft.trim()) {
                  submitPrompt();
                  setShowPrompt(false);
                }
                if (e.key === 'Escape') setShowPrompt(false);
              }}
            />
          </div>
        </div>
      )}
      {canvas.tree === null && (
        // Empty-canvas status line per visual-spec §7.1 — click to change server
        <button
          className="lume-canvas-status"
          title="Connection — click to change server"
          onClick={() => setShowSetup(true)}
        >
          {status.state === 'ready'
            ? 'Canvas ready. ⌘K to start.'
            : `${status.state}${status.detail ? ` — ${status.detail}` : ''}`}
        </button>
      )}
      {import.meta.env.DEV && canvas.notices.length > 0 && (
        <div className="lume-notices">
          {canvas.notices.slice(-5).map((n, i) => (
            <div key={i}>{n}</div>
          ))}
        </div>
      )}
      {showPalettePicker && <PalettePicker onClose={() => setShowPalettePicker(false)} />}
      <Notifications
        notifications={notifications}
        onDismiss={(id) => {
          const n = notifications.find((x) => x.id === id);
          setNotifications((l) => dismissNotification(l, id));
          if (n) window.omadiaCanvas.ackNotification(n.slotKey, id);
        }}
        onMarkAllRead={() => setNotifications((l) => markAllRead(l))}
        onAction={(n) => {
          // typed action reuses the canvas action→turn plumbing on the
          // ACTIVE canvas; the notification is dismissed alongside.
          if (n.action) {
            window.omadiaCanvas.sendTurn(activeSlotId, {
              type: 'turn',
              turnId: crypto.randomUUID(),
              action: { type: n.action.type, payload: n.action.payload },
              // PR-9b-3: patch in place when a live tree is rendered.
              ...(inPlaceCanvasState() ?? {}),
            });
            setCanvas((c) => ({ ...c, turnPending: true, turnError: null, prose: '' }));
          }
          setNotifications((l) => dismissNotification(l, n.id));
          window.omadiaCanvas.ackNotification(n.slotKey, n.id);
        }}
      />
      {/* instance switcher — relocated from the deleted sidebar to a floating
          bottom-left chip. Which omadia this board talks to; switching
          re-fetches EVERYTHING against the selected server. */}
      {settings?.instances && settings.instances.length > 0 && (
        <div className="lume-board-instances">
          {instancesOpen && (
            <div className="lume-instance-list" role="menu">
              {settings.instances.map((i) => (
                <button
                  key={i.id}
                  type="button"
                  role="menuitem"
                  className={`lume-instance-item${
                    i.id === settings.activeInstanceId ? ' lume-instance-active' : ''
                  }`}
                  title={i.serverUrl}
                  onClick={() => {
                    setInstancesOpen(false);
                    switchInstance(i.id);
                  }}
                >
                  <span className="lume-instance-dot" aria-hidden />
                  {i.name}
                  {i.id === settings.activeInstanceId ? ' ✓' : ''}
                </button>
              ))}
              <button
                type="button"
                role="menuitem"
                className="lume-instance-item"
                onClick={() => {
                  setInstancesOpen(false);
                  setShowSetup(true);
                }}
              >
                + Instanz hinzufügen…
              </button>
            </div>
          )}
          <button
            type="button"
            className="lume-instance-chip"
            aria-expanded={instancesOpen}
            onClick={() => setInstancesOpen((o) => !o)}
          >
            <span className="lume-instance-dot lume-instance-dot-live" aria-hidden />
            <span className="lume-instance-name">
              {settings.instances.find((i) => i.id === settings.activeInstanceId)?.name ?? 'Omadia'}
            </span>
            <span className="lume-instance-caret" aria-hidden>
              {instancesOpen ? '▾' : '▸'}
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
