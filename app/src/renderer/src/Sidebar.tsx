import { useState, type ReactNode } from 'react';
import type { CanvasSlotMeta } from './store/canvasSlots.js';
import type { DesktopMeta } from './store/desktopStore.js';

interface Props {
  /** desktops — named, colored tiling layouts; the first sidebar category */
  desktops: DesktopMeta[];
  activeDesktopId: string;
  onSelectDesktop: (desktopId: string) => void;
  onAddDesktop: () => void;
  onRenameDesktop: (desktopId: string, name: string) => void;
  /** click on the dot cycles the desktop color */
  onDesktopColor: (desktopId: string) => void;
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

/** Warp-style rail in two categories: DESKTOPS (renamable + color-select
 *  tiling layouts) above, CANVASES below. Pure view — state lives in App. */
export function Sidebar({
  desktops,
  activeDesktopId,
  onSelectDesktop,
  onAddDesktop,
  onRenameDesktop,
  onDesktopColor,
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
  // confirmation step, and the list shrinking is the feedback.
  const [confirmId, setConfirmId] = useState<string | null>(null);
  // inline rename (double-click a desktop name)
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');

  const commitRename = (): void => {
    if (renameId && renameDraft.trim()) onRenameDesktop(renameId, renameDraft.trim());
    setRenameId(null);
  };

  return (
    <nav className="lume-sidebar">
      <div className="lume-sidebar-section-title">Desktops</div>
      <div className="lume-sidebar-list lume-sidebar-desktops">
        {desktops.map((d) => (
          <div
            key={d.desktopId}
            role="button"
            tabIndex={0}
            className={`lume-sidebar-item${
              d.desktopId === activeDesktopId ? ' lume-sidebar-active' : ''
            }`}
            title={d.name}
            onClick={() => onSelectDesktop(d.desktopId)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelectDesktop(d.desktopId);
              }
            }}
          >
            <button
              type="button"
              className={`lume-sidebar-dot lume-canvas-dot-${d.color} lume-desktop-dot`}
              title="Farbe wechseln"
              aria-label={`Farbe von „${d.name}“ wechseln`}
              onClick={(e) => {
                e.stopPropagation();
                onDesktopColor(d.desktopId);
              }}
            />
            {renameId === d.desktopId ? (
              <input
                className="lume-sidebar-rename"
                autoFocus
                value={renameDraft}
                onChange={(e) => setRenameDraft(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename();
                  if (e.key === 'Escape') setRenameId(null);
                }}
              />
            ) : (
              <span
                className="lume-sidebar-title"
                title={`${d.name} — Doppelklick zum Umbenennen`}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  setRenameId(d.desktopId);
                  setRenameDraft(d.name);
                }}
              >
                {d.name}
              </span>
            )}
          </div>
        ))}
      </div>
      <button type="button" className="lume-sidebar-add" onClick={onAddDesktop} title="Neuer Desktop">
        + Neuer Desktop
      </button>

      <div className="lume-sidebar-section-title">Canvases</div>
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
                confirmId === s.slotId ? `„${s.title}“ endgültig löschen` : `„${s.title}“ löschen`
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
