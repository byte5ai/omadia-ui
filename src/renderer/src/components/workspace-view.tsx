import { type ReactElement, useRef } from "react";

import { useStore } from "../lib/create-store";
import { createCanvas } from "../state/canvases";
import {
  activeDesktop,
  type Layout,
  leaves,
  setRatio,
  showCanvas,
  workspaceStore,
} from "../state/workspace";
import { CanvasPane } from "./canvas-pane";
import { Icon } from "./icons";

/** The tiling area of the active desktop. */
export function WorkspaceView(): ReactElement {
  const desktop = useStore(workspaceStore, (s) => activeDesktop(s));
  const layout = desktop?.layout ?? null;
  if (!layout) {
    return (
      <main className="workspace empty">
        <div className="empty-desk">
          <p className="t-voice">Dieser Desktop ist leer.</p>
          <button
            type="button"
            className="btn primary"
            onClick={() => showCanvas(createCanvas())}
          >
            <Icon name="plus" />
            Canvas anlegen
          </button>
        </div>
      </main>
    );
  }
  const single = leaves(layout).length === 1;
  return (
    <main className="workspace">
      <Tile
        layout={layout}
        path=""
        focused={desktop?.focused}
        single={single}
      />
    </main>
  );
}

function Tile({
  layout,
  path,
  focused,
  single,
}: {
  layout: Layout;
  path: string;
  focused?: string;
  single: boolean;
}): ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  if (layout.kind === "leaf") {
    return (
      <CanvasPane
        slotKey={layout.slotKey}
        focused={focused === layout.slotKey}
        single={single}
      />
    );
  }
  const columns = layout.dir === "columns";
  const startDrag = (e: React.PointerEvent): void => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    e.preventDefault();
    const move = (ev: PointerEvent): void => {
      const ratio = columns
        ? (ev.clientX - box.left) / box.width
        : (ev.clientY - box.top) / box.height;
      setRatio(path, ratio);
    };
    const up = (): void => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  const sub = (k: "a" | "b"): string => (path ? `${path}.${k}` : k);
  return (
    <div
      ref={ref}
      className={`tile ${columns ? "cols" : "rows"}`}
      style={{
        [columns ? "gridTemplateColumns" : "gridTemplateRows"]:
          `minmax(0, ${layout.ratio}fr) 12px minmax(0, ${1 - layout.ratio}fr)`,
      }}
    >
      <Tile
        layout={layout.a}
        path={sub("a")}
        focused={focused}
        single={single}
      />
      <div
        className="tile-gutter"
        role="separator"
        aria-orientation={columns ? "vertical" : "horizontal"}
        onPointerDown={startDrag}
      />
      <Tile
        layout={layout.b}
        path={sub("b")}
        focused={focused}
        single={single}
      />
    </div>
  );
}
