import type { ReactElement, ReactNode } from "react";

import { type Node, str } from "../lib/tree";
import { ButtonNode, ChoiceNode, InputNode, ToggleNode } from "./control-nodes";
import { ChartNode, ListNode, TableNode, TreeNode } from "./data-nodes";
import {
  CanvasRegionNode,
  MediaNode,
  TimelineNode,
  VectorPathNode,
} from "./editor-nodes";
import {
  ContainerNode,
  FormNode,
  MenubarNode,
  PaneNode,
  TabsNode,
  ToolbarNode,
} from "./layout-nodes";
import { LumenNode, SceneNode } from "./lumen-nodes";
import { useRender } from "./render-context";
import {
  DividerNode,
  HeadingNode,
  ImageNode,
  ProgressNode,
  StatusNode,
  TextNode,
} from "./text-nodes";

type Renderer = (props: { node: Node }) => ReactElement | null;

const RENDERERS: Record<string, Renderer> = {
  text: TextNode,
  heading: HeadingNode,
  status: StatusNode,
  divider: DividerNode,
  progress: ProgressNode,
  image: ImageNode,
  container: ContainerNode,
  pane: PaneNode,
  tabs: TabsNode,
  toolbar: ToolbarNode,
  menubar: MenubarNode,
  form: FormNode,
  table: TableNode,
  list: ListNode,
  tree: TreeNode,
  chart: ChartNode,
  button: ButtonNode,
  input: InputNode,
  choice: ChoiceNode,
  toggle: ToggleNode,
  media: MediaNode,
  "canvas-region": CanvasRegionNode,
  timeline: TimelineNode,
  "vector-path": VectorPathNode,
  // omadia-canvas-protocol/1.1
  lumen: LumenNode,
  scene: SceneNode,
};

/** Data-carrying primitives keep their frame and show skeleton rows. */
const SKELETON_IN_PLACE = new Set(["table", "list", "chart", "tree"]);

export function PrimitiveNode({ node }: { node: Node }): ReactElement | null {
  const ctx = useRender();
  const Render = RENDERERS[node.type];
  if (!Render) return null;
  const id = str(node.id);
  const loading = node.loading === "skeleton" || node.loading === "spinner";
  const error = node.error as
    { message?: string; severity?: string } | null | undefined;

  let body: ReactNode;
  if (loading && !SKELETON_IN_PLACE.has(node.type)) {
    body = <Skeleton lines={node.type === "text" ? 2 : 3} />;
  } else {
    body = <Render node={node} />;
  }

  const emerging = id !== undefined && ctx.changed.has(id);
  return (
    <div
      className={`p-node p-${node.type}-wrap${emerging ? " emerge" : ""}`}
      data-node-id={id}
    >
      {body}
      {error && typeof error.message === "string" ? (
        <ErrorBlock message={error.message} severity={error.severity} />
      ) : null}
    </div>
  );
}

export function Skeleton({ lines = 3 }: { lines?: number }): ReactElement {
  const widths = ["90%", "70%", "80%", "60%", "75%"];
  return (
    <div className="p-skeleton" aria-label="omadia lädt hier" role="status">
      {Array.from({ length: lines }, (_, i) => (
        <div
          key={i}
          className="skeleton"
          style={{ width: widths[i % widths.length] }}
        />
      ))}
    </div>
  );
}

function ErrorBlock({
  message,
  severity,
}: {
  message: string;
  severity?: string;
}): ReactElement {
  const ctx = useRender();
  const tone =
    severity === "error"
      ? "danger"
      : severity === "warning"
        ? "warning"
        : "info";
  return (
    <div className="p-error" role={severity === "error" ? "alert" : "status"}>
      <span className={`status ${tone}`}>{message}</span>
      {severity === "error" ? (
        <button
          type="button"
          className="btn sm"
          onClick={() => ctx.action({ type: "retry" })}
        >
          Erneut versuchen
        </button>
      ) : null}
    </div>
  );
}

export function Children({ nodes }: { nodes: unknown[] }): ReactElement {
  return (
    <>
      {nodes.map((c, i) =>
        c && typeof c === "object" && typeof (c as Node).type === "string" ? (
          <PrimitiveNode
            key={str((c as Node).id) ?? `${(c as Node).type}-${i}`}
            node={c as Node}
          />
        ) : null,
      )}
    </>
  );
}
