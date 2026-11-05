// Dev bench: send one prompt like the app does and time it. Prints when the
// skeleton, the first data and the end arrived, then the filled tree as text.
// Usage: node scripts/bench-turn.mjs "prompt" [out.json] [timeoutSeconds]
import { readFileSync, writeFileSync } from "node:fs";
import WebSocket from "ws";

import { applyServerMessage, initialCanvasState } from "../node_modules/@omadia/canvas-core/dist/src/canvasStore.js";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.dev.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
const origin = env.OMADIA_DEV_SERVER;
const res = await fetch(`${origin}/api/v1/auth/login/local`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: env.OMADIA_DEV_EMAIL, password: env.OMADIA_DEV_PASSWORD }),
});
const cookie = res.headers.getSetCookie().find((c) => c.startsWith("omadia_session="))?.split(";")[0];
if (!cookie) throw new Error(`login failed ${res.status}`);

const text = process.argv[2];
const out = process.argv[3] ?? "bench-frames.json";
const timeoutS = Number(process.argv[4] ?? 300);
const frames = [];
let state = initialCanvasState;
let t0 = 0;
const marks = {};
const since = () => ((Date.now() - t0) / 1000).toFixed(1);

/** Every leaf value in the tree, as "id: value" lines. */
function dump(node, lines = []) {
  if (Array.isArray(node)) {
    node.forEach((n) => dump(n, lines));
    return lines;
  }
  if (!node || typeof node !== "object") return lines;
  const v = node.content ?? node.text;
  if (typeof v === "string" && v) lines.push(`${node.type} ${node.id}: ${v}`);
  if (node.type === "table") {
    for (const r of node.rows ?? []) lines.push(`  row ${JSON.stringify(r.cells)}`);
  }
  if (node.type === "chart") {
    for (const p of node.points ?? []) lines.push(`  point ${p.label}=${p.value}`);
  }
  for (const k of ["children", "container", "child"]) if (node[k]) dump(node[k], lines);
  for (const t of node.tabs ?? []) dump(t.child, lines);
  return lines;
}

function finish(reason) {
  writeFileSync(out, JSON.stringify(frames, null, 2));
  console.log(`\n== ${reason} after ${since()} s`);
  console.log(JSON.stringify(marks));
  console.log(dump(state.tree).join("\n"));
  process.exit(0);
}

const ws = new WebSocket(origin.replace(/^http/, "ws") + "/omadia-ui/canvas", { headers: { Cookie: cookie } });
ws.on("message", (raw) => {
  const msg = JSON.parse(String(raw));
  if (msg.type === "handshake_offer") {
    ws.send(JSON.stringify({ type: "handshake_select", handshakeId: msg.handshakeId, protocolVersion: "1.0", opsCatalogVersion: "1.0", localOperations: [] }));
    return;
  }
  if (msg.type === "handshake_ack") {
    t0 = Date.now();
    ws.send(JSON.stringify({ type: "turn", turnId: "bench-1", text }));
    return;
  }
  frames.push({ at: Number(since()), ...msg });
  try {
    state = applyServerMessage(state, msg).state;
  } catch (err) {
    console.log(`${since()} s reducer threw on ${msg.type}: ${String(err).slice(0, 300)}`);
  }
  if (msg.type === "surface_snapshot" && !marks.skeleton) marks.skeleton = since();
  if (msg.type === "surface_patch" && !marks.firstData) marks.firstData = since();
  if (msg.type === "surface_patch" || msg.type === "surface_snapshot") console.log(`${since()} s ${msg.type}`);
  if (msg.type === "turn_error") finish(`turn_error: ${msg.message}`);
  if (msg.type === "turn_complete") finish("turn_complete");
});
setTimeout(() => finish("bench timeout"), timeoutS * 1000);
