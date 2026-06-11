import { useState, type ReactNode } from 'react';
import { PrimitiveNode, type PrimitiveJson } from './render/PrimitiveNode.js';
import type { CanvasSlotMeta } from './store/canvasSlots.js';

interface Props {
  slots: CanvasSlotMeta[];
  activeSlotId: string;
  /** the parked/live tree per slot — null when never materialised */
  treeFor: (slotId: string) => unknown | null;
  onOpen: (slotId: string) => void;
  onDelete: (slotId: string) => void;
  onClose: () => void;
}

/** Count the data containers of a tree for the card's meta line. */
function describeTree(tree: unknown): string | null {
  let tables = 0;
  let rows = 0;
  let charts = 0;
  const walk = (n: unknown): void => {
    if (Array.isArray(n)) {
      for (const c of n) walk(c);
      return;
    }
    if (typeof n !== 'object' || n === null) return;
    const node = n as Record<string, unknown>;
    if (node['type'] === 'table' && Array.isArray(node['rows'])) {
      tables += 1;
      rows += (node['rows'] as unknown[]).length;
    } else if (node['type'] === 'chart') {
      charts += 1;
    }
    for (const v of Object.values(node)) {
      if (typeof v === 'object' && v !== null) walk(v);
    }
  };
  walk(tree);
  const parts: string[] = [];
  if (tables > 0) parts.push(`${tables} ${tables === 1 ? 'Tabelle' : 'Tabellen'} · ${rows} Zeilen`);
  if (charts > 0) parts.push(`${charts} ${charts === 1 ? 'Diagramm' : 'Diagramme'}`);
  return parts.length > 0 ? parts.join(' · ') : null;
}

/** Canvas library (issue #12 v1): every canvas the user holds a reference to,
 *  as a card with a LIVE mini-render of its last known tree (the registry
 *  already materialises trees locally — no stale thumbnails needed), plus the
 *  lifecycle actions open + delete. Owner badges / grantee lists arrive with
 *  sharing (#6); the Omadia-Graph variant is the documented follow-up. */
export function CanvasLibrary({
  slots,
  activeSlotId,
  treeFor,
  onOpen,
  onDelete,
  onClose,
}: Props): ReactNode {
  // two-step delete confirm, same idiom as the sidebar (issue #8)
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const noop = (): void => undefined;
  return (
    <div className="lume-library" onClick={onClose}>
      <div className="lume-library-panel" onClick={(e) => e.stopPropagation()}>
        <div className="lume-library-head">
          <h2 className="lume-heading">Canvas-Bibliothek</h2>
          <button className="lume-button" onClick={onClose}>
            Schließen
          </button>
        </div>
        <div className="lume-library-grid">
          {slots.map((s) => {
            const tree = treeFor(s.slotId);
            const meta = tree !== null ? describeTree(tree) : null;
            return (
              <div
                key={s.slotId}
                className={`lume-library-card${
                  s.slotId === activeSlotId ? ' lume-library-card-active' : ''
                }`}
              >
                <div className="lume-library-card-head">
                  <span className={`lume-sidebar-dot lume-canvas-dot-${s.color}`} aria-hidden />
                  <span className="lume-library-card-title" title={s.title}>
                    {s.title}
                  </span>
                </div>
                <button
                  type="button"
                  className="lume-library-preview"
                  title={`„${s.title}“ öffnen`}
                  onClick={() => onOpen(s.slotId)}
                >
                  {tree !== null ? (
                    <div className="lume-library-preview-scale" aria-hidden>
                      <PrimitiveNode node={tree as PrimitiveJson} onAction={noop} onRowMenu={noop} />
                    </div>
                  ) : (
                    <span className="lume-library-preview-empty">
                      Noch nicht geladen — öffnen stellt den Canvas wieder her.
                    </span>
                  )}
                </button>
                <div className="lume-library-card-foot">
                  <span className="lume-library-card-meta">{meta ?? ' '}</span>
                  <button
                    type="button"
                    className={`lume-sidebar-delete lume-library-delete${
                      confirmId === s.slotId ? ' lume-sidebar-delete-armed' : ''
                    }`}
                    title={
                      confirmId === s.slotId ? `„${s.title}“ endgültig löschen` : `„${s.title}“ löschen`
                    }
                    onClick={() => {
                      if (confirmId === s.slotId) {
                        setConfirmId(null);
                        onDelete(s.slotId);
                      } else {
                        setConfirmId(s.slotId);
                      }
                    }}
                    onMouseLeave={() => {
                      if (confirmId === s.slotId) setConfirmId(null);
                    }}
                  >
                    {confirmId === s.slotId ? 'Löschen?' : '×'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
