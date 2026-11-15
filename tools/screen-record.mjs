// Records where every element of the game's screen sits and how it looks, in several states,
// so two versions of the code can be compared exactly. Usage: node dump.mjs <dir> <out.json>
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const [dir, out] = process.argv.slice(2);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const edge = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  ['--headless=new', '--disable-gpu', '--remote-debugging-port=9333', `--user-data-dir=${dir}/edge3`, '--window-size=1600,900', 'about:blank']);
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
const click = text => run(`(() => { const b = [...document.querySelectorAll('button')].find(b => b.textContent.trim().startsWith(${JSON.stringify(text)})); b?.click(); return !!b; })()`);
const clickAt = async (x, y) => { for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 }); };
const snapshot = () => run(`JSON.stringify([...document.querySelectorAll('.game, .game *')].map(el => {
  const r = el.getBoundingClientRect(); const c = getComputedStyle(el);
  const b = getComputedStyle(el, '::before'); const a = getComputedStyle(el, '::after');
  return [el.tagName + '.' + el.className, el.children.length ? '' : el.textContent.slice(0, 30),
    [r.x, r.y, r.width, r.height].map(n => Math.round(n * 10) / 10).join(','),
    [c.display, c.color, c.backgroundColor, c.fontSize, c.lineHeight, c.padding, c.margin, c.borderWidth, c.borderColor, c.boxShadow, c.opacity,
      c.whiteSpace, c.overflowX, c.overflowY, c.zIndex, c.backgroundSize, c.letterSpacing, c.textDecorationLine, c.cursor, b.content, b.backgroundColor, a.content, a.backgroundColor].join('|')];
}))`);

const result = {};
await send('Page.enable');
for (const [w, h] of [[1600, 900], [1100, 720], [600, 800]]) {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: 'http://localhost:5199/' });
  await sleep(5000);
  await click('暫停');
  await click('選單'); await sleep(200);
  result[`${w}:menu`] = JSON.parse(await snapshot());
  await click('示範'); await sleep(300);
  result[`${w}:pick`] = JSON.parse(await snapshot());
  await run(`document.querySelector('.pick .cards button').click()`);
  await sleep(5000);
  await click('暫停'); await sleep(300);
  for (const tab of ['地塊', '城市', '任務', '成就', '手冊', '路線', '紀錄']) {
    await run(`[...document.querySelectorAll('.side .tabs button')].find(b => b.textContent.startsWith('${tab}')).click()`);
    await sleep(300);
    result[`${w}:tab:${tab}`] = JSON.parse(await snapshot());
  }
  await run(`[...document.querySelectorAll('.side .tabs button')].find(b => b.textContent.startsWith('地塊')).click()`);
  const spots = []; for (let a = 0.2; a < 0.7; a += 0.04) for (let b = 0.25; b < 0.75; b += 0.06) spots.push([a, b]);
  let n = 0;
  for (const [fx, fy] of spots) {
    await clickAt(Math.round(w * fx), Math.round(h * fy)); await sleep(250);
    if (n < 6 && await run(`!!document.querySelector('.side-content dl')`)) result[`${w}:tile:${n++}`] = JSON.parse(await snapshot());
    if (await run(`!!document.querySelector('.side .people li')`)) break;
  }
  result[`${w}:home`] = JSON.parse(await snapshot());
  await run(`document.querySelector('.side .people li')?.click()`); await sleep(400);
  result[`${w}:person`] = JSON.parse(await snapshot());
  for (const group of ['分區', '休閒觀光', '教育']) {
    await click(group); await sleep(200);
    result[`${w}:build:${group}`] = JSON.parse(await snapshot());
  }
  await click('存檔'); await sleep(500);
  result[`${w}:saves`] = (JSON.parse(await snapshot())).map(row => row[0].includes('tag') || row[0].startsWith('B.') ? [row[0], '', row[2].split(',').slice(2).join(','), row[3]] : row);
  await click('關閉'); await sleep(200);
  await run(`document.querySelector('.build .fold').click()`);
  await run(`document.querySelector('.panel-toggle-views').click()`);
  await run(`document.querySelector('.panel-toggle-side').click()`);
  await sleep(400);
  result[`${w}:folded`] = JSON.parse(await snapshot());
  await run(`document.querySelector('.dev button').click()`); await sleep(300);
  result[`${w}:dev`] = (JSON.parse(await snapshot())).filter(row => !row[1].includes('每秒'));
}
writeFileSync(out, JSON.stringify(result));
console.log(Object.entries(result).map(([k, v]) => `${k}=${v.length}`).join(' '));
ws.close(); edge.kill(); process.exit(0);
