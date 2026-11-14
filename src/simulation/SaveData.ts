import { isZone, MAP_SIZE, TILES } from './TileMap';

import { economy, milestones } from './Economy';
import { COMPLEX_LEVEL } from './LandValue';
import { transit, type SavedLine } from './Transit';
import { growth } from './ZoneDemandSystem';
import type { Zone } from './TileMap';
import { HOME_KINDS, type HomeKind } from './Residents';
import { vehicles } from './Wealth';

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
  /** For a home in a housing complex: the tile of the complex's top left home. */
  block?: number;
  /**
   * For a home: who lives in it, one record per occupant. Saves from before people were kept
   * have none; they load as the first `occupants` places, all looking for work.
   */
  people?: SavedPerson[];
  /** For a home: the place the next person to move in takes. */
  nextSlot?: number;
  /** For a home: what kind it is, if it is not an ordinary one. Decided when it is built. */
  kind?: HomeKind;
}

export interface SavedPerson {
  /** The place they took in the home, which with the seed decides who they are. */
  slot: number;
  /** The tile of the workplace they work at, or -1 without a job. */
  job: number;
  /** The ticks at which they moved in and started the job they have. */
  came: number;
  hired: number;
  /** Their savings, and the vehicle they own as an index into Wealth's `vehicles`; left out while zero. */
  money?: number;
  car?: number;
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
  /** Bus and metro lines. Saves from before there were any have none. */
  lines: SavedLine[];
  /** The road tiles with a metro station under them. */
  metros: number[];
  /** The ids of the goals already rewarded. */
  goals: string[];
  /** Months left to pay on each loan. */
  loans: number[];
}

const zonedCode = (code: number) => isZone(TILES[code]);
const isCount = (value: unknown): value is number =>
  Number.isSafeInteger(value) && (value as number) >= 0;


/** A list that older saves do not have, checked item by item. */
function parseList(list: unknown, valid: (value: unknown) => boolean): unknown[] {
  if (list === undefined) return [];
  if (!Array.isArray(list) || list.length > 64 || !list.every(valid)) throw new Error('存檔資料損壞。');
  return [...list];
}

/** Every line must have a known kind, a sane number of vehicles and stops of its own kind. */
function parseLines(lines: unknown, tiles: Uint8Array, metros: ReadonlySet<number>): SavedLine[] {
  if (lines === undefined) return [];
  if (!Array.isArray(lines) || lines.length > transit.maxLines) throw new Error('存檔資料損壞。');
  const ids = new Set<number>();
  return lines.map(line => {
    const { id, kind, stops, vehicles } = (line ?? {}) as Record<string, unknown>;
    if (!isCount(id) || ids.has(id) || (kind !== 'bus' && kind !== 'metro') ||
        !isCount(vehicles) || vehicles < 1 || vehicles > transit.maxVehicles ||
        !Array.isArray(stops) || new Set(stops).size !== stops.length ||
        !stops.every(stop => isCount(stop) && (kind === 'metro' ? metros.has(stop) : TILES[tiles[stop]] === 'bus'))) {
      throw new Error('存檔資料損壞。');
    }
    ids.add(id);
    return { id, kind, stops: [...stops] as number[], vehicles };
  });
}

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
  // Stations lie under roads. A save from when a station was a tile of its own gets a piece
  // of road in its place, with the station under it.
  const saved = (data as Record<string, unknown>).metros;
  if (saved !== undefined && (!Array.isArray(saved) || saved.length > 4096 ||
      !saved.every(id => isCount(id) && (TILES[tiles[id]] === 'road' || TILES[tiles[id]] === 'avenue')))) {
    throw new Error('存檔資料損壞。');
  }
  const metros = new Set<number>((saved as number[] | undefined) ?? []);
  let layout = tiles;
  if (tiles.includes(TILES.indexOf('metro'))) {
    layout = tiles.slice();
    layout.forEach((code, id) => {
      if (TILES[code] !== 'metro') return;
      layout[id] = TILES.indexOf('road');
      metros.add(id);
    });
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
    const block = schemaVersion === 1 ? undefined : entry.block;
    if (!isCount(capacity) || capacity === 0 || !isCount(occupants) || occupants > capacity ||
        !isCount(level) || level < 1 || level > COMPLEX_LEVEL ||
        (level === COMPLEX_LEVEL) !== (block !== undefined) || (block !== undefined && !zoned.has(block))) {
      throw new Error('存檔資料損壞。');
    }
    const record: SavedBuilding = block === undefined ? { id, capacity, occupants, level } :
      { id, capacity, occupants, level, block };
    const kind = schemaVersion === 1 ? undefined : entry.kind;
    if (kind !== undefined) {
      if (!HOME_KINDS.includes(kind) || zone !== 'residential') throw new Error('存檔資料損壞。');
      record.kind = kind;
    }
    const people = schemaVersion === 1 ? undefined : entry.people;
    if (people !== undefined && zone === 'residential') {
      const nextSlot = entry.nextSlot;
      const slots = new Set<number>();
      if (!Array.isArray(people) || people.length !== occupants || !isCount(nextSlot)) throw new Error('存檔資料損壞。');
      record.people = people.map(person => {
        const { slot, job, came, hired, money, car } = (person ?? {}) as Record<string, unknown>;
        if (!isCount(slot) || slot >= nextSlot || slots.has(slot) || !(job === -1 || isCount(job)) ||
            !isCount(came) || !isCount(hired) || !(money === undefined || isCount(money)) ||
            !(car === undefined || (isCount(car) && car < vehicles.length))) throw new Error('存檔資料損壞。');
        slots.add(slot);
        return { slot, job: job as number, came, hired, ...(money ? { money } : {}), ...(car ? { car } : {}) };
      });
      record.nextSlot = nextSlot;
    }
    records.push(record);
  }
  const homes = records.filter(b => TILES[tiles[b.id]] === 'residential');
  const workplaces = records.filter(b => TILES[tiles[b.id]] !== 'residential');
  let available = homes.reduce((total, b) => total + b.occupants, 0);
  for (const b of workplaces) {
    if (schemaVersion === 1) b.occupants = Math.min(available, b.capacity);
    available -= b.occupants;
    if (available < 0) throw new Error('存檔資料損壞。');
  }
  return { schemaVersion: SCHEMA_VERSION, seed: seed as number, tick, tiles: layout, zones, buildings: records,
    funds: funds as number, rank, taxRate, metros: [...metros].sort((a, b) => a - b),
    lines: parseLines((data as Record<string, unknown>).lines, tiles, metros),
    goals: parseList((data as Record<string, unknown>).goals, value => typeof value === 'string') as string[],
    loans: parseList((data as Record<string, unknown>).loans, isCount) as number[] };
}
