/**
 * Node.js 22+ and Chromium. Serve a production build, then run:
 *   node tools/benchmark-browser.mjs http://localhost:4173/
 * Set CHROME_BIN to a Chromium/Chrome executable when it is not on PATH.
 * Opens a fresh profile, loads the large demo, and samples 10s each running/paused.
 * Run revisions sequentially on an otherwise idle machine; cloud software GPU FPS
 * is a comparison within that environment, not a prediction for players' devices.
 */
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const wait = ms => new Promise(r=>setTimeout(r,ms));
async function openBrowser(url) {
  mkdirSync('work', {recursive:true});
  const dir=mkdtempSync(resolve('work/browser-benchmark-'));
  console.log(`Artifacts: ${dir}`);
  const browser=spawn(process.env.CHROME_BIN ?? 'chromium',['--headless=new','--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader','--remote-debugging-port=0',`--user-data-dir=${dir}`,'about:blank'],{stdio:'ignore',detached:true});
  let port;for(let i=0;i<80;i++){try{port=readFileSync(`${dir}/DevToolsActivePort`,'utf8').split('\n')[0];break;}catch{}await wait(100);}
  if(!port)throw Error('Chromium did not start');
  const target=(await(await fetch(`http://127.0.0.1:${port}/json`)).json()).find(x=>x.type==='page');
  const ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r));
  let id=0;const pending=new Map();const errors=[];
  const send=(method,params={})=>new Promise((resolve,reject)=>{const callId=++id;const timer=setTimeout(()=>{pending.delete(callId);reject(Error(`Timeout: ${method}`));},60000);pending.set(callId,m=>{clearTimeout(timer);if(m.error)reject(Error(JSON.stringify(m.error)));else resolve(m.result);});ws.send(JSON.stringify({id:callId,method,params}));});
  ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);if(m.method==='Page.javascriptDialogOpening')void send('Page.handleJavaScriptDialog',{accept:true});if(pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id);}});
  const run=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result?.value;};
  const click=text=>run(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim().startsWith(${JSON.stringify(text)}));b?.click();return !!b;})()`);
  const close=()=>{ws.close();try{if(process.platform==='win32')browser.kill();else process.kill(-browser.pid,'SIGTERM');}catch{}};
  await send('Runtime.enable');await send('Page.enable');await send('Emulation.setDeviceMetricsOverride',{width:1600,height:900,deviceScaleFactor:1,mobile:false});await send('Page.navigate',{url});await wait(3000);
  return {send,run,click,close,errors,dir};
}

const page=await openBrowser(process.argv[2] ?? 'http://localhost:5173/');
try{
const {run,send,click}=page;
if(!await click('選單')||!await click('示範'))throw Error('No demo menu');await wait(100);
await run(`document.querySelector('.pick .cards button:last-child').click()`);await wait(5000);
if(!await run(`!!document.querySelector('canvas')`))throw Error('Game not loaded');
await click('1×');
const measure=async label=>{
await send('Performance.enable');const start=(await send('Performance.getMetrics')).metrics;
await run(`(()=>{window.__perf={frames:[],long:[]};window.__observer=new PerformanceObserver(l=>window.__perf.long.push(...l.getEntries().map(x=>x.duration)));window.__observer.observe({type:'longtask',buffered:false});window.__record=true;let last=performance.now();requestAnimationFrame(function frame(t){if(!window.__record)return;window.__perf.frames.push(t-last);last=t;requestAnimationFrame(frame);});})()`);
await send('Profiler.enable');await send('Profiler.start');await wait(10000);const {profile}=await send('Profiler.stop');
await run(`window.__record=false;window.__observer.disconnect()`);const end=(await send('Performance.getMetrics')).metrics;
const perf=await run(`window.__perf`);const sorted=perf.frames.slice(1).sort((a,b)=>a-b);
const delta=name=>end.find(x=>x.name===name)?.value-start.find(x=>x.name===name)?.value;
const summary={label,frames:sorted.length,median:sorted[Math.floor(sorted.length*.5)],p95:sorted[Math.floor(sorted.length*.95)],long:perf.long.length,longMs:perf.long.reduce((a,b)=>a+b,0),scriptSeconds:delta('ScriptDuration'),taskSeconds:delta('TaskDuration')};
console.log(JSON.stringify(summary));writeFileSync(`${page.dir}/${label}.json`,JSON.stringify({summary,profile}));};
await measure('running');await click('暫停');await wait(1000);await measure('paused');
if(page.errors.length)throw Error(JSON.stringify(page.errors));
}finally{page.close();}
