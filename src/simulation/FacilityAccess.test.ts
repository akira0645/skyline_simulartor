import { expect, it } from 'vitest';
import { TileMap } from './TileMap';
import { RoadGraph } from './RoadGraph';
import { entrances, parkGroups, routeToSite } from './FacilityAccess';

it('uses the nearest reachable building edge, including roads on disconnected sides', () => {
  const map = new TileMap();
  map.execute({ type: 'BUILD_SERVICE', service: 'hospital', x: 4, y: 4 });
  map.execute({ type: 'BUILD_ROAD', path: [{ x: 3, y: 4 }, { x: 6, y: 5 }] });
  const graph = new RoadGraph(map);
  expect(entrances(map, { x: 5, y: 5 })).toHaveLength(2);
  expect(routeToSite(map, graph, { x: 6, y: 5 }, { x: 4, y: 4 })?.path)
    .toEqual([{ x: 6, y: 5 }, { x: 5, y: 5 }]);
  expect(routeToSite(map, graph, { x: 3, y: 4 }, { x: 5, y: 5 })?.path.at(-1)).toEqual({ x: 4, y: 4 });
  map.execute({ type: 'DEMOLISH', x: 6, y: 5 });
  expect(routeToSite(map, graph, { x: 6, y: 5 }, { x: 4, y: 4 })).toBeUndefined();
  map.execute({ type: 'BUILD_ROAD', path: [{ x: 6, y: 5 }] });
  expect(routeToSite(map, graph, { x: 6, y: 5 }, { x: 4, y: 4 })?.path.at(-1)).toEqual({ x: 5, y: 5 });
});

it('groups connected parks without merging a diagonal neighbour', () => {
  const map = new TileMap();
  map.execute({ type: 'BUILD_PARK', tiles: [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 3, y: 2 }] });
  const groups = parkGroups(map);
  expect(groups.get(129)).toEqual([129, 130]);
  expect(groups.get(130)).toBe(groups.get(129));
  expect(groups.get(259)).toEqual([259]);
});
