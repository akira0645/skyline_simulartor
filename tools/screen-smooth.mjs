// Opens a demo town, lets it run at a speed and prints how smoothly: frames a second, the
// longest waits between frames, and how long the page was busy in one go.
// Usage: node tools/screen-smooth.mjs <dir> [which demo card, 0-2] [speed button, e.g. 1×]
// Needs the game at http://localhost:5199/, or at GAME_URL.
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
const speedName = process.argv[4] ?? '1×';
await click(speedName);
await run(`(() => { window.__gaps = []; window.__long = []; let last = performance.now();
  const loop = now => { window.__gaps.push(now - last); last = now; requestAnimationFrame(loop); }; requestAnimationFrame(loop);
  new PerformanceObserver(list => { for (const e of list.getEntries()) window.__long.push(Math.round(e.duration)); }).observe({ entryTypes: ['longtask'] }); })()`);
for (let i = 0; i < 6; i++) { await send('Page.bringToFront'); await sleep(5000); }
console.log(speedName, await run(`(() => { const g = window.__gaps.slice(5).sort((a, b) => a - b); const sum = g.reduce((a, b) => a + b, 0);
  return 'frames/s ' + (g.length / sum * 1000).toFixed(0) + ' | median gap ' + g[g.length >> 1].toFixed(0) + ' ms | worst gaps ' + g.slice(-5).map(v => v.toFixed(0)).join(' ') +
    ' | gaps over 100 ms: ' + g.filter(v => v > 100).length + ' | long tasks: ' + window.__long.length + ', longest ' + Math.max(0, ...window.__long) + ' ms, total ' + window.__long.reduce((a, b) => a + b, 0) + ' ms of ' + Math.round(sum) + ' ms'; })()`));
ws.close(); edge.kill(); process.exit(0);
