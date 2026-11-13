import { expect, it } from 'vitest';
import { calendar, dateAt } from './calendar';
import { SimulationEngine } from './SimulationEngine';
import type { Cell } from './TileMap';

const MONTH = calendar.daysPerMonth * calendar.ticksPerDay;
const row = (y: number, from: number, to: number): Cell[] =>
  Array.from({ length: to - from + 1 }, (_, index) => ({ x: from + index, y }));

/** A main street with houses to the north and shops and factories to the south. */
function planTown() {
  const engine = new SimulationEngine({ version: 1, seed: 42, tick: 0 });
  const results = [
    engine.city.execute({ type: 'BUILD_ROAD', path: row(10, 5, 24) }),
    engine.city.execute({ type: 'SET_ZONE', tiles: row(9, 5, 24), zone: 'residential' }),
    engine.city.execute({ type: 'SET_ZONE', tiles: row(11, 5, 14), zone: 'commercial' }),
    engine.city.execute({ type: 'SET_ZONE', tiles: row(11, 15, 24), zone: 'industrial' }),
    // A second row of houses with no road next to it must stay empty.
    engine.city.execute({ type: 'SET_ZONE', tiles: row(8, 5, 24), zone: 'residential' }),
  ];
  expect(results.every(result => !result.error)).toBe(true);
  return engine;
}

it('counts thirty-day months from the first day of year one', () => {
  expect(dateAt(0)).toEqual({ year: 1, month: 1, day: 1 });
  expect(dateAt(29)).toEqual({ year: 1, month: 1, day: 30 });
  expect(dateAt(30)).toEqual({ year: 1, month: 2, day: 1 });
  expect(dateAt(360)).toEqual({ year: 2, month: 1, day: 1 });
});

it('grows a blank map into a small town and then settles', () => {
  const engine = planTown();
  expect(engine.city.getStats().buildings).toBe(0);

  engine.advance(MONTH);
  const early = engine.city.getStats();
  expect(early.population).toBeGreaterThan(0);
  expect(early.jobs).toBeGreaterThan(0);

  engine.advance(5 * MONTH);
  const grown = engine.city.getStats();
  expect(grown.buildings).toBeGreaterThan(early.buildings);
  expect(grown.buildings).toBeLessThanOrEqual(40);
  expect(row(8, 5, 24).some(cell => engine.city.hasBuilding(cell))).toBe(false);
  expect(dateAt(engine.getSnapshot().tick)).toEqual({ year: 1, month: 7, day: 1 });

  // Once every reachable lot is built, more time changes nothing.
  engine.advance(12 * MONTH);
  expect(engine.city.getStats()).toEqual(grown);
});

it('plays out identically from the same plan, and from a save made part-way', () => {
  const first = planTown();
  const second = planTown();
  first.advance(MONTH);
  second.advance(MONTH);

  const resumed = new SimulationEngine({ version: 1, seed: 0, tick: 0 });
  resumed.load(structuredClone(first.save()));
  for (const engine of [first, second, resumed]) engine.advance(3 * MONTH);

  expect(second.save()).toEqual(first.save());
  expect(resumed.save()).toEqual(first.save());
});
