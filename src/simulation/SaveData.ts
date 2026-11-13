import { MAP_SIZE, TILES } from './TileMap';

export const SCHEMA_VERSION = 1;

export interface SaveData {
  schemaVersion: number;
  seed: number;
  tick: number;
  /** One tile code per cell, indexing TILES. */
  tiles: Uint8Array;
  /** Zoned cell indices, in the order growth checks them. */
  zones: number[];
  /** Cell indices that hold a building. */
  buildings: number[];
}

const FIRST_ZONE = 2;
const isCount = (value: unknown): value is number =>
  Number.isInteger(value) && (value as number) >= 0;
const isUnique = (values: number[]) => new Set(values).size === values.length;

/** Checks everything before anything is applied, so a bad save cannot half-load. */
export function parseSave(data: unknown): SaveData {
  if (typeof data !== 'object' || data === null) throw new Error('存檔資料損壞。');
  const { schemaVersion, seed, tick, tiles, zones, buildings } = data as Record<string, unknown>;
  if (schemaVersion !== SCHEMA_VERSION) throw new Error('存檔版本不相容。');

  if (!Number.isFinite(seed) || !isCount(tick) ||
      !(tiles instanceof Uint8Array) || tiles.length !== MAP_SIZE ** 2 ||
      !Array.isArray(zones) || !zones.every(isCount) ||
      !Array.isArray(buildings) || !buildings.every(isCount)) {
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
      zones.some(id => !(tiles[id] >= FIRST_ZONE)) ||
      !isUnique(buildings) || buildings.some(id => !zoned.has(id))) {
    throw new Error('存檔資料損壞。');
  }

  return { schemaVersion, seed: seed as number, tick, tiles, zones, buildings };
}
