import { useEffect, useRef, useState } from 'react';
import type { AppSettings, ConnectOptions, ConnectionStatus } from '../../shared/ipc.js';
import { applyServerMessage, goBack, initialCanvasState, type CanvasState } from './store/canvasStore.js';
import {
  PrimitiveNode,
  type BeamTarget,
  type PrimitiveAction,
  type PrimitiveJson,
  type RowMenuRequest,
} from './render/PrimitiveNode.js';
import { Onboarding } from './onboarding/Onboarding.js';
import { Sidebar } from './Sidebar.js';
import {
  autoTitle,
  loadSlots,
  newSlot,
  saveSlots,
  type CanvasSlotMeta,
} from './store/canvasSlots.js';
import { initPalette } from './theme/palette.js';
import { PalettePicker } from './theme/PalettePicker.js';

const DEFAULT_WS_URL: string =
  import.meta.env.VITE_OMADIA_WS_URL ?? 'ws://127.0.0.1:8181/omadia-ui/canvas';
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
  const inactiveStates = useRef(new Map<string, CanvasState>());
  // true once the server's canvas list arrived — local pushes wait for the
  // merge so a fresh install never clobbers the user's server-side registry
  const canvasListSynced = useRef(false);
  // turn prose is debug-only: hidden behind the bottom-right marker
  const [showTurnLog, setShowTurnLog] = useState(false);
  // ⌥⌘P palette quick-picker (VS-Code-Quick-Pick idiom, §3.6 modal)
  const [showPalettePicker, setShowPalettePicker] = useState(false);
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
  const stateRef = useRef(canvas);
  stateRef.current = canvas;
  const promptRef = useRef<HTMLInputElement>(null);
  const proseRef = useRef<HTMLDivElement>(null);

  // keep the newest text in view while the turn-log panel is open
  useEffect(() => {
    proseRef.current?.scrollTo(0, proseRef.current.scrollHeight);
  }, [canvas.prose, showTurnLog]);

  useEffect(() => {
    const offMsg = window.omadiaCanvas.onServerMessage((msg) => {
      // per-user canvas registry (LVL2-persisted): server list is authoritative
      // for known sessions; local-only slots (never connected) are kept.
      if (msg.type === 'canvas_list') {
        canvasListSynced.current = true;
        const server = msg.canvases;
        if (server.length > 0) {
          setSlots((prev) => {
            const bySession = new Map(
              prev.filter((s) => s.sessionId).map((s) => [s.sessionId as string, s]),
            );
            const merged: CanvasSlotMeta[] = server.map((e) => {
              const existing = bySession.get(e.sessionId);
              return existing
                ? { ...existing, title: e.title || existing.title, color: e.color }
                : {
                    slotId: crypto.randomUUID(),
                    title: e.title || 'Canvas',
                    color: e.color,
                    sessionId: e.sessionId,
                  };
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
      const { state, resync } = applyServerMessage(stateRef.current, msg);
      setCanvas(state);
      if (resync) window.omadiaCanvas.requestResync();
    });
    const offStatus = window.omadiaCanvas.onStatus(setStatus);
    void window.omadiaCanvas.getSettings().then((saved) => {
      setSettings(saved);
      // resume the ACTIVE slot's canvas session (not just the last-used file id)
      const active = initialSlots.current.slots.find(
        (s) => s.slotId === (initialSlots.current.activeId || initialSlots.current.slots[0]?.slotId),
      );
      if (saved)
        void window.omadiaCanvas.connect({
          ...toConnectOptions(saved),
          ...(active?.sessionId ? { canvasSessionId: active.sessionId } : {}),
        });
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
    }
  }, [pending, status]);

  // bind the server-acked canvasSessionId to the active slot (first connect
  // mints it; later connects echo it) and pull the user's server-side canvas
  // registry — app-start sync across installs.
  useEffect(() => {
    if (status.state !== 'ready') return;
    if (status.canvasSessionId) {
      setSlots((prev) =>
        prev.map((s) =>
          s.slotId === activeSlotId && s.sessionId !== status.canvasSessionId
            ? { ...s, sessionId: status.canvasSessionId }
            : s,
        ),
      );
    }
    window.omadiaCanvas.requestCanvasList();
  }, [status, activeSlotId]);

  // push slot metadata to the LVL2 registry (debounced; only after the first
  // server merge so we never overwrite the registry with a stale local view)
  useEffect(() => {
    if (!canvasListSynced.current) return;
    const t = setTimeout(() => {
      window.omadiaCanvas.saveCanvasList(
        slots
          .filter((s) => s.sessionId)
          .map((s) => ({ sessionId: s.sessionId as string, title: s.title, color: s.color })),
      );
    }, 800);
    return () => clearTimeout(t);
  }, [slots]);

  // the canvas names itself — first heading/title of the active tree
  useEffect(() => {
    if (canvas.tree === null) return;
    const title = autoTitle(canvas.tree);
    if (!title) return;
    setSlots((prev) =>
      prev.map((s) => (s.slotId === activeSlotId && s.title !== title ? { ...s, title } : s)),
    );
  }, [canvas.tree, activeSlotId]);

  useEffect(() => {
    saveSlots(slots, activeSlotId);
  }, [slots, activeSlotId]);

  /** park the current canvas, surface the target slot, reconnect its session */
  const switchCanvas = (slotId: string) => {
    if (slotId === activeSlotId || !settings) return;
    inactiveStates.current.set(activeSlotId, stateRef.current);
    const target = slots.find((s) => s.slotId === slotId);
    setActiveSlotId(slotId);
    setCanvas(inactiveStates.current.get(slotId) ?? initialCanvasState);
    setBeam(null);
    setRowMenu(null);
    setShowPrompt(false);
    setDraft('');
    setStatus({ state: 'connecting' });
    void window.omadiaCanvas.connect({
      ...toConnectOptions(settings),
      ...(target?.sessionId ? { canvasSessionId: target.sessionId } : { freshSession: true }),
    });
  };

  const addCanvas = () => {
    if (!settings) return;
    const slot = newSlot(slots.length);
    setSlots((prev) => [...prev, slot]);
    inactiveStates.current.set(activeSlotId, stateRef.current);
    setActiveSlotId(slot.slotId);
    setCanvas(initialCanvasState);
    setBeam(null);
    setRowMenu(null);
    setShowPrompt(false);
    setDraft('');
    setStatus({ state: 'connecting' });
    void window.omadiaCanvas.connect({ ...toConnectOptions(settings), freshSession: true });
  };

  const submitSetup = (candidate: AppSettings) => {
    setPending(candidate);
    // optimistic: the last status may still be 'ready' from the old connection
    setStatus({ state: 'connecting' });
    setCanvas(initialCanvasState);
    void window.omadiaCanvas.connect(toConnectOptions(candidate));
  };

  const cancelSetup = () => {
    setShowSetup(false);
    if (pending && settings) {
      // a failed attempt replaced the socket — reconnect to the saved server
      setPending(null);
      setStatus({ state: 'connecting' });
      void window.omadiaCanvas.connect(toConnectOptions(settings));
    }
  };

  const submitPrompt = () => {
    const text = draft.trim();
    if (!text) return;
    window.omadiaCanvas.sendTurn({ type: 'turn', turnId: crypto.randomUUID(), text });
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
    window.omadiaCanvas.sendTurn({
      type: 'turn',
      turnId: crypto.randomUUID(),
      text,
      target: target ?? { kind: 'item', containerId: menu.tableId, itemKey: menu.rowKey },
    });
    setBeam({ containerId: menu.tableId, rowKey: menu.rowKey, x: menu.x, y: menu.y });
    setCanvas((c) => ({ ...c, turnPending: true, turnError: null, prose: '' }));
  };

  const onAction = (action: PrimitiveAction) => {
    window.omadiaCanvas.sendTurn({
      type: 'turn',
      turnId: crypto.randomUUID(),
      action: { type: action.type, payload: action.payload },
      ...(action.sourceId ? { target: { kind: 'element', elementId: action.sourceId } } : {}),
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

  return (
    <div style={{ display: 'flex', flexDirection: 'row', height: '100%' }}>
      <Sidebar slots={slots} activeSlotId={activeSlotId} onSelect={switchCanvas} onAdd={addCanvas} />
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
      {/* instant feedback the moment a turn fires — the old view stays
          (back-navigable), the lit strip says "omadia is working" */}
      {canvas.turnPending && (
        <div className="lume-turn-progress" role="progressbar" aria-label="turn pending">
          <span className="lume-turn-progress-bar" />
        </div>
      )}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {/* view-only back navigation — in flow, above the tree; Layer-2
            persistence is a later slice */}
        {canvas.tree !== null && canvas.history.length > 0 && (
          <button className="lume-button lume-back-button" onClick={() => setCanvas((c) => goBack(c))}>
            ← Zurück
          </button>
        )}
        {canvas.tree ? (
          // §6.1 motion split: snapshot → full-canvas crossfade (key per
          // snapshot run, so patches never remount the tree); patch →
          // per-node condensation via the condense prop.
          <div
            key={canvas.snapshotRevision ?? 'local-pending'}
            className={canvas.lastApply?.kind === 'snapshot' ? 'lume-crossfade' : undefined}
          >
            <PrimitiveNode
              node={canvas.tree as PrimitiveJson}
              onAction={onAction}
              onRowMenu={(req) => {
                setBeamDraft('');
                setRowMenu(req);
              }}
              condense={
                canvas.lastApply?.kind === 'patch'
                  ? {
                      ids: new Set(canvas.lastApply.changedIds),
                      revision: canvas.lastApply.revision,
                      rapid: canvas.lastApply.rapid,
                    }
                  : undefined
              }
              beamTarget={beam}
            />
          </div>
        ) : (
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
                    void window.omadiaCanvas.connect(toConnectOptions(settings));
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
        )}
      </div>
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
      </div>
    </div>
  );
}
