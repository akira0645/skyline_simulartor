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
  city.execute({ type: 'DEMOLISH', ...home });
  expect(city.getStats().population).toBe(0);
});
