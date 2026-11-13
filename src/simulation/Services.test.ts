import { expect, it } from 'vitest';
import { economy } from './Economy';
import { landValue } from './LandValue';
import { services } from './Services';
import { SimulationEngine } from './SimulationEngine';
import { MAP_SIZE, type Cell } from './TileMap';

const id = ({ x, y }: Cell) => y * MAP_SIZE + x;
const row = (y: number, from: number, to: number): Cell[] =>
  Array.from({ length: to - from + 1 }, (_, index) => ({ x: from + index, y }));

it('covers the tiles within reach of a station and raises their land value', () => {
  const engine = new SimulationEngine({ version: 1, seed: 1, tick: 0 });
  const { city } = engine;
  const near = { x: 20, y: 20 };
  const far = { x: 20, y: 22 + services.radius.school };
  city.execute({ type: 'SET_ZONE', tiles: [near, far], zone: 'residential' });
  // A school with no road beside it is closed.
  city.execute({ type: 'BUILD_SERVICE', x: 20, y: 21, service: 'school' });
  expect(city.isCovered(near, 'school')).toBe(false);
  expect(city.inspect({ x: 20, y: 21 })).toMatchObject({ running: false, reaching: 0 });
  expect(city.getStats().idle).toBe(1);
  city.execute({ type: 'DEMOLISH', x: 20, y: 21 });
  // One road tile behind each of the four stations to come.
  for (const [x, y] of [[20, 22], [22, 20], [18, 20], [20, 18]]) {
    city.execute({ type: 'BUILD_ROAD', path: [{ x, y }] });
  }

  const before = city.getStats().funds;
  expect(city.execute({ type: 'BUILD_SERVICE', x: 20, y: 21, service: 'school' }).cost).toBe(economy.cost.school);
  expect(city.getStats().funds).toBe(before - economy.cost.school);
  expect(city.getStats().budget.upkeep).toBe(4 * economy.upkeep.road + economy.upkeep.school);
  expect(city.map.get({ x: 20, y: 21 })).toBe('school');
  expect(city.isCovered(near, 'school')).toBe(true);
  expect(city.isCovered({ x: 20, y: 21 + services.radius.school }, 'school')).toBe(true);
  expect(city.isCovered(far, 'school')).toBe(false);
  expect(city.isCovered(near, 'clinic')).toBe(false);
  expect(city.landValueAt(near)).toBe(landValue.base + services.value.school);
  expect(city.landValueAt(far)).toBe(landValue.base);

  city.execute({ type: 'BUILD_SERVICE', x: 21, y: 20, service: 'clinic' });
  city.execute({ type: 'BUILD_SERVICE', x: 19, y: 20, service: 'fire' });
  city.execute({ type: 'BUILD_SERVICE', x: 20, y: 19, service: 'police' });
  expect(city.landValueAt(near)).toBe(landValue.base + services.value.school + services.value.clinic +
    services.value.fire + services.value.police);
  engine.load({ ...engine.save(), buildings: [{ id: id(near), capacity: 4, occupants: 0 }] });
  expect(city.inspect(near)).toMatchObject({ services: ['fire', 'police', 'school', 'clinic'] });
  expect(city.inspect({ x: 20, y: 21 })).toMatchObject({ tile: 'school', radius: services.radius.school, reaching: 1, running: true });

  // Stations survive a save, come down like anything else, and cannot stand on a road.
  const restored = new SimulationEngine({ version: 1, seed: 0, tick: 0 });
  restored.load(structuredClone(engine.save()));
  expect(restored.city.isCovered(near, 'police')).toBe(true);
  city.execute({ type: 'DEMOLISH', x: 20, y: 21 });
  expect(city.isCovered(near, 'school')).toBe(false);
  city.execute({ type: 'BUILD_ROAD', path: [{ x: 30, y: 30 }] });
  expect(city.execute({ type: 'BUILD_SERVICE', x: 30, y: 30, service: 'fire' }).error).toBeTruthy();
});

/** Thirty homes facing thirty shops across one street: 120 people, all in work, nothing to grow. */
function town(stations: readonly (readonly [number, number])[]) {
  const engine = new SimulationEngine({ version: 1, seed: 9, tick: 0 });
  const { city } = engine;
  const homes = row(4, 1, 30);
  const shops = row(6, 1, 30);
  city.execute({ type: 'BUILD_ROAD', path: row(5, 1, 30) });
  city.execute({ type: 'SET_ZONE', tiles: homes, zone: 'residential' });
  city.execute({ type: 'SET_ZONE', tiles: shops, zone: 'commercial' });
  for (const [x, y] of stations) {
    // Each station gets a stub of road behind it; it touches no home or shop.
    city.execute({ type: 'BUILD_ROAD', path: [{ x, y: y + 1 }] });
    city.execute({ type: 'BUILD_SERVICE', x, y, service: 'fire' });
  }
  engine.load({ ...engine.save(), buildings: [
    ...homes.map(home => ({ id: id(home), capacity: 8, occupants: 4 })),
    ...shops.map(shop => ({ id: id(shop), capacity: 10, occupants: 0 })),
  ] });
  return engine;
}

it('reports crime in a town of a hundred without police', () => {
  const engine = town([]);
  const { city } = engine;
  const home = { x: 5, y: 4 };
  expect(city.getStats().population).toBe(120);
  expect(city.inspect(home)).toMatchObject({ issues: expect.arrayContaining(['crime']) });
  expect(city.getStats().complaints.crime).toBe(60);
  const unsafe = city.landValueAt(home);

  city.execute({ type: 'BUILD_ROAD', path: [{ x: 5, y: 9 }] });
  city.execute({ type: 'BUILD_SERVICE', x: 5, y: 8, service: 'police' });
  expect(city.inspect(home)).toMatchObject({ issues: expect.not.arrayContaining(['crime']) });
  expect(city.landValueAt(home)).toBeCloseTo(unsafe + services.crime.penalty + services.value.police);
  // The far end of the street is out of the station's reach.
  expect(city.inspect({ x: 30, y: 4 })).toMatchObject({ issues: expect.arrayContaining(['crime']) });

  // A village is too small for crime.
  const village = new SimulationEngine({ version: 1, seed: 1, tick: 0 });
  village.city.execute({ type: 'SET_ZONE', tiles: [home], zone: 'residential' });
  village.load({ ...village.save(), buildings: [{ id: id(home), capacity: 8, occupants: 4 }] });
  expect(village.city.inspect(home)).toMatchObject({ issues: expect.not.arrayContaining(['crime']) });
});

it('burns buildings down unless a fire station is in reach', () => {
  const days = 300 * 8;
  const unprotected = town([]);
  unprotected.advance(days);
  const fires = unprotected.city.getEvents().filter(event => event.kind.startsWith('fire'));
  // With no station of any kind, nothing that happens is answered.
  expect(unprotected.city.getEvents().every(event => ['fire', 'crime', 'sick'].includes(event.kind) && !event.station)).toBe(true);
  expect(fires.length).toBeGreaterThan(0);
  expect(fires.every(event => event.kind === 'fire')).toBe(true);
  // The lot of the latest fire stays zoned; whatever stands there now was built afterwards.
  expect(unprotected.city.map.get(fires.at(-1)!.cell)).not.toBe('grass');

  // The same town with the whole street in reach of a station has the same fires, all put out.
  const guarded = town([[8, 7], [23, 7]]);
  const before = guarded.save().buildings.map(building => building.id);
  guarded.advance(days);
  const calls = guarded.city.getEvents().filter(event => event.kind.startsWith('fire'));
  // Each call names the nearer of the two stations, which is where the engine sets out from.
  expect(calls.every(event => event.station?.y === 7 && [8, 23].includes(event.station.x))).toBe(true);
  expect(calls.length).toBeGreaterThan(0);
  expect(calls.every(event => event.kind === 'fire-out')).toBe(true);
  expect(guarded.save().buildings.map(building => building.id)).toEqual(before);
  expect(guarded.city.now).toBe(days);

  // Events are not part of a save.
  const restored = new SimulationEngine({ version: 1, seed: 0, tick: 0 });
  restored.load(structuredClone(guarded.save()));
  expect(restored.city.getEvents()).toEqual([]);
});

it('has no fires in a town of under a hundred people', () => {
  const engine = new SimulationEngine({ version: 1, seed: 9, tick: 0 });
  const homes = row(4, 1, 20);
  engine.city.execute({ type: 'SET_ZONE', tiles: homes, zone: 'residential' });
  engine.load({ ...engine.save(), buildings: homes.map(home => ({ id: id(home), capacity: 8, occupants: 4 })) });
  engine.advance(300 * 8);
  expect(engine.city.getEvents()).toEqual([]);
});
