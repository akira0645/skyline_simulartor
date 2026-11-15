// Opens the small demo town, finds a building that has a capacity, lets the clock run until
// people are in it, and saves a picture of its panel. Usage: node tools/screen-capacity.mjs <dir>
// Needs the game served at http://localhost:5199/.
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const dir = process.argv[2];
const [w, h] = [1600, 900];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const edge = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  ['--headless=new', '--disable-gpu', '--remote-debugging-port=9333', `--user-data-dir=${dir}/edge4`, `--window-size=${w},${h}`, 'about:blank']);
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
  waiting.get(m.id)?.(m);
});
const send = (method, params = {}) => new Promise(r => { waiting.set(++id, r); ws.send(JSON.stringify({ id, method, params })); });
const run = async code => (await send('Runtime.evaluate', { expression: code, returnByValue: true })).result?.result?.value;
const shot = async name => writeFileSync(`${dir}/${name}.png`, Buffer.from((await send('Page.captureScreenshot')).result.data, 'base64'));
const click = text => run(`(() => { const b = [...document.querySelectorAll('button')].find(b => b.textContent.trim().startsWith(${JSON.stringify(text)})); b?.click(); return !!b; })()`);
const clickAt = async (x, y) => { for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 }); };
const rows = () => run(`[...document.querySelectorAll('.side-content dt')].map(dt => dt.textContent + '=' + dt.nextElementSibling.textContent).join(' | ')`);

await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: 'http://localhost:5199/' });
await sleep(5000);
await click('選單'); await sleep(200); await click('示範'); await sleep(300);
await run(`document.querySelector('.pick .cards button').click()`);
await sleep(4000);
await click('暫停');
let found;
for (let x = 60; x < 640 && !found; x += 16) for (let y = 130; y < 520 && !found; y += 16) {
  await clickAt(x, y); await sleep(120);
  const title = await run(`document.querySelector('.side-content h2')?.textContent`);
  if ((await rows()).includes('容量=') && ['銀行', '廟', '市場'].includes(title)) found = title;
}
console.log('found', found, '|', await rows());
await click('4×');
for (let i = 0; i < 150; i++) {
  await sleep(1000);
  const text = await rows();
  if (/容量=客滿|擠不進去/.test(text) || /容量=還有位子[1-9]/.test(text)) break;
}
await click('暫停'); await sleep(300);
console.log('time', await run(`document.querySelector('.stat.when b').textContent`), '|', await rows());
await shot('capacity');
ws.close(); edge.kill(); process.exit(0);
