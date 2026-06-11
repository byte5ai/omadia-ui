// CDP probe: evaluate renderer state + collect console/log entries for a few seconds.
const list = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const ws = new WebSocket(list[0].webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const logs = [];

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
  } else if (msg.method === 'Runtime.consoleAPICalled') {
    logs.push(`[console.${msg.params.type}] ${msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ')}`);
  } else if (msg.method === 'Log.entryAdded') {
    logs.push(`[log.${msg.params.entry.level}] ${msg.params.entry.text}`);
  } else if (msg.method === 'Runtime.exceptionThrown') {
    logs.push(`[EXCEPTION] ${msg.params.exceptionDetails.text} ${msg.params.exceptionDetails.exception?.description ?? ''}`);
  }
};

await new Promise((r) => (ws.onopen = r));
await send('Runtime.enable');
await send('Log.enable');

const evalJs = async (expr) =>
  (await send('Runtime.evaluate', { expression: expr, returnByValue: true }))?.result?.value;

const status = await evalJs(`(() => {
  const root = document.getElementById('root');
  return JSON.stringify({
    rootChildren: root ? root.children.length : -1,
    bodyClasses: document.body.className,
    palette: document.documentElement.getAttribute('data-palette'),
    statusLine: document.querySelector('.lume-status-line')?.textContent ?? null,
    onboarding: !!document.querySelector('.lume-onboarding, .lume-setup-card'),
    spotlight: !!document.querySelector('input'),
    visibleText: (root?.innerText ?? '').slice(0, 400),
  });
})()`);
console.log('STATE:', status);

// watch for 6s to catch connection logs / errors
await new Promise((r) => setTimeout(r, 6000));
const status2 = await evalJs(`(() => {
  const root = document.getElementById('root');
  return JSON.stringify({
    statusLine: document.querySelector('.lume-status-line')?.textContent ?? null,
    visibleText: (root?.innerText ?? '').slice(0, 400),
  });
})()`);
console.log('STATE_AFTER_6S:', status2);
console.log('LOGS:');
for (const l of logs.slice(0, 40)) console.log(' ', l);
ws.close();
process.exit(0);
