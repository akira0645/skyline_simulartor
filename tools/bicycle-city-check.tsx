import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { SimulationEngine } from '../src/simulation/SimulationEngine';
import { SimulationClock, type SimulationSpeed } from '../src/simulation/SimulationClock';
import { YEAR_TICKS } from '../src/simulation/ResidentIdentity';
import { genderNames } from '../src/simulation/ResidentGender';
import { hourAt } from '../src/simulation/calendar';
import { CityRenderer } from '../src/rendering/CityRenderer';
import { PersonPortrait } from '../src/app/PersonPortrait';

// A reproducible fixture; no storage writes and no special bicycle drawing path.
const engine = new SimulationEngine({ version: 1, seed: 0, tick: 0 });
engine.load({ ...engine.save(), funds: 100000, rank: 5 });
engine.city.execute({ type: 'BUILD_ROAD', path: Array.from({ length: 13 }, (_, i) => ({ x: i + 2, y: 2 })) });
engine.city.execute({ type: 'SET_ZONE', tiles: [{ x: 2, y: 1 }, { x: 4, y: 1 }], zone: 'residential' });
engine.city.execute({ type: 'BUILD_SERVICE', x: 14, y: 1, service: 'bank' });
const residents = [
  { home: 130, id: 42, name: '蔡信宏', gender: 'male' as const },
  { home: 132, id: 43, name: '李美玲', gender: 'female' as const },
];
engine.load({ ...engine.save(), buildings: residents.map(person => ({ id: person.home, capacity: 4, occupants: 1, nextSlot: 1,
  people: [{ slot: 0, job: -1, came: 0, hired: 0, identity: { id: person.id, name: person.name,
    gender: person.gender, born: -30 * YEAR_TICKS } }] })) });
for (const person of residents) {
  const x = person.home % 128;
  engine.city.visits.start([{ home: person.home, slot: 0, destination: 142, doing: 'bank', ride: 0, legs: 3,
    path: [{ x, y: 1 }, ...Array.from({ length: 15 - x }, (_, i) => ({ x: x + i, y: 2 })), { x: 14, y: 1 }] }], 0);
}
let speed: SimulationSpeed = 1, ready = false, last = performance.now(), elapsed = 0;
const clock = new SimulationClock(engine);
const renderer = new CityRenderer(engine.city, () => speed,
  () => hourAt(engine.getSnapshot().tick, clock.tickProgress), () => 'none', () => {
    if (!ready || !speed) return;
    const now = performance.now(), dt = Math.min(now - last, 5000 - elapsed);
    last = now; elapsed += dt; clock.advance(dt);
    if (elapsed >= 5000) {
      speed = 0;
      document.querySelector('#status')!.textContent = '已暫停：兩位居民的腳踏車行程 ride = 0，畫面由正式 CityRenderer 繪製。';
    }
  });
await renderer.mount(document.querySelector<HTMLElement>('#map')!, new AbortController().signal, () => 'inspect', () => {}, () => {});
const zoom = Number(new URLSearchParams(location.search).get('zoom') ?? 3);
renderer.zoomView?.(Math.log(Math.max(1, Math.min(6, zoom))) / 0.32);
renderer.lookAt?.({ x: 7, y: 2 });
last = performance.now(); ready = true;
document.querySelector('#status')!.textContent = `正在行進，地圖縮放 ${zoom}×；五秒後自動暫停。`;
createRoot(document.querySelector('#cards')!).render(createElement('div', { style: { display: 'flex', gap: 50 } },
  ...residents.map(person => createElement('section', { key: person.id },
    createElement(PersonPortrait, { seed: 0, id: person.id, name: person.name, age: 30, gender: person.gender }),
    createElement('div', null, `${person.name}・${genderNames[person.gender]}・腳踏車`)))));
