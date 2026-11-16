import { expect, it } from 'vitest';
import { planFreight } from './Freight';
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
