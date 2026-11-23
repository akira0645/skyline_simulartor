import { calendar } from '../simulation/calendar';
import { economy } from '../simulation/Economy';
import type { SimulationEngine } from '../simulation/SimulationEngine';
import { isFacility, MAP_SIZE, type Cell, type Facility, type Service, type Zone } from '../simulation/TileMap';

/** The western plant and tower, which the demo's outage buttons switch off and on. */
export const powerPlant = { x: 3, y: 9 };
export const waterTower = { x: 4, y: 9 };
/** The avenue tile that is the only way into the industrial estate. */
export const works = { x: 14, y: 5 };

const block = (fromX: number, toX: number, fromY: number, toY: number): Cell[] => {
  const cells: Cell[] = [];
  for (let y = fromY; y <= toY; y++) for (let x = fromX; x <= toX; x++) cells.push({ x, y });
  return cells;
};

/** The avenue's bridge, and the start of the unfinished district on the far bank. */
export const bridge = { x: 22, y: 5 };
export const eastBank = { x: 27, y: 5 };
/** How long the town has been lived in when the player takes over. */
const HISTORY = 4 * calendar.daysPerMonth * calendar.ticksPerDay;

/** The three ready-made cities, and what each opens with. */
export type DemoSize = 'small' | 'medium' | 'large';
const YEAR = 12 * calendar.daysPerMonth * calendar.ticksPerDay;
export const demoSizes: Record<DemoSize, { years: number; rank: number; funds: number; fresh: Cell }> = {
  small: { years: 0, rank: 2, funds: economy.startingFunds, fresh: eastBank },
  medium: { years: 3, rank: 3, funds: 30000, fresh: { x: 49, y: 5 } },
  large: { years: 8, rank: 4, funds: 80000, fresh: { x: 8, y: 41 } },
};

type City = SimulationEngine['city'];
type Fitting = readonly [Facility | Service | 'park' | 'bus', number, number];

/**
 * A district: a street every third row from `top` with two rows of lots between, one zone to
 * each pair of rows, and a street down each side. Returns its lots.
 */
function district(city: City, left: number, right: number, top: number, bands: readonly Zone[]): Cell[] {
  const bottom = top + 3 * bands.length;
  for (let y = top; y <= bottom; y += 3) city.execute({ type: 'BUILD_ROAD', path: block(left, right, y, y) });
  for (const x of [left, right]) city.execute({ type: 'BUILD_ROAD', path: block(x, x, top, bottom) });
  return bands.flatMap((zone, band) => {
    const tiles = block(left + 1, right - 1, top + 3 * band + 1, top + 3 * band + 2);
    city.execute({ type: 'SET_ZONE', tiles, zone });
    return tiles;
  });
}

/** Puts plants, towers, services, parks and bus stops on tiles, each beside a street. */
function fit(city: City, fittings: readonly Fitting[]) {
  for (const [what, x, y] of fittings) {
    const done = what === 'park' ? city.execute({ type: 'BUILD_PARK', tiles: [{ x, y }] }) :
      what === 'bus' ? city.execute({ type: 'BUILD_BUS_STOP', x, y }) :
      isFacility(what) ? city.execute({ type: 'BUILD_FACILITY', x, y, facility: what }) :
      city.execute({ type: 'BUILD_SERVICE', x, y, service: what });
    if (done.error) throw new Error(`${what} at ${x},${y}: ${done.error}`);
  }
}

function line(city: City, kind: 'bus' | 'metro', stops: readonly (readonly [number, number])[], vehicles: number) {
  const id = city.addLine(kind).id!;
  for (const [x, y] of stops) {
    if (kind === 'metro') city.execute({ type: 'BUILD_METRO', x, y });
    city.toggleStop(id, { x, y });
  }
  city.setVehicles(id, vehicles);
}

/** The river every ready-made city has: top to bottom, three tiles wide, a little east of the first factories. */
function river(city: City, size: DemoSize) {
  const water: Cell[] = [];
  for (let y = 0; y < MAP_SIZE; y++) {
    const west = 21 + Math.round(1.4 * Math.sin(y / 5));
    water.push({ x: west, y }, { x: west + 1, y }, { x: west + 2, y });
    // New York: a second river further east, so the east bank is an island between the two.
    if (size === 'medium') water.push({ x: 40, y }, { x: 41, y }, { x: 42, y });
  }
  // San Francisco: the bay along the whole south side, nine tiles across.
  if (size === 'large') for (const cell of block(0, MAP_SIZE - 1, 28, 36)) water.push(cell);
  // California: an ocean frontage south of town, with a beach between the ocean and boulevard.
  if (size === 'small') {
    for (let x = 0; x < MAP_SIZE; x++) {
      const shore = 15 + Math.round(1.5 * Math.sin(x / 6));
      water.push(...block(x, x, shore, MAP_SIZE - 1));
    }
  }
  city.map.flood(water);
}

/**
 * The old town on the west bank, which all three sizes share: homes north of an avenue with a
 * park strip behind them, shops to the south, and factories out east behind a row of parks,
 * reached only by the avenue, which runs on east to `avenueEnd`. Returns its lots.
 */
function oldTown(city: City, avenueEnd: number): Cell[] {
  city.execute({ type: 'BUILD_ROAD', path: block(1, avenueEnd, 5, 5), road: 'avenue' });
  city.execute({ type: 'BUILD_ROAD', path: block(1, 13, 2, 2) });
  // The south street runs on east past the plants and stations, but not up to the factories.
  city.execute({ type: 'BUILD_ROAD', path: block(1, 18, 8, 8) });
  for (const x of [6, 13]) city.execute({ type: 'BUILD_ROAD', path: block(x, x, 2, 8) });
  const homes = [...block(1, 5, 3, 4), ...block(7, 12, 3, 4)];
  const shops = [...block(1, 5, 6, 7), ...block(7, 12, 6, 7)];
  const factories = [...block(15, 18, 4, 4), ...block(15, 18, 6, 6)];
  city.execute({ type: 'SET_ZONE', tiles: homes, zone: 'residential' });
  city.execute({ type: 'SET_ZONE', tiles: shops, zone: 'commercial' });
  city.execute({ type: 'SET_ZONE', tiles: factories, zone: 'industrial' });
  // The small park behind the temple, with the market down the street, makes a temple fair of it.
  city.execute({ type: 'BUILD_PARK', tiles: [...block(1, 12, 1, 1).filter(({ x }) => ![2, 4, 7, 8, 10, 11].includes(x)),
    { x: 14, y: 4 }, { x: 14, y: 6 }, { x: 12, y: 10 }] });
  fit(city, [
    ['power', powerPlant.x, powerPlant.y], ['water', waterTower.x, waterTower.y], ['power', 15, 9], ['water', 14, 9],
    // Fire and police cover for both halves.
    ['fire', 6, 9], ['police', 7, 9], ['fire', 16, 9], ['police', 17, 9],
    // The schools and the clinic take three plots of the park strip, facing the north street.
    ['school', 4, 1], ['school', 10, 1], ['clinic', 7, 1],
    // A bakery, a florist and a cake shop among them, a short walk from every home.
    ['bakery', 2, 1], ['florist', 8, 1], ['cakeshop', 11, 1],
    // A market, a high school, a temple and a cinema with its car park on the south street.
    ['cityhall', 1, 7], ['bank', 2, 7], ['market', 9, 9], ['highschool', 11, 9], ['temple', 12, 9], ['cinema', 13, 9], ['parking', 10, 9],
  ]);
  // A metro line from behind the homes to the factories: under the north street and the avenue.
  line(city, 'metro', [[3, 2], [10, 2], [16, 5]], 2);
  return [...homes, ...shops, ...factories];
}

/**
 * A city for the player to take over, in one of three sizes. All three have the same old town
 * west of a river, and end in a district that has only just been laid out (`demoSizes[size].fresh`
 * is on its avenue): streets and lots, but no power, water or services, which is the first
 * thing to put right.
 *
 * - small: the old town alone, and the new district just over the bridge. It grows by itself
 *   for four months before it is handed over.
 * - small, in California's colours: the old town alone, and the new district just over the bridge.
 * - medium, laid out like New York: more homes and shops to the south, a factory estate beside
 *   them, and a finished district on an island between two rivers with a Central Park in it; the
 *   new district is over the east river.
 * - large, laid out like San Francisco: all of that twice as deep, a second district further east
 *   with a university, a mall, a casino and a large factory estate, a Golden Gate Park among the
 *   western homes, a cable car line, and the bay along the south with the new district across it
 *   at the end of a long red bridge.
 *
 * The two larger ones are too big to grow in a moment, so their buildings are put up at once
 * (`BuildingSystem.found`) in a year well after the first, and then lived in for two months. Each
 * opens with the goals it met by itself already ticked off, without the rewards. A demo lays
 * out its own water, so call it on a map without any.
 */
export function demoCity(engine: SimulationEngine, size: DemoSize = 'small') {
  const city = engine.city;
  const { years, rank, funds } = demoSizes[size];
  river(city, size);
  // The city is laid out with money to spare, then handed over with its opening balance. It
  // starts at the rank a city of its size has reached, which is what lets it have its buildings.
  // Each size wears another city's colours, so the three do not look alike.
  engine.load({ ...engine.save(), tick: years * YEAR, visitsAt: years * YEAR, freightRuntime: undefined, funds: 10_000_000, rank,
    theme: size === 'small' ? 'california' : size === 'medium' ? 'newyork' : 'sf' });
  if (size === 'small') {
    oldTown(city, 32);
    city.execute({ type: 'BUILD_ROAD', path: block(18, 18, 9, 11) });
    city.execute({ type: 'BUILD_ROAD', path: block(2, 18, 11, 11), road: 'avenue' });
    // The far bank: a cross street and lots for homes and shops, and nothing else yet.
    city.execute({ type: 'BUILD_ROAD', path: block(28, 28, 2, 8) });
    city.execute({ type: 'SET_ZONE', tiles: [...block(26, 27, 4, 4), ...block(29, 32, 4, 4), ...block(29, 31, 3, 3)],
      zone: 'residential' });
    city.execute({ type: 'SET_ZONE', tiles: [...block(26, 27, 6, 6), ...block(29, 32, 6, 6)], zone: 'commercial' });
    fit(city, [['library', 2, 12], ['park', 3, 10], ['culture', 7, 10], ['market', 8, 10],
      ['coldstore', 9, 10], ['square', 13, 10], ['daycare', 6, 10],
      ['recycling', 17, 10], ['workshop', 17, 12]]);
    fit(city, [['bus', 1, 3], ['bus', 4, 12]]);
    line(city, 'bus', [[4, 12], [1, 3]], 2);
    city.execute({ type: 'BUILD_FARM', tiles: [...block(6, 10, 12, 12), { x: 10, y: 10 }] });
    const communityHomes = [{ x: 2, y: 10 }, { x: 3, y: 12 }, { x: 4, y: 10 }, { x: 5, y: 10 }, { x: 11, y: 12 }, { x: 13, y: 12 }, { x: 15, y: 10 }];
    const communityShops = [{ x: 1, y: 1 }, { x: 3, y: 1 }, { x: 12, y: 12 }, { x: 14, y: 12 }];
    city.execute({ type: 'SET_ZONE', tiles: communityHomes, zone: 'residential' });
    city.execute({ type: 'SET_ZONE', tiles: communityShops, zone: 'commercial' });
    city.execute({ type: 'SET_ZONE', tiles: [{ x: 16, y: 12 }], zone: 'industrial' });
    const id = ({ x, y }: Cell) => y * MAP_SIZE + x;
    const homes = [{ x: 1, y: 4 }, { x: 2, y: 4 }, { x: 8, y: 4 }, { x: 10, y: 4 }];
    const shops = [{ x: 2, y: 6 }, { x: 8, y: 6 }];
    const factories = [{ x: 15, y: 4 }, { x: 16, y: 6 }, { x: 16, y: 12 }];
    engine.load({ ...engine.save(), buildings: [
      ...[...homes, ...communityHomes].map(home => ({ id: id(home), capacity: 4, occupants: 4, level: 1 })),
      ...[...shops, ...communityShops].map(shop => ({ id: id(shop), capacity: 3, occupants: 0, level: 1 })),
      ...factories.map(factory => ({ id: id(factory), capacity: 5, occupants: 0, level: 1 })),
    ] });
    engine.advance(HISTORY);
    engine.load({ ...engine.save(), funds });
    return;
  }

  const large = size === 'large';
  const R = 'residential', C = 'commercial', I = 'industrial';
  const lots = oldTown(city, large ? 50 : 54);
  // Three streets lead south from the old town's south street, between its stations.
  for (const x of [1, 8, 18]) city.execute({ type: 'BUILD_ROAD', path: block(x, x, 9, 11) });
  // South of the old town: homes with shops among them, and a factory estate towards the river.
  lots.push(...district(city, 1, 13, 11, large ? [R, R, C, R, R] : [R, R, C]));
  lots.push(...district(city, 13, 19, 11, large ? [I, I, I, I, I] : [I, I, I]));
  // The east bank, along the avenue from the bridge.
  lots.push(...district(city, 26, 38, 2, large ? [R, C, R, R, C, R, R] : [R, C, R]));
  fit(city, [
    // South homes: a park, a school, and in the shopping rows a high school and a hospital.
    ...block(5, 7, 12, 13).map(({ x, y }) => ['park', x, y] as const),
    ['school', 7, 15], ['temple', 2, 16], ['power', 12, 15], ['water', 12, 16],
    ['highschool', 6, 18], ['hospital', 10, 18], ['power', 3, 19], ['water', 4, 19], ['police', 7, 19], ['fire', 8, 19],
    // The factory estate.
    ['power', 16, 18], ['water', 16, 19], ['fire', 14, 18], ['police', 14, 19],
    // The east bank's shopping rows, with a museum at the far end.
    ['police', 32, 6], ['fire', 33, 6], ['museum', 36, 6], ['power', 27, 7], ['water', 28, 7], ['power', 30, 7],
    ['water', 31, 7], ['clinic', 32, 7], ['school', 33, 7], ['highschool', 34, 7], ['market', 35, 7],
    // New York's has a Central Park: big enough to be a forest, with homes all round it.
    ...block(large ? 31 : 29, large ? 33 : 35, 9, 10).map(({ x, y }) => ['park', x, y] as const),
  ]);
  line(city, 'metro', [[7, 14], [16, 14], [32, 8]], 2);
  if (large) {
    // A second district further east: shops and a university on the avenue, then homes and factories by turns.
    lots.push(...district(city, 38, 50, 2, [C, R, I, I, R, I, I]));
    fit(city, [
      // Golden Gate Park: a long strip of green in the western homes.
      ...block(2, 9, 21, 22).map(({ x, y }) => ['park', x, y] as const),
      ['school', 10, 22], ['bus', 5, 25], ['bus', 17, 25],
      ['power', 28, 15], ['water', 29, 15], ['hospital', 30, 15], ['police', 32, 15], ['fire', 33, 15], ['power', 35, 15],
      ['water', 36, 15], ['school', 32, 16], ['highschool', 33, 16], ['cinema', 34, 16], ['parking', 35, 16],
      ['mall', 39, 3], ['parking', 41, 4], ['power', 42, 4], ['water', 43, 4], ['police', 43, 3], ['fire', 44, 3],
      ['school', 44, 4], ['clinic', 45, 4], ['highschool', 46, 4], ['university', 47, 3], ['power', 46, 10], ['water', 47, 10],
      ...block(43, 45, 6, 7).map(({ x, y }) => ['park', x, y] as const),
      ['casino', 39, 12], ['school', 44, 15], ['power', 42, 19], ['water', 43, 19], ['police', 44, 18], ['fire', 45, 18],
      ['power', 46, 19], ['water', 47, 19],
    ]);
    // Two more ways over the river, and avenues where the districts meet.
    for (const y of [14, 20]) city.execute({ type: 'BUILD_ROAD', path: block(1, 50, y, y), road: 'avenue' });
    for (const [x, from, to] of [[13, 11, 26], [26, 2, 23], [38, 2, 23]]) {
      city.execute({ type: 'BUILD_ROAD', path: block(x, x, from, to), road: 'avenue' });
    }
    line(city, 'metro', [[32, 14], [44, 14], [44, 20]], 3);
    line(city, 'metro', [[7, 20], [16, 20], [32, 20]], 3);
    line(city, 'bus', [[5, 25], [17, 25]], 2);
  }
  // The new district: streets and lots, and nothing else yet. New York's is over the east
  // river at the end of the avenue; San Francisco's is across the bay, at the far end of a long
  // red bridge from the western avenue.
  const { fresh } = demoSizes[size];
  if (large) {
    city.execute({ type: 'BUILD_ROAD', path: block(13, 13, 26, 38), road: 'avenue' });
    district(city, fresh.x - 5, fresh.x + 5, fresh.y - 3, [R, C]);
    city.execute({ type: 'BUILD_ROAD', path: block(fresh.x - 5, fresh.x + 5, fresh.y, fresh.y), road: 'avenue' });
  } else {
    district(city, fresh.x - 5, fresh.x + 5, 2, [R, C]);
  }
  city.found(lots);
  engine.advance(2 * calendar.daysPerMonth * calendar.ticksPerDay);
  engine.load({ ...engine.save(), funds });
}
