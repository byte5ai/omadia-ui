import { useEffect, useRef, useState } from 'react';
import type { ConnectionStatus } from '../../shared/ipc.js';
import { applyServerMessage, initialCanvasState, type CanvasState } from './store/canvasStore.js';
import { PrimitiveNode, type PrimitiveAction, type PrimitiveJson } from './render/PrimitiveNode.js';

const WS_URL: string = import.meta.env.VITE_OMADIA_WS_URL ?? 'ws://127.0.0.1:8181/omadia-ui/canvas';
const USE_AUTH = import.meta.env.VITE_OMADIA_USE_AUTH === '1' || WS_URL.startsWith('wss');

export function App() {
  const [canvas, setCanvas] = useState<CanvasState>(initialCanvasState);
  const [status, setStatus] = useState<ConnectionStatus>({ state: 'disconnected' });
  const [draft, setDraft] = useState('');
  const stateRef = useRef(canvas);
  stateRef.current = canvas;

  useEffect(() => {
    const offMsg = window.omadiaCanvas.onServerMessage((msg) => {
      const { state, resync } = applyServerMessage(stateRef.current, msg);
      setCanvas(state);
      if (resync) window.omadiaCanvas.requestResync();
    });
    const offStatus = window.omadiaCanvas.onStatus(setStatus);
    void window.omadiaCanvas.connect({ url: WS_URL, useAuth: USE_AUTH });
    return () => {
      offMsg();
      offStatus();
    };
  }, []);

  const submitPrompt = () => {
    const text = draft.trim();
    if (!text) return;
    window.omadiaCanvas.sendTurn({ type: 'turn', turnId: crypto.randomUUID(), text });
    setCanvas((c) => ({ ...c, turnPending: true, prose: '' }));
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ flex: 1, overflow: 'auto' }}>
        {canvas.tree ? (
          <PrimitiveNode node={canvas.tree as PrimitiveJson} onAction={onAction} />
        ) : (
          // Cold-start: a canvas is never empty (concept §Interaction Model).
          <div className="lume-coldstart">
            <input
              autoFocus
              placeholder={
                status.state === 'ready'
                  ? 'Ask omadia…'
                  : `(${status.state}${status.detail ? `: ${status.detail}` : ''})`
              }
              disabled={status.state !== 'ready'}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submitPrompt()}
            />
          </div>
        )}
      </div>
      {canvas.prose && <div className="lume-prose-strip lume-prose">{canvas.prose}</div>}
      {canvas.tree !== null && (
        <div className="lume-prose-strip">
          <input
            style={{ width: '100%', background: 'transparent', border: 'none', color: 'inherit', outline: 'none' }}
            placeholder={canvas.turnPending ? 'working…' : '⌘K — ask omadia…'}
            disabled={canvas.turnPending || status.state !== 'ready'}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submitPrompt()}
          />
        </div>
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
