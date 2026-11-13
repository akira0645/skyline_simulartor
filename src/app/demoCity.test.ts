import { expect, it } from 'vitest';
import { demoCity, powerPlant, waterTower, works } from './demoCity';
import { calendar } from '../simulation/calendar';
import { economy } from '../simulation/Economy';
import { SimulationEngine } from '../simulation/SimulationEngine';

const MONTH = calendar.daysPerMonth * calendar.ticksPerDay;
const demo = () => {
  const engine = new SimulationEngine({ version: 1, seed: 42, tick: 0 });
  demoCity(engine);
  return engine;
};

it('starts with both walking and driving routes and loses jobs when the avenue closes', () => {
  const { city } = demo();
  expect(city.getStats()).toMatchObject({ population: 16, employed: 16, funds: economy.startingFunds });
  expect(city.map.get(powerPlant)).toBe('power');
  expect(city.map.get(waterTower)).toBe('water');
  const lengths = city.getCommutes().map(route => route.path.length);
  expect(lengths.some(length => length < 5)).toBe(true);
  expect(lengths.some(length => length >= 5)).toBe(true);
  const before = city.getStats().employed;
  city.execute({ type: 'DEMOLISH', ...works });
  expect(city.getStats().employed).toBeLessThan(before);
});

it('grows by itself into a town with upgraded buildings and money coming in', () => {
  const engine = demo();
  const { city } = engine;
  const start = city.getStats();
  engine.advance(12 * MONTH);
  const grown = city.getStats();
  expect(grown.population).toBeGreaterThan(4 * start.population);
  expect(grown.rank).toBeGreaterThanOrEqual(1);
  expect(grown.budget.net).toBeGreaterThan(0);
  expect(grown.funds).toBeGreaterThan(start.funds);
  expect(grown.complaints).toMatchObject({ 'no-power': 0, 'no-water': 0, pollution: 0 });
  const levels = engine.save().buildings.map(building => building.level);
  expect(Math.max(...levels)).toBe(3);
});
