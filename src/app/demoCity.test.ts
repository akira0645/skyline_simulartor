import { expect, it } from 'vitest';
import { demoCity, powerPlant, waterTower, works } from './demoCity';
import { calendar } from '../simulation/calendar';
import { economy } from '../simulation/Economy';
import { SimulationEngine } from '../simulation/SimulationEngine';
import { TILES } from '../simulation/TileMap';

const MONTH = calendar.daysPerMonth * calendar.ticksPerDay;
const demo = () => {
  const engine = new SimulationEngine({ version: 1, seed: 42, tick: 0 });
  demoCity(engine);
  return engine;
};

it('starts with both walking and driving routes and loses jobs when the avenue closes', () => {
  const engine = demo();
  const { city } = engine;
  expect(city.getStats()).toMatchObject({ population: 16, employed: 16, funds: economy.startingFunds });
  expect(city.map.get(powerPlant)).toBe('power');
  expect(city.map.get(waterTower)).toBe('water');
  // Everything the town was meant to have got built and is connected.
  const count = (tile: string) => engine.save().tiles.filter(code => TILES[code] === tile).length;
  expect(['power', 'water', 'fire', 'police', 'school', 'clinic', 'metro'].map(count)).toEqual([2, 2, 2, 2, 2, 1, 3]);
  expect(city.getStats().idle).toBe(0);
  expect(city.getLines()).toMatchObject([{ kind: 'metro', active: true, vehicles: 2 }]);
  expect(city.getLines()[0].stops).toHaveLength(3);
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
  // People ride the metro to the factories.
  expect(grown.riders).toBeGreaterThan(0);
  expect(grown.budget.fares).toBeGreaterThan(0);
  const levels = engine.save().buildings.map(building => building.level);
  expect(Math.max(...levels)).toBeGreaterThanOrEqual(3);
});
