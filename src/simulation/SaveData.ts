import { isZone, MAP_SIZE, TILES } from './TileMap';

import { economy, milestones } from './Economy';
import { MAX_LEVEL } from './LandValue';
import { growth } from './ZoneDemandSystem';
import type { Zone } from './TileMap';

/**
 * 4 added funds, the milestone rank and avenue tiles; 3 added power and water facility tiles;
 * 2 added per-building capacity and occupants.
 */
export const SCHEMA_VERSION = 4;
const READABLE = [1, 2, 3, SCHEMA_VERSION];

export interface SavedBuilding {
  id: number;
  capacity: number;
  occupants: number;
  /** 1 to 3. Saves made before buildings could upgrade have none and load as level 1. */
  level: number;
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
  /** City money; negative when upkeep has outrun tax. */
  funds: number;
  /** How many population milestones have been paid out. */
  rank: number;
  /** Tax rate in percent. Saves from before it could be set have none and load at the default. */
  taxRate: number;
}

const zonedCode = (code: number) => isZone(TILES[code]);
const isCount = (value: unknown): value is number =>
  Number.isSafeInteger(value) && (value as number) >= 0;


/** Checks everything before anything is applied, so a bad save cannot half-load. */
export function parseSave(data: unknown): SaveData {
  if (typeof data !== 'object' || data === null) throw new Error('存檔資料損壞。');
  const { schemaVersion, seed, tick, tiles, zones, buildings } = data as Record<string, unknown>;
  // Saves from before the city had money start with the opening balance and no milestones paid.
  const { funds = economy.startingFunds, rank = 0 } = (schemaVersion as number) < 4 ? {} :
    data as Record<string, unknown>;
  const { taxRate = economy.taxRate.default } = data as Record<string, unknown>;
  if (!isCount(taxRate) || taxRate < economy.taxRate.min || taxRate > economy.taxRate.max) {
    throw new Error('存檔資料損壞。');
  }
  if (!Number.isFinite(funds) || !isCount(rank) || rank > milestones.length) {
    throw new Error('存檔資料損壞。');
  }
  if (!READABLE.includes(schemaVersion as number)) throw new Error('存檔版本不相容。');

  if (!Number.isFinite(seed) || !isCount(tick) ||
      !(tiles instanceof Uint8Array) || tiles.length !== MAP_SIZE ** 2 ||
      !Array.isArray(zones) || !zones.every(isCount) ||
      !Array.isArray(buildings)) {
    throw new Error('存檔資料損壞。');
  }

  let zonedTiles = 0;
  for (const code of tiles) {
    if (code >= TILES.length) throw new Error('存檔資料損壞。');
    if (zonedCode(code)) zonedTiles++;
  }
  // zones must list every zoned tile exactly once; buildings must stand on zones.
  const zoned = new Set<number>(zones);
  if (zoned.size !== zonedTiles || zones.length !== zonedTiles ||
      zones.some(id => !zonedCode(tiles[id]))) {
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
    const level = schemaVersion === 1 ? 1 : entry.level ?? 1;
    if (!isCount(capacity) || capacity === 0 || !isCount(occupants) || occupants > capacity ||
        !isCount(level) || level < 1 || level > MAX_LEVEL) {
      throw new Error('存檔資料損壞。');
    }
    records.push({ id, capacity, occupants, level });
  }
  const homes = records.filter(b => TILES[tiles[b.id]] === 'residential');
  const workplaces = records.filter(b => TILES[tiles[b.id]] !== 'residential');
  let available = homes.reduce((total, b) => total + b.occupants, 0);
  for (const b of workplaces) {
    if (schemaVersion === 1) b.occupants = Math.min(available, b.capacity);
    available -= b.occupants;
    if (available < 0) throw new Error('存檔資料損壞。');
  }
  return { schemaVersion: SCHEMA_VERSION, seed: seed as number, tick, tiles, zones, buildings: records,
    funds: funds as number, rank, taxRate };
}
