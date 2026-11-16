import { expect, it } from 'vitest';
import { freightAssignment, freightFleetSize, planFreight, summarizeFreight, type FreightRoute } from './Freight';
import { SimulationEngine } from './SimulationEngine';
import { MAP_SIZE } from './TileMap';

it('allocates finite output, skips disconnected shops, and breaks distance ties by supplier id', () => {
  const routes = planFreight([{ id: 1, amount: 30 }, { id: 3, amount: 10 }],
    [{ id: 2, amount: 35 }, { id: 4, amount: 20 }, { id: 5, amount: 100 }],
    (from, to) => to === 5 ? undefined : [{ x: from, y: 0 }, { x: to, y: 0 }]);
  expect(routes.map(({ from, to, goods, trucks }) => ({ from, to, goods, trucks }))).toEqual([
    { from: 1, to: 2, goods: 30, trucks: 2 },
    { from: 3, to: 2, goods: 5, trucks: 1 },
    { from: 3, to: 4, goods: 5, trucks: 1 },
  ]);
  expect(planFreight([{ id: 1, amount: 20 }], [{ id: 2, amount: 20 }], () => undefined)).toEqual([]);
});

it('rebuilds freight from employed factories, preserves it on load, and drops a severed route', () => {
  const engine = new SimulationEngine({ version: 1, seed: 7, tick: 0 });
  const { city } = engine;
  city.execute({ type: 'BUILD_ROAD', path: Array.from({ length: 9 }, (_, x) => ({ x: x + 1, y: 2 })) });
  const zones = [{ x: 1, y: 1, zone: 'residential' as const },
    { x: 4, y: 1, zone: 'industrial' as const }, { x: 9, y: 1, zone: 'commercial' as const }];
  for (const { x, y, zone } of zones) city.execute({ type: 'SET_ZONE', tiles: [{ x, y }], zone });
  engine.load({ ...engine.save(), buildings: zones.map(({ x, y, zone }) => ({
    id: y * MAP_SIZE + x, capacity: zone === 'residential' ? 12 : 12, occupants: zone === 'residential' ? 12 : 0,
  })) });
  expect(city.getFreight().length).toBeGreaterThan(0);
  expect(city.getFreight()[0].minutes).toBeGreaterThan(0);
  const restored = new SimulationEngine({ version: 1, seed: 0, tick: 0 });
  restored.load(structuredClone(engine.save()));
  expect(restored.city.getFreight()).toEqual(city.getFreight());
  city.execute({ type: 'DEMOLISH', x: 6, y: 2 });
  expect(city.getFreight()).toEqual([]);
});


it('shares a daily-sized fleet rather than spawning a truck for every monthly route', () => {
  const routes = Array.from({ length: 17 }, (_, id): FreightRoute => ({ from: id, to: id + 100,
    trucks: 1, goods: 10, minutes: 2, path: [{ x: 1, y: 1 }, { x: 2, y: 1 }] }));
  expect(freightFleetSize(routes)).toBe(1);
  expect(freightFleetSize([{ ...routes[0], trucks: 60 }])).toBe(2);
  expect(freightFleetSize([{ ...routes[0], trucks: 6000 }])).toBe(8);
  expect(freightFleetSize([])).toBe(0);
  const sameEntrance = [{ ...routes[0], path: [{ x: 1, y: 1 }] }];
  expect(freightFleetSize(sameEntrance)).toBe(0);
  expect(freightAssignment(sameEntrance, 0, 0)).toBeUndefined();
  expect(new Set(Array.from({ length: 17 }, (_, round) => freightAssignment(routes, 0, round)?.from)).size).toBe(17);
  expect(freightAssignment([], 0, 0)).toBeUndefined();
});

it('weights new assignments by cargo volume and explains unmet replenishment without calling it delivered', () => {
  const sources = [{ id: 1, amount: 30 }];
  const shops = [{ id: 2, amount: 10 }, { id: 3, amount: 40 }, { id: 4, amount: 5 }];
  const routes = planFreight(sources, shops, (_from, to) => to === 4 ? undefined : [{ x: 1, y: 1 }, { x: 2, y: 1 }]);
  const report = summarizeFreight(sources, shops, routes, id => id !== 4);
  expect(report).toMatchObject({ supply: 30, demand: 55, planned: 30, missing: 25, unused: 0, trips: 2, fleet: 1 });
  expect(report.destinations.map(shop => shop.problem)).toEqual([undefined, 'shortage', 'disconnected']);
  expect(summarizeFreight([], shops, [], () => false).destinations[0].problem).toBe('no-source');
  expect(summarizeFreight([], [], [], () => false)).toMatchObject({ planned: 0, missing: 0, fleet: 0 });
  const weighted = [{ ...routes[0], trucks: 2 }, { ...routes[1], trucks: 1 }];
  expect([0, 1, 2].map(round => freightAssignment(weighted, 0, round)?.to)).toEqual([2, 2, 3]);
});

it('reports disconnected shops even when both districts have their own workers', () => {
  const engine = new SimulationEngine({ version: 1, seed: 7, tick: 0 });
  const { city } = engine;
  for (const start of [1, 8]) city.execute({ type: 'BUILD_ROAD', path: Array.from({ length: 4 }, (_, x) => ({ x: start + x, y: 2 })) });
  const zones = [{ x: 1, zone: 'residential' as const }, { x: 8, zone: 'residential' as const },
    { x: 4, zone: 'industrial' as const }, { x: 11, zone: 'commercial' as const }];
  for (const { x, zone } of zones) city.execute({ type: 'SET_ZONE', tiles: [{ x, y: 1 }], zone });
  engine.load({ ...engine.save(), buildings: zones.map(({ x, zone }) => ({ id: MAP_SIZE + x,
    capacity: zone === 'residential' ? 12 : 24, occupants: zone === 'residential' ? 12 : 0 })) });
  expect(city.getLogistics()).toMatchObject({ factories: 1, shops: 1, planned: 0 });
  expect(city.getLogistics().destinations[0]).toMatchObject({ id: MAP_SIZE + 11, problem: 'disconnected' });
  const restored = new SimulationEngine({ version: 1, seed: 0, tick: 0 });
  restored.load(structuredClone(engine.save()));
  expect(restored.city.getLogistics()).toEqual(city.getLogistics());
});
