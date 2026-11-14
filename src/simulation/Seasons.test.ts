import { expect, it } from 'vitest';
import { demoCity } from '../app/demoCity';
import { calendar } from './calendar';
import { goods } from './Goods';
import { nextFestival, policies, seasonAt, seasons } from './Seasons';
import { SimulationEngine } from './SimulationEngine';

const DAY = calendar.ticksPerDay;
const MONTH = calendar.daysPerMonth * DAY;
const demo = () => {
  const engine = new SimulationEngine({ version: 1, seed: 42, tick: 0 });
  demoCity(engine);
  return engine;
};

it('goes round four seasons, and farmland grows by the season', () => {
  expect([0, 3, 6, 9, 12].map(month => seasonAt(month * MONTH))).toEqual(['spring', 'summer', 'autumn', 'winter', 'spring']);
  const engine = new SimulationEngine({ version: 1, seed: 1, tick: 0 });
  const { city } = engine;
  city.execute({ type: 'BUILD_FARM', tiles: [{ x: 30, y: 30 }] });
  const field = () => city.inspect({ x: 30, y: 30 })!.grows;
  expect(field()).toBe(goods.farm.dry);
  engine.advance(6 * MONTH);
  expect(field()).toBe(goods.farm.dry * seasons.farm.autumn);
  engine.advance(3 * MONTH);
  expect(field()).toBe(goods.farm.dry * seasons.farm.winter);
});

it('holds a festival on its day where the city has somewhere for it', () => {
  const engine = demo();
  const { city } = engine;
  // The town opens on the first of the fifth month; the games are on the fifteenth of the seventh.
  expect(nextFestival(engine.getSnapshot().tick)).toEqual({ id: 'games', days: 74 });
  expect(city.getStats().festival).toMatchObject({ id: 'games', ready: true });
  const before = city.getStats().funds;
  engine.advance(73 * DAY);
  expect(city.getFeasts()).toEqual([]);
  const eve = city.getStats().funds;
  engine.advance(2 * DAY);
  const [games] = city.getFeasts();
  expect(games).toMatchObject({ id: 'games' });
  expect(games.income).toBeGreaterThan(100);
  expect(city.getStats().funds - eve).toBeGreaterThan(games.income);
  expect(eve).toBeGreaterThan(before);
  // The harvest festival comes next, and a town without farmland has nothing to show.
  engine.advance(70 * DAY);
  expect(city.getFeasts().at(-1)).toMatchObject({ id: 'harvest', income: 0 });
});

it('lets the city set policies, which cost money and are saved', () => {
  const engine = demo();
  const { city } = engine;
  const before = city.getStats();
  expect(before.budget.fares).toBeGreaterThan(0);
  city.setPolicy('freeride', true);
  city.setPolicy('recycle', true);
  const after = city.getStats();
  expect(after.policies).toEqual(['recycle', 'freeride']);
  expect(after.budget.fares).toBe(0);
  expect(after.riders).toBeGreaterThanOrEqual(before.riders);
  expect(after.budget.upkeep).toBe(before.budget.upkeep + Math.round(policies.recycle.perResident * after.population));
  const restored = new SimulationEngine({ version: 1, seed: 0, tick: 0 });
  restored.load(structuredClone(engine.save()));
  expect(restored.city.getStats().policies).toEqual(['recycle', 'freeride']);
  city.setPolicy('freeride', false);
  expect(city.getStats().budget.fares).toBeGreaterThan(0);
});

it('sets a challenge against the clock now and then, and saves it', () => {
  const engine = demo();
  const { city } = engine;
  let seen;
  for (let day = 0; day < 200 && !seen; day++) {
    engine.advance(DAY);
    seen = city.getStats().challenge;
  }
  expect(seen).toBeDefined();
  expect(seen!.target).toBeGreaterThan(seen!.now);
  const restored = new SimulationEngine({ version: 1, seed: 0, tick: 0 });
  restored.load(structuredClone(engine.save()));
  expect(restored.city.getStats().challenge).toEqual(city.getStats().challenge);
  // It ends one way or the other when its time is up.
  engine.advance(130 * DAY);
  expect(city.getNotices().challengeEnd).toBeDefined();
});

it('opens new places to spend a day off as the city grows', () => {
  const empty = new SimulationEngine({ version: 1, seed: 1, tick: 0 });
  expect(empty.city.execute({ type: 'BUILD_SERVICE', x: 5, y: 5, service: 'library' }).error).toContain('50');
  const engine = demo();
  const { city } = engine;
  engine.load({ ...engine.save(), funds: 100000 });
  // Beside the south street, east of the old town's stations.
  for (const [service, x] of [['library', 2], ['pool', 5], ['ktv', 8]] as const) {
    expect(city.execute({ type: 'BUILD_SERVICE', x, y: 9, service }).error).toBeUndefined();
  }
  expect(city.inspect({ x: 5, y: 9 })).toMatchObject({ tile: 'pool', running: true });
  expect(city.inspect({ x: 5, y: 9 })!.earns).toBeGreaterThan(0);
  expect(city.execute({ type: 'BUILD_SERVICE', x: 30, y: 12, service: 'amusement' }).error).toContain('400');
});
