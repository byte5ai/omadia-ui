import type { ReactNode } from 'react';
import type { CanvasSlotMeta } from './store/canvasSlots.js';

interface Props {
  slots: CanvasSlotMeta[];
  activeSlotId: string;
  onSelect: (slotId: string) => void;
  onAdd: () => void;
}

/** Warp-style canvas rail: one entry per canvas session (auto title + color),
 *  plus the new-canvas affordance. Pure view — slot state lives in App. */
export function Sidebar({ slots, activeSlotId, onSelect, onAdd }: Props): ReactNode {
  return (
    <nav className="lume-sidebar">
      <div className="lume-sidebar-list">
        {slots.map((s) => (
          <button
            key={s.slotId}
            type="button"
            className={`lume-sidebar-item${s.slotId === activeSlotId ? ' lume-sidebar-active' : ''}`}
            title={s.title}
            onClick={() => onSelect(s.slotId)}
          >
            <span className={`lume-sidebar-dot lume-canvas-dot-${s.color}`} aria-hidden="true" />
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
