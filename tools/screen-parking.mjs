// Opens a demo town, lets an afternoon go by, then looks for a place whose card shows its parking
// Usage: node tools/screen-person.mjs <dir> [which demo card, 0-2]
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
await send('Page.navigate', { url: process.env.GAME_URL ?? 'http://localhost:5199/' });
await sleep(5000);
await click('選單'); await sleep(200); await click('示範'); await sleep(300);
await run(`document.querySelectorAll('.pick .cards button')[${card}].click()`);
// A large town takes a while to build; the page must stay alive meanwhile.
const built = async () => { for (let i = 0; i < 120; i++) { await sleep(500); if (!(await run(`document.querySelector('.toast')?.textContent ?? ''`)).startsWith('正在')) return (i + 1) / 2; } return -1; };
console.log('built after seconds:', await built());
await sleep(1500);
const tap = async (x, y) => {
  for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
  await sleep(250);
};
await click('暫停');
await shot('map');
// Run on to the evening, when the parks and the cinema draw people, then stop the clock.
await click('4×');
for (let i = 0; i < 40; i++) { await sleep(500); if (/1[78]:/.test(await run(`document.querySelector('.topbar')?.innerText ?? document.body.innerText.slice(0, 200)`))) break; }
await click('暫停');
await shot('map');
// Places are scattered: try points until a card shows its parking, and prefer one that is full.
let seen = 0;
for (let y = 150; y < 760 && seen < 2; y += 32) for (let x = 60; x < 1150 && seen < 2; x += 32) {
  await tap(x, y);
  const text = await run(`[...document.querySelectorAll('dt')].find(dt => dt.textContent === '車位')?.nextElementSibling.innerText ?? ''`);
  if (!text || (seen === 0 && !/停滿|找不到/.test(text) && y < 600)) continue;
  console.log('parking at', x, y, text.replace(/\n/g, ' '));
  await shot(`parking${seen++}`);
}
ws.close(); edge.kill(); process.exit(0);
