import { useEffect, useRef, useState } from 'react';
import type { AppSettings, ConnectOptions, ConnectionStatus } from '../../shared/ipc.js';
import { applyServerMessage, goBack, initialCanvasState, type CanvasState } from './store/canvasStore.js';
import {
  PrimitiveNode,
  type PrimitiveAction,
  type PrimitiveJson,
  type RowMenuRequest,
} from './render/PrimitiveNode.js';
import { Onboarding } from './onboarding/Onboarding.js';

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
  // right-click row context menu (closed on any outside click)
  const [rowMenu, setRowMenu] = useState<RowMenuRequest | null>(null);
  useEffect(() => {
    if (!rowMenu) return;
    const close = () => setRowMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [rowMenu]);
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
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        promptRef.current?.focus();
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
      prose: '',
      // jump to the canvas immediately on cold start — local skeleton, no wait
      ...(c.tree === null ? { tree: LOCAL_PENDING_TREE } : {}),
    }));
    setDraft('');
  };

  const onAction = (action: PrimitiveAction) => {
    window.omadiaCanvas.sendTurn({
      type: 'turn',
      turnId: crypto.randomUUID(),
      action: { type: action.type, payload: action.payload },
      ...(action.sourceId ? { target: { kind: 'element', elementId: action.sourceId } } : {}),
    });
  };

  // context-menu action: details for the clicked row, rendered as panes by
  // the next composed canvas (the previous view stays back-navigable).
  const showRowDetails = (menu: RowMenuRequest) => {
    setRowMenu(null);
    const summary = Object.entries(menu.cells)
      .filter(([, v]) => v !== '' && v !== null && v !== undefined)
      .map(([k, v]) => `${k}: ${String(v)}`)
      .join(', ');
    window.omadiaCanvas.sendTurn({
      type: 'turn',
      turnId: crypto.randomUUID(),
      text:
        `Zeige die Details zu diesem Datensatz inklusive der Teilnehmerliste ` +
        `(${summary}; rowKey ${menu.rowKey}). Stelle die Ansicht als Panes dar: ` +
        `eine Übersicht und eine Teilnehmer-Tabelle.`,
      target: { kind: 'element', elementId: menu.tableId },
    });
    setCanvas((c) => ({ ...c, turnPending: true, prose: '' }));
  };

  // settings load is a local file read — sub-300ms, so no skeleton (spec §7.2)
  if (settings === undefined) return null;
  if (settings === null || showSetup) {
    const defaults = pending ??
      settings ?? { serverUrl: DEFAULT_WS_URL, useAuth: DEFAULT_USE_AUTH };
    return (
      <Onboarding
        defaults={defaults}
        status={status}
        busy={pending !== null}
        canCancel={settings !== null}
        onSubmit={submitSetup}
        onCancel={cancelSetup}
      />
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ flex: 1, overflow: 'auto' }}>
        {canvas.tree ? (
          <PrimitiveNode node={canvas.tree as PrimitiveJson} onAction={onAction} onRowMenu={setRowMenu} />
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
      {/* view-only back navigation — Layer-2 persistence is a later slice */}
      {canvas.tree !== null && canvas.history.length > 0 && (
        <button className="lume-button lume-back-button" onClick={() => setCanvas((c) => goBack(c))}>
          ← Zurück
        </button>
      )}
      {rowMenu && (
        <div className="lume-row-menu" style={{ left: rowMenu.x, top: rowMenu.y }}>
          <button className="lume-row-menu-item" onClick={() => showRowDetails(rowMenu)}>
            Details anzeigen (inkl. Teilnehmer)
          </button>
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
    </div>
  );
}
