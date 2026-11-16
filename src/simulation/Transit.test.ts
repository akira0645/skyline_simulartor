import { weatherAt } from './Weather';
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

it('increases rainy-day transit demand without exceeding train capacity', () => {
  const { city, engine } = street();
  city.execute({ type: 'BUILD_METRO', x: 1, y: 2 });
  city.execute({ type: 'BUILD_METRO', x: 12, y: 2 });
  const line = city.addLine('metro').id!;
  city.toggleStop(line, { x: 1, y: 2 });
  city.toggleStop(line, { x: 12, y: 2 });
  const dryRiders = city.getStats().riders;
  const wetTick = Array.from({ length: 200 }, (_, day) => dryTick + (day + 1) * 8)
    .find(tick => weatherAt(1, tick) !== 'clear')!;
  engine.load({ ...engine.save(), tick: wetTick });
  expect(city.getStats().riders).toBeGreaterThan(dryRiders);
  expect(city.getLines()[0].riders).toBeLessThanOrEqual(city.getLines()[0].capacity);
});

/** A home of 400 and a factory with room for them all, twelve road tiles apart. */
const dryTick = Array.from({ length: 30 }, (_, day) => day * 8).find(tick => weatherAt(1, tick) === 'clear')!;
function street(tick = dryTick) {
  const engine = new SimulationEngine({ version: 1, seed: 1, tick });
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

it('delays buses in road traffic, reduces capacity, and reproduces the estimate after loading', () => {
  const { engine, city } = street();
  const near = { x: 2, y: 1 };
  const far = { x: 11, y: 1 };
  city.execute({ type: 'BUILD_BUS_STOP', ...near });
  city.execute({ type: 'BUILD_BUS_STOP', ...far });
  const line = city.addLine('bus').id!;
  expect(city.toggleStop(line, home).error).toBeTruthy();
  city.toggleStop(line, near);
  expect(city.getLines()[0].active).toBe(false);
  city.toggleStop(line, far);
  const plan = city.getLines()[0];
  const free = 10 * traffic.minutesPerTile + transit.dwell;
  expect(plan.active).toBe(true);
  expect(plan.times[1]).toBeGreaterThan(free);
  expect(plan.delay).toBeCloseTo(plan.times[1] - free);
  expect(plan.headway).toBeCloseTo(2 * plan.times[1]);
  expect(plan.capacity).toBeLessThan(Math.floor(transit.peakMinutes / (2 * free) * transit.bus.capacity));
  expect(plan.busiest).toBeLessThanOrEqual(plan.capacity);
  expect(city.getStats().riders).toBeLessThanOrEqual(plan.capacity);
  const before = city.getStats().funds;
  expect(city.setVehicles(line, 3)).toEqual({ cost: 2 * transit.bus.vehicleCost });
  expect(city.getStats().funds).toBe(before - 2 * transit.bus.vehicleCost);
  const restored = new SimulationEngine({ version: 1, seed: 0, tick: 0 });
  restored.load(structuredClone(engine.save()));
  expect(restored.city.getLines()).toEqual(city.getLines());
  expect(restored.city.getStats().riders).toBe(city.getStats().riders);
  city.execute({ type: 'DEMOLISH', ...far });
  expect(city.getLines()[0]).toMatchObject({ active: false, capacity: 0, delay: 0 });
  expect(city.getStats().riders).toBe(0);
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
  expect(plan.delay).toBe(0);
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
