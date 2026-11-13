import { expect, it } from 'vitest';
import { landValue } from './LandValue';
import { SimulationEngine } from './SimulationEngine';
import { MAP_SIZE, type Cell } from './TileMap';
import { traffic } from './Traffic';

const id = ({ x, y }: Cell) => y * MAP_SIZE + x;
const row = (y: number, from: number, to: number): Cell[] =>
  Array.from({ length: to - from + 1 }, (_, index) => ({ x: from + index, y }));

/** A home and a shop three road tiles apart. */
function street() {
  const engine = new SimulationEngine({ version: 1, seed: 3, tick: 0 });
  const home = { x: 1, y: 1 };
  const shop = { x: 3, y: 1 };
  engine.city.execute({ type: 'BUILD_ROAD', path: row(2, 1, 3) });
  engine.city.execute({ type: 'SET_ZONE', tiles: [home], zone: 'residential' });
  engine.city.execute({ type: 'SET_ZONE', tiles: [shop], zone: 'commercial' });
  engine.load({ ...engine.save(), buildings: [
    { id: id(home), capacity: 4, occupants: 0 }, { id: id(shop), capacity: 3, occupants: 0 },
  ] });
  return { engine, city: engine.city, home, shop };
}

it('values land by utilities, parks, pollution and commute', () => {
  const { engine, city, home, shop } = street();
  expect(city.landValueAt({ x: 1, y: 2 })).toBe(0);
  expect(city.landValueAt(home)).toBe(landValue.base);

  city.execute({ type: 'BUILD_FACILITY', x: 1, y: 3, facility: 'water' });
  expect(city.landValueAt(home)).toBe(landValue.base);
  // A plant with no road beside it gives no power.
  city.execute({ type: 'BUILD_FACILITY', x: 6, y: 7, facility: 'power' });
  expect(city.landValueAt(home)).toBe(landValue.base);
  city.execute({ type: 'BUILD_ROAD', path: [{ x: 6, y: 8 }] });
  expect(city.landValueAt(home)).toBe(landValue.base + landValue.utilities);

  // The plant is far enough away to leave the home clean; one next door is not.
  city.execute({ type: 'BUILD_FACILITY', x: 0, y: 2, facility: 'power' });
  const smog = city.pollutionAt(home);
  expect(smog).toBeGreaterThan(0);
  expect(city.landValueAt(home)).toBeCloseTo(landValue.base + landValue.utilities - landValue.pollution * smog);
  city.execute({ type: 'DEMOLISH', x: 0, y: 2 });

  const { strength, radius } = landValue.park;
  city.execute({ type: 'BUILD_PARK', tiles: [{ x: 1, y: 0 }] });
  expect(city.landValueAt(home)).toBeCloseTo(landValue.base + landValue.utilities + strength * (1 - 1 / radius));
  // However many parks, their bonus stops at the maximum.
  city.execute({ type: 'BUILD_PARK', tiles: [...row(0, 0, 4), { x: 0, y: 1 }, { x: 2, y: 1 }] });
  expect(city.landValueAt(home)).toBe(landValue.base + landValue.utilities + landValue.park.max);

  // Once someone commutes, the minutes come off the home but not off the shop.
  engine.advance(8);
  const minutes = city.inspect(home)!.commute!;
  expect(minutes).toBeCloseTo(3 * traffic.minutesPerTile, 2);
  expect(city.landValueAt(home)).toBeCloseTo(
    landValue.base + landValue.utilities + landValue.park.max - landValue.commute.perMinute * minutes);
  expect(city.landValueAt(shop)).toBeGreaterThan(landValue.base + landValue.utilities);
});

it('upgrades full buildings on good land, and further once parks raise its value', () => {
  const { engine, city, home, shop } = street();
  const levels = () => [city.getBuilding(home)!, city.getBuilding(shop)!]
    .map(({ level, capacity }) => [level, capacity]);

  // Without power and water the land is worth too little, however long it takes.
  engine.advance(800);
  expect(levels()).toEqual([[1, 4], [1, 3]]);

  city.execute({ type: 'BUILD_ROAD', path: [{ x: 6, y: 8 }, { x: 7, y: 8 }] });
  city.execute({ type: 'BUILD_FACILITY', x: 6, y: 7, facility: 'power' });
  city.execute({ type: 'BUILD_FACILITY', x: 7, y: 7, facility: 'water' });
  expect(city.inspect(home)).toMatchObject({ nextLevel: landValue.upgrade[0] });
  engine.advance(1600);
  expect(levels()).toEqual([[2, landValue.capacity.residential[1]], [2, landValue.capacity.commercial[1]]]);
  expect(city.getStats()).toMatchObject({ population: 6, employed: 5 });

  city.execute({ type: 'BUILD_PARK', tiles: [{ x: 0, y: 1 }, { x: 1, y: 0 }, { x: 2, y: 1 }] });
  engine.advance(1600);
  expect(levels()).toEqual([[3, landValue.capacity.residential[2]], [3, landValue.capacity.commercial[2]]]);
  expect(city.inspect(home)).toMatchObject({ level: 3, nextLevel: undefined });
  expect(city.getStats()).toMatchObject({ population: 9, employed: 8 });
});

it('saves building levels and reads saves that have none', () => {
  const { engine, city, home } = street();
  const save = engine.save();
  expect(save.buildings.every(building => building.level === 1)).toBe(true);

  engine.load({ ...save, buildings: save.buildings.map(building => ({ ...building, level: 2 })) });
  expect(city.getBuilding(home)?.level).toBe(2);
  expect(engine.save().buildings[0].level).toBe(2);
  expect(() => engine.load({ ...save, buildings: save.buildings.map(building => ({ ...building, level: 4 })) }))
    .toThrow('存檔資料損壞。');
  expect(() => engine.load({ ...save, buildings: save.buildings.map(building => ({ ...building, level: 0 })) }))
    .toThrow('存檔資料損壞。');
});
