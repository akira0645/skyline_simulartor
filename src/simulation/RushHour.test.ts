import { expect, it } from 'vitest';
import { economy } from './Economy';
import { countTrait, traits } from './Residents';
import { SimulationEngine } from './SimulationEngine';
import { MAP_SIZE, type Cell } from './TileMap';
import { traffic } from './Traffic';
import { rushShifts, shiftIndex, shifts, workShift } from './WorkShift';

const id = ({ x, y }: Cell) => y * MAP_SIZE + x;
const row = (y: number, from: number, to: number): Cell[] =>
  Array.from({ length: to - from + 1 }, (_, index) => ({ x: from + index, y }));

it('knows which shifts are travelling at each hour', () => {
  const titles = (hour: number) => rushShifts(hour).map(index => shifts[index].title);
  expect(titles(5)).toEqual(['工廠早班']);
  expect(titles(8)).toEqual(['辦公室']);
  // Offices start at nine while the shops' commute begins.
  expect(titles(9.5)).toEqual(['店鋪']);
  expect(titles(12)).toEqual([]);
  // Early factory hands going home meet the late shift going in.
  expect(titles(14.5)).toEqual(['工廠早班', '工廠晚班']);
  expect(titles(17.5)).toEqual(['辦公室']);
  expect(titles(0.5)).toEqual(['工廠晚班']);
  expect(titles(3)).toEqual([]);
});

it('keeps the traffic of different shifts apart', () => {
  // One home, an office and a shop further along the same street. Both hold 30 without utilities.
  const home = { x: 1, y: 1 };
  const office = { x: 5, y: 1 };
  const shop = { x: 6, y: 1 };
  expect(workShift('commercial', id(office)).title).toBe('辦公室');
  expect(workShift('commercial', id(shop)).title).toBe('店鋪');
  const engine = new SimulationEngine({ version: 1, seed: 1, tick: 0 });
  const { city } = engine;
  city.execute({ type: 'BUILD_ROAD', path: row(2, 1, 6) });
  city.execute({ type: 'SET_ZONE', tiles: [home], zone: 'residential' });
  city.execute({ type: 'SET_ZONE', tiles: [office, shop], zone: 'commercial' });
  engine.load({ ...engine.save(), buildings: [
    { id: id(home), capacity: 60, occupants: 60 },
    { id: id(office), capacity: 60, occupants: 0 },
    { id: id(shop), capacity: 60, occupants: 0 },
  ] });

  expect(city.getCommutes().map(({ workId, workers, shift }) => [workId, workers, shift])).toEqual([
    [id(office), 30, shiftIndex('commercial', id(office))],
    [id(shop), 30, shiftIndex('commercial', id(shop))],
  ]);
  // Sixty people use the first stretch, but never more than thirty at a time.
  const shared = { x: 2, y: 2 };
  const shopOnly = { x: 6, y: 2 };
  const load = 30 / traffic.capacity;
  expect(city.inspect(shared)).toMatchObject({ flow: 30, congestion: load });
  expect(city.congestionAt(shared)).toBe(load);

  expect(city.congestionAt(shared, 8)).toBe(load);      // offices on the way in
  expect(city.congestionAt(shopOnly, 8)).toBe(0);
  expect(city.congestionAt(shared, 10)).toBe(load);     // shops on the way in
  expect(city.congestionAt(shopOnly, 10)).toBe(load);
  expect(city.congestionAt(shared, 13)).toBe(0);        // everyone at work
  expect(city.congestionAt(shared, 18)).toBe(load);     // offices going home
  expect(city.congestionAt(shopOnly, 21)).toBe(load);   // shops going home
  expect(city.congestionAt(shared, 3)).toBe(0);         // night
});

it('scales income with the tax rate and cools or heats demand', () => {
  const engine = new SimulationEngine({ version: 1, seed: 1, tick: 0 });
  const { city } = engine;
  const home = { x: 1, y: 1 };
  const work = { x: 2, y: 1 };
  city.execute({ type: 'BUILD_ROAD', path: row(2, 1, 2) });
  city.execute({ type: 'SET_ZONE', tiles: [home], zone: 'residential' });
  city.execute({ type: 'SET_ZONE', tiles: [work], zone: 'commercial' });
  engine.load({ ...engine.save(), buildings: [
    { id: id(home), capacity: 40, occupants: 20 }, { id: id(work), capacity: 40, occupants: 0 },
  ] });

  const usual = city.getStats();
  expect(usual.taxRate).toBe(economy.taxRate.default);
  const rich = countTrait(1, id(home), 0, 20, 'rich');
  expect(usual.budget.tax).toBe((20 + rich * (traits.rich.taxTimes - 1)) * economy.tax.resident + 20 * economy.tax.job);

  expect(city.setTaxRate(12)).toBe(12);
  const high = city.getStats();
  expect(high.budget.tax).toBe(usual.budget.tax * 12 / 8);
  for (const zone of ['residential', 'commercial', 'industrial'] as const) {
    expect(high.demand[zone]).toBeCloseTo(Math.max(-100, usual.demand[zone] - 4 * economy.taxRate.above));
  }

  city.setTaxRate(4);
  const low = city.getStats();
  expect(low.budget.tax).toBe(usual.budget.tax / 2);
  expect(low.demand.industrial).toBeCloseTo(Math.min(100, usual.demand.industrial + 4 * economy.taxRate.below));

  // Out of range is pulled back in; the rate is saved, and old saves load at the default.
  expect(city.setTaxRate(99)).toBe(economy.taxRate.max);
  expect(city.setTaxRate(-5)).toBe(economy.taxRate.min);
  expect(city.getStats().budget.tax).toBe(0);
  city.setTaxRate(11);
  const restored = new SimulationEngine({ version: 1, seed: 0, tick: 0 });
  restored.load(structuredClone(engine.save()));
  expect(restored.city.getStats().taxRate).toBe(11);
  const old: Record<string, unknown> = { ...engine.save() };
  delete old.taxRate;
  restored.load(old);
  expect(restored.city.getStats().taxRate).toBe(economy.taxRate.default);
  expect(() => restored.load({ ...engine.save(), taxRate: 50 })).toThrow('存檔資料損壞。');
});

it('stops a heavily taxed town from growing', () => {
  const plan = (rate: number) => {
    const engine = new SimulationEngine({ version: 1, seed: 5, tick: 0 });
    engine.city.execute({ type: 'BUILD_ROAD', path: row(5, 1, 20) });
    engine.city.execute({ type: 'SET_ZONE', tiles: row(4, 1, 20), zone: 'residential' });
    engine.city.execute({ type: 'SET_ZONE', tiles: row(6, 1, 10), zone: 'commercial' });
    engine.city.execute({ type: 'SET_ZONE', tiles: row(6, 11, 20), zone: 'industrial' });
    engine.city.setTaxRate(rate);
    engine.advance(480);
    return engine.city.getStats().buildings;
  };
  expect(plan(8)).toBeGreaterThan(20);
  expect(plan(20)).toBeLessThan(plan(8));
  expect(plan(20)).toBeLessThanOrEqual(6);
});
