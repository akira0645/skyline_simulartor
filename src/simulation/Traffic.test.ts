import { expect, it } from 'vitest';
import { SimulationEngine } from './SimulationEngine';
import { MAP_SIZE, type Cell } from './TileMap';
import { tileMinutes, traffic } from './Traffic';
import { utilities } from './Utilities';
import { buildChance, zoneDemand } from './ZoneDemandSystem';

const id = ({ x, y }: Cell) => y * MAP_SIZE + x;
const row = (y: number, from: number, to: number): Cell[] =>
  Array.from({ length: to - from + 1 }, (_, index) => ({ x: from + index, y }));
const column = (x: number, from: number, to: number): Cell[] =>
  Array.from({ length: to - from + 1 }, (_, index) => ({ x, y: from + index }));

/** A city whose buildings are placed directly instead of grown. */
function cityWith(plan: (city: SimulationEngine['city']) => void,
  buildings: { at: Cell; capacity: number; occupants?: number }[]) {
  const engine = new SimulationEngine({ version: 1, seed: 1, tick: 0 });
  plan(engine.city);
  engine.load({ ...engine.save(), buildings: buildings.map(({ at, capacity, occupants = 0 }) =>
    ({ id: id(at), capacity, occupants })) });
  return engine;
}

it('slows a road tile down along the volume-delay curve', () => {
  expect(tileMinutes(0)).toBe(traffic.minutesPerTile);
  expect(tileMinutes(traffic.capacity)).toBeCloseTo(traffic.minutesPerTile * (1 + traffic.alpha));
  expect(tileMinutes(2 * traffic.capacity))
    .toBeCloseTo(traffic.minutesPerTile * (1 + traffic.alpha * 2 ** traffic.beta));
});

it('adds up commuters per road tile and sends later homes around a jam', () => {
  // A direct street along y = 2 and a longer loop through y = 4 between the same two ends.
  const first = { x: 0, y: 2 };
  const second = { x: 1, y: 1 };
  const work = { x: 8, y: 2 };
  const { city } = cityWith(city => {
    city.execute({ type: 'BUILD_ROAD', path: row(2, 1, 7) });
    city.execute({ type: 'BUILD_ROAD', path: column(1, 3, 4) });
    city.execute({ type: 'BUILD_ROAD', path: row(4, 2, 7) });
    city.execute({ type: 'BUILD_ROAD', path: [{ x: 7, y: 3 }] });
    city.execute({ type: 'SET_ZONE', tiles: [first, second], zone: 'residential' });
    city.execute({ type: 'SET_ZONE', tiles: [work], zone: 'industrial' });
    city.execute({ type: 'BUILD_FACILITY', x: 3, y: 0, facility: 'power' });
    city.execute({ type: 'BUILD_FACILITY', x: 4, y: 0, facility: 'water' });
  }, [
    { at: first, capacity: 80, occupants: 80 },
    { at: second, capacity: 40, occupants: 40 },
    { at: work, capacity: 120 },
  ]);

  const commutes = city.getCommutes();
  expect(commutes.map(({ homeId, workers, path }) => [homeId, workers, path.length]))
    .toEqual([[id(first), 80, 7], [id(second), 40, 11]]);
  expect(city.congestionAt({ x: 4, y: 2 })).toBe(2);
  expect(city.congestionAt({ x: 4, y: 4 })).toBe(1);
  expect(city.congestionAt({ x: 4, y: 3 })).toBe(0);

  // Every road tile carries exactly the commuters whose route crosses it.
  const crossing = new Map<number, number>();
  for (const { workers, path } of commutes) {
    for (const cell of path) crossing.set(id(cell), (crossing.get(id(cell)) ?? 0) + workers);
  }
  for (let y = 0; y < 6; y++) {
    for (let x = 0; x < 9; x++) {
      const info = city.inspect({ x, y });
      if (info?.tile === 'road') expect(info.flow).toBe(crossing.get(id({ x, y })) ?? 0);
    }
  }

  // Commute times include the delay: the second home's eleven tiles take more than free flow.
  expect(commutes[1].minutes).toBeGreaterThan(11 * traffic.minutesPerTile);
  expect(city.getStats().commute).toBeGreaterThan(7 * traffic.minutesPerTile);
});

it('leaves jobs beyond the longest commute unfilled', () => {
  const reach = traffic.maxCommute / traffic.minutesPerTile;
  const home = { x: 1, y: 1 };
  const town = (work: Cell) => cityWith(city => {
    city.execute({ type: 'BUILD_ROAD', path: row(2, 1, work.x) });
    city.execute({ type: 'SET_ZONE', tiles: [home], zone: 'residential' });
    city.execute({ type: 'SET_ZONE', tiles: [work], zone: 'commercial' });
  }, [{ at: home, capacity: 4, occupants: 2 }, { at: work, capacity: 4 }]).city;

  expect(town({ x: reach, y: 1 }).getStats().employed).toBe(2);
  const tooFar = town({ x: reach + 1, y: 1 });
  expect(tooFar.getStats().employed).toBe(0);
  expect(tooFar.inspect(home)).toMatchObject({ employed: 0, issues: expect.arrayContaining(['no-jobs']) });
});

it('stops homes filling without work in reach, and fills them once a shortcut opens', () => {
  // The only way from home to work is a 33-tile loop until the three tiles between them are paved.
  const home = { x: 0, y: 1 };
  const work = { x: 0, y: 5 };
  const shortcut = column(1, 2, 4);
  const engine = cityWith(city => {
    city.execute({ type: 'BUILD_ROAD', path: row(1, 1, 15) });
    city.execute({ type: 'BUILD_ROAD', path: column(15, 2, 5) });
    city.execute({ type: 'BUILD_ROAD', path: row(5, 1, 14) });
    city.execute({ type: 'SET_ZONE', tiles: [home], zone: 'residential' });
    city.execute({ type: 'SET_ZONE', tiles: [work], zone: 'industrial' });
    city.execute({ type: 'BUILD_FACILITY', x: 3, y: 3, facility: 'power' });
    city.execute({ type: 'BUILD_FACILITY', x: 4, y: 3, facility: 'water' });
  }, [{ at: home, capacity: 4 }, { at: work, capacity: 5 }]);
  const { city } = engine;

  engine.advance(200);
  expect(city.getStats()).toMatchObject({ population: 1, employed: 0 });

  city.execute({ type: 'BUILD_ROAD', path: shortcut });
  engine.advance(200);
  expect(city.getStats()).toMatchObject({ population: 4, employed: 4 });
  expect(city.inspect(home)).toMatchObject({ commute: expect.closeTo(5 * traffic.minutesPerTile, 2), issues: [] });

  // Closing it again strands them, and they move away over the following days.
  city.execute({ type: 'DEMOLISH', ...shortcut[1] });
  engine.advance(200);
  expect(city.getStats()).toMatchObject({ population: 1, employed: 0 });
});

it('serves the nearest buildings within reach, up to the capacity of each facility', () => {
  const block = Array.from({ length: 7 }, (_, index) => row(index + 1, 1, 10)).flat();
  const outside = { x: 5, y: utilities.radius + 1 };
  const plant = { x: 5, y: 0 };
  const { city } = cityWith(city => {
    city.execute({ type: 'SET_ZONE', tiles: [...block, outside], zone: 'residential' });
    city.execute({ type: 'BUILD_FACILITY', ...plant, facility: 'power' });
  }, [...block, outside].map(at => ({ at, capacity: 4 })));
  const powered = () => block.filter(cell => city.isServed(cell, 'power'));

  expect(powered()).toHaveLength(utilities.capacity.power);
  expect(city.inspect(plant)).toMatchObject({ serving: 60, capacity: 60 });
  expect(city.isServed({ x: 5, y: 1 }, 'power')).toBe(true);
  expect(city.isServed({ x: 10, y: 7 }, 'power')).toBe(false);
  expect(city.isServed(outside, 'power')).toBe(false);
  expect(city.isServed({ x: 5, y: 1 }, 'water')).toBe(false);

  // A second plant takes the buildings the first one had no capacity left for.
  city.execute({ type: 'BUILD_FACILITY', x: 6, y: 0, facility: 'power' });
  expect(powered()).toHaveLength(block.length);
  expect(city.inspect({ x: 6, y: 0 })).toMatchObject({ serving: block.length - 60 });
  expect(city.isServed(outside, 'power')).toBe(false);
});

it('wants homes when jobs are open and workplaces when people need work', () => {
  const empty = zoneDemand({ population: 0, openings: 0, commercialJobs: 0, industrialJobs: 0 });
  expect(empty).toEqual({ residential: 100, commercial: 100, industrial: 100 });

  const allJobs = zoneDemand({ population: 0, openings: 0, commercialJobs: 50, industrialJobs: 50 });
  expect(allJobs.residential).toBeGreaterThan(0);
  expect(allJobs.commercial).toBe(-100);
  expect(allJobs.industrial).toBe(-100);

  const allHomes = zoneDemand({ population: 100, openings: 20, commercialJobs: 0, industrialJobs: 0 });
  expect(allHomes.residential).toBe(-100);
  expect(allHomes.commercial).toBe(100);

  expect(buildChance(-10)).toBe(0);
  expect(buildChance(0)).toBe(0);
  expect(buildChance(50)).toBeGreaterThan(buildChance(1));
  expect(buildChance(100)).toBe(1);
});
