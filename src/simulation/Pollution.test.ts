import { expect, it } from 'vitest';
import { economy } from './Economy';
import { pollution } from './Pollution';
import { SimulationEngine } from './SimulationEngine';
import { MAP_SIZE, type Cell } from './TileMap';

const id = ({ x, y }: Cell) => y * MAP_SIZE + x;
const row = (y: number, from: number, to: number): Cell[] =>
  Array.from({ length: to - from + 1 }, (_, index) => ({ x: from + index, y }));

it('fades with distance from a factory, adds up, and is cleaned by parks', () => {
  const engine = new SimulationEngine({ version: 1, seed: 1, tick: 0 });
  const { city } = engine;
  const factory = { x: 10, y: 10 };
  city.execute({ type: 'SET_ZONE', tiles: [factory], zone: 'industrial' });
  // A zoned lot is clean until a factory stands on it.
  expect(city.pollutionAt(factory)).toBe(0);
  engine.load({ ...engine.save(), buildings: [{ id: id(factory), capacity: 5, occupants: 0 }] });

  const { strength, radius } = pollution.industry;
  expect(city.pollutionAt(factory)).toBe(strength);
  expect(city.pollutionAt({ x: 11, y: 10 })).toBeCloseTo(strength * (1 - 1 / radius));
  expect(city.pollutionAt({ x: 11, y: 12 })).toBeCloseTo(strength * (1 - 3 / radius));
  expect(city.pollutionAt({ x: 10, y: 10 + radius })).toBe(0);
  expect(city.pollutionAt({ x: -1, y: 0 })).toBe(0);

  // A power plant next door adds its own; the total stops at 100.
  city.execute({ type: 'BUILD_FACILITY', x: 11, y: 10, facility: 'power' });
  expect(city.pollutionAt({ x: 11, y: 10 })).toBe(100);
  city.execute({ type: 'DEMOLISH', x: 11, y: 10 });

  const before = city.pollutionAt({ x: 12, y: 10 });
  const result = city.execute({ type: 'BUILD_PARK', tiles: [{ x: 12, y: 10 }, { x: 13, y: 10 }] });
  expect(result).toMatchObject({ cost: 2 * economy.cost.park });
  expect(city.map.get({ x: 12, y: 10 })).toBe('park');
  expect(city.pollutionAt({ x: 12, y: 10 })).toBe(0);
  expect(before).toBeGreaterThan(0);
  expect(city.getStats().budget.upkeep).toBe(2 * economy.upkeep.park);
  expect(city.execute({ type: 'BUILD_PARK', tiles: [{ x: 5, y: 5 }] }).error).toBeUndefined();
  city.execute({ type: 'BUILD_ROAD', path: [{ x: 6, y: 5 }] });
  expect(city.execute({ type: 'BUILD_PARK', tiles: [{ x: 6, y: 5 }] }).error).toBe('公園不能覆蓋道路。');
});

it('keeps people out of homes beside factories until a park cleans the air', () => {
  // Homes north of a street and a row of factories right across it.
  const homes = row(1, 3, 6);
  const factories = row(3, 3, 6);
  const engine = new SimulationEngine({ version: 1, seed: 1, tick: 0 });
  const { city } = engine;
  city.execute({ type: 'BUILD_ROAD', path: row(2, 1, 8) });
  city.execute({ type: 'SET_ZONE', tiles: homes, zone: 'residential' });
  city.execute({ type: 'SET_ZONE', tiles: factories, zone: 'industrial' });
  city.execute({ type: 'BUILD_FACILITY', x: 12, y: 1, facility: 'water' });
  engine.load({ ...engine.save(), buildings: [
    ...homes.map(home => ({ id: id(home), capacity: 4, occupants: 0 })),
    ...factories.map(factory => ({ id: id(factory), capacity: 5, occupants: 0 })),
  ] });

  expect(city.pollutionAt(homes[1])).toBeGreaterThan(pollution.limit);
  engine.advance(80);
  expect(city.getStats()).toMatchObject({ population: 0 });
  expect(city.inspect(homes[1])).toMatchObject({ issues: expect.arrayContaining(['pollution']) });
  expect(city.getStats().complaints.pollution).toBe(4);

  // Parks behind and beside the homes bring them under the limit.
  city.execute({ type: 'BUILD_PARK', tiles: [...row(0, 2, 7), { x: 2, y: 1 }, { x: 7, y: 1 }] });
  for (const home of homes) expect(city.pollutionAt(home)).toBeLessThanOrEqual(pollution.limit);
  engine.advance(80);
  expect(city.getStats().population).toBeGreaterThan(0);
  expect(city.getStats().complaints.pollution).toBe(0);
});
