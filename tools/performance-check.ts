import { SimulationEngine } from '../src/simulation/SimulationEngine';
import { SimulationClock } from '../src/simulation/SimulationClock';
import { hourAt } from '../src/simulation/calendar';
import { CityRenderer } from '../src/rendering/CityRenderer';

const params = new URLSearchParams(location.search);
const size = params.get('size') === 'medium' ? 'medium' : 'large';
const save = await (await fetch(`../demo/${size}.json`)).json();
const engine = new SimulationEngine({ version: 1, seed: 0, tick: 0 });
engine.load({ ...save, tiles: Uint8Array.from(save.tiles) });
const clock = new SimulationClock(engine);
const samples: { simulationMs: number; actorsMs: number; effectsMs: number }[] = [], intervals: number[] = [];
let ready = false, finished = false, last = performance.now(), start = 0, lastFrame = 0;
const renderer = new CityRenderer(engine.city, () => finished ? 0 : 1,
  () => hourAt(engine.getSnapshot().tick, clock.tickProgress), () => 'none', () => {
    if (!ready || finished) return;
    const now = performance.now(); clock.advance(now - last); last = now;
    if (now - start >= 10000) {
      finished = true;
      const stats = (values: number[]) => {
        const sorted = values.slice().sort((a, b) => a - b);
        return { mean: values.reduce((a, b) => a + b, 0) / Math.max(1, values.length),
          p50: sorted[Math.floor(sorted.length * .5)] ?? 0, p95: sorted[Math.floor(sorted.length * .95)] ?? 0 };
      };
      const result = { label: params.get('label') ?? 'sample', size, tick: save.tick,
        population: engine.city.getStats().population, frames: samples.length,
        simulationMs: stats(samples.map(s => s.simulationMs)), actorsMs: stats(samples.map(s => s.actorsMs)),
        effectsMs: stats(samples.map(s => s.effectsMs)), frameIntervalMs: stats(intervals),
        note: 'Same CityRenderer, 2s warm-up + 8s sampling. Browser CPU/frame cadence; not a physical tablet FPS claim.' };
      document.querySelector('[data-testid=result]')!.textContent = JSON.stringify(result, null, 2);
      document.querySelector('#status')!.textContent = '量測完成，已暫停；單位為毫秒。';
      renderer.setPlaying?.(false);
    }
  });
renderer.onFrameTiming = sample => {
  if (!ready || finished || performance.now() - start < 2000) return;
  samples.push(sample);
  const now = performance.now(); if (lastFrame) intervals.push(now - lastFrame); lastFrame = now;
};
await renderer.mount(document.querySelector<HTMLElement>('#map')!, new AbortController().signal, () => 'inspect', () => {}, () => {});
last = start = performance.now(); ready = true;
document.querySelector('#status')!.textContent = '正在量測：前兩秒暖機，其後八秒收集。';
