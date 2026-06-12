import { useEffect, useRef, useState } from 'react';
import {
  applyPalette,
  currentPalette,
  LUME_PALETTES,
  PALETTE_META,
  type LumePalette,
} from './palette.js';

interface Props {
  onClose: () => void;
}

/** ⌥⌘P palette quick-picker — VS-Code-Quick-Pick idiom in Lume material
 *  (§3.6 modal materialisation). Arrow keys (and repeated ⌥⌘P) preview the
 *  palette live without persisting; ⏎ binds it (§2.5.4), esc reverts to the
 *  palette that was active on open. A transient command moment, not a
 *  Settings screen (§7.6). */
export function PalettePicker({ onClose }: Props) {
  const initialRef = useRef<LumePalette>(currentPalette());
  const [selected, setSelected] = useState<LumePalette>(initialRef.current);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;

  const preview = (palette: LumePalette) => {
    setSelected(palette);
    applyPalette(palette, { persist: false });
  };
  const confirm = (palette: LumePalette) => {
    applyPalette(palette);
    onClose();
  };
  const cancel = () => {
    applyPalette(initialRef.current, { persist: false });
    onClose();
  };

  useEffect(() => {
    const step = (dir: 1 | -1) => {
      const order = LUME_PALETTES;
      const idx = order.indexOf(selectedRef.current);
      const next = order.at((idx + dir + order.length) % order.length) ?? 'lagoon';
      preview(next);
    };
    // capture phase + stopPropagation: the picker owns the keyboard while
    // open (App's ⌘K / ⌥⌘P window handlers must not fire underneath)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown' || ((e.metaKey || e.ctrlKey) && e.altKey && e.code === 'KeyP')) {
        e.preventDefault();
        e.stopPropagation();
        step(1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        step(-1);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        confirm(selectedRef.current);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        cancel();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  return (
    <div className="lume-modal-overlay" onClick={cancel}>
      <div
        className="lume-modal-pane"
        role="dialog"
        aria-label="Farbpalette"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="lume-container-title">Farbpalette</div>
        {LUME_PALETTES.map((p) => (
          <button
            key={p}
            type="button"
            className={`lume-palette-option${p === selected ? ' lume-palette-option-selected' : ''}`}
            onMouseEnter={() => preview(p)}
            onClick={() => confirm(p)}
          >
            <span
              className="lume-palette-swatch"
              style={{ background: PALETTE_META[p].swatch, boxShadow: `0 0 8px ${PALETTE_META[p].swatch}66` }}
            />
            <span>
              <span className="lume-palette-name">{PALETTE_META[p].name}</span>
              <br />
              <span className="lume-palette-story">{PALETTE_META[p].story}</span>
            </span>
          </button>
        ))}
        <div className="lume-modal-hint">↑↓ / ⌥⌘P vorschauen · ⏎ übernehmen · esc abbrechen</div>
      </div>
    </div>
  );
}
