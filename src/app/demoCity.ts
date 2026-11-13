import { economy } from '../simulation/Economy';
import type { SimulationEngine } from '../simulation/SimulationEngine';
import { MAP_SIZE, type Cell } from '../simulation/TileMap';

/** The western plant and tower, which the demo's outage buttons switch off and on. */
export const powerPlant = { x: 3, y: 9 };
export const waterTower = { x: 4, y: 9 };
/** The avenue tile that is the only way into the industrial estate. */
export const works = { x: 14, y: 5 };

const block = (fromX: number, toX: number, fromY: number, toY: number): Cell[] => {
  const cells: Cell[] = [];
  for (let y = fromY; y <= toY; y++) for (let x = fromX; x <= toX; x++) cells.push({ x, y });
  return cells;
};

/**
 * A small planned town that keeps growing by itself: homes north of an avenue with a park
 * strip behind them, shops to the south, and factories out east behind a row of parks, reached
 * only by the avenue. Two plants and two towers cover all of it. A few buildings stand from
 * the start so people are commuting at once; the empty lots fill in and upgrade over time.
 */
export function demoCity(engine: SimulationEngine) {
  const city = engine.city;
  const id = ({ x, y }: Cell) => y * MAP_SIZE + x;
  city.execute({ type: 'BUILD_ROAD', path: block(1, 18, 5, 5), road: 'avenue' });
  for (const y of [2, 8]) city.execute({ type: 'BUILD_ROAD', path: block(1, 13, y, y) });
  for (const x of [6, 13]) city.execute({ type: 'BUILD_ROAD', path: block(x, x, 2, 8) });

  city.execute({ type: 'SET_ZONE', tiles: [...block(1, 5, 3, 4), ...block(7, 12, 3, 4)], zone: 'residential' });
  city.execute({ type: 'SET_ZONE', tiles: [...block(1, 5, 6, 7), ...block(7, 12, 6, 7)], zone: 'commercial' });
  city.execute({ type: 'SET_ZONE', tiles: [...block(15, 18, 4, 4), ...block(15, 18, 6, 6)], zone: 'industrial' });
  city.execute({ type: 'BUILD_PARK', tiles: [...block(1, 12, 1, 1), { x: 14, y: 4 }, { x: 14, y: 6 }] });
  for (const [plant, tower] of [[powerPlant, waterTower], [{ x: 15, y: 9 }, { x: 14, y: 9 }]]) {
    city.execute({ type: 'BUILD_FACILITY', ...plant, facility: 'power' });
    city.execute({ type: 'BUILD_FACILITY', ...tower, facility: 'water' });
  }

  const homes = [{ x: 1, y: 4 }, { x: 2, y: 4 }, { x: 8, y: 4 }, { x: 10, y: 4 }];
  const shops = [{ x: 2, y: 6 }, { x: 8, y: 6 }];
  const factories = [{ x: 15, y: 4 }, { x: 16, y: 6 }];
  engine.load({ ...engine.save(), funds: economy.startingFunds, buildings: [
    ...homes.map(home => ({ id: id(home), capacity: 4, occupants: 4, level: 1 })),
    ...shops.map(shop => ({ id: id(shop), capacity: 3, occupants: 0, level: 1 })),
    ...factories.map(factory => ({ id: id(factory), capacity: 5, occupants: 0, level: 1 })),
  ] });
}
