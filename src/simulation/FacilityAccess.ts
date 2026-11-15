import { footprint, isBig, isRoad, MAP_SIZE, type Cell, type TileMap } from './TileMap';
import type { RoadGraph } from './RoadGraph';

export const cellId = ({ x, y }: Cell): number => y * MAP_SIZE + x;
export const cellFromId = (id: number): Cell => ({ x: id % MAP_SIZE, y: Math.floor(id / MAP_SIZE) });
const offsets = [[0, -1], [1, 0], [0, 1], [-1, 0]];
type SiteRoute = { path: Cell[]; distance: number; entrance: Cell };
const routes = new WeakMap<TileMap, { revision: number; values: Map<string, SiteRoute | undefined> }>();

export function siteCells(map: TileMap, cell: Cell): Cell[] {
  const anchor = map.anchorOf(cell) ?? cell;
  return isBig(map.get(anchor)) ? footprint(anchor) : [anchor];
}

/** A doorway is the pair of a building cell and its adjacent public road. */
export function entrances(map: TileMap, cell: Cell): { cell: Cell; road: Cell }[] {
  return siteCells(map, cell).flatMap(part => offsets.flatMap(([dx, dy]) => {
    const road = { x: part.x + dx, y: part.y + dy };
    return isRoad(map.get(road)) ? [{ cell: part, road }] : [];
  }));
}

/** Search every reachable entrance; never jump from a side road to the anchor through walls. */
export function routeToSite(map: TileMap, graph: RoadGraph, from: Cell, dest: Cell, tie = 0) {
  let cache = routes.get(map);
  if (!cache || cache.revision !== map.layoutRevision) {
    cache = { revision: map.layoutRevision, values: new Map() };
    routes.set(map, cache);
  }
  const doors = entrances(map, dest);
  const key = `${cellId(from)}:${cellId(map.anchorOf(dest) ?? dest)}:${doors.length ? Math.abs(tie) % doors.length : 0}`;
  if (cache.values.has(key)) return cache.values.get(key);
  let best: { path: Cell[]; distance: number; entrance: Cell } | undefined;
  for (let n = 0; n < doors.length; n++) {
    const door = doors[(n + Math.abs(tie) % doors.length) % doors.length];
    if (graph.componentAt(from) !== graph.componentAt(door.road)) continue;
    const route = graph.shortestPath(from, door.road);
    if (!route || (best && best.distance <= route.distance)) continue;
    best = { path: [...route.path, door.cell], distance: route.distance, entrance: door.cell };
  }
  if (cache.values.size >= 8192) cache.values.clear();
  cache.values.set(key, best);
  return best;
}

/** Four-connected park groups. Cached per layout by the caller, independent of camera. */
export function parkGroups(map: TileMap): Map<number, readonly number[]> {
  const result = new Map<number, readonly number[]>();
  for (let id = 0; id < MAP_SIZE ** 2; id++) {
    if (map.at(id) !== 'park' || result.has(id)) continue;
    const cells = [id];
    result.set(id, cells);
    for (let at = 0; at < cells.length; at++) {
      const cell = cellFromId(cells[at]);
      for (const [dx, dy] of offsets) {
        const next = { x: cell.x + dx, y: cell.y + dy };
        const nextId = cellId(next);
        if (map.get(next) !== 'park' || result.has(nextId)) continue;
        cells.push(nextId);
        result.set(nextId, cells);
      }
    }
  }
  return result;
}
