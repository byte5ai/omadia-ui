import { type Node, walk } from "../lib/tree";
import { type CanvasRuntime, canvasStore, createCanvas } from "./canvases";

/**
 * Dev mode: replays a build turn locally, without a model. The forge gets
 * what a real turn sends: a token stream, a skeleton snapshot, one patch per
 * container and the turn_complete, on a believable clock.
 */

const LOADS = new Set(["table", "chart", "list", "text", "status"]);

const STREAM = [
  "Ich lese die Anfrage: offene Tickets je Owner, dazu das Restbudget. ",
  "Quellen: Jira (Issues, Assignee), ERP (Budgetstunden), HR (Abwesenheiten). ",
  '{"tool":"jira_search","jql":"statusCategory != Done ORDER BY assignee"} ',
  "→ 28 Issues, 6 Owner. ",
  '{"tool":"erp_budget","scope":"team","period":"KW41"} ',
  "→ Restbudget je Person in Stunden. ",
  "Lege das Layout an: Titel, Herkunft, Tabelle, zwei Diagramme. ",
  '{"tool":"canvas_publish_skeleton","containers":["auslastung","budget-chart","cost-chart"]} ',
  "Fülle die Tabelle, markiere alles unter 8 Stunden. ",
  '{"tool":"canvas_publish_rows","containerId":"auslastung","rows":6} ',
  "Diagramme: Restbudget nach Abteilung, Kostenanteile. ",
  '{"tool":"canvas_publish_rows","containerId":"budget-chart"} ',
  '{"tool":"canvas_publish_rows","containerId":"cost-chart"} ',
  "Prüfe die Summen gegen das ERP. Fertig.",
];

function skeletonOf(tree: unknown): { tree: unknown; ids: string[] } {
  const ids: string[] = [];
  const strip = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(strip);
    if (typeof v !== "object" || v === null) return v;
    const n = v as Node;
    if (typeof n.type === "string" && LOADS.has(n.type) && n.id) {
      ids.push(n.id);
      return {
        ...n,
        loading: "skeleton",
        ...("rows" in n ? { rows: [] } : {}),
        ...("points" in n ? { points: [] } : {}),
      };
    }
    return Object.fromEntries(Object.entries(n).map(([k, c]) => [k, strip(c)]));
  };
  return { tree: strip(tree), ids };
}

function restore(tree: unknown, source: unknown, id: string): unknown {
  let original: Node | undefined;
  walk(source, (n) => {
    if (n.id === id) original = n;
  });
  const swap = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(swap);
    if (typeof v !== "object" || v === null) return v;
    if ((v as Node).id === id && original) return original;
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>).map(([k, c]) => [
        k,
        swap(c),
      ]),
    );
  };
  return swap(tree);
}

export function simulateBuild(
  title: string,
  prompt: string,
  source: unknown,
): string {
  const slotKey = createCanvas({ title, titleLocked: true });
  const patch = (fn: (rt: CanvasRuntime) => CanvasRuntime): void =>
    canvasStore.set((s) => {
      const rt = s.runtime[slotKey];
      return rt ? { ...s, runtime: { ...s.runtime, [slotKey]: fn(rt) } } : s;
    });
  const log = (tier: "T1" | "T2" | "T3", text: string): void =>
    patch((rt) => ({
      ...rt,
      log: [...rt.log.slice(-199), { at: Date.now(), tier, text }],
    }));
  const timers: Array<ReturnType<typeof setTimeout>> = [];
  const at = (ms: number, fn: () => void): void => {
    timers.push(
      setTimeout(() => {
        // Stop replaying once the canvas is gone or the turn was aborted.
        if (!canvasStore.get().runtime[slotKey]?.canvas.turnPending) {
          timers.forEach(clearTimeout);
          return;
        }
        fn();
      }, ms),
    );
  };

  patch((rt) => ({
    ...rt,
    connected: true,
    status: { state: "ready" },
    prompt,
    forging: true,
    activity: "thinking",
    turnId: "sim",
    canvas: { ...rt.canvas, prose: "", turnPending: true, turnError: null },
  }));
  log("T1", `turn ${prompt.slice(0, 40)}`);

  let t = 700;
  at(300, () => log("T1", "handshake_ack sim"));
  for (const chunk of STREAM.slice(0, 8)) {
    for (let i = 0; i < chunk.length; i += 6) {
      const piece = chunk.slice(i, i + 6);
      at(t, () =>
        patch((rt) => ({
          ...rt,
          canvas: { ...rt.canvas, prose: rt.canvas.prose + piece },
        })),
      );
      t += 38;
    }
    t += 220;
  }

  const { tree: skeleton, ids } = skeletonOf(source);
  let rev = 1;
  at(t, () => {
    patch((rt) => ({
      ...rt,
      activity: "working",
      workingOn: ids[0],
      canvas: {
        ...rt.canvas,
        tree: skeleton,
        revision: "1",
        snapshotRevision: "1",
        lastApply: {
          kind: "snapshot",
          revision: "1",
          changedIds: [],
          rapid: false,
        },
      },
    }));
    log("T2", "surface_snapshot rev 1");
  });
  t += 900;

  let streamAt = 8;
  ids.forEach((id, i) => {
    const chunk = STREAM[streamAt++];
    if (chunk) {
      at(t, () =>
        patch((rt) => ({
          ...rt,
          canvas: { ...rt.canvas, prose: rt.canvas.prose + chunk },
        })),
      );
    }
    t += 1300 + (i % 3) * 350;
    at(t, () => {
      rev += 1;
      const r = String(rev);
      patch((rt) => ({
        ...rt,
        workingOn: ids[i + 1],
        canvas: {
          ...rt.canvas,
          tree: restore(rt.canvas.tree, source, id),
          revision: r,
          lastApply: {
            kind: "patch",
            revision: r,
            changedIds: [id],
            rapid: false,
          },
        },
      }));
      log("T2", `canvas.patch rev ${r}, ${2 + (i % 4)} ops`);
      if (i % 2 === 0) log("T3", `data_ref ${id}`);
    });
  });

  at(t + 1100, () => {
    patch((rt) => ({
      ...rt,
      activity: "idle",
      workingOn: undefined,
      turnId: undefined,
      canvas: { ...rt.canvas, turnPending: false, tree: source },
    }));
    log("T2", "turn_complete");
  });
  return slotKey;
}
