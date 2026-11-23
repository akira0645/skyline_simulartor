import { expect, it, vi } from 'vitest';
import { TileMap } from './TileMap';
import { RoadPathValidity } from './RoadPathValidity';

it('reuses unchanged roads and rechecks demolition, rebuilding and loaded maps', () => {
  const map = new TileMap();
  const path = [{ x: 2, y: 2 }, { x: 3, y: 2 }, { x: 4, y: 2 }];
  map.execute({ type: 'BUILD_ROAD', path: [path[1]] });
  const roads = new RoadPathValidity(map), get = vi.spyOn(map, 'get');
  expect(roads.hasRoads(path)).toBe(true);
  get.mockClear();
  expect(roads.hasRoads(path)).toBe(true);
  expect(get).not.toHaveBeenCalled();
  map.execute({ type: 'DEMOLISH', ...path[1] });
  expect(roads.hasRoads(path)).toBe(false);
  map.execute({ type: 'BUILD_ROAD', path: [path[1]] });
  expect(roads.hasRoads(path)).toBe(true);
  const saved = map.save();
  map.execute({ type: 'DEMOLISH', ...path[1] });
  expect(roads.hasRoads(path)).toBe(false);
  map.load(saved);
  expect(roads.hasRoads(path)).toBe(true);
});
