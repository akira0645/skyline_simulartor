import { expect, it } from 'vitest';
import { calendar } from './calendar';
import { economy, milestones } from './Economy';
import { goals } from './Goals';
import { goods } from './Goods';
import { countTrait, traits } from './Residents';
import { SimulationEngine } from './SimulationEngine';
import { MAP_SIZE, type Cell } from './TileMap';
import { traffic } from './Traffic';

const MONTH = calendar.daysPerMonth * calendar.ticksPerDay;
const id = ({ x, y }: Cell) => y * MAP_SIZE + x;
const row = (y: number, from: number, to: number): Cell[] =>
  Array.from({ length: to - from + 1 }, (_, index) => ({ x: from + index, y }));
const start = () => new SimulationEngine({ version: 1, seed: 1, tick: 0 });

it('charges per changed tile and refuses what the city cannot afford', () => {
  const { city } = start();
  const funds = () => city.getStats().funds;
  expect(funds()).toBe(economy.startingFunds);

  expect(city.execute({ type: 'BUILD_ROAD', path: row(1, 0, 9) }).cost).toBe(10 * economy.cost.road);
  // Paving the same stretch again changes two new tiles only.
  expect(city.execute({ type: 'BUILD_ROAD', path: row(1, 0, 11) }).cost).toBe(2 * economy.cost.road);
  city.execute({ type: 'SET_ZONE', tiles: row(0, 0, 3), zone: 'residential' });
  city.execute({ type: 'BUILD_FACILITY', x: 0, y: 2, facility: 'power' });
  city.execute({ type: 'DEMOLISH', x: 0, y: 0 });
  expect(funds()).toBe(economy.startingFunds - 12 * economy.cost.road - 4 * economy.cost.zone -
    economy.cost.power - economy.cost.demolish);

  // The money runs out part-way through these; a refused command changes nothing.
  for (let x = 1; x <= 12; x++) city.execute({ type: 'BUILD_FACILITY', x, y: 2, facility: 'power' });
  const before = funds();
  expect(before).toBeLessThan(economy.cost.power);
  const refused = city.execute({ type: 'BUILD_FACILITY', x: 20, y: 2, facility: 'power' });
  expect(refused).toMatchObject({ changed: [], cost: 0, error: expect.stringContaining('錢不夠') });
  expect(city.map.get({ x: 20, y: 2 })).toBe('grass');
  expect(funds()).toBe(before);
  // A road too long for the balance is refused whole rather than paved part-way.
  expect(city.execute({ type: 'BUILD_ROAD', path: row(5, 0, 127), road: 'avenue' }).changed).toEqual([]);
  expect(city.map.get({ x: 0, y: 5 })).toBe('grass');
});

it('settles tax and upkeep once a month and keeps the balance in the save', () => {
  const engine = start();
  const { city } = engine;
  const home = { x: 1, y: 1 };
  const work = { x: 3, y: 1 };
  city.execute({ type: 'BUILD_ROAD', path: row(2, 1, 3) });
  city.execute({ type: 'BUILD_ROAD', path: [{ x: 4, y: 2 }], road: 'avenue' });
  city.execute({ type: 'SET_ZONE', tiles: [home], zone: 'residential' });
  city.execute({ type: 'SET_ZONE', tiles: [work], zone: 'commercial' });
  city.execute({ type: 'BUILD_FACILITY', x: 2, y: 3, facility: 'power' });
  city.execute({ type: 'BUILD_FACILITY', x: 3, y: 3, facility: 'water' });
  engine.load({ ...engine.save(), buildings: [
    { id: id(home), capacity: 4, occupants: 4 }, { id: id(work), capacity: 3, occupants: 0 },
  ] });

  const { funds, budget } = city.getStats();
  // Four residents, the rich among them counted twice, and three of them at work in the shop.
  const rich = countTrait(1, id(home), 0, 4, 'rich');
  const tax = (4 + rich * (traits.rich.taxTimes - 1)) * economy.tax.resident + 3 * economy.tax.job;
  // With no factory, everything the four of them need is bought in.
  const trade = -4 * goods.perResident * goods.importCost;
  const upkeep = 3 * economy.upkeep.road + economy.upkeep.avenue + economy.upkeep.power + economy.upkeep.water;
  expect(budget).toEqual({ tax, fares: 0, trade, visitors: 0, licence: 0, fuel: 0, parking: 0, loans: 0, upkeep, net: tax + trade - upkeep });
  expect(budget.net).toBeLessThan(0);

  // A thirtieth of the month's figure is paid each day, at the day's last tick.
  engine.advance(calendar.ticksPerDay - 1);
  expect(city.getStats().funds).toBe(funds);
  engine.advance(1);
  expect(city.getStats().funds).toBeCloseTo(funds + budget.net / 30);
  engine.advance(MONTH - calendar.ticksPerDay);
  // Someone may buy a scooter during the month, which adds a little licence money.
  expect(Math.abs(city.getStats().funds - funds - budget.net)).toBeLessThan(3);

  const restored = start();
  restored.load(structuredClone(engine.save()));
  expect(restored.city.getStats().funds).toBe(city.getStats().funds);
  // A save from before money existed starts with the opening balance.
  const old: Record<string, unknown> = { ...engine.save(), schemaVersion: 3 };
  delete old.funds;
  delete old.rank;
  restored.load(old);
  expect(restored.city.getStats()).toMatchObject({ funds: economy.startingFunds, rank: 0 });
  expect(() => restored.load({ ...engine.save(), funds: NaN })).toThrow('存檔資料損壞。');
  expect(() => restored.load({ ...engine.save(), rank: 99 })).toThrow('存檔資料損壞。');
});

it('pays each population milestone once', () => {
  const engine = start();
  const { city } = engine;
  const homes = row(1, 1, 10);
  city.execute({ type: 'BUILD_ROAD', path: row(2, 1, 10) });
  city.execute({ type: 'SET_ZONE', tiles: homes, zone: 'residential' });
  const people = (occupants: number) => engine.load({ ...engine.save(),
    buildings: homes.map(home => ({ id: id(home), capacity: 40, occupants })) });

  // Without power and water a home holds half its capacity, so nobody moves in or out here.
  people(4);
  const before = city.getStats().funds;
  engine.advance(1);
  expect(city.getStats()).toMatchObject({ rank: 0, funds: before });

  // 160 people pass the first two milestones at once.
  people(16);
  // Passing 150 people also meets two of the goals, which pay once each as well.
  const rewards = (ids: string[]) => goals.filter(goal => ids.includes(goal.id))
    .reduce((sum, goal) => sum + goal.reward, 0);
  expect(milestones[1].population).toBeLessThanOrEqual(160);
  expect(milestones[2].population).toBeGreaterThan(160);
  engine.advance(4);
  expect(city.getStats()).toMatchObject({ rank: 2, funds: before + milestones[0].grant + milestones[1].grant });
  // Goals are looked at once a day, at the same tick the day's tax and upkeep are paid.
  engine.advance(4);
  const after = city.getStats();
  expect(after.rank).toBe(2);
  expect(after.goals).toEqual(['first-homes', 'village']);
  const paid = before + milestones[0].grant + milestones[1].grant + rewards(after.goals);
  expect(Math.abs(after.funds - paid)).toBeLessThan(100);
  // Neither milestones nor goals pay twice.
  engine.advance(calendar.ticksPerDay);
  expect(Math.abs(city.getStats().funds - paid)).toBeLessThan(200);
});

it('keeps avenues when a street is drawn across them, and joins both into one network', () => {
  const { city } = start();
  city.execute({ type: 'BUILD_ROAD', path: row(1, 0, 4), road: 'avenue' });
  expect(city.execute({ type: 'BUILD_ROAD', path: row(1, 0, 6) }).changed).toEqual([{ x: 5, y: 1 }, { x: 6, y: 1 }]);
  expect(city.map.get({ x: 2, y: 1 })).toBe('avenue');
  // Upgrading a street pays the avenue price.
  expect(city.execute({ type: 'BUILD_ROAD', path: [{ x: 5, y: 1 }], road: 'avenue' }).cost).toBe(economy.cost.avenue);
  expect(city.roadGraph.shortestPath({ x: 0, y: 1 }, { x: 6, y: 1 })?.distance).toBe(6);
  expect(city.execute({ type: 'SET_ZONE', tiles: [{ x: 2, y: 1 }], zone: 'residential' }).error).toBeTruthy();
  expect(city.inspect({ x: 2, y: 1 })).toMatchObject({ tile: 'avenue', roadCapacity: traffic.avenue.capacity });
  expect(city.inspect({ x: 6, y: 1 })).toMatchObject({ tile: 'road', roadCapacity: traffic.capacity });
});

it('stops a home with a long commute from filling until the road is upgraded', () => {
  // Twenty-five street tiles take 50 minutes: within reach, but longer than people accept.
  const home = { x: 1, y: 1 };
  const work = { x: 25, y: 1 };
  const engine = start();
  const { city } = engine;
  city.execute({ type: 'BUILD_ROAD', path: row(2, 1, 25) });
  city.execute({ type: 'SET_ZONE', tiles: [home], zone: 'residential' });
  city.execute({ type: 'SET_ZONE', tiles: [work], zone: 'industrial' });
  for (const x of [1, 16]) {
    city.execute({ type: 'BUILD_FACILITY', x, y: 3, facility: 'power' });
    city.execute({ type: 'BUILD_FACILITY', x: x + 1, y: 3, facility: 'water' });
  }
  engine.load({ ...engine.save(), buildings: [
    { id: id(home), capacity: 4, occupants: 0 }, { id: id(work), capacity: 5, occupants: 0 },
  ] });

  engine.advance(100);
  expect(city.getStats()).toMatchObject({ population: 1, employed: 1 });
  expect(city.inspect(home)).toMatchObject({ commute: expect.closeTo(50, 1), issues: ['long-commute'] });
  expect(city.getStats().complaints).toMatchObject({ 'long-commute': 1, 'no-power': 0 });

  city.execute({ type: 'BUILD_ROAD', path: row(2, 1, 25), road: 'avenue' });
  engine.advance(100);
  expect(city.getStats()).toMatchObject({ population: 4, employed: 4 });
  expect(city.inspect(home)).toMatchObject({ commute: expect.closeTo(25, 1), issues: [] });
});
