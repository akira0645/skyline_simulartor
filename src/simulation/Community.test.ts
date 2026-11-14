import { expect, it } from 'vitest';
import { calendar } from './calendar';
import { bond, circle } from './Community';
import { mind } from './Mind';
import { family } from './Residents';
import { services } from './Services';
import { SimulationEngine } from './SimulationEngine';
import { MAP_SIZE, type Cell } from './TileMap';
import { pay, vehicles } from './Wealth';

const DAY = calendar.ticksPerDay;
const id = ({ x, y }: Cell) => y * MAP_SIZE + x;
const row = (y: number, from: number, to: number): Cell[] =>
  Array.from({ length: to - from + 1 }, (_, index) => ({ x: from + index, y }));

/** Ten homes of two people facing ten shops, all in work, in a city that may build anything. */
function town() {
  const engine = new SimulationEngine({ version: 1, seed: 5, tick: 0 });
  const { city } = engine;
  const homes = row(4, 1, 10);
  const shops = row(6, 1, 10);
  city.execute({ type: 'BUILD_ROAD', path: row(5, 1, 30) });
  city.execute({ type: 'SET_ZONE', tiles: homes, zone: 'residential' });
  city.execute({ type: 'SET_ZONE', tiles: shops, zone: 'commercial' });
  engine.load({ ...engine.save(), rank: 3, funds: 100000, buildings: [
    ...homes.map(home => ({ id: id(home), capacity: 4, occupants: 2 })),
    ...shops.map(shop => ({ id: id(shop), capacity: 4, occupants: 0 })),
  ] });
  return { engine, city, homes };
}

it('pays people by the day, lets them save up for a vehicle, and collects licences on them', () => {
  const { engine, city, homes } = town();
  expect(city.getStats().cars).toEqual([20, 0, 0, 0, 0]);
  expect(city.getStats().budget.licence).toBe(0);
  const first = () => city.inspect(homes[0])!.residents![0];
  expect(first()).toMatchObject({ car: 0, money: 0 });
  engine.advance(DAY);
  expect(first().pay).toBeGreaterThan(pay.living);
  expect(first().money).toBe(first().pay - pay.living);

  // Two months on, everyone in work has a scooter, and the city is paid for each.
  engine.advance(60 * DAY);
  const stats = city.getStats();
  expect(stats.cars[0]).toBe(stats.population - stats.employed);
  expect(stats.cars[1]).toBeGreaterThan(0);
  expect(stats.budget.licence).toBe(stats.cars.reduce((sum, count, tier) => sum + count * vehicles[tier].licence, 0));
  expect(city.carOn(first().homeId, id(first().work!))).toBeGreaterThan(0);

  // Savings and vehicles are saved with the people.
  const restored = new SimulationEngine({ version: 1, seed: 0, tick: 0 });
  restored.load(structuredClone(engine.save()));
  expect(restored.city.getStats()).toEqual(city.getStats());
  engine.advance(30 * DAY);
  restored.advance(30 * DAY);
  expect(restored.save()).toEqual(engine.save());
  expect(() => restored.load({ ...engine.save(), buildings: engine.save().buildings.map(building =>
    building.people?.length ? { ...building, people: building.people.map(person => ({ ...person, car: 9 })) } :
      building) })).toThrow('存檔資料損壞。');
});

it('knows what each home has within a walk, and how close its people are', () => {
  const { engine, city, homes } = town();
  const near = homes[0];
  const far = homes[9];
  expect(city.inspect(near)).toMatchObject({ circle: ['shops'] });
  const before = city.inspect(near)!.bond!;
  expect(before).toBeLessThan(bond.close);

  // A temple, a park and a market by the first homes; the last ones are out of their reach.
  expect(city.execute({ type: 'BUILD_SERVICE', x: 1, y: 3, service: 'temple' }).error).toBeUndefined();
  city.execute({ type: 'BUILD_PARK', tiles: [{ x: 2, y: 3 }] });
  city.execute({ type: 'BUILD_SERVICE', x: 0, y: 5, service: 'market' });
  expect(city.inspect(near)!.circle).toEqual(['shops', 'market', 'park', 'temple']);
  expect(city.inspect(far)!.circle).toEqual(['shops']);
  expect(city.inspect(near)!.bond).toBe(before + 3 * bond.perPlace + bond.temple + bond.park);

  // People who stay get to know each other: in time the home is close-knit and worth more.
  const person = () => city.inspect(near)!.residents![0];
  expect(city.person(person().homeId, person().slot, 20)!.thoughts).toContain('temple-near');
  expect(city.person(person().homeId, person().slot, 20)!.thoughts).not.toContain('close-knit');
  const worth = city.landValueAt(near) - city.landValueAt(far);
  engine.advance(12 * calendar.daysPerMonth * DAY);
  expect(city.inspect(near)!.bond).toBeGreaterThanOrEqual(bond.close);
  expect(city.inspect(far)!.bond).toBeLessThan(bond.close);
  expect(city.person(person().homeId, person().slot, 20)!.thoughts).toContain('close-knit');
  expect(city.landValueAt(near) - city.landValueAt(far)).toBe(worth + bond.value);
  expect(circle.reach).toBeGreaterThan(0);
});

it('loses people who are miserable, once the town is big enough to have a choice', () => {
  // A hundred and twenty people with no power, no water, no police and nothing near.
  const engine = new SimulationEngine({ version: 1, seed: 3, tick: 0 });
  const { city } = engine;
  const homes = row(4, 1, 30);
  const works = row(6, 1, 30);
  city.execute({ type: 'BUILD_ROAD', path: row(5, 1, 30) });
  city.execute({ type: 'SET_ZONE', tiles: homes, zone: 'residential' });
  city.execute({ type: 'SET_ZONE', tiles: works, zone: 'industrial' });
  engine.load({ ...engine.save(), buildings: [
    ...homes.map(home => ({ id: id(home), capacity: 8, occupants: 4 })),
    ...works.map(work => ({ id: id(work), capacity: 8, occupants: 0 })),
  ] });
  expect(city.getStats().population).toBeGreaterThanOrEqual(mind.leave.population);
  expect(city.voices().mood).toBeLessThan(mind.low);
  engine.advance(3 * calendar.daysPerMonth * DAY);
  expect(city.getNews().some(item => item.kind === 'left-unhappy')).toBe(true);
});

it('brings more visitors to a sight with a car park, and gives the homes near it somewhere to go', () => {
  const { city, homes } = town();
  expect(city.execute({ type: 'BUILD_SERVICE', x: 14, y: 4, service: 'cinema' }).error).toBeUndefined();
  const plain = city.inspect({ x: 14, y: 4 })!;
  expect(plain).toMatchObject({ parked: false, earns: Math.round(20 * services.visitors.cinema!.perResident) });
  expect(city.getStats().budget.visitors).toBe(plain.earns);
  city.execute({ type: 'BUILD_SERVICE', x: 15, y: 4, service: 'parking' });
  const parked = city.inspect({ x: 14, y: 4 })!;
  expect(parked).toMatchObject({ parked: true,
    earns: Math.round(20 * services.visitors.cinema!.perResident * services.parking.boost) });
  expect(city.getStats().budget.visitors).toBe(parked.earns);
  // A mall takes four tiles and a city of some size; a casino a bigger city still.
  expect(city.execute({ type: 'BUILD_SERVICE', x: 20, y: 3, service: 'mall' }).changed).toHaveLength(4);
  expect(city.execute({ type: 'BUILD_SERVICE', x: 24, y: 3, service: 'casino' }).error).toContain('城市還不夠大');
  expect(city.inspect(homes[9])!.circle).toContain('fun');
  expect(city.inspect(homes[0])!.circle).not.toContain('fun');
  const person = city.inspect(homes[9])!.residents![0];
  expect(city.person(person.homeId, person.slot, 12)!.thoughts).toContain('fun-near');
});

it('gives some homes children, who carry the family name and grow up', () => {
  const { engine, city, homes } = town();
  const families = homes.map(home => city.inspect(home)!.kids!);
  const withKids = families.findIndex(kids => kids.length > 0);
  expect(withKids).toBeGreaterThanOrEqual(0);
  const home = homes[withKids];
  const [kid] = city.inspect(home)!.kids!;
  expect(kid.age).toBeLessThanOrEqual(family.oldest);
  expect(city.inspect(home)!.residents!.some(adult => adult.name[0] === kid.name[0])).toBe(true);
  // Children are not residents.
  expect(city.getStats().population).toBe(20);
  engine.advance(2 * 12 * calendar.daysPerMonth * DAY);
  const later = city.inspect(home)!.kids!.find(child => child.name === kid.name);
  if (kid.age + 2 <= family.oldest) expect(later?.age).toBe(kid.age + 2);
});
