// Live-probe issue #14: split a pane, verify two independent panes + focus +
// persisted layout; then close the pane again.
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
const snap = async () =>
  JSON.parse(
    await evalJs(`JSON.stringify({
      panes: document.querySelectorAll('.lume-workspace-pane').length,
      focused: document.querySelector('.lume-workspace-pane-focused .lume-pane-bar-title')?.textContent ?? null,
      dividers: document.querySelectorAll('.lume-workspace-divider').length,
      layout: localStorage.getItem('omadia.ui-prefs.workspace'),
      sidebarSlots: document.querySelectorAll('.lume-sidebar-item').length,
    })`),
  );

console.log('BEFORE:', JSON.stringify(await snap()));
await evalJs(`document.querySelector('.lume-workspace-pane-focused button[title^="Neue Spalte"]').click()`);
await new Promise((r) => setTimeout(r, 600));
const after = await snap();
console.log('AFTER_SPLIT:', JSON.stringify(after));
await evalJs(`document.querySelector('.lume-workspace-pane-focused button[title="Pane schließen"]').click()`);
await new Promise((r) => setTimeout(r, 600));
console.log('AFTER_CLOSE:', JSON.stringify(await snap()));
ws.close();
process.exit(0);
