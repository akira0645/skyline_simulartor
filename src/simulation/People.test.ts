import { expect, it } from 'vitest';
import { calendar } from './calendar';
import { economy } from './Economy';
import { goals } from './Goals';
import { goods } from './Goods';
import { COMPLEX_LEVEL, landValue } from './LandValue';
import { residentAt, traitOf, traits, TRAITS } from './Residents';
import { expectations, services } from './Services';
import { SimulationEngine } from './SimulationEngine';
import { MAP_SIZE, type Cell } from './TileMap';

const MONTH = calendar.daysPerMonth * calendar.ticksPerDay;
const id = ({ x, y }: Cell) => y * MAP_SIZE + x;
const row = (y: number, from: number, to: number): Cell[] =>
  Array.from({ length: to - from + 1 }, (_, index) => ({ x: from + index, y }));
const column = (x: number, from: number, to: number): Cell[] =>
  Array.from({ length: to - from + 1 }, (_, index) => ({ x, y: from + index }));
const start = (seed = 1) => new SimulationEngine({ version: 1, seed, tick: 0 });

it('gives every resident a name and, now and then, a trait, the same each time', () => {
  expect(residentAt(7, 300, 2)).toEqual(residentAt(7, 300, 2));
  expect(residentAt(7, 300, 2)).not.toEqual(residentAt(7, 300, 3));
  expect(residentAt(8, 300, 2).name).not.toBe(residentAt(7, 300, 2).name);
  expect([...residentAt(7, 300, 2).name]).toHaveLength(3);

  // Over many people each trait turns up about as often as it should.
  const counts = new Map<string, number>();
  const people = 20000;
  for (let place = 0; place < people; place++) {
    const trait = traitOf(42, place % 50, place) ?? 'none';
    counts.set(trait, (counts.get(trait) ?? 0) + 1);
  }
  for (const trait of TRAITS) {
    expect(counts.get(trait)! / people).toBeGreaterThan(traits[trait].share - 0.02);
    expect(counts.get(trait)! / people).toBeLessThan(traits[trait].share + 0.02);
  }

  // A home lists who lives in it; those with work say which shift.
  const engine = start();
  const home = { x: 1, y: 1 };
  const shop = { x: 2, y: 1 };
  engine.city.execute({ type: 'BUILD_ROAD', path: row(2, 1, 2) });
  engine.city.execute({ type: 'SET_ZONE', tiles: [home], zone: 'residential' });
  engine.city.execute({ type: 'SET_ZONE', tiles: [shop], zone: 'commercial' });
  engine.load({ ...engine.save(), buildings: [
    { id: id(home), capacity: 5, occupants: 5 }, { id: id(shop), capacity: 6, occupants: 0 },
  ] });
  const info = engine.city.inspect(home)!;
  expect(info.residents).toHaveLength(5);
  expect(info.residents!.map(person => person.name)).toEqual(
    [0, 1, 2, 3, 4].map(place => residentAt(1, id(home), place).name));
  // The shop takes three without power and water: the first three to move in have the work.
  expect(info.residents!.map(person => person.shift !== undefined)).toEqual([true, true, true, false, false]);
  const totals = engine.city.getStats().traits;
  expect(Object.values(totals).reduce((sum, count) => sum + count, 0))
    .toBe(info.residents!.filter(person => person.trait).length);
});

it('makes goods in factories, sells them in shops, and trades the difference', () => {
  const home = { x: 1, y: 1 };
  const shop = { x: 2, y: 1 };
  const factory = { x: 4, y: 1 };
  const town = (factoryRoom: number) => {
    const engine = start();
    engine.city.execute({ type: 'BUILD_ROAD', path: row(2, 1, 4) });
    engine.city.execute({ type: 'SET_ZONE', tiles: [home], zone: 'residential' });
    engine.city.execute({ type: 'SET_ZONE', tiles: [shop], zone: 'commercial' });
    engine.city.execute({ type: 'SET_ZONE', tiles: [factory], zone: 'industrial' });
    // Without power and water each workplace takes half its room.
    engine.load({ ...engine.save(), buildings: [
      { id: id(home), capacity: 100, occupants: 100 }, { id: id(shop), capacity: 20, occupants: 0 },
      { id: id(factory), capacity: 2 * factoryRoom, occupants: 0 },
    ] });
    return engine.city;
  };

  // Ten in the shop serve fifty of the hundred; thirty in the factory make ninety of the hundred goods.
  const short = town(30);
  expect(short.getStats().goods).toEqual({ made: 30 * goods.perWorker, needed: 100, farmed: 0,
    served: 10 * goods.perClerk, trade: -(100 - 90) * goods.importCost });
  expect(short.getStats().budget).toMatchObject({ trade: -30 });
  // Half the town cannot shop, which takes half the penalty off the home's land value.
  const plenty = town(200);
  expect(plenty.getStats().goods).toMatchObject({ made: 90 * goods.perWorker, trade: (270 - 100) * goods.exportPrice });
  expect(plenty.getStats().budget.net - short.getStats().budget.net).toBeGreaterThan(170);
  const noShops = start();
  noShops.city.execute({ type: 'SET_ZONE', tiles: [home], zone: 'residential' });
  noShops.load({ ...noShops.save(), buildings: [{ id: id(home), capacity: 100, occupants: 100 }] });
  expect(noShops.city.landValueAt(home)).toBeLessThanOrEqual(landValue.base - goods.shopPenalty + traits.gardener.most);
  expect(noShops.city.getStats().goods).toMatchObject({ served: 0, trade: -100 * goods.importCost });
});

it('expects a school once the city has grown, and says which homes have none', () => {
  // Thirty homes of six facing thirty shops: 180 people, all in work.
  const engine = start();
  const { city } = engine;
  const homes = row(4, 1, 30);
  const shops = row(6, 1, 30);
  city.execute({ type: 'BUILD_ROAD', path: row(5, 1, 30) });
  city.execute({ type: 'SET_ZONE', tiles: homes, zone: 'residential' });
  city.execute({ type: 'SET_ZONE', tiles: shops, zone: 'commercial' });
  engine.load({ ...engine.save(), buildings: [
    ...homes.map(home => ({ id: id(home), capacity: 12, occupants: 6 })),
    ...shops.map(shop => ({ id: id(shop), capacity: 12, occupants: 0 })),
  ] });
  expect(city.getStats().population).toBeGreaterThanOrEqual(expectations[0].population);
  expect(city.getStats().population).toBeLessThan(expectations[1].population);
  const home = homes[4];
  expect(city.inspect(home)!.issues).toContain('no-school');
  expect(city.inspect(home)!.issues).not.toContain('no-clinic');
  expect(city.inspect(shops[4])!.issues).not.toContain('no-school');
  expect(city.getStats().complaints['no-school']).toBe(30);

  const before = city.landValueAt(home);
  city.execute({ type: 'BUILD_ROAD', path: [{ x: 5, y: 8 }] });
  city.execute({ type: 'BUILD_SERVICE', x: 5, y: 7, service: 'school' });
  expect(city.inspect(home)!.issues).not.toContain('no-school');
  expect(city.landValueAt(home)).toBeCloseTo(before + expectations[0].penalty + services.value.school);
  // The far end of the street is out of the school's reach.
  expect(city.inspect(homes[29])!.issues).toContain('no-school');
});

it('turns six parks that touch into one big park with a fountain', () => {
  const engine = start();
  const { city } = engine;
  const lot = { x: 4, y: 10 };
  city.execute({ type: 'SET_ZONE', tiles: [lot], zone: 'residential' });
  city.execute({ type: 'BUILD_PARK', tiles: row(10, 10, 14) });
  expect(city.inspect({ x: 10, y: 10 })).toMatchObject({ parkTiles: 5, bigPark: false });
  expect(city.getStats().bigParks).toBe(0);
  // Six tiles from the nearest park: too far for an ordinary park to matter.
  expect(city.landValueAt(lot)).toBe(landValue.base);

  city.execute({ type: 'BUILD_PARK', tiles: [{ x: 15, y: 10 }] });
  expect(city.inspect({ x: 12, y: 10 })).toMatchObject({ parkTiles: 6, bigPark: true });
  expect(city.getStats().bigParks).toBe(1);
  expect(city.landValueAt(lot)).toBe(landValue.base + landValue.bigPark.bonus);
  const parks = row(10, 10, 15).map(cell => city.parkAt(cell));
  expect(parks.every(park => park.big)).toBe(true);
  expect(parks.filter(park => park.fountain)).toHaveLength(1);

  // A park that only touches at a corner is not part of it.
  city.execute({ type: 'BUILD_PARK', tiles: [{ x: 16, y: 11 }] });
  expect(city.inspect({ x: 16, y: 11 })).toMatchObject({ parkTiles: 1, bigPark: false });
  // Cut in two, neither half is big.
  city.execute({ type: 'DEMOLISH', x: 12, y: 10 });
  expect(city.getStats().bigParks).toBe(0);
  expect(city.landValueAt(lot)).toBe(landValue.base);
});

it('joins four full top-level homes in a square into a housing complex', () => {
  const engine = start();
  const { city } = engine;
  const homes = [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 1, y: 2 }, { x: 2, y: 2 }];
  const shops = row(1, 4, 7);
  city.execute({ type: 'BUILD_ROAD', path: row(0, 0, 8) });
  city.execute({ type: 'BUILD_ROAD', path: row(3, 0, 8) });
  city.execute({ type: 'BUILD_ROAD', path: column(0, 1, 2) });
  city.execute({ type: 'SET_ZONE', tiles: homes, zone: 'residential' });
  city.execute({ type: 'SET_ZONE', tiles: shops, zone: 'commercial' });
  city.execute({ type: 'BUILD_FACILITY', x: 4, y: 4, facility: 'power' });
  city.execute({ type: 'BUILD_FACILITY', x: 5, y: 4, facility: 'water' });
  const usual = landValue.capacity.residential[2];
  const larger = landValue.capacity.residential[COMPLEX_LEVEL - 1];
  engine.load({ ...engine.save(), buildings: [
    ...homes.map(home => ({ id: id(home), capacity: usual, occupants: usual, level: 3 })),
    ...shops.map(shop => ({ id: id(shop), capacity: 40, occupants: 0 })),
  ] });
  expect(city.getStats()).toMatchObject({ population: 4 * usual, employed: 4 * usual, complexes: 0 });

  engine.advance(2000);
  for (const home of homes) {
    expect(city.getBuilding(home)).toMatchObject({ level: COMPLEX_LEVEL, block: id(homes[0]), capacity: larger });
  }
  expect(city.inspect(homes[3])).toMatchObject({ complex: true, nextLevel: undefined });
  const grown = city.getStats();
  // Children now occupy housing too; filling the complex does not mean every occupant works.
  expect(grown).toMatchObject({ complexes: 1, totalPopulation: 4 * larger });
  expect(grown.population + grown.children).toBe(4 * larger);
  expect(grown.levels[3]).toBe(4);
  expect(grown.goals).toContain('complex');

  // It is saved as one, and a save that claims a complex without its anchor is refused.
  const save = engine.save();
  const restored = start(0);
  restored.load(structuredClone(save));
  expect(restored.city.getStats().complexes).toBe(1);
  expect(() => restored.load({ ...save, buildings: save.buildings.map(building =>
    building.id === id(homes[1]) ? { ...building, block: undefined } : building) })).toThrow('存檔資料損壞。');

  // Losing one home breaks it back up into ordinary top-level homes.
  city.execute({ type: 'DEMOLISH', ...homes[3] });
  for (const home of homes.slice(0, 3)) {
    const building = city.getBuilding(home)!;
    expect(building).toMatchObject({ level: 3, capacity: usual });
    expect(building.block).toBeUndefined();
    expect(building.occupants).toBeLessThanOrEqual(usual);
  }
  expect(city.getStats().complexes).toBe(0);
});

it('rewards each goal once, lends money, and knows when the city is bankrupt', () => {
  const engine = start();
  const { city } = engine;
  const home = { x: 1, y: 1 };
  city.execute({ type: 'SET_ZONE', tiles: [home], zone: 'residential' });
  engine.load({ ...engine.save(), buildings: [{ id: id(home), capacity: 40, occupants: 12 }] });
  expect(city.getStats().goals).toEqual([]);
  const before = city.getStats().funds;
  engine.advance(calendar.ticksPerDay);
  const first = goals.find(goal => goal.id === 'first-homes')!;
  expect(city.getStats().goals).toEqual(['first-homes']);
  expect(Math.abs(city.getStats().funds - before - first.reward)).toBeLessThan(50);
  engine.advance(calendar.ticksPerDay);
  expect(city.getStats().goals).toEqual(['first-homes']);
  expect(Math.abs(city.getStats().funds - before - first.reward)).toBeLessThan(100);
  const restored = start(0);
  restored.load(structuredClone(engine.save()));
  expect(restored.city.getStats().goals).toEqual(['first-homes']);

  // A loan is money now and a payment every month for a year.
  const { amount, months, payment, max } = economy.loan;
  const funds = city.getStats().funds;
  const net = city.getStats().budget.net;
  expect(city.borrow()).toEqual({});
  expect(city.getStats()).toMatchObject({ funds: funds + amount, loans: [months] });
  expect(city.getStats().budget).toMatchObject({ loans: payment, net: net - payment });
  for (let more = 1; more < max; more++) expect(city.borrow()).toEqual({});
  expect(city.borrow().error).toBeTruthy();
  expect(engine.save().loans).toEqual([months, months, months]);
  engine.advance(MONTH);
  expect(city.getStats().loans).toEqual([months - 1, months - 1, months - 1]);
  engine.advance((months - 1) * MONTH);
  expect(city.getStats().loans).toEqual([]);
  expect(city.getStats().budget.loans).toBe(0);

  expect(city.getStats().bankrupt).toBe(false);
  engine.load({ ...engine.save(), funds: economy.bankrupt - 1 });
  expect(city.getStats().bankrupt).toBe(true);
  expect(() => engine.load({ ...engine.save(), loans: [-1] })).toThrow('存檔資料損壞。');
});
