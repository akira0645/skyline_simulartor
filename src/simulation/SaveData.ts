import { WAREHOUSE_CAPACITY, parseFreightRuntime, type FreightRuntimeSave } from './FreightRuntime';
import { parseFreightLines, type FreightMode, type SavedFreightLine } from './FreightLines';
import { parseLand } from './Land';
import { parseDiary, type ActivityEntry } from './ActivityDiary';
import { parseLife } from './SavedLife';
import type { LifeSave } from './LifeSystem';
import { parseIdentity, type ResidentIdentity } from './ResidentIdentity';
import type { Relationship } from './Relationships';
import { parseVisits, parseScares, parseCooldowns, isVisitDoing } from './SavedVisits';
import type { ActiveVisit } from './VisitSystem';
import { combos, taskList } from './Combos';
import { isZone, MAP_SIZE, TILES } from './TileMap';

import { economy, milestones } from './Economy';
import { COMPLEX_LEVEL } from './LandValue';
import { transit, type SavedLine } from './Transit';
import { growth } from './ZoneDemandSystem';
import type { Zone } from './TileMap';
import { HOME_KINDS, type HomeKind } from './Residents';
import { vehicles } from './Wealth';
import { challenges, type Challenge } from './Seasons';
import { brands, dilemmas, type Boost, type Brand, type Dilemma } from './Dilemmas';

/**
 * 12 stores resident gender, shared by cards, walkers and bicycle riders.
 * 11 preserves sub-tick visits and travel delays on the slower live clock.
 * 10 adds logistics warehouse tiles and transshipment inventory.
 * 9 adds actual local freight stocks, vehicle manifests and monthly operating reports.
 * 8 adds player-managed logistics lines and fleet settings.
 * 7 adds purchased land parcels; earlier saves keep the full map.
 * 6 adds bounded daily activity diaries and reasons for continuous venue trips.
 * 5 adds persistent visits, resident identities, relationships, life events and cooldowns.
 * 4 added funds, the milestone rank and avenue tiles; 3 added power and water facility tiles;
 * 2 added per-building capacity and occupants.
 */
export const SCHEMA_VERSION = 12;
/**
 * How a city looks: which city's colours its homes and shops wear, and the trees, cars and
 * bridges that go with them. Nothing in the simulation goes by it.
 */
export const THEMES = ['classic', 'sf', 'california', 'newyork'] as const;
export type Theme = (typeof THEMES)[number];
const READABLE = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, SCHEMA_VERSION];

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
  /** For a shop: the business a decision brought to it, if any (see Dilemmas.ts). */
  brand?: Brand;
}

export interface SavedPerson {
  identity?: ResidentIdentity;
  graceUntil?: number;
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
  ownedLand?: number[];
  freightRuntime?: FreightRuntimeSave;
  freightMode?: FreightMode;
  freightLines?: SavedFreightLine[];
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
  /** The tiles an elevated road passes over. Saves from before there were any have none. */
  spans: number[];
  /** The ids of the goals already rewarded. */
  goals: string[];
  /** Months left to pay on each loan. */
  loans: number[];
  /** The ids of the tasks the city is working on. Saves from before there were any have none. */
  tasks: string[];
  /** The special groups (see Combos.ts) the city has ever had, for the handbook. */
  combos: string[];
  coldStock?: [number, number][];
  marketStock?: [number, number][];
  monthlyVisits?: [number, number][];
  activeVisits?: ActiveVisit[];
  dailyActivities?: ActivityEntry[];
  visitsAt?: number;
  scares?: { id: number; until: number }[];
  tasksRest?: [string, number][];
  nextPersonId?: number;
  relationships?: Relationship[];
  life?: LifeSave;
  /** The policies that are on, and the challenge under way if there is one. */
  policies: string[];
  challenge?: Challenge;
  /** The decision waiting for an answer, and what the last answers still do to demand. */
  dilemma?: Dilemma;
  boosts: Boost[];
  /** The price level: 1 on the city's first day (see Prices.ts). Saves from before there was one load at 1. */
  level: number;
  /** The city's look. Saves from before there was a choice load as the first. */
  theme: Theme;
}

function parseStock(value: unknown, limit: number): [number, number][] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAP_SIZE ** 2 || !value.every(entry =>
    Array.isArray(entry) && entry.length === 2 && isCount(entry[0]) && entry[0] < MAP_SIZE ** 2 &&
    isCount(entry[1]) && entry[1] <= limit)) throw new Error('存檔資料損壞。');
  return value;
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

function parseSpans(value: unknown): number[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || !value.every(id => isCount(id) && id < MAP_SIZE ** 2)) throw new Error('存檔資料損壞。');
  return [...new Set(value as number[])].sort((a, b) => a - b);
}

function parseDilemma({ dilemma, boosts }: Record<string, unknown>): { dilemma?: Dilemma; boosts: Boost[] } {
  const list = boosts === undefined ? [] : boosts;
  if (!Array.isArray(list) || list.length > 16 ||
      !list.every(boost => Number.isFinite(boost?.amount) && isCount(boost?.until))) throw new Error('存檔資料損壞。');
  const kept = list.map(({ amount, until }) => ({ amount, until }));
  if (dilemma === undefined) return { boosts: kept };
  const { id, until } = (dilemma ?? {}) as Record<string, unknown>;
  if (!dilemmas.list.some(entry => entry.id === id) || !isCount(until)) throw new Error('存檔資料損壞。');
  return { dilemma: { id: id as Dilemma['id'], until }, boosts: kept };
}

function parseLevel(value: unknown): number {
  if (value === undefined) return 1;
  if (typeof value !== 'number' || !(value > 0.1 && value < 100)) throw new Error('存檔資料損壞。');
  return value;
}

function parseChallenge(value: unknown): { challenge?: Challenge } {
  if (value === undefined) return {};
  const { id, target, until } = (value ?? {}) as Record<string, unknown>;
  if (!challenges.list.some(entry => entry.id === id) || !isCount(target) || !isCount(until)) throw new Error('存檔資料損壞。');
  return { challenge: { id: id as Challenge['id'], target, until } };
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
    if (!isCount(capacity) || capacity === 0 || !isCount(occupants) || (zone !== 'residential' && occupants > capacity) || occupants > 10000 ||
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
    const brand = schemaVersion === 1 ? undefined : entry.brand;
    if (brand !== undefined) {
      if (!Object.hasOwn(brands, brand) || zone !== 'commercial') throw new Error('存檔資料損壞。');
      record.brand = brand;
    }
    const people = schemaVersion === 1 ? undefined : entry.people;
    if (people !== undefined && zone === 'residential') {
      const nextSlot = entry.nextSlot;
      const slots = new Set<number>();
      if (!Array.isArray(people) || people.length !== occupants || !isCount(nextSlot)) throw new Error('存檔資料損壞。');
      record.people = people.map(person => {
        const { slot, job, came, hired, money, car, identity, graceUntil } = (person ?? {}) as Record<string, unknown>;
        if (!isCount(slot) || slot >= nextSlot || slots.has(slot) || !(job === -1 || isCount(job)) ||
            !isCount(came) || !isCount(hired) || !(money === undefined || isCount(money)) ||
            !(car === undefined || (isCount(car) && car < vehicles.length))) throw new Error('存檔資料損壞。');
        if (graceUntil !== undefined && !isCount(graceUntil)) throw new Error('存檔資料損壞。');
        slots.add(slot);
        return { slot, job: job as number, came, hired, identity: parseIdentity(identity), ...(graceUntil !== undefined ? { graceUntil: graceUntil as number } : {}), ...(money ? { money } : {}), ...(car ? { car } : {}) };
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
  const identities = records.flatMap(building => building.people?.flatMap(person => person.identity ? [person.identity.id] : []) ?? []);
  const life = parseLife((data as Record<string, unknown>).life, tick);
  const allIds = [...identities, ...(life?.children.map(child => child.identity.id) ?? [])];
  if (new Set(allIds).size !== allIds.length) throw new Error('存檔資料損壞。');
  const nextPersonId = (data as Record<string, unknown>).nextPersonId ?? 0;
  if (!isCount(nextPersonId) || new Set(identities).size !== identities.length) throw new Error('存檔資料損壞。');
  const relations = (data as Record<string, unknown>).relationships ?? [];
  const identityIds = new Set(identities);
  const relationKeys = new Set<string>();
  const degree = new Map<number, number>();
  if (!Array.isArray(relations) || relations.length > identities.length * 12) throw new Error('存檔資料損壞。');
  const relationships: Relationship[] = relations.map(edge => {
    if (!edge || !identityIds.has(edge.a) || !identityIds.has(edge.b) || edge.a >= edge.b ||
        !isCount(edge.familiarity) || edge.familiarity > 100 || !isCount(edge.lastDay) ||
        edge.lastDay > Math.floor(tick / 8)) throw new Error('存檔資料損壞。');
    const key = `${edge.a}:${edge.b}`;
    if (relationKeys.has(key)) throw new Error('存檔資料損壞。');
    relationKeys.add(key);
    for (const id of [edge.a, edge.b]) {
      const count = (degree.get(id) ?? 0) + 1;
      if (count > 24) throw new Error('存檔資料損壞。');
      degree.set(id, count);
    }
    return { a: edge.a, b: edge.b, familiarity: edge.familiarity, lastDay: edge.lastDay };
  });
  const freightRuntime = parseFreightRuntime((data as Record<string, unknown>).freightRuntime);
  const visitsAt = (data as Record<string, unknown>).visitsAt ?? tick;
  if (typeof visitsAt !== 'number' || !Number.isFinite(visitsAt) || visitsAt < tick || visitsAt > tick + 1) throw new Error('存檔資料損壞。');
  const liveVisitTime = Math.max(visitsAt, Math.min(tick + 1,
    freightRuntime ? tick + ((freightRuntime.time + (freightRuntime.pending ?? 0)) % 1000) / 1000 : tick));
  if (freightRuntime) {
    const reserved = new Map(freightRuntime.stocks);
    for (const vehicle of freightRuntime.vehicles) for (const cargo of vehicle.cargo) {
      if (TILES[layout[cargo.to]] === 'warehouse') reserved.set(cargo.to, (reserved.get(cargo.to) ?? 0) + cargo.amount);
      if (TILES[layout[vehicle.route.from]] === 'warehouse') reserved.set(vehicle.route.from, (reserved.get(vehicle.route.from) ?? 0) + cargo.amount);
    }
    for (const [id, amount] of reserved) if (TILES[layout[id]] === 'warehouse' && amount > WAREHOUSE_CAPACITY + 1e-6) throw new Error('存檔倉庫容量損壞。');
  }
  return { schemaVersion: SCHEMA_VERSION, seed: seed as number, tick, tiles: layout, zones, buildings: records,
    freightRuntime,
    ...parseFreightLines((data as Record<string, unknown>).freightMode, (data as Record<string, unknown>).freightLines),
    ownedLand: parseLand((data as Record<string, unknown>).ownedLand),
    funds: funds as number, rank, taxRate, metros: [...metros].sort((a, b) => a - b),
    spans: parseSpans((data as Record<string, unknown>).spans),
    lines: parseLines((data as Record<string, unknown>).lines, tiles, metros),
    goals: parseList((data as Record<string, unknown>).goals, value => typeof value === 'string') as string[],
    loans: parseList((data as Record<string, unknown>).loans, isCount) as number[],
    tasks: parseList((data as Record<string, unknown>).tasks, value => typeof value === 'string') as string[],
    combos: parseList((data as Record<string, unknown>).combos, value => typeof value === 'string') as string[],
    nextPersonId, relationships, life,
    visitsAt,
    dailyActivities: parseDiary((data as Record<string, unknown>).dailyActivities, visitsAt, isVisitDoing),
    activeVisits: parseVisits((data as Record<string, unknown>).activeVisits, liveVisitTime),
    scares: parseScares((data as Record<string, unknown>).scares),
    tasksRest: parseCooldowns((data as Record<string, unknown>).tasksRest, taskList.map(task => task.id)),
    monthlyVisits: parseStock((data as Record<string, unknown>).monthlyVisits, Number.MAX_SAFE_INTEGER),
    coldStock: parseStock((data as Record<string, unknown>).coldStock, combos.coldchain.capacity),
    marketStock: parseStock((data as Record<string, unknown>).marketStock, combos.coldchain.marketPerDay * combos.coldchain.batchDays),
    policies: parseList((data as Record<string, unknown>).policies, value => typeof value === 'string') as string[],
    ...parseChallenge((data as Record<string, unknown>).challenge),
    ...parseDilemma(data as Record<string, unknown>), level: parseLevel((data as Record<string, unknown>).level),
    theme: THEMES.find(theme => theme === (data as Record<string, unknown>).theme) ?? 'classic' };
}
