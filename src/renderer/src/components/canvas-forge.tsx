import { type ReactElement, useEffect, useMemo, useRef } from "react";

import { useStore } from "../lib/create-store";
import { type Forge, startForge } from "../lib/forge-engine";
import { blueprintOf, touchedBlocks } from "../lib/forge-layout";
import { withoutQuestions } from "../lib/tree";
import { abort, canvasStore } from "../state/canvases";
import { focusPane } from "../state/workspace";
import { LightCone } from "./light-cone";

/**
 * A canvas that does not exist yet has no panel. The tile stays ground; the
 * dot draws the outline of the view as omadia builds it.
 */
export function CanvasForge({ slotKey }: { slotKey: string }): ReactElement {
  const rt = useStore(canvasStore, (s) => s.runtime[slotKey]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const anchorRef = useRef<HTMLSpanElement>(null);
  const forgeRef = useRef<Forge | null>(null);

  const tree = rt?.canvas.tree ?? null;
  const shown = useMemo(() => withoutQuestions(tree), [tree]);
  const blocks = useMemo(() => blueprintOf(shown), [shown]);
  const lastApply = rt?.canvas.lastApply;
  const changed = useMemo(
    () =>
      lastApply?.kind === "patch"
        ? touchedBlocks(shown, blocks, lastApply.changedIds)
        : [],
    [lastApply, shown, blocks],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const forge = startForge(canvas, anchorRef.current, {
      reduced: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    });
    forgeRef.current = forge;
    return () => {
      forge.destroy();
      forgeRef.current = null;
    };
  }, []);

  const workingOn = rt?.workingOn;
  useEffect(() => {
    forgeRef.current?.feed({
      blocks,
      ...(workingOn ? { focusId: workingOn } : {}),
      changed,
      changedAt: changed.length ? performance.now() : 0,
    });
  }, [blocks, workingOn, changed]);

  return (
    <section
      className="forge"
      data-pane={slotKey}
      aria-label="omadia baut den Canvas"
      aria-busy="true"
      onMouseDown={() => focusPane(slotKey)}
    >
      <LightCone height={0.8} />
      <canvas ref={canvasRef} className="forge-canvas" aria-hidden="true" />
      <span
        ref={anchorRef}
        className="forge-pen"
        data-dot-anchor={`pane:${slotKey}:center`}
        data-dot-size={6}
      />
      <header className="forge-head">
        {rt?.prompt ? <p className="forge-prompt">{rt.prompt}</p> : null}
        <button
          type="button"
          className="btn ghost sm"
          onClick={() => abort(slotKey)}
        >
          Abbrechen
        </button>
      </header>
      <p className="sr-only" role="status">
        omadia baut die Ansicht
      </p>
    </section>
  );
}
