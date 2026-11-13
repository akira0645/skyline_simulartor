import { expect, it } from 'vitest';
import { economy } from './Economy';
import { landValue } from './LandValue';
import { SimulationEngine } from './SimulationEngine';
import { DRY_CORNER, MAP_SIZE, TileMap, type Cell, type GameCommand } from './TileMap';
import { traffic } from './Traffic';

const id = ({ x, y }: Cell) => y * MAP_SIZE + x;
const row = (y: number, from: number, to: number): Cell[] =>
  Array.from({ length: to - from + 1 }, (_, index) => ({ x: from + index, y }));

it('lays out different water for every seed, and the same for the same seed', () => {
  const terrain = (seed: number) => {
    const map = new TileMap();
    map.generateTerrain(seed);
    return map.save();
  };
  expect(terrain(42)).toEqual(terrain(42));
  const maps = new Set<string>();
  let upright = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const tiles = terrain(seed);
    maps.add(tiles.join(''));
    const wet = (cell: Cell) => tiles[id(cell)] !== 0;
    // A river at least two tiles wide runs right across, one way or the other.
    const rows = Array.from({ length: MAP_SIZE }, (_, y) => row(y, 0, MAP_SIZE - 1).filter(wet).length);
    const columns = Array.from({ length: MAP_SIZE }, (_, x) =>
      Array.from({ length: MAP_SIZE }, (_, y) => ({ x, y })).filter(wet).length);
    const crossesRows = rows.slice(DRY_CORNER.height).every(count => count >= 2);
    const crossesColumns = columns.slice(DRY_CORNER.width).every(count => count >= 2);
    expect(crossesRows || crossesColumns).toBe(true);
    if (crossesRows) upright++;
    // Water never takes more than a fifth of the map, and never the starting corner.
    expect(tiles.filter(code => code !== 0).length).toBeLessThan(MAP_SIZE ** 2 / 5);
    for (let y = 0; y < DRY_CORNER.height; y++) {
      expect(row(y, 0, DRY_CORNER.width - 1).some(wet)).toBe(false);
    }
  }
  expect(maps.size).toBe(40);
  // Both directions turn up.
  expect(upright).toBeGreaterThan(5);
  expect(upright).toBeLessThan(35);
});

it('lets only roads cross water, as bridges', () => {
  const engine = new SimulationEngine({ version: 1, seed: 1, tick: 0 });
  const { city } = engine;
  const y = 20;
  const wet = row(y, 50, 52);
  city.map.flood(wet);
  expect(wet.map(cell => city.map.get(cell))).toEqual(['river', 'river', 'river']);
  const [west, , east] = wet;

  const refused: GameCommand[] = [
    { type: 'SET_ZONE', tiles: [west], zone: 'residential' },
    { type: 'BUILD_PARK', tiles: [west] },
    { type: 'BUILD_FACILITY', ...west, facility: 'power' },
    { type: 'BUILD_SERVICE', ...west, service: 'school' },
    { type: 'BUILD_BUS_STOP', ...west },
    { type: 'DEMOLISH', ...west },
  ];
  for (const command of refused) {
    expect(city.execute(command)).toMatchObject({ changed: [], cost: 0, error: expect.any(String) });
  }
  expect(city.map.get(west)).toBe('river');

  // A street from bank to bank: two tiles of road and three of bridge.
  const crossing = row(y, west.x - 1, east.x + 1);
  expect(city.execute({ type: 'BUILD_ROAD', path: crossing }).cost)
    .toBe(2 * economy.cost.road + 3 * economy.cost.bridge);
  expect(crossing.map(cell => city.map.get(cell))).toEqual(['road', 'bridge', 'bridge', 'bridge', 'road']);
  expect(city.roadGraph.shortestPath(crossing[0], crossing[4])?.distance).toBe(4);
  expect(city.getStats().budget.upkeep).toBe(2 * economy.upkeep.road + 3 * economy.upkeep.bridge);
  expect(city.inspect(west)).toMatchObject({ tile: 'bridge', roadCapacity: traffic.capacity });
  // Paving over it again, even as an avenue, leaves the bridge as it is.
  expect(city.execute({ type: 'BUILD_ROAD', path: crossing, road: 'avenue' }).changed)
    .toEqual([crossing[0], crossing[4]]);
  expect(city.map.get(west)).toBe('bridge');

  // Taking a bridge down leaves water, and the banks are no longer joined.
  city.execute({ type: 'DEMOLISH', ...wet[1] });
  expect(city.map.get(wet[1])).toBe('river');
  expect(city.roadGraph.shortestPath(crossing[0], crossing[4])).toBeUndefined();

  // Land near the water is worth more.
  const bank = { x: west.x - 2, y: y + 1 };
  const inland = { x: west.x - 2 - landValue.waterfront.radius, y: y + 1 };
  city.execute({ type: 'SET_ZONE', tiles: [bank, inland], zone: 'residential' });
  expect(city.landValueAt(bank)).toBe(landValue.base + landValue.waterfront.value);
  expect(city.landValueAt(inland)).toBe(landValue.base);

  // The river is part of a save.
  const restored = new SimulationEngine({ version: 1, seed: 0, tick: 0 });
  restored.load(structuredClone(engine.save()));
  expect(restored.city.map.get(wet[0])).toBe('bridge');
  expect(restored.city.map.get(wet[1])).toBe('river');
});
