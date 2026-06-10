import type { ReactNode } from 'react';
import type { CanvasSlotMeta } from './store/canvasSlots.js';

interface Props {
  slots: CanvasSlotMeta[];
  activeSlotId: string;
  /** slots with an in-flight turn — their dot pulses (building/loading) */
  busySlotIds: ReadonlySet<string>;
  onSelect: (slotId: string) => void;
  onAdd: () => void;
}

/** Warp-style canvas rail: one entry per canvas session (auto title + color,
 *  pulsing dot while its turn is building), plus the new-canvas affordance.
 *  Pure view — slot state lives in App; switching is ALWAYS allowed. */
export function Sidebar({ slots, activeSlotId, busySlotIds, onSelect, onAdd }: Props): ReactNode {
  return (
    <nav className="lume-sidebar">
      <div className="lume-sidebar-list">
        {slots.map((s) => (
          <button
            key={s.slotId}
            type="button"
            className={`lume-sidebar-item${s.slotId === activeSlotId ? ' lume-sidebar-active' : ''}`}
            title={busySlotIds.has(s.slotId) ? `${s.title} — arbeitet…` : s.title}
            onClick={() => onSelect(s.slotId)}
          >
            <span
              className={`lume-sidebar-dot lume-canvas-dot-${s.color}${
                busySlotIds.has(s.slotId) ? ' lume-sidebar-dot-busy' : ''
              }`}
              aria-hidden="true"
            />
            <span className="lume-sidebar-title">{s.title}</span>
          </button>
        ))}
      </div>
      <button type="button" className="lume-sidebar-add" onClick={onAdd} title="Neuer Canvas">
        + Neuer Canvas
      </button>
    </nav>
  );
}
