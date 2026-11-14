import { expect, it } from 'vitest';
import { calendar } from './calendar';
import { cycle } from './Economy';
import { SimulationEngine } from './SimulationEngine';
import { MAP_SIZE, type Cell } from './TileMap';

const DAY = calendar.ticksPerDay;
const id = ({ x, y }: Cell) => y * MAP_SIZE + x;
const row = (y: number, from: number, to: number): Cell[] =>
  Array.from({ length: to - from + 1 }, (_, index) => ({ x: from + index, y }));

/** Homes facing shops across one street, `perHome` people in each of twenty homes, all in work. */
function town(perHome: number) {
  const engine = new SimulationEngine({ version: 1, seed: 5, tick: 0 });
  const { city } = engine;
  const homes = row(4, 1, 20);
  const shops = row(6, 1, 20);
  city.execute({ type: 'BUILD_ROAD', path: row(5, 0, 21) });
  city.execute({ type: 'SET_ZONE', tiles: homes, zone: 'residential' });
  city.execute({ type: 'SET_ZONE', tiles: shops, zone: 'commercial' });
  // Police and firemen at both ends, so that nothing but business changes how many jobs there are.
  for (const x of [0, 21]) {
    city.execute({ type: 'BUILD_SERVICE', x, y: 4, service: 'police' });
    city.execute({ type: 'BUILD_SERVICE', x, y: 6, service: 'fire' });
  }
  // Without power and water every building takes half of what it holds.
  engine.load({ ...engine.save(), buildings: [
    ...homes.map(home => ({ id: id(home), capacity: 2 * perHome, occupants: perHome })),
    ...shops.map(shop => ({ id: id(shop), capacity: 2 * perHome, occupants: 0 })),
  ] });
  return engine;
}

it('spares a small town the ups and downs of business', () => {
  const engine = town(5);
  const { city } = engine;
  expect(city.getStats().population).toBeLessThan(cycle.population);
  const jobs = city.getStats().jobs;
  for (let month = 0; month < cycle.months; month++) {
    engine.advance(calendar.daysPerMonth * DAY);
    expect(city.getStats()).toMatchObject({ mood: 'normal', jobs });
  }
});

it('takes a city through a boom and a slump and back', () => {
  const engine = town(20);
  const { city } = engine;
  expect(city.getStats().population).toBeGreaterThanOrEqual(cycle.population);
  const seen = new Map<string, ReturnType<typeof city.getStats>>();
  const changes: string[] = [];
  let mood = city.getStats().mood;
  let laidOff = false;
  for (let day = 0; day < cycle.months * calendar.daysPerMonth; day++) {
    engine.advance(DAY);
    const stats = city.getStats();
    if (stats.mood !== mood) changes.push(mood = stats.mood);
    if (!seen.has(stats.mood)) seen.set(stats.mood, stats);
    laidOff ||= city.getNews().some(item => item.kind === 'job-lost' || item.kind === 'left-no-work');
  }
  // One whole wave: each state comes round, with an ordinary spell between boom and slump.
  expect([...seen.keys()].sort()).toEqual(['boom', 'normal', 'slump']);
  expect(changes.length).toBeLessThanOrEqual(5);
  for (let index = 1; index < changes.length; index++) {
    expect([changes[index - 1], changes[index]].sort()).not.toEqual(['boom', 'slump']);
  }

  const boom = seen.get('boom')!;
  const normal = seen.get('normal')!;
  const slump = seen.get('slump')!;
  // A slump cuts jobs, so people are laid off and say so; a boom pays more tax per head.
  expect(slump.jobs).toBeLessThan(normal.jobs);
  expect(slump.jobs).toBe(20 * Math.ceil(20 * cycle.slump.jobs));
  expect(slump.employed).toBeLessThan(slump.population);
  expect(slump.demand.commercial).toBeLessThanOrEqual(normal.demand.commercial);
  expect(boom.budget.tax / boom.population).toBeGreaterThan(normal.budget.tax / normal.population);
  expect(laidOff).toBe(true);

  // A save made in the middle of it plays on the same way.
  const restored = new SimulationEngine({ version: 1, seed: 0, tick: 0 });
  restored.load(structuredClone(engine.save()));
  expect(restored.city.getStats()).toEqual(city.getStats());
  engine.advance(60 * DAY);
  restored.advance(60 * DAY);
  expect(restored.save()).toEqual(engine.save());
});
