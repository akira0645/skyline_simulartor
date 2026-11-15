// Opens a demo town with the traffic view on, zooms in on the middle, and saves a picture every
// few seconds through a day, so the colours of the roads can be set beside the cars drawn on them.
// Usage: node tools/screen-traffic.mjs <dir> [which demo card, 0-2] [how many pictures]
// Needs the game served at http://localhost:5199/.
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const dir = process.argv[2];
const card = Number(process.argv[3] ?? 0);
const shots = Number(process.argv[4] ?? 16);
const [w, h] = [1600, 900];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const edge = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  ['--headless=new', '--disable-gpu', '--remote-debugging-port=9333', `--user-data-dir=${dir}/edge5`, `--window-size=${w},${h}`, 'about:blank']);
let target;
for (let i = 0; i < 40 && !target; i++) {
  await sleep(250);
  try { target = (await (await fetch('http://127.0.0.1:9333/json')).json()).find(t => t.type === 'page'); } catch {}
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r));
let id = 0; const waiting = new Map();
ws.addEventListener('message', e => {
  const m = JSON.parse(e.data);
  if (m.method === 'Page.javascriptDialogOpening') ws.send(JSON.stringify({ id: 999999, method: 'Page.handleJavaScriptDialog', params: { accept: true } }));
  if (m.method === 'Runtime.exceptionThrown') console.log('error:', m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') console.log('console:', m.params.args.map(a => a.value ?? a.description).join(' '));
  waiting.get(m.id)?.(m);
});
const send = (method, params = {}) => new Promise(r => { waiting.set(++id, r); ws.send(JSON.stringify({ id, method, params })); });
const run = async code => (await send('Runtime.evaluate', { expression: code, returnByValue: true })).result?.result?.value;
const shot = async name => writeFileSync(`${dir}/${name}.png`, Buffer.from((await send('Page.captureScreenshot')).result.data, 'base64'));
const click = text => run(`(() => { const b = [...document.querySelectorAll('button')].find(b => b.textContent.trim().startsWith(${JSON.stringify(text)})); b?.click(); return !!b; })()`);

await send('Page.enable'); await send('Runtime.enable');
// A page that thinks nobody is looking pauses the game, so it is kept in front.
await send('Emulation.setFocusEmulationEnabled', { enabled: true });
await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: 'http://localhost:5199/' });
await sleep(5000);
await click('選單'); await sleep(200); await click('示範'); await sleep(300);
await run(`document.querySelectorAll('.pick .cards button')[${card}].click()`);
await sleep(4000);
console.log('view', await click('車流'));
for (let i = 0; i < 3; i++) {
  await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 700, y: 430, deltaX: 0, deltaY: -240 });
  await sleep(200);
}
await click('城市'); await click('1×');
for (let i = 0; i < shots; i++) {
  await send('Page.bringToFront');
  await sleep(900);
  const when = await run(`document.querySelector('.stat.when b').textContent`);
  await shot(`traffic-${String(i).padStart(2, '0')}`);
  console.log(i, when, await run(`[...document.querySelectorAll('.side-content dt')].find(d => d.textContent === '通勤狀態')?.nextElementSibling.textContent`));
}
console.log('hidden', await run('document.hidden'), '|', await run(`[...document.querySelectorAll('.toast, .save-warning, [role=alert], [role=status]')].map(e => e.className + ':' + e.textContent).join(' | ')`));
ws.close(); edge.kill(); process.exit(0);
