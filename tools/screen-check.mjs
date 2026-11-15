import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const dir = process.argv[2];
const [w, h] = (process.argv[3] ?? '1600,900').split(',').map(Number);
const edge = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  ['--headless=new', '--disable-gpu', '--remote-debugging-port=9333', `--user-data-dir=${dir}\edge2`, `--window-size=${w},${h}`, 'about:blank']);
const sleep = ms => new Promise(r => setTimeout(r, ms));
let target;
for (let i = 0; i < 40 && !target; i++) {
  await sleep(250);
  try { target = (await (await fetch('http://127.0.0.1:9333/json')).json()).find(t => t.type === 'page'); } catch {}
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r));
let id = 0; const waiting = new Map();
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.method === 'Page.javascriptDialogOpening') { console.log('dialog:', m.params.message); ws.send(JSON.stringify({ id: 999999, method: 'Page.handleJavaScriptDialog', params: { accept: true } })); } waiting.get(m.id)?.(m); });
const send = (method, params = {}) => new Promise(r => { waiting.set(++id, r); ws.send(JSON.stringify({ id, method, params })); });
const run = async code => (await send('Runtime.evaluate', { expression: code, returnByValue: true })).result?.result?.value;
const shot = async name => writeFileSync(`${dir}/${name}-${w}.png`, Buffer.from((await send('Page.captureScreenshot')).result.data, 'base64'));
const clickText = text => run(`(() => { const b = [...document.querySelectorAll('button')].find(b => b.textContent.trim().startsWith(${JSON.stringify(text)})); b?.click(); return !!b; })()`);
const clickAt = async (x, y) => { for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 }); };
await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
await send('Page.enable'); await send('Page.navigate', { url: 'http://localhost:5199/' });
await sleep(5000);
await clickText('選單'); await sleep(300); await shot('menu'); console.log('demo', await clickText('示範')); await sleep(500);
await shot('demo-pick');
console.log('card', await run(`(() => { const b = [...document.querySelectorAll('.pick .cards button')].shift(); b?.click(); return b?.textContent; })()`));
await sleep(4000);
console.log('4x', await clickText('4×')); await sleep(6000);
console.log('1x', await clickText('1×'));
// Try spots on the map until one shows a home with people in it.
let found = false;
const spots = []; for (let a = 0.2; a < 0.7; a += 0.04) for (let b = 0.25; b < 0.75; b += 0.06) spots.push([a, b]);
for (const [fx, fy] of spots) {
  await clickAt(Math.round(w * fx), Math.round(h * fy)); await sleep(400);
  if (await run(`!!document.querySelector('.side .people li')`)) { found = true; break; }
}
console.log('home found', found, await run(`document.querySelector('.side-content h2')?.textContent`));
await shot('tile');
console.log('person', await run(`(() => { const li = document.querySelector('.side .people li'); li?.click(); return li?.textContent; })()`));
await sleep(600); await shot('person');
await run(`[...document.querySelectorAll('.side .tabs button')].find(b => b.textContent.startsWith('紀錄')).click()`); await sleep(500); await shot('log');
console.log('fold', await run(`(() => { const b = document.querySelector('.build .fold'); b?.click(); return !!b; })()`));
await run(`document.querySelector('.panel-toggle-views')?.click()`);
await run(`document.querySelector('.panel-toggle-side')?.click()`);
await sleep(600); await shot('folded');
console.log('overflow', await run(`JSON.stringify([...document.querySelectorAll('.side dt')].filter(d => d.scrollWidth > d.clientWidth).map(d => d.textContent))`));
ws.close(); edge.kill();
