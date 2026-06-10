import { useState, type ReactNode } from 'react';
import type { CanvasSlotMeta } from './store/canvasSlots.js';

interface Props {
  slots: CanvasSlotMeta[];
  activeSlotId: string;
  /** slots with an in-flight turn — their dot pulses (building/loading) */
  busySlotIds: ReadonlySet<string>;
  onSelect: (slotId: string) => void;
  onAdd: () => void;
  onDelete: (slotId: string) => void;
  /** open the canvas library overlay (issue #12) */
  onLibrary: () => void;
}

/** Warp-style canvas rail: one entry per canvas session (auto title + color,
 *  pulsing dot while its turn is building), plus the new-canvas affordance.
 *  Pure view — slot state lives in App; switching is ALWAYS allowed. */
export function Sidebar({
  slots,
  activeSlotId,
  busySlotIds,
  onSelect,
  onAdd,
  onDelete,
  onLibrary,
}: Props): ReactNode {
  // two-step delete confirm (issue #8): the first click on × arms the entry,
  // the second deletes. No dialog, no toast — the armed label IS the
  // confirmation step, and the list shrinking is the feedback. Leaving the
  // entry (or selecting any canvas) disarms.
  const [confirmId, setConfirmId] = useState<string | null>(null);
  return (
    <nav className="lume-sidebar">
      <div className="lume-sidebar-list">
        {slots.map((s) => (
          <div
            key={s.slotId}
            role="button"
            tabIndex={0}
            className={`lume-sidebar-item${s.slotId === activeSlotId ? ' lume-sidebar-active' : ''}`}
            title={busySlotIds.has(s.slotId) ? `${s.title} — arbeitet…` : s.title}
            onClick={() => {
              setConfirmId(null);
              onSelect(s.slotId);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setConfirmId(null);
                onSelect(s.slotId);
              }
            }}
            onMouseLeave={() => {
              if (confirmId === s.slotId) setConfirmId(null);
            }}
          >
            <span
              className={`lume-sidebar-dot lume-canvas-dot-${s.color}${
                busySlotIds.has(s.slotId) ? ' lume-sidebar-dot-busy' : ''
              }`}
              aria-hidden="true"
            />
            <span className="lume-sidebar-title">{s.title}</span>
            <button
              type="button"
              className={`lume-sidebar-delete${
                confirmId === s.slotId ? ' lume-sidebar-delete-armed' : ''
              }`}
              title={
                confirmId === s.slotId
                  ? `„${s.title}“ endgültig löschen`
                  : `„${s.title}“ löschen`
              }
              aria-label={`Canvas „${s.title}“ löschen`}
              onClick={(e) => {
                e.stopPropagation();
                if (confirmId === s.slotId) {
                  setConfirmId(null);
                  onDelete(s.slotId);
                } else {
                  setConfirmId(s.slotId);
                }
              }}
            >
              {confirmId === s.slotId ? 'Löschen?' : '×'}
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        className="lume-sidebar-add"
        onClick={onLibrary}
        title="Alle Canvases als Übersicht"
      >
        ▦ Bibliothek
      </button>
      <button type="button" className="lume-sidebar-add" onClick={onAdd} title="Neuer Canvas">
        + Neuer Canvas
      </button>
    </nav>
  );
}
