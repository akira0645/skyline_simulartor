import { expect, it } from 'vitest';
import { SimulationEngine } from './SimulationEngine';
import { MAP_SIZE } from './TileMap';

it('fills the closest jobs first, then leaves unreachable workers unemployed', () => {
  const engine = new SimulationEngine({ version: 1, seed: 7, tick: 0 });
  const { city } = engine;
  const home = { x: 1, y: 1 };
  const near = { x: 2, y: 1 };
  const far = { x: 5, y: 1 };
  const id = ({ x, y }: typeof home) => y * MAP_SIZE + x;
  city.execute({ type: 'BUILD_ROAD', path: Array.from({ length: 5 }, (_, i) => ({ x: i + 1, y: 2 })) });
  city.execute({ type: 'SET_ZONE', tiles: [home], zone: 'residential' });
  city.execute({ type: 'SET_ZONE', tiles: [far, near], zone: 'commercial' });
  engine.load({ ...engine.save(), buildings: [
    { id: id(home), capacity: 4, occupants: 4 },
    { id: id(far), capacity: 3, occupants: 0 },
    { id: id(near), capacity: 3, occupants: 0 },
  ] });
  expect(city.getCommutes().map(({ workId, workers, path }) => [workId, workers, path.length]))
    .toEqual([[id(near), 2, 2], [id(far), 2, 5]]);
  city.execute({ type: 'DEMOLISH', x: 3, y: 2 });
  expect(city.getStats()).toMatchObject({ employed: 2, jobs: 4 });
  expect(city.getBuilding(far)?.occupants).toBe(0);
});
