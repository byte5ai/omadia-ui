const list = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const ws = new WebSocket(list[0].webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id === 1) {
    console.log(m.result.result.value);
    ws.close();
    process.exit(0);
  }
};
ws.send(
  JSON.stringify({
    id: 1,
    method: 'Runtime.evaluate',
    params: {
      expression: `JSON.stringify({
        sidebar: !!document.querySelector('.lume-sidebar'),
        slots: document.querySelectorAll('.lume-sidebar-item').length,
        addBtn: !!document.querySelector('.lume-sidebar-add'),
        activeTitle: document.querySelector('.lume-sidebar-active .lume-sidebar-title')?.textContent ?? null,
        visible: document.getElementById('root').innerText.slice(0, 120),
      })`,
      returnByValue: true,
    },
  }),
);
