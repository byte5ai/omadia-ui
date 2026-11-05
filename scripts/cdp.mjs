// Dev helper: drive the running app over the Chrome DevTools protocol.
// Start the app with --remote-debugging-port=9333, then:
//   node scripts/cdp.mjs eval "<js expression>"
//   node scripts/cdp.mjs shot <file.png>
import { writeFileSync } from "node:fs";
import WebSocket from "ws";

const [cmd, arg] = process.argv.slice(2);
const targets = await (await fetch("http://127.0.0.1:9333/json")).json();
const page = targets.find((t) => t.type === "page" && !t.url.startsWith("devtools"));
if (!page) throw new Error("no page target");
const ws = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate: false });
await new Promise((r) => ws.once("open", r));
let id = 0;
const call = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const my = ++id;
    const onMsg = (raw) => {
      const msg = JSON.parse(String(raw));
      if (msg.id !== my) return;
      ws.off("message", onMsg);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
    };
    ws.on("message", onMsg);
    ws.send(JSON.stringify({ id: my, method, params }));
  });

if (cmd === "eval") {
  const res = await call("Runtime.evaluate", { expression: arg, awaitPromise: true, returnByValue: true });
  console.log(JSON.stringify(res.result.value ?? res.result.description ?? res, null, 2));
} else if (cmd === "shot") {
  const res = await call("Page.captureScreenshot", { format: "png" });
  writeFileSync(arg, Buffer.from(res.data, "base64"));
  console.log("saved", arg);
}
ws.close();
