import { expect, it } from 'vitest';
import { SimulationEngine } from './SimulationEngine';

it('grows only next to roads, applies capacity, and removes demolished buildings', () => {
  const engine = new SimulationEngine({ version: 1, seed: 42, tick: 0 });
  const city = engine.city;
  const home = { x: 2, y: 1 };
  const remote = { x: 5, y: 5 };
  const shop = { x: 1, y: 2 };
  city.execute({ type: 'BUILD_ROAD', path: [{ x: 1, y: 1 }] });
  city.execute({ type: 'SET_ZONE', tiles: [home, remote], zone: 'residential' });
  city.execute({ type: 'SET_ZONE', tiles: [shop], zone: 'commercial' });
  engine.advance(1);
  expect(city.hasBuilding(home)).toBe(false);
  engine.advance(9);
  expect(city.hasBuilding(remote)).toBe(false);
  expect(city.getStats()).toEqual({ population: 4, jobs: 3, employed: 3, buildings: 2 });
  expect(city.inspect(home)).toEqual({ tile: 'residential', building: true, roadAccess: true, capacity: 4, occupants: 4, level: 3 });
  expect(city.inspect(remote)).toEqual({ tile: 'residential', building: false, roadAccess: false, capacity: 0, occupants: 0 });
  expect(city.inspect({ x: 1, y: 1 })).toEqual({ tile: 'road' });
  expect(city.inspect({ x: -1, y: 0 })).toBeUndefined();
  city.execute({ type: 'DEMOLISH', ...home });
  expect(city.getStats().population).toBe(0);
});

it('uses the seed to choose a lot and fills homes one resident per tick', () => {
  function start(seed: number) {
    const engine = new SimulationEngine({ version: 1, seed, tick: 0 });
    engine.city.execute({ type: 'BUILD_ROAD', path: [{ x: 2, y: 2 }] });
    engine.city.execute({ type: 'SET_ZONE', tiles: [
      { x: 1, y: 2 }, { x: 3, y: 2 }, { x: 2, y: 3 },
    ], zone: 'residential' });
    engine.advance(2);
    return engine;
  }
  const first = start(7);
  expect(first.save()).toEqual(start(7).save());
  expect(new Set([7, 8, 9, 10].map(seed => start(seed).save().buildings[0].id)).size).toBeGreaterThan(1);
  expect(first.city.getStats().population).toBe(0);
  first.advance(1);
  expect(first.city.getStats().population).toBe(1);
});
