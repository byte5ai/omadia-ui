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
      const { state, resync } = applyServerMessage(stateRef.current, msg);
      setCanvas(state);
      if (resync) window.omadiaCanvas.requestResync();
    });
    const offStatus = window.omadiaCanvas.onStatus(setStatus);
    void window.omadiaCanvas.getSettings().then((saved) => {
      setSettings(saved);
      if (saved) void window.omadiaCanvas.connect(toConnectOptions(saved));
    });
    initPalette();
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        promptRef.current?.focus();
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

  // generic fallback affordance — shown ONLY when the agent supplied no
  // suggestedActions for the container. What "details" means (and which
  // actions fit the current view) is the agent's call, not the client's.
  const showRowDetails = (menu: RowMenuRequest) => {
    const summary = Object.entries(menu.cells)
      .filter(([, v]) => v !== '' && v !== null && v !== undefined)
      .map(([k, v]) => `${k}: ${String(v)}`)
      .join(', ');
    submitBeam(
      menu,
      `Zeige die Details zu diesem Datensatz (${summary}; rowKey ${menu.rowKey}). ` +
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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
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
              onClick={() =>
                a.prompt !== undefined && a.prompt !== ''
                  ? setBeamDraft(a.prompt) // expands into a beam — user confirms
                  : submitBeam(rowMenu, a.label, a.target)
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
      {canvas.tree !== null && (
        <div className="lume-prose-strip">
          <input
            ref={promptRef}
            style={{ width: '100%', background: 'transparent', border: 'none', color: 'inherit', outline: 'none' }}
            placeholder={canvas.turnPending ? 'working…' : '⌘K — ask omadia…'}
            disabled={canvas.turnPending || status.state !== 'ready'}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submitPrompt()}
          />
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
  );
}
