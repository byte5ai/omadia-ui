// Fire one turn on the ACTIVE slot (multi-socket API) and watch events.
const list = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const ws = new WebSocket(list[0].webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
function send(method, params = {}) {
  return new Promise((resolve) => {
    id += 1;
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });
}
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg.result);
    pending.delete(msg.id);
  }
};
await new Promise((r) => (ws.onopen = r));
const evalJs = async (expr) =>
  (await send('Runtime.evaluate', { expression: expr, returnByValue: true }))?.result?.value;

await evalJs(`(() => {
  const meta = JSON.parse(localStorage.getItem('omadia.ui-prefs.canvases'));
  window.__active = meta.activeId;
  window.__events = [];
  window.omadiaCanvas.onServerMessage((slotKey, m) => window.__events.push({ slot: slotKey.slice(0,6), t: m.type }));
  window.omadiaCanvas.sendTurn(meta.activeId, { type: 'turn', turnId: crypto.randomUUID(), text: 'Zeige die offenen Kurse der nächsten Woche als Tabelle' });
  return meta.activeId;
})()`);

for (let i = 1; i <= 10; i += 1) {
  await new Promise((r) => setTimeout(r, 5000));
  const s = await evalJs(`JSON.stringify({
    events: window.__events.map(e => e.t),
    rows: document.querySelectorAll('tbody tr[data-row-key]').length,
    busyDots: document.querySelectorAll('.lume-sidebar-dot-busy').length,
  })`);
  console.log(`T${i * 5}s:`, s);
  if (JSON.parse(s).events.includes('turn_complete')) break;
}
ws.close();
process.exit(0);
