// Dev probe: sign in with .env.dev.local, open a canvas socket, send one
// prompt and dump every server frame. Usage: node scripts/probe-turn.mjs "text"
import { readFileSync, writeFileSync } from "node:fs";
import WebSocket from "ws";

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
const frames = [];
const ws = new WebSocket(origin.replace(/^http/, "ws") + "/omadia-ui/canvas", { headers: { Cookie: cookie } });
const text = process.argv[2] ?? "Zeig mir eine kleine Tabelle mit drei Beispielprojekten und Status";
ws.on("message", (raw) => {
  const msg = JSON.parse(String(raw));
  frames.push(msg);
  console.log(msg.type, msg.type === "agent_text_delta" ? "" : JSON.stringify(msg).slice(0, 160));
  if (msg.type === "handshake_offer") ws.send(JSON.stringify({ type: "handshake_select", handshakeId: msg.handshakeId, protocolVersion: "1.0", opsCatalogVersion: "1.0", localOperations: [] }));
  if (msg.type === "handshake_ack") ws.send(JSON.stringify({ type: "turn", turnId: "probe-1", text }));
  if (msg.type === "turn_complete" || msg.type === "turn_error") {
    writeFileSync(process.argv[3] ?? "probe-frames.json", JSON.stringify(frames, null, 2));
    ws.close();
  }
});
setTimeout(() => { writeFileSync(process.argv[3] ?? "probe-frames.json", JSON.stringify(frames, null, 2)); process.exit(0); }, 240000);
