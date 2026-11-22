// Visual regression of the real game: zoom thresholds, three themes and actual atlas use.
// Serve Vite on 127.0.0.1:5199, then: node tools/screen-detail.mjs
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
const wait = ms => new Promise(r => setTimeout(r, ms));
mkdirSync('work/car-preview', { recursive: true });
const directory = resolve('work/car-preview');
const profile = mkdtempSync(resolve(tmpdir(), 'city-detail-edge-'));
const browser = spawn(process.env.CHROME_BIN ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  ['--headless=new', '--enable-unsafe-swiftshader', '--disable-extensions', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore', windowsHide: true });
let socket;
const errors = [];
try {
  let port;
  for (let i = 0; i < 100 && !port; i++) {
    try { port = readFileSync(`${profile}/DevToolsActivePort`, 'utf8').split('\n')[0]; } catch { await wait(100); }
  }
  if (!port) throw Error('Headless browser did not start');
  const target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(t => t.type === 'page');
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve); socket.addEventListener('error', reject); });
  let sequence = 0;
  const pending = new Map();
  socket.addEventListener('message', e => {
    const message = JSON.parse(e.data);
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails);
    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') errors.push(message.params.args.map(a => a.value ?? a.description));
    if (message.method === 'Page.javascriptDialogOpening') void send('Page.handleJavaScriptDialog', { accept: true });
    pending.get(message.id)?.(message);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(Error(`Timeout: ${method}`)); }, 20000);
    pending.set(id, message => { clearTimeout(timer); pending.delete(id); message.error ? reject(Error(JSON.stringify(message.error))) : resolve(message.result); });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const run = async expression => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));
    return result.result?.value;
  };
  const click = async text => {
    if (!await run(`(() => { const button = [...document.querySelectorAll('button')].find(b => b.textContent.trim().startsWith(${JSON.stringify(text)})); button?.click(); return !!button; })()`)) throw Error(`Missing button: ${text}`);
  };
  const screenshot = async name => writeFileSync(`${directory}/${name}.png`, Buffer.from((await send('Page.captureScreenshot')).data, 'base64'));
  const until = async expression => {
    for (let i = 0; i < 150; i++) { if (await run(expression)) return; await wait(200); }
    await screenshot('failure');
    throw Error(`Did not become ready: ${expression}\n${await run('document.body.innerText.slice(0, 1500)')}\n${JSON.stringify(errors)}`);
  };
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: process.argv[2] ?? 'http://127.0.0.1:5199/' });
  await until(`!!document.querySelector('canvas')`);
  // Instrument the same imported classes used by CityRenderer, without production test hooks.
  await run(`(async () => {
    window.__detail = { cars: 0, headings: [], sources: [], prototypes: [], actors: 0 };
    const renderer = await (await fetch('/src/rendering/CityRenderer.ts')).text();
    const moduleUrl = name => renderer.split(String.fromCharCode(10))
      .map(line => line.match(/["']([^"']+)["']/)?.[1])
      .find(url => url?.includes('/' + name + '.ts'));
    const { CarSprites } = await import(moduleUrl('CarSprites'));
    const draw = CarSprites.prototype.draw;
    CarSprites.prototype.draw = function(...args) {
      window.__detail.cars++;
      if (window.__detail.headings.length < 100) window.__detail.headings.push(args[3]);
      return draw.apply(this, args);
    };
    const { TileRenderer } = await import(moduleUrl('TileRenderer'));
    const { StreetArt } = await import(moduleUrl('StreetArt'));
    const building = StreetArt.prototype.drawBuilding;
    StreetArt.prototype.drawBuilding = function(...args) {
      window.__detail.prototypes.push(args[1]);
      return building.apply(this, args);
    };
    for (const name of ['drawTree', 'drawPerson', 'drawTruck']) {
      const original = StreetArt.prototype[name];
      StreetArt.prototype[name] = function(...args) { window.__detail.actors++; return original.apply(this, args); };
    }
    const tiles = TileRenderer.prototype.draw;
    TileRenderer.prototype.draw = function(...args) {
      const result = tiles.apply(this, args);
      window.__detail.sources.push({ width: this.city.width, unit: this.cityUnit, cacheResolution: this.cacheResolution });
      return result;
    };
  })()`);
  const report = [];
  for (const [card, theme] of [[0, 'california'], [1, 'newyork'], [2, 'sf']]) {
    await click('選單');
    await run(`(() => { const b = [...document.querySelectorAll('button')].find(b => b.textContent.trim().startsWith('示範')); b.click(); })()`);
    await until(`document.querySelectorAll('.pick .cards button').length === 3`);
    await run(`document.querySelectorAll('.pick .cards button')[${card}].click()`);
    await until(`!document.querySelector('.pick') && !!document.querySelector('canvas')`);
    await wait(1200);
    await click('1×');
    await wait(1200);
    await click('暫停');
    let current = 1;
    for (const zoom of [1, 1.74, 1.76, 3, 6]) {
      await run(`window.__detail = { cars: 0, headings: [], sources: [], prototypes: [], actors: 0 }`);
      // Zoom around the western town centre, keeping the same world point under the cursor.
      if (current === zoom) {
        await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 470, y: 330, deltaX: 0, deltaY: 1 });
        current *= Math.exp(-0.002);
        await wait(100);
      }
      await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 470, y: 330, deltaX: 0, deltaY: -Math.log(zoom / current) / 0.002 });
      current = zoom;
      await wait(350);
      const observed = await run(`window.__detail`);
      const source = observed.sources.at(-1);
      if (!source) throw Error(`No map repaint: ${theme} ${zoom}`);
      if (source.unit !== (zoom >= 1.75 ? 64 : 32)) throw Error(`Wrong building resolution: ${JSON.stringify(source)}`);
      if (source.cacheResolution !== (zoom >= 3 ? 4 : zoom >= 1.75 ? 2 : 1)) throw Error(`Detail lost in terrain cache: ${JSON.stringify(source)}`);
      if (zoom < 1.75 && observed.cars !== 0) throw Error('Detailed cars rendered below threshold');
      if (zoom >= 1.75 && zoom < 6 && observed.cars === 0) throw Error(`No detailed cars in ${theme} at ${zoom}`);
      const entry = { theme, zoom, cars: observed.cars, prototypes: [...new Set(observed.prototypes)], actors: observed.actors,
        buildingTexture: source, directions: [...new Set(observed.headings.map(a => Math.round(a * 16 / (2 * Math.PI))))] };
      report.push(entry);
      await screenshot(`${theme}-${zoom}x`);
      console.log(JSON.stringify(entry));
    }
  }
  await send('Page.navigate', { url: new URL('/tools/street-preview.html', process.argv[2] ?? 'http://127.0.0.1:5199/').href });
  await until(`document.documentElement.dataset.ready === 'true'`);
  await click('暫停動畫');
  for (const zoom of [6, 3, 1]) {
    await run(`document.querySelector('[data-zoom="${zoom}"]').click()`);
    await wait(200);
    const metrics = await run(`({ width: document.querySelector('canvas').width, height: document.querySelector('canvas').height })`);
    if (metrics.width !== 256 * zoom || metrics.height !== 152 * zoom) throw Error('Wrong street review scale');
    await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: zoom === 6 ? 1200 : 1000, deviceScaleFactor: 1, mobile: false });
    await screenshot(`handmade-street-${zoom}x`);
  }
  if (errors.length) throw Error(`Browser errors: ${JSON.stringify(errors)}`);
  writeFileSync(`${directory}/verification.json`, JSON.stringify({ report, browserErrors: errors }, null, 2));
  console.log(`Screenshots and verification saved to ${directory}`);
  await send('Browser.close').catch(() => {});
} finally {
  socket?.close();
  browser.kill();
}
