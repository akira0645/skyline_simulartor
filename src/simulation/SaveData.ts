import { MAP_SIZE, TILES } from './TileMap';

import { growth } from './ZoneDemandSystem';
import type { Zone } from './TileMap';

export const SCHEMA_VERSION = 2;

export interface SavedBuilding {
  id: number;
  capacity: number;
  occupants: number;
}

export interface SaveData {
  schemaVersion: number;
  seed: number;
  tick: number;
  /** One tile code per cell, indexing TILES. */
  tiles: Uint8Array;
  /** Zoned cell indices, in the order growth checks them. */
  zones: number[];
  /** Cell indices that hold a building. */
  buildings: SavedBuilding[];
}

const FIRST_ZONE = 2;
const isCount = (value: unknown): value is number =>
  Number.isSafeInteger(value) && (value as number) >= 0;


/** Checks everything before anything is applied, so a bad save cannot half-load. */
export function parseSave(data: unknown): SaveData {
  if (typeof data !== 'object' || data === null) throw new Error('存檔資料損壞。');
  const { schemaVersion, seed, tick, tiles, zones, buildings } = data as Record<string, unknown>;
  if (schemaVersion !== 1 && schemaVersion !== SCHEMA_VERSION) throw new Error('存檔版本不相容。');

  if (!Number.isFinite(seed) || !isCount(tick) ||
      !(tiles instanceof Uint8Array) || tiles.length !== MAP_SIZE ** 2 ||
      !Array.isArray(zones) || !zones.every(isCount) ||
      !Array.isArray(buildings)) {
    throw new Error('存檔資料損壞。');
  }

  let zonedTiles = 0;
  for (const code of tiles) {
    if (code >= TILES.length) throw new Error('存檔資料損壞。');
    if (code >= FIRST_ZONE) zonedTiles++;
  }
  // zones must list every zoned tile exactly once; buildings must stand on zones.
  const zoned = new Set<number>(zones);
  if (zoned.size !== zonedTiles || zones.length !== zonedTiles ||
      zones.some(id => !(tiles[id] >= FIRST_ZONE))) {
    throw new Error('存檔資料損壞。');
  }

  const records: SavedBuilding[] = [];
  const seen = new Set<number>();
  for (const entry of buildings) {
    const id = schemaVersion === 1 ? entry : entry?.id;
    if (!isCount(id) || !zoned.has(id) || seen.has(id)) throw new Error('存檔資料損壞。');
    seen.add(id);
    const zone = TILES[tiles[id]] as Zone;
    const capacity = schemaVersion === 1 ? growth.capacity[zone] : entry.capacity;
    const occupants = schemaVersion === 1 ? (zone === 'residential' ? capacity : 0) : entry.occupants;
    if (!isCount(capacity) || capacity === 0 || !isCount(occupants) || occupants > capacity) {
      throw new Error('存檔資料損壞。');
    }
    records.push({ id, capacity, occupants });
  }
  const homes = records.filter(b => TILES[tiles[b.id]] === 'residential');
  const workplaces = records.filter(b => TILES[tiles[b.id]] !== 'residential');
  let available = homes.reduce((total, b) => total + b.occupants, 0);
  for (const b of workplaces) {
    if (schemaVersion === 1) b.occupants = Math.min(available, b.capacity);
    available -= b.occupants;
    if (available < 0) throw new Error('存檔資料損壞。');
  }
  return { schemaVersion: SCHEMA_VERSION, seed: seed as number, tick, tiles, zones, buildings: records };
}
