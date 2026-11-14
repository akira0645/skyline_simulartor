import { expect, it } from 'vitest';
import { economy, milestones } from './Economy';
import { goods } from './Goods';
import { homeKinds, residentAt, traitOf, traits } from './Residents';
import { expectations, services } from './Services';
import { SimulationEngine } from './SimulationEngine';
import { MAP_SIZE, type Cell } from './TileMap';

const id = ({ x, y }: Cell) => y * MAP_SIZE + x;
const row = (y: number, from: number, to: number): Cell[] =>
  Array.from({ length: to - from + 1 }, (_, index) => ({ x: from + index, y }));
/** A city that has passed `rank` population milestones, with money to build anything. */
function start(rank = 0) {
  const engine = new SimulationEngine({ version: 1, seed: 1, tick: 0 });
  engine.load({ ...engine.save(), rank, funds: 100000 });
  return engine;
}

it('opens bigger buildings as the city passes its milestones', () => {
  const engine = start();
  const { city } = engine;
  city.execute({ type: 'BUILD_ROAD', path: row(5, 1, 10) });
  // A village cannot have a hospital; the refusal says how big it must get.
  const refused = city.execute({ type: 'BUILD_SERVICE', x: 2, y: 3, service: 'hospital' });
  expect(refused).toMatchObject({ changed: [], cost: 0 });
  expect(refused.error).toContain(String(milestones[services.unlock.hospital! - 1].population));
  expect(city.lockedUntil('hospital')).toBe(services.unlock.hospital);
  expect(city.lockedUntil('school')).toBeUndefined();
  expect(city.execute({ type: 'BUILD_SERVICE', x: 2, y: 4, service: 'market' }).error).toBeTruthy();

  // The rank is the most the city has ever been, so it stays open once reached.
  engine.load({ ...engine.save(), rank: services.unlock.hospital! });
  expect(city.lockedUntil('hospital')).toBeUndefined();
  expect(city.lockedUntil('stadium')).toBe(services.unlock.stadium);
  expect(city.execute({ type: 'BUILD_SERVICE', x: 2, y: 4, service: 'market' }).error).toBeUndefined();
});

it('builds a hospital on four tiles that stand and fall together', () => {
  const engine = start(5);
  const { city } = engine;
  const home = { x: 12, y: 4 };
  city.execute({ type: 'BUILD_ROAD', path: row(5, 1, 14) });
  city.execute({ type: 'SET_ZONE', tiles: [home], zone: 'residential' });
  const before = city.getStats().funds;
  // Its corner is two rows off the road; the lower pair of tiles touches it.
  const built = city.execute({ type: 'BUILD_SERVICE', x: 3, y: 3, service: 'hospital' });
  expect(built.changed).toHaveLength(4);
  expect(built.cost).toBe(economy.cost.hospital);
  expect(city.getStats().funds).toBe(before - economy.cost.hospital);
  expect([[3, 3], [4, 3], [3, 4], [4, 4]].map(([x, y]) => city.map.get({ x, y })))
    .toEqual(['hospital', 'annex', 'annex', 'annex']);
  expect(city.getStats().budget.upkeep).toBe(14 * economy.upkeep.road + economy.upkeep.hospital);
  expect(city.getStats().idle).toBe(0);
  // Any of its tiles answers for the whole building.
  expect(city.inspect({ x: 4, y: 4 })).toMatchObject({ tile: 'hospital', running: true, radius: services.radius.hospital });
  // It does a clinic's work too.
  expect(city.isCovered(home, 'hospital')).toBe(true);
  expect(city.isCovered(home, 'clinic')).toBe(true);

  // Nothing big may overlap it, and a road may not cut through the site of a new one.
  expect(city.execute({ type: 'BUILD_SERVICE', x: 4, y: 2, service: 'museum' }).error).toBeTruthy();
  expect(city.execute({ type: 'BUILD_SERVICE', x: 6, y: 4, service: 'museum' }).error).toBeTruthy();
  expect(city.execute({ type: 'BUILD_SERVICE', x: 6, y: 3, service: 'museum' }).error).toBeUndefined();

  // It survives a save.
  const restored = new SimulationEngine({ version: 1, seed: 0, tick: 0 });
  restored.load(structuredClone(engine.save()));
  expect(restored.city.isCovered(home, 'clinic')).toBe(true);

  // Pulling down one corner, or zoning over it, takes the whole building.
  city.execute({ type: 'DEMOLISH', x: 4, y: 4 });
  expect([[3, 3], [4, 3], [3, 4], [4, 4]].map(([x, y]) => city.map.get({ x, y }))).toEqual(Array(4).fill('grass'));
  expect(city.isCovered(home, 'clinic')).toBe(false);
  city.execute({ type: 'SET_ZONE', tiles: [{ x: 7, y: 4 }], zone: 'commercial' });
  expect([[6, 3], [7, 3], [6, 4], [7, 4]].map(([x, y]) => city.map.get({ x, y })))
    .toEqual(['grass', 'grass', 'grass', 'commercial']);
});

it('lets a market serve shoppers and sights bring in visitors', () => {
  const engine = start(5);
  const { city } = engine;
  const home = { x: 1, y: 4 };
  city.execute({ type: 'BUILD_ROAD', path: row(5, 1, 12) });
  city.execute({ type: 'SET_ZONE', tiles: [home], zone: 'residential' });
  engine.load({ ...engine.save(), buildings: [{ id: id(home), capacity: 400, occupants: 200 }] });
  // Nobody works in a shop, so nobody can buy anything.
  expect(city.getStats().goods).toMatchObject({ needed: 200 * goods.perResident, served: 0 });
  city.execute({ type: 'BUILD_SERVICE', x: 3, y: 4, service: 'market' });
  expect(city.getStats().goods.served).toBe(services.market.shoppers);
  expect(city.inspect({ x: 3, y: 4 })).toMatchObject({ shoppers: services.market.shoppers });
  city.execute({ type: 'BUILD_SERVICE', x: 4, y: 4, service: 'market' });
  expect(city.getStats().goods.served).toBe(200);

  const before = city.getStats().budget;
  expect(before.visitors).toBe(0);
  city.execute({ type: 'BUILD_SERVICE', x: 6, y: 3, service: 'museum' });
  const visitors = Math.round(200 * services.visitors.museum!.perResident);
  expect(city.inspect({ x: 7, y: 4 })).toMatchObject({ tile: 'museum', earns: visitors });
  expect(city.getStats().budget).toMatchObject({ visitors, net: before.net + visitors - economy.upkeep.museum });
  // A sight nobody can get to earns nothing.
  city.execute({ type: 'BUILD_SERVICE', x: 20, y: 20, service: 'stadium' });
  expect(city.inspect({ x: 20, y: 20 })).toMatchObject({ running: false, earns: undefined });
  expect(city.getStats().budget.visitors).toBe(visitors);
  expect(city.getStats().idle).toBe(1);
});

it('expects a high school of a large town', () => {
  const engine = start(5);
  const { city } = engine;
  const home = { x: 1, y: 4 };
  const need = expectations.find(entry => entry.service === 'highschool')!;
  city.execute({ type: 'BUILD_ROAD', path: row(5, 1, 6) });
  city.execute({ type: 'SET_ZONE', tiles: [home], zone: 'residential' });
  engine.load({ ...engine.save(), buildings: [{ id: id(home), capacity: 4000, occupants: need.population }] });
  expect(city.inspect(home)!.issues).toContain('no-highschool');
  expect(city.inspect(home)!.issues).not.toContain('no-hospital');
  const before = city.landValueAt(home);
  city.execute({ type: 'BUILD_SERVICE', x: 3, y: 4, service: 'highschool' });
  expect(city.inspect(home)!.issues).not.toContain('no-highschool');
  // The lot is worth little with so many people and no shops, but it is worth more than it was.
  expect(city.landValueAt(home)).toBeGreaterThan(before);
});

it('builds different kinds of home in different places, with different people in them', () => {
  const engine = start();
  const { city } = engine;
  // Homes by the factories, homes among the shops, and homes off by themselves.
  city.execute({ type: 'BUILD_ROAD', path: row(5, 1, 40) });
  city.execute({ type: 'SET_ZONE', tiles: row(4, 1, 6), zone: 'residential' });
  city.execute({ type: 'SET_ZONE', tiles: row(6, 1, 6), zone: 'industrial' });
  city.execute({ type: 'SET_ZONE', tiles: [...row(4, 16, 17), ...row(4, 19, 20)], zone: 'residential' });
  city.execute({ type: 'SET_ZONE', tiles: [{ x: 18, y: 4 }, ...row(6, 16, 20)], zone: 'commercial' });
  city.execute({ type: 'SET_ZONE', tiles: row(4, 30, 35), zone: 'residential' });
  engine.advance(2000);
  const kindAt = (x: number) => city.getBuilding({ x, y: 4 })?.kind;
  const built = (from: number, to: number) => row(4, from, to).filter(cell => city.hasBuilding(cell));
  expect(built(1, 6).length).toBeGreaterThan(0);
  for (const cell of built(1, 6)) expect(kindAt(cell.x)).toBe('worker');
  for (const x of [17, 19]) if (city.hasBuilding({ x, y: 4 })) expect(kindAt(x)).toBe('downtown');
  // Far from every shop and service, a home is a suburban one.
  for (const cell of built(30, 35)) expect(kindAt(cell.x)).toBe('suburb');
  expect(city.inspect(built(1, 6)[0])).toMatchObject({ kind: 'worker' });

  // Over many people, a kind of home shifts who lives there.
  const share = (kind: 'villa' | 'worker' | undefined, test: (place: number) => boolean) => {
    let count = 0;
    for (let place = 0; place < 4000; place++) if (test(place)) count++;
    return count / 4000;
  };
  const rich = (kind?: 'villa' | 'worker') => share(kind, place => traitOf(9, 77, place, kind) === 'rich');
  expect(rich('villa')).toBeGreaterThan(3 * rich());
  expect(rich('worker')).toBeLessThan(0.5 * rich());
  expect(rich()).toBeCloseTo(traits.rich.share, 1);
  const factoryMinded = (kind?: 'worker') =>
    share(kind, place => residentAt(9, 77, place, kind).liking === 'industrial');
  expect(factoryMinded('worker')).toBeCloseTo(homeKinds.worker.liking!.industrial, 1);
  expect(factoryMinded('worker')).toBeGreaterThan(2 * factoryMinded());
  // The kind is saved with the home.
  const restored = new SimulationEngine({ version: 1, seed: 0, tick: 0 });
  restored.load(structuredClone(engine.save()));
  expect(restored.save()).toEqual(engine.save());
  expect(() => restored.load({ ...engine.save(), buildings: engine.save().buildings.map(building =>
    building.kind ? { ...building, kind: 'castle' } : building) })).toThrow('存檔資料損壞。');
});
