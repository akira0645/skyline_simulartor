import { expect, it } from 'vitest';
import { demoCity } from '../app/demoCity';
import { calendar } from './calendar';
import { economy } from './Economy';
import { fuelPrice, goodsPrice, prices } from './Prices';
import { SimulationEngine } from './SimulationEngine';

const DAY = calendar.ticksPerDay;
const MONTH = calendar.daysPerMonth * DAY;

it('lets the prices of fuel and goods swing, each at its own pace, from level on the first day', () => {
  expect([fuelPrice(0), goodsPrice(0)]).toEqual([1, 1]);
  const year = Array.from({ length: 24 }, (_, half) => fuelPrice(half * MONTH / 2));
  expect(Math.max(...year)).toBeCloseTo(1 + prices.fuel.swing, 1);
  expect(Math.min(...year)).toBeCloseTo(1 - prices.fuel.swing, 1);
  expect(goodsPrice(3 * MONTH)).not.toBeCloseTo(fuelPrice(3 * MONTH));
});

it('charges drivers for fuel, and gives the city a share where it has a filling station', () => {
  const engine = new SimulationEngine({ version: 1, seed: 42, tick: 0 });
  demoCity(engine, 'medium');
  const { city } = engine;
  const before = city.getStats();
  // People own vehicles, and there is no station yet: they fill up out of town.
  expect(before.cars[1] + before.cars[2]).toBeGreaterThan(100);
  expect(before.budget.fuel).toBe(0);
  engine.load({ ...engine.save(), funds: 100000 });
  // One beside the old town's south street, and one on the new one to the south.
  expect(city.execute({ type: 'BUILD_SERVICE', x: 2, y: 9, service: 'gas' }).error).toBeUndefined();
  const after = city.getStats();
  expect(after.budget.fuel).toBeGreaterThan(0);
  expect(after.budget.net).toBe(before.budget.net + after.budget.fuel - Math.round(economy.upkeep.gas * after.prices.level));
  // Someone in its reach no longer thinks of the trip to fill up.
  const home = engine.save().buildings.find(building => building.people?.some(person => person.car) && city.isCovered(
    { x: building.id % 128, y: Math.floor(building.id / 128) }, 'gas'))!;
  const owner = home.people!.find(person => person.car)!;
  expect(city.person(home.id, owner.slot, 12)!.thoughts).not.toContain('no-gas');
});

it('raises the price of everything in a city big enough for business to turn, and saves the level', () => {
  const engine = new SimulationEngine({ version: 1, seed: 42, tick: 0 });
  demoCity(engine, 'medium');
  const { city } = engine;
  const opening = city.getStats();
  engine.advance(12 * MONTH);
  const later = city.getStats();
  expect(later.prices.level).not.toBe(opening.prices.level);
  expect(later.prices.level).toBeGreaterThan(0.9);
  expect(later.prices.level).toBeLessThan(1.2);
  // What a road costs follows it.
  const funds = later.funds;
  city.execute({ type: 'BUILD_ROAD', path: [{ x: 60, y: 60 }] });
  expect(funds - city.getStats().funds).toBe(Math.round(economy.cost.road * later.prices.level));
  const restored = new SimulationEngine({ version: 1, seed: 0, tick: 0 });
  restored.load(structuredClone(engine.save()));
  expect(restored.city.getStats().prices).toEqual(city.getStats().prices);
  // A small town's prices stay put.
  const small = new SimulationEngine({ version: 1, seed: 42, tick: 0 });
  demoCity(small);
  small.advance(6 * MONTH);
  expect(small.city.getStats().prices.level).toBe(1);
});

it('counts the commuters held up on the road as late', () => {
  const engine = new SimulationEngine({ version: 1, seed: 42, tick: 0 });
  demoCity(engine, 'large');
  const stats = engine.city.getStats();
  expect(stats.late).toBeGreaterThan(0);
  expect(stats.late).toBeLessThan(stats.employed);
  void DAY;
});
