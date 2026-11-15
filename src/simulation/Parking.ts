import { isRoad, MAP_SIZE, type Cell, type Tile, type TileMap } from './TileMap';
import { prices } from './Prices';

/**
 * Where the cars of those on an outing stand. Every place has `kerb` spaces on the road outside
 * its door; the big ones listed in `own` have a car park of their own besides; and every city
 * car park within `prices.keep.lotReach` tiles adds `lot` more. Scooters fit in anywhere and
 * are not counted. A driver who finds no space goes round looking, `circle` road tiles more.
 */
export const parking = {
  kerb: 2, lot: 12, circle: 6,
  own: { mall: 16, stadium: 24, amusement: 16, casino: 10, museum: 6, hospital: 6, university: 6, cinema: 4,
    school: 8, highschool: 8, park: 6, market: 4, temple: 2 } as Partial<Record<Tile, number>>,
};

const counted = new WeakMap<TileMap, { revision: number; spaces: Map<number, number> }>();

/** How many visitors' cars can stand at a place, given the buildings round it. */
export function spacesAt(map: TileMap, place: Cell): number {
  let cache = counted.get(map);
  if (!cache || cache.revision !== map.layoutRevision) counted.set(map, cache = { revision: map.layoutRevision, spaces: new Map() });
  const anchor = map.anchorOf(place) ?? place;
  const id = anchor.y * MAP_SIZE + anchor.x;
  let spaces = cache.spaces.get(id);
  if (spaces === undefined) {
    const reach = prices.keep.lotReach;
    let lots = 0;
    for (let dy = -reach; dy <= reach; dy++) {
      for (let dx = -reach; dx <= reach; dx++) if (map.get({ x: anchor.x + dx, y: anchor.y + dy }) === 'parking') lots++;
    }
    spaces = parking.kerb + (parking.own[map.get(anchor)!] ?? 0) + lots * parking.lot;
    cache.spaces.set(id, spaces);
  }
  return spaces;
}

const ways = [[0, -1], [1, 0], [0, 1], [-1, 0]];

/**
 * The way of a driver who gets to the door and finds no space: on past it along the road,
 * straight where they can, then round and back. `path` is the whole way, from the place they
 * left to the place they are going, with the road tiles between; the same is returned when
 * the road ends at the door and there is nowhere to go round.
 */
export function circling(map: TileMap, path: readonly Cell[]): Cell[] {
  const door = path.length - 2;
  if (door < 2) return [...path];
  const out: Cell[] = [];
  let before = path[door - 1];
  let at = path[door];
  for (let step = 0; step < parking.circle / 2; step++) {
    const straight = { x: 2 * at.x - before.x, y: 2 * at.y - before.y };
    const next = [straight, ...ways.map(([dx, dy]) => ({ x: at.x + dx, y: at.y + dy }))]
      .find(cell => isRoad(map.get(cell)) && !(cell.x === before.x && cell.y === before.y));
    if (!next) break;
    out.push(next);
    before = at;
    at = next;
  }
  if (!out.length) return [...path];
  const back = out.slice(0, -1).reverse();
  return [...path.slice(0, door + 1), ...out, ...back, path[door], path[door + 1]];
}
