import { calendar } from './calendar';
import { economy, milestones, tileCost } from './Economy';
import { landValue, MAX_LEVEL } from './LandValue';
import { pollution } from './Pollution';
import { RoadGraph } from './RoadGraph';
import type { SaveData, SavedBuilding } from './SaveData';
import { isFacility, isRoad, isZone, MAP_SIZE, type Cell, type Facility, type GameCommand,
  type Road, type TileMap, type Zone } from './TileMap';
import { congestion, tileMinutes, traffic } from './Traffic';
import { utilities } from './Utilities';
import { buildChance, growth, zoneDemand, type Demand } from './ZoneDemandSystem';

const neighbors = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const indexOf = ({ x, y }: Cell) => y * MAP_SIZE + x;
const cellAt = (id: number): Cell => ({ x: id % MAP_SIZE, y: Math.floor(id / MAP_SIZE) });
const zoneOrder: readonly Zone[] = ['residential', 'commercial', 'industrial'];
const facilityKinds: readonly Facility[] = ['power', 'water'];
/** A home takes no newcomers while it has this many residents without a job, and loses residents above it. */
const JOB_SEEKERS = 1;

export interface Commute {
  homeId: number;
  workId: number;
  workers: number;
  /** Road tiles from the home's road to the workplace's road. */
  path: readonly Cell[];
  /** Travel time over the path with everyone on the road. */
  minutes: number;
}

/** What holds a building back, most pressing first. */
export type Issue = 'no-road' | 'no-power' | 'no-water' | 'no-jobs' | 'long-commute' | 'pollution' |
  'vacancies';
export const ISSUES: readonly Issue[] =
  ['no-road', 'no-power', 'no-water', 'no-jobs', 'long-commute', 'pollution', 'vacancies'];

/** A deterministic 32-bit roll from the city seed, the tick and a salt. */
function roll(seed: number, tick: number, salt: number): number {
  let hash = Math.imul(seed ^ Math.imul(tick, 0x9e3779b1) ^ Math.imul(salt + 1, 0x85ebca6b), 0xc2b2ae35);
  hash = Math.imul(hash ^ (hash >>> 15), 0x27d4eb2f);
  return (hash ^ (hash >>> 13)) >>> 0;
}

export class BuildingSystem {
  private readonly zones = new Map<number, Cell>();
  private readonly buildings = new Map<number, SavedBuilding>();
  private readonly facilities = new Map<number, Facility>();
  private funds = economy.startingFunds;
  /** How many milestones the city has been paid for. */
  private rank = 0;

  // Everything below is derived from the tiles and buildings, so none of it is saved.
  private readonly served: Record<Facility, Set<number>> = { power: new Set(), water: new Set() };
  /** Buildings each facility serves, by facility tile. */
  private readonly loads = new Map<number, number>();
  private readonly commutes: Commute[] = [];
  /** Commuters crossing each road tile. */
  private readonly flows = new Float32Array(MAP_SIZE ** 2);
  /** Residents with a job and their average commute, by home. */
  private readonly employed = new Map<number, number>();
  private readonly commuteMinutes = new Map<number, number>();
  /** Pollution per tile, 0 to 100. */
  private readonly smog = new Float32Array(MAP_SIZE ** 2);
  /** What nearby parks add to land value, per tile. */
  private readonly green = new Float32Array(MAP_SIZE ** 2);
  readonly roadGraph: RoadGraph;

  constructor(readonly map: TileMap) {
    this.roadGraph = new RoadGraph(map);
  }

  getCommutes(): readonly Commute[] {
    return this.commutes;
  }

  hasBuilding(cell: Cell): boolean {
    return this.getBuilding(cell) !== undefined;
  }

  private roadAccess({ x, y }: Cell): Cell | undefined {
    for (const [dx, dy] of neighbors) {
      const road = { x: x + dx, y: y + dy };
      if (isRoad(this.map.get(road))) return road;
    }
  }

  hasRoadAccess(cell: Cell): boolean {
    return this.roadAccess(cell) !== undefined;
  }

  /** Whether the building on a cell has power or water. False where there is no building. */
  isServed(cell: Cell, facility: Facility): boolean {
    return this.served[facility].has(indexOf(cell));
  }

  /** A road tile's flow as a share of its capacity; 0 off the roads. */
  congestionAt(cell: Cell): number {
    const tile = this.map.get(cell);
    return isRoad(tile) ? congestion(this.flows[indexOf(cell)], tile) : 0;
  }

  /** Pollution on a tile, 0 to 100; 0 off the map. */
  pollutionAt(cell: Cell): number {
    return this.map.get(cell) === undefined ? 0 : this.smog[indexOf(cell)];
  }

  /** Land value of a zoned tile, 0 to 100; 0 anywhere else. */
  landValueAt(cell: Cell): number {
    return isZone(this.map.get(cell)) ? this.valueOf(indexOf(cell)) : 0;
  }

  private valueOf(id: number): number {
    const zone = this.map.at(id);
    let value = landValue.base + this.green[id];
    if (this.served.power.has(id) && this.served.water.has(id)) value += landValue.utilities;
    if (zone !== 'industrial') value -= landValue.pollution * this.smog[id];
    if (zone === 'residential') {
      value -= Math.min(landValue.commute.max,
        landValue.commute.perMinute * (this.commuteMinutes.get(id) ?? 0));
    }
    return Math.max(0, Math.min(100, value));
  }

  /** Minutes to cross a road tile with the traffic now on it. */
  private readonly minutesAt = (id: number) => tileMinutes(this.flows[id], this.map.at(id) as Road);

  /** Whether a home accepts another resident: room, nobody waiting for work, a bearable commute. */
  private takesNewcomers(id: number, building: SavedBuilding): boolean {
    return building.occupants < this.capacityOf(building) &&
      building.occupants - (this.employed.get(id) ?? 0) < JOB_SEEKERS &&
      (this.commuteMinutes.get(id) ?? 0) <= traffic.longCommute &&
      this.smog[id] <= pollution.limit;
  }

  /** What holds the building on a zoned tile back. */
  private issuesOf(id: number, building: SavedBuilding): Issue[] {
    const cell = this.zones.get(id)!;
    const home = this.map.at(id) === 'residential';
    const roadAccess = this.hasRoadAccess(cell);
    const issues: Issue[] = [];
    if (!roadAccess) issues.push('no-road');
    if (!this.served.power.has(id)) issues.push('no-power');
    if (!this.served.water.has(id)) issues.push('no-water');
    if (home) {
      if ((this.employed.get(id) ?? 0) < building.occupants) issues.push('no-jobs');
      if ((this.commuteMinutes.get(id) ?? 0) > traffic.longCommute) issues.push('long-commute');
      if (this.smog[id] > pollution.limit) issues.push('pollution');
    } else if (roadAccess && building.occupants < this.capacityOf(building)) issues.push('vacancies');
    return issues;
  }

  /** What a building can hold right now: all of its capacity only with both power and water. */
  private capacityOf({ id, capacity }: SavedBuilding): number {
    return this.served.power.has(id) && this.served.water.has(id) ? capacity :
      Math.ceil(capacity * utilities.unservedShare);
  }

  getBuilding(cell: Cell) {
    const zone = this.map.get(cell);
    if (!isZone(zone)) return undefined;
    const record = this.buildings.get(indexOf(cell));
    if (!record) return undefined;
    return { ...record, ...cell, zone, road: this.roadAccess(cell) };
  }

  inspect(cell: Cell) {
    const tile = this.map.get(cell);
    if (!tile) return undefined;
    const id = indexOf(cell);
    if (tile === 'grass' || tile === 'park') return { tile, pollution: Math.round(this.smog[id]) };
    if (isRoad(tile)) {
      return { tile, flow: Math.round(this.flows[id]), congestion: this.congestionAt(cell),
        roadCapacity: tile === 'avenue' ? traffic.avenue.capacity : traffic.capacity };
    }
    if (isFacility(tile)) {
      return { tile, serving: this.loads.get(id) ?? 0, capacity: utilities.capacity[tile] };
    }

    const roadAccess = this.hasRoadAccess(cell);
    const record = this.getBuilding(cell);
    const value = Math.round(this.valueOf(id));
    if (!record) return { tile, building: false as const, roadAccess, pollution: Math.round(this.smog[id]), value };
    const power = this.served.power.has(id);
    const water = this.served.water.has(id);
    const capacity = this.capacityOf(record);
    const home = tile === 'residential';
    const employed = home ? this.employed.get(id) ?? 0 : record.occupants;
    const issues = this.issuesOf(id, record);
    return { tile, building: true as const, roadAccess, capacity, occupants: record.occupants,
      level: record.level, power, water, employed,
      commute: home ? this.commuteMinutes.get(id) : undefined, issues,
      pollution: Math.round(this.smog[id]), value,
      /** The land value the next level needs; undefined at the top level. */
      nextLevel: landValue.upgrade[record.level - 1] as number | undefined };
  }

  /** Runs a command if the city can pay for it. `cost` is what was charged. */
  execute(command: GameCommand): { changed: Cell[]; error?: string; cost: number } {
    let cost = 0;
    const result = { ...this.map.execute(command, (changed, tile) => {
      const price = changed.length * tileCost(tile);
      if (price > this.funds) return `資金不足：需要 $${price}，目前 $${Math.floor(this.funds)}。`;
      cost = price;
    }), cost };
    this.funds -= cost;
    for (const cell of result.changed) {
      const id = indexOf(cell);
      const tile = this.map.get(cell);
      this.buildings.delete(id);
      if (isZone(tile)) this.zones.set(id, cell);
      else this.zones.delete(id);
      if (isFacility(tile)) this.facilities.set(id, tile);
      else this.facilities.delete(id);
    }
    if (result.changed.length) this.refresh();
    return result;
  }

  /**
   * A growth step: residents move, then each zone type may get one building. Nothing changes
   * between steps, so what is derived from the city is always up to date, also after loading.
   */
  grow(tick: number, seed: number): void {
    if (tick % (calendar.ticksPerDay * calendar.daysPerMonth) === 0) this.funds += this.budget().net;
    if (tick % growth.interval !== 0) return;
    let changed = false;
    const daily = tick % calendar.ticksPerDay === 0;
    for (const [id, building] of this.buildings) {
      const cell = this.zones.get(id)!;
      if (this.map.get(cell) !== 'residential') continue;
      const capacity = this.capacityOf(building);
      const jobless = building.occupants - (this.employed.get(id) ?? 0);
      if (building.occupants > capacity || jobless > JOB_SEEKERS) {
        // Leaving is slower than arriving: once a day.
        if (!daily) continue;
        building.occupants--;
      } else if (this.takesNewcomers(id, building) && this.hasRoadAccess(cell)) {
        building.occupants++;
      } else continue;
      changed = true;
    }

    // A full building on good enough land grows a level and holds more.
    for (const [id, building] of this.buildings) {
      if (building.level >= MAX_LEVEL || building.occupants < this.capacityOf(building) ||
          this.valueOf(id) < landValue.upgrade[building.level - 1] ||
          roll(seed, tick, id + 16) / 2 ** 32 >= landValue.chance) continue;
      const larger = landValue.capacity[this.map.at(id) as Zone][building.level++];
      building.capacity = Math.max(building.capacity, larger);
      changed = true;
    }

    const demand = this.getDemand();
    const lots: Record<Zone, { id: number; road: number }[]> =
      { residential: [], commercial: [], industrial: [] };
    for (const [id, cell] of this.zones) {
      if (this.buildings.has(id)) continue;
      const road = this.roadAccess(cell);
      if (road) lots[this.map.get(cell) as Zone].push({ id, road: indexOf(road) });
    }
    zoneOrder.forEach((zone, index) => {
      const open = lots[zone];
      if (!open.length || roll(seed, tick, index) / 2 ** 32 >= buildChance(demand[zone])) return;
      // Build where it is of use: homes in reach of vacancies, workplaces in reach of people
      // who want work. Without that a large zoned area fills with buildings too far apart.
      const useful = this.reachOf(zone === 'residential' ? 'vacancies' : 'workers');
      const near = open.filter(lot => useful.has(lot.road));
      // Nobody builds a home in smog while there is a clean lot.
      const clean = zone !== 'residential' ? [] :
        (near.length ? near : open).filter(lot => this.smog[lot.id] <= pollution.limit);
      const candidates = clean.length ? clean : near.length ? near : open;
      // Seed and tick are saved, so a loaded city picks the same next lot.
      const { id } = candidates[roll(seed, tick, index + zoneOrder.length) % candidates.length];
      this.buildings.set(id, { id, capacity: growth.capacity[zone], occupants: 0, level: 1 });
      changed = true;
    });
    if (changed) this.refresh();

    const { population } = this.supply();
    while (this.rank < milestones.length && population >= milestones[this.rank].population) {
      this.funds += milestones[this.rank++].grant;
    }
  }

  /** The road tiles within a commute of a vacancy, or of a home with someone to fill one. */
  private reachOf(target: 'vacancies' | 'workers'): Set<number> {
    const sources: number[] = [];
    for (const [id, building] of this.buildings) {
      const cell = this.zones.get(id)!;
      const home = this.map.get(cell) === 'residential';
      if (home !== (target === 'workers')) continue;
      // A home counts while it has someone out of work or room for someone to move in.
      const wanted = home ? building.occupants > (this.employed.get(id) ?? 0) ||
        building.occupants < this.capacityOf(building) : building.occupants < this.capacityOf(building);
      const road = wanted && this.roadAccess(cell);
      if (road) sources.push(indexOf(road));
    }
    const reach = new Set<number>();
    this.roadGraph.explore(sources, this.minutesAt, traffic.maxCommute, id => {
      reach.add(id);
      return false;
    });
    return reach;
  }

  /** Recomputes everything derived after tiles or the set of buildings changed. */
  private refresh(): void {
    this.connectUtilities();
    this.assignJobs();
    this.spreadPollution();
  }

  /**
   * Factories, power plants and busy roads pollute the tiles around them and parks clean them.
   * Each source fades in a straight line to nothing at its radius, and the effects add up.
   */
  private spreadPollution(): void {
    const { smog, green } = this;
    smog.fill(0);
    green.fill(0);
    const spread = (id: number, strength: number, radius: number, field = smog) => {
      const { x, y } = cellAt(id);
      for (let dy = -radius + 1; dy < radius; dy++) {
        const span = radius - 1 - Math.abs(dy);
        for (let dx = -span; dx <= span; dx++) {
          const cell = { x: x + dx, y: y + dy };
          if (this.map.get(cell) === undefined) continue;
          field[indexOf(cell)] += strength * (1 - (Math.abs(dx) + Math.abs(dy)) / radius);
        }
      }
    };
    const { industry, power, road, park } = pollution;
    for (const id of this.buildings.keys()) {
      if (this.map.at(id) === 'industrial') spread(id, industry.strength, industry.radius);
    }
    for (let id = 0; id < MAP_SIZE ** 2; id++) {
      const tile = this.map.at(id);
      if (tile === 'power') spread(id, power.strength, power.radius);
      else if (tile === 'park') {
        spread(id, -park.strength, park.radius);
        spread(id, landValue.park.strength, landValue.park.radius, green);
      }
      else if (isRoad(tile)) {
        const load = congestion(this.flows[id], tile);
        if (load > road.from) spread(id, road.strength * Math.min(load, 2), road.radius);
      }
    }
    for (let id = 0; id < smog.length; id++) {
      smog[id] = Math.max(0, Math.min(100, smog[id]));
      green[id] = Math.min(landValue.park.max, green[id]);
    }
  }

  /** Each facility, in tile order, serves the nearest buildings in reach that nothing serves yet. */
  private connectUtilities(): void {
    this.loads.clear();
    const { radius } = utilities;
    for (const kind of facilityKinds) {
      const served = this.served[kind];
      served.clear();
      const sites = [...this.facilities].filter(([, facility]) => facility === kind)
        .map(([id]) => id).sort((a, b) => a - b);
      for (const site of sites) {
        const { x, y } = cellAt(site);
        const inReach: { id: number; distance: number }[] = [];
        for (let dy = -radius; dy <= radius; dy++) {
          const span = radius - Math.abs(dy);
          for (let dx = -span; dx <= span; dx++) {
            const cell = { x: x + dx, y: y + dy };
            if (this.map.get(cell) === undefined) continue;
            const id = indexOf(cell);
            if (this.buildings.has(id) && !served.has(id)) {
              inReach.push({ id, distance: Math.abs(dx) + Math.abs(dy) });
            }
          }
        }
        inReach.sort((a, b) => a.distance - b.distance || a.id - b.id);
        const taken = inReach.slice(0, utilities.capacity[kind]);
        for (const { id } of taken) served.add(id);
        this.loads.set(site, taken.length);
      }
    }
  }

  /**
   * Matches residents to jobs and loads their commutes onto the roads, starting from empty
   * roads every time. Homes go in the order they were built; each takes the vacancies that are
   * quickest to reach given the traffic of the homes before it.
   */
  private assignJobs(): void {
    this.commutes.length = 0;
    this.flows.fill(0);
    this.employed.clear();
    this.commuteMinutes.clear();
    const homes: { building: SavedBuilding; road: Cell }[] = [];
    const jobsAt = new Map<number, SavedBuilding[]>();
    let vacancies = 0;

    for (const [id, building] of this.buildings) {
      const cell = this.zones.get(id)!;
      const road = this.roadAccess(cell);
      if (this.map.get(cell) === 'residential') {
        if (road && building.occupants > 0) homes.push({ building, road });
      } else {
        building.occupants = 0;
        if (!road) continue;
        const at = indexOf(road);
        const sharing = jobsAt.get(at);
        if (sharing) sharing.push(building);
        else jobsAt.set(at, [building]);
        vacancies += this.capacityOf(building);
      }
    }
    for (const sharing of jobsAt.values()) sharing.sort((a, b) => a.id - b.id);

    const { minutesAt } = this;
    for (const { building, road } of homes) {
      if (!vacancies) break;
      let remaining = building.occupants;
      const taken: { workId: number; workers: number; at: number }[] = [];
      this.roadGraph.explore(road, minutesAt, traffic.maxCommute, at => {
        for (const work of jobsAt.get(at) ?? []) {
          const workers = Math.min(remaining, this.capacityOf(work) - work.occupants);
          if (workers <= 0) continue;
          work.occupants += workers;
          remaining -= workers;
          taken.push({ workId: work.id, workers, at });
          if (!remaining) return true;
        }
        return false;
      });
      for (const { workId, workers, at } of taken) {
        const path = this.roadGraph.pathTo(at);
        for (const cell of path) this.flows[indexOf(cell)] += workers;
        this.commutes.push({ homeId: building.id, workId, workers, path, minutes: 0 });
      }
      vacancies -= building.occupants - remaining;
      this.employed.set(building.id, building.occupants - remaining);
    }

    // Times are read once everyone is on the road, so early homes feel later traffic too.
    for (const commute of this.commutes) {
      for (const cell of commute.path) commute.minutes += minutesAt(indexOf(cell));
      this.commuteMinutes.set(commute.homeId, (this.commuteMinutes.get(commute.homeId) ?? 0) +
        commute.minutes * commute.workers / this.employed.get(commute.homeId)!);
    }
  }

  save(): Omit<SaveData, 'schemaVersion' | 'seed' | 'tick'> {
    return { tiles: this.map.save(), zones: [...this.zones.keys()],
      buildings: [...this.buildings.values()].map(building => ({ ...building })),
      funds: this.funds, rank: this.rank };
  }

  load({ tiles, zones, buildings, funds, rank }: SaveData): void {
    this.funds = funds;
    this.rank = rank;
    this.map.load(tiles);
    this.zones.clear();
    this.buildings.clear();
    this.facilities.clear();
    for (const id of zones) this.zones.set(id, cellAt(id));
    for (const building of buildings) this.buildings.set(building.id, { ...building });
    for (let id = 0; id < MAP_SIZE ** 2; id++) {
      const tile = this.map.get(cellAt(id));
      if (isFacility(tile)) this.facilities.set(id, tile);
    }
    this.refresh();
  }

  private supply() {
    let population = 0;
    let housing = 0;
    let openings = 0;
    let employed = 0;
    const jobs = { commercial: 0, industrial: 0 };
    for (const [id, building] of this.buildings) {
      const zone = this.map.get(this.zones.get(id)!) as Zone;
      if (zone === 'residential') {
        const capacity = this.capacityOf(building);
        population += building.occupants;
        housing += capacity;
        if (this.takesNewcomers(id, building)) openings += capacity - building.occupants;
      } else {
        jobs[zone] += this.capacityOf(building);
        employed += building.occupants;
      }
    }
    return { population, housing, openings, employed, commercialJobs: jobs.commercial, industrialJobs: jobs.industrial };
  }

  /** Demand per zone, -100 to 100. */
  getDemand(): Demand {
    return zoneDemand(this.supply());
  }

  /** What a month brings in and costs with the city as it is now. */
  budget() {
    const { population, employed } = this.supply();
    const tax = population * economy.tax.resident + employed * economy.tax.job;
    let upkeep = 0;
    for (const kind of this.facilities.values()) upkeep += economy.upkeep[kind];
    for (let id = 0; id < MAP_SIZE ** 2; id++) {
      const tile = this.map.at(id);
      if (isRoad(tile) || tile === 'park') upkeep += economy.upkeep[tile];
    }
    return { tax, upkeep, net: tax - upkeep };
  }

  /** How many buildings report each issue. */
  private complaints(): Record<Issue, number> {
    const counts = Object.fromEntries(ISSUES.map(issue => [issue, 0])) as Record<Issue, number>;
    for (const [id, building] of this.buildings) {
      for (const issue of this.issuesOf(id, building)) counts[issue]++;
    }
    return counts;
  }

  getStats() {
    const supply = this.supply();
    let minutes = 0;
    for (const commute of this.commutes) minutes += commute.minutes * commute.workers;
    return { population: supply.population, housing: supply.housing,
      jobs: supply.commercialJobs + supply.industrialJobs, employed: supply.employed,
      buildings: this.buildings.size,
      /** Average minutes to work over everyone with a job; 0 when nobody has one. */
      commute: supply.employed ? minutes / supply.employed : 0,
      demand: zoneDemand(supply), funds: this.funds, budget: this.budget(), rank: this.rank,
      complaints: this.complaints() };
  }
}
