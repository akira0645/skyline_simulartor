// Opens a demo town, picks a home and then one of the people in it, and saves pictures of the map
// and of the resident's card. It then loads the demo a second time, over the first, and prints
// the notice left on screen, which must not be the one that says the town is being built.
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
await send('Page.navigate', { url: 'http://localhost:5199/' });
await sleep(5000);
await click('選單'); await sleep(200); await click('示範'); await sleep(300);
await run(`document.querySelectorAll('.pick .cards button')[${card}].click()`);
await sleep(4000);
const tap = async (x, y) => {
  for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
  await sleep(250);
};
await click('暫停');
await shot('map');
// Homes are somewhere left of the middle: try points until one shows a list of people.
let found = false;
for (let y = 150; y < 700 && !found; y += 40) for (let x = 60; x < 1100 && !found; x += 40) {
  await tap(x, y);
  found = await run(`!!document.querySelector('.people li')`);
  if (found) console.log('home at', x, y);
}
await run(`document.querySelector('.people li')?.click()`);
await sleep(400);
await shot('person');
console.log('card:', await run(`document.querySelector('.person')?.innerText.slice(0, 600)`));
await click('選單'); await sleep(200); await click('示範'); await sleep(300);
await run(`document.querySelectorAll('.pick .cards button')[${card}].click()`);
await sleep(6000);
console.log('notice after second load:', await run(`document.querySelector('.toast')?.textContent`));
ws.close(); edge.kill(); process.exit(0);
