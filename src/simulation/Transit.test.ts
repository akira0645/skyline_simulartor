import { expect, it } from 'vitest';
import { economy } from './Economy';
import { countTrait } from './Residents';
import { SimulationEngine } from './SimulationEngine';
import { MAP_SIZE, type Cell } from './TileMap';
import { traffic } from './Traffic';
import { transit } from './Transit';

const id = ({ x, y }: Cell) => y * MAP_SIZE + x;
const row = (y: number, from: number, to: number): Cell[] =>
  Array.from({ length: to - from + 1 }, (_, index) => ({ x: from + index, y }));

const home = { x: 1, y: 1 };
const work = { x: 12, y: 1 };
const middle = { x: 6, y: 2 };
// Of the 400, some never ride and some always do; the usual share applies to the rest.
const drivers = countTrait(1, id(home), 0, 400, 'driver');
const keen = countTrait(1, id(home), 0, 400, 'rider');
const willing = (share: number) => Math.floor((400 - drivers - keen) * share) + keen;

/** A home of 400 and a factory with room for them all, twelve road tiles apart. */
function street() {
  const engine = new SimulationEngine({ version: 1, seed: 1, tick: 0 });
  const { city } = engine;
  city.execute({ type: 'BUILD_ROAD', path: row(2, 1, 12) });
  city.execute({ type: 'SET_ZONE', tiles: [home], zone: 'residential' });
  city.execute({ type: 'SET_ZONE', tiles: [work], zone: 'industrial' });
  // Without power and water the factory takes half of 800.
  engine.load({ ...engine.save(), buildings: [
    { id: id(home), capacity: 400, occupants: 400 }, { id: id(work), capacity: 800, occupants: 0 },
  ] });
  return { engine, city };
}

it('runs a bus line whose riders depend on how often the buses come and how many they hold', () => {
  const { engine, city } = street();
  const near = { x: 2, y: 1 };
  const far = { x: 11, y: 1 };
  city.execute({ type: 'BUILD_BUS_STOP', ...near });
  city.execute({ type: 'BUILD_BUS_STOP', ...far });
  // Stops alone carry nobody: they have to be joined into a line.
  expect(city.getStats()).toMatchObject({ employed: 400, riders: 0 });
  expect(city.hasTransit(home)).toBe(false);

  const line = city.addLine('bus').id!;
  expect(city.toggleStop(line, home).error).toBeTruthy();
  expect(city.toggleStop(line, near)).toEqual({ added: true });
  expect(city.getLines()[0]).toMatchObject({ active: false, capacity: 0 });
  expect(city.toggleStop(line, far)).toEqual({ added: true });

  // Ten road tiles at two minutes each and a minute at the stop: 21 minutes each way.
  const oneWay = 10 * traffic.minutesPerTile + transit.dwell;
  expect(city.getLines()[0]).toMatchObject({ active: true, vehicles: 1, times: [0, oneWay], headway: 2 * oneWay });
  expect(city.getLines()[0].path).toHaveLength(10);
  expect(city.hasTransit(home)).toBe(true);
  // One bus every 42 minutes: waiting and riding take far longer than the 24-minute drive, so
  // only those who always ride get on.
  expect(keen).toBeGreaterThan(0);
  expect(drivers).toBeGreaterThan(0);
  expect(city.getStats().riders).toBe(willing(0));
  expect(city.inspect(middle)).toMatchObject({ flow: 400 - willing(0) });

  // Three buses come every 14 minutes: slower than driving, but close enough for some.
  const before = city.getStats().funds;
  expect(city.setVehicles(line, 3)).toEqual({ cost: 2 * transit.bus.vehicleCost });
  expect(city.getStats().funds).toBe(before - 2 * transit.bus.vehicleCost);
  const capacity = Math.floor(transit.peakMinutes / (2 * oneWay / 3) * transit.bus.capacity);
  // More would ride than the buses hold.
  expect(willing(transit.share.close)).toBeGreaterThan(capacity);
  expect(city.getLines()[0]).toMatchObject({ headway: 2 * oneWay / 3, capacity, busiest: capacity, riders: capacity });
  expect(city.getStats().riders).toBe(capacity);
  expect(city.inspect(middle)).toMatchObject({ flow: 400 - capacity });
  expect(city.getCommutes()[0]).toMatchObject({ riders: capacity, line, transitMinutes: oneWay / 3 + oneWay });

  // A fourth bus makes room for everyone who wants to ride.
  city.setVehicles(line, 4);
  expect(city.getLines()[0]).toMatchObject({ riders: willing(transit.share.close) });
  expect(city.getLines()[0].busiest).toBeLessThan(city.getLines()[0].capacity);

  // Fares come in and vehicles cost upkeep.
  expect(city.getStats().budget).toMatchObject({
    fares: willing(transit.share.close) * transit.bus.fare,
    upkeep: 12 * economy.upkeep.road + 2 * economy.upkeep.bus + 4 * transit.bus.vehicleUpkeep,
  });
  expect(city.setVehicles(line, 99)).toMatchObject({ cost: (transit.maxVehicles - 4) * transit.bus.vehicleCost });
  expect(city.getLines()[0].vehicles).toBe(transit.maxVehicles);
  city.setVehicles(line, 4);

  // The line is saved, and a loaded city carries the same riders.
  const restored = new SimulationEngine({ version: 1, seed: 0, tick: 0 });
  restored.load(structuredClone(engine.save()));
  expect(restored.save().lines).toEqual([{ id: line, kind: 'bus', stops: [id(near), id(far)], vehicles: 4 }]);
  expect(restored.city.getStats().riders).toBe(willing(transit.share.close));
  expect(() => restored.load({ ...engine.save(), lines: [{ id: 1, kind: 'bus', stops: [id(home)], vehicles: 1 }] }))
    .toThrow('存檔資料損壞。');
  expect(() => restored.load({ ...engine.save(), lines: [{ id: 1, kind: 'tram', stops: [], vehicles: 1 }] }))
    .toThrow('存檔資料損壞。');

  // Pulling a stop down takes it off the line, which then stops running.
  city.execute({ type: 'DEMOLISH', ...far });
  expect(city.getLines()[0]).toMatchObject({ stops: [id(near)], active: false });
  expect(city.getStats().riders).toBe(0);
  expect(city.inspect(middle)).toMatchObject({ flow: 400 });
  // Clicking a stop that is on the line takes it off again.
  expect(city.toggleStop(line, near)).toEqual({ added: false });
  city.removeLine(line);
  expect(city.getLines()).toEqual([]);
});

it('does not run a bus line whose stops have no road between them', () => {
  const { city } = street();
  city.execute({ type: 'BUILD_BUS_STOP', x: 2, y: 1 });
  city.execute({ type: 'BUILD_BUS_STOP', x: 11, y: 4 });
  const line = city.addLine('bus').id!;
  city.toggleStop(line, { x: 2, y: 1 });
  city.toggleStop(line, { x: 11, y: 4 });
  expect(city.getLines()[0].active).toBe(false);
  expect(city.getStats().idle).toBe(1);
  // No more lines than the limit.
  for (let extra = 1; extra < transit.maxLines; extra++) expect(city.addLine('metro').id).toBeDefined();
  expect(city.addLine('metro').error).toBeTruthy();
});

it('runs a metro line under the roads, fast enough that most people ride', () => {
  const { engine, city } = street();
  const west = { x: 1, y: 2 };
  const east = { x: 12, y: 2 };
  // A station goes under a road, not on open ground or a lot.
  expect(city.execute({ type: 'BUILD_METRO', x: 0, y: 1 }).error).toBeTruthy();
  expect(city.execute({ type: 'BUILD_METRO', ...home }).error).toBeTruthy();
  // Four hundred people on one street: the drive is a crawl.
  const jammed = city.inspect(home)!.commute!;
  expect(city.execute({ type: 'BUILD_METRO', ...west }).cost).toBe(economy.cost.metro);
  city.execute({ type: 'BUILD_METRO', ...east });
  const line = city.addLine('metro').id!;
  city.toggleStop(line, west);
  city.toggleStop(line, east);

  // The road above is still a road, and costs a station's upkeep more.
  expect(city.map.get(west)).toBe('road');
  expect(city.map.hasStation(west)).toBe(true);
  expect(city.getStats().budget.upkeep).toBe(12 * economy.upkeep.road + 2 * economy.upkeep.metro + transit.metro.vehicleUpkeep);
  // Eleven tiles along.
  const oneWay = 11 * transit.metro.minutesPerTile + transit.dwell;
  const plan = city.getLines()[0];
  expect(plan).toMatchObject({ active: true, headway: 2 * oneWay });
  expect(plan.times[1]).toBeCloseTo(oneWay);
  expect(plan.path).toHaveLength(12);
  expect(plan.path[0]).toEqual(west);
  expect(plan.path.at(-1)).toEqual(east);
  expect(city.inspect(west)).toMatchObject({ tile: 'metro', running: true, lines: [line] });
  expect(city.getStats().idle).toBe(0);

  // Waiting half the time between trains and riding beats the crawl by road.
  expect(city.getStats().riders).toBe(willing(transit.share.faster));
  expect(city.inspect(middle)).toMatchObject({ flow: 400 - willing(transit.share.faster) });
  expect(city.getStats().budget.fares).toBe(willing(transit.share.faster) * transit.metro.fare);
  // The home's average trip to work is shorter than it was by road alone.
  expect(city.inspect(home)!.commute!).toBeLessThan(jammed / 2);
  expect(city.inspect(home)).toMatchObject({ transit: true });

  // Stations survive a save. Pulling at the road takes the station out first and leaves the road.
  const restored = new SimulationEngine({ version: 1, seed: 0, tick: 0 });
  restored.load(structuredClone(engine.save()));
  expect(restored.city.getStats().riders).toBe(city.getStats().riders);
  city.execute({ type: 'DEMOLISH', ...east });
  expect(city.map.get(east)).toBe('road');
  expect(city.map.hasStation(east)).toBe(false);
  expect(city.getLines()[0]).toMatchObject({ stops: [id(west)], active: false });
  expect(city.getStats().employed).toBe(400);
  // A save from when a station was a tile of its own: it becomes a road with the station under it.
  const old = engine.save();
  const tiles = old.tiles.slice();
  tiles[id({ x: 20, y: 20 })] = 16;
  restored.load({ ...old, tiles, metros: undefined, lines: [] });
  expect(restored.city.map.get({ x: 20, y: 20 })).toBe('road');
  expect(restored.city.map.hasStation({ x: 20, y: 20 })).toBe(true);
});
