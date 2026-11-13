import { calendar } from './calendar';
import { economy, milestones, tileCost } from './Economy';
import { landValue, MAX_LEVEL } from './LandValue';
import { pollution } from './Pollution';
import { RoadGraph } from './RoadGraph';
import type { SaveData, SavedBuilding } from './SaveData';
import { emergencies, services, SERVICES } from './Services';
import { isFacility, isRoad, isService, isZone, MAP_SIZE, type Cell, type Facility, type GameCommand,
  type Road, type Service, type TileMap, type Zone } from './TileMap';
import { congestion, tileMinutes, traffic } from './Traffic';
import { utilities } from './Utilities';
import { rushShifts, shiftIndex, shifts } from './WorkShift';
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
  /** Travel time over the path with everyone on the same shift on the road. */
  minutes: number;
  /** The workplace's shift, an index into WorkShift's `shifts`. */
  shift: number;
  /** How many of the workers go by bus. */
  riders: number;
}

/** What holds a building back, most pressing first. */
export type Issue = 'no-road' | 'no-power' | 'no-water' | 'no-jobs' | 'long-commute' | 'pollution' |
  'crime' | 'vacancies';
export const ISSUES: readonly Issue[] =
  ['no-road', 'no-power', 'no-water', 'no-jobs', 'long-commute', 'pollution', 'crime', 'vacancies'];

/** Something that happened in the city, newest last. Not saved. */
export interface CityEvent {
  tick: number;
  /** An emergency nobody came to, or the one the service in reach dealt with. */
  kind: (typeof emergencies)[number]['trouble' | 'handled'];
  cell: Cell;
  /** The station that answered, when one did. */
  station?: Cell;
}
const EVENT_LOG = 20;

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
  private taxRate: number = economy.taxRate.default;

  // Everything below is derived from the tiles and buildings, so none of it is saved.
  private readonly served: Record<Facility, Set<number>> = { power: new Set(), water: new Set() };
  /** Buildings each facility serves, by facility tile. */
  private readonly loads = new Map<number, number>();
  private readonly commutes: Commute[] = [];
  /** Commuters crossing each road tile, per shift: only people on one shift travel together. */
  private readonly shiftFlows = shifts.map(() => new Float32Array(MAP_SIZE ** 2));
  /** The busiest shift's commuters on each road tile. Routing and pollution go by this. */
  private readonly flows = new Float32Array(MAP_SIZE ** 2);
  /** Residents with a job and their average commute, by home. */
  private readonly employed = new Map<number, number>();
  private readonly commuteMinutes = new Map<number, number>();
  /** Pollution per tile, 0 to 100. */
  private readonly smog = new Float32Array(MAP_SIZE ** 2);
  /** Whether each tile is within reach of a station of each service. */
  private readonly covered: Record<Service, Uint8Array> = {
    fire: new Uint8Array(MAP_SIZE ** 2), police: new Uint8Array(MAP_SIZE ** 2),
    school: new Uint8Array(MAP_SIZE ** 2), clinic: new Uint8Array(MAP_SIZE ** 2),
  };
  /** Everyone living in the city, as of the last refresh. */
  private residents = 0;
  /** Tiles near water, and tiles within reach of a working bus stop. */
  private readonly shore = new Uint8Array(MAP_SIZE ** 2);
  private readonly busCover = new Uint8Array(MAP_SIZE ** 2);
  /** Commuters who go by bus, as of the last refresh. */
  private riders = 0;
  private readonly events: CityEvent[] = [];
  /** The tick of the latest growth call, for showing how recent an event is. */
  private clock = 0;
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

  /**
   * A road tile's flow as a share of its capacity; 0 off the roads. With an hour of the day it
   * counts the shifts travelling at that hour; without, the tile's busiest shift.
   */
  congestionAt(cell: Cell, hour?: number): number {
    const tile = this.map.get(cell);
    if (!isRoad(tile)) return 0;
    const id = indexOf(cell);
    let flow = this.flows[id];
    if (hour !== undefined) {
      flow = 0;
      for (const shift of rushShifts(hour)) flow += this.shiftFlows[shift][id];
    }
    return congestion(flow, tile);
  }

  /** Sets the tax rate in percent, kept within the allowed range, and returns it. */
  setTaxRate(rate: number): number {
    const { min, max } = economy.taxRate;
    return this.taxRate = Math.max(min, Math.min(max, Math.round(rate)));
  }

  /** Pollution on a tile, 0 to 100; 0 off the map. */
  pollutionAt(cell: Cell): number {
    return this.map.get(cell) === undefined ? 0 : this.smog[indexOf(cell)];
  }

  /** Whether a tile is within reach of a working bus stop. */
  hasBus(cell: Cell): boolean {
    return this.map.get(cell) !== undefined && this.busCover[indexOf(cell)] === 1;
  }

  /** Whether a tile is within reach of a station of the service. */
  isCovered(cell: Cell, service: Service): boolean {
    return this.map.get(cell) !== undefined && this.covered[service][indexOf(cell)] === 1;
  }

  /** The latest events, oldest first. */
  getEvents(): readonly CityEvent[] {
    return this.events;
  }

  /** The tick the city last advanced to. */
  get now(): number {
    return this.clock;
  }

  /** Whether the city is big enough for crime and this tile has no police. */
  private unsafe(id: number): boolean {
    return this.residents >= services.crime.population && !this.covered.police[id];
  }

  /** Land value of a zoned tile, 0 to 100; 0 anywhere else. */
  landValueAt(cell: Cell): number {
    return isZone(this.map.get(cell)) ? this.valueOf(indexOf(cell)) : 0;
  }

  private valueOf(id: number): number {
    const zone = this.map.at(id);
    let value = landValue.base + this.green[id] + (this.shore[id] ? landValue.waterfront.value : 0);
    if (this.served.power.has(id) && this.served.water.has(id)) value += landValue.utilities;
    for (const service of SERVICES) if (this.covered[service][id]) value += services.value[service];
    if (this.unsafe(id)) value -= services.crime.penalty;
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
    }
    if (this.unsafe(id)) issues.push('crime');
    if (!home && roadAccess && building.occupants < this.capacityOf(building)) issues.push('vacancies');
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
    if (tile === 'grass' || tile === 'park' || tile === 'river') {
      return { tile, pollution: Math.round(this.smog[id]) };
    }
    if (tile === 'bus') {
      const radius = traffic.bus.radius;
      let reaching = 0;
      for (const building of this.buildings.keys()) {
        const other = cellAt(building);
        if (Math.abs(other.x - cell.x) + Math.abs(other.y - cell.y) <= radius) reaching++;
      }
      const running = this.hasRoadAccess(cell);
      return { tile, reaching: running ? reaching : 0, radius, running };
    }
    if (isRoad(tile)) {
      return { tile, flow: Math.round(this.flows[id]), congestion: this.congestionAt(cell),
        roadCapacity: tile === 'avenue' ? traffic.avenue.capacity : traffic.capacity };
    }
    if (isFacility(tile)) {
      return { tile, serving: this.loads.get(id) ?? 0, capacity: utilities.capacity[tile],
        running: this.hasRoadAccess(cell) };
    }
    if (isService(tile)) {
      const radius = services.radius[tile];
      let reaching = 0;
      for (const building of this.buildings.keys()) {
        const other = cellAt(building);
        if (Math.abs(other.x - cell.x) + Math.abs(other.y - cell.y) <= radius) reaching++;
      }
      const running = this.hasRoadAccess(cell);
      return { tile, reaching: running ? reaching : 0, radius, running };
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
      services: SERVICES.filter(service => this.covered[service][id]), bus: this.busCover[id] === 1,
      /** The land value the next level needs; undefined at the top level. */
      nextLevel: landValue.upgrade[record.level - 1] as number | undefined };
  }

  /** Runs a command if the city can pay for it. `cost` is what was charged. */
  execute(command: GameCommand): { changed: Cell[]; error?: string; cost: number } {
    let cost = 0;
    const result = { ...this.map.execute(command, changes => {
      let price = 0;
      for (const { tile } of changes) price += tileCost(tile);
      if (price > this.funds) return `錢不夠：要 $${price}，現在只有 $${Math.floor(this.funds)}。`;
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
    this.clock = tick;
    // A day's share of the month's tax and upkeep.
    if (tick % calendar.ticksPerDay === 0) this.funds += this.budget().net / calendar.daysPerMonth;
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
    if (daily) this.rollEmergencies(tick, seed);

    const { population } = this.supply();
    while (this.rank < milestones.length && population >= milestones[this.rank].population) {
      this.funds += milestones[this.rank++].grant;
    }
  }

  /** The road tile beside a cell, if there is one. Vehicles drive between these. */
  roadBeside(cell: Cell): Cell | undefined {
    return this.roadAccess(cell);
  }

  /** The nearest working station of a service that has the cell in reach. */
  private nearestStation(cell: Cell, service: Service): Cell | undefined {
    let best: Cell | undefined;
    let bestDistance = services.radius[service] + 1;
    for (let id = 0; id < MAP_SIZE ** 2; id++) {
      if (this.map.at(id) !== service) continue;
      const station = cellAt(id);
      const distance = Math.abs(station.x - cell.x) + Math.abs(station.y - cell.y);
      if (distance < bestDistance && this.hasRoadAccess(station)) {
        best = station;
        bestDistance = distance;
      }
    }
    return best;
  }

  /**
   * Once a day each kind of emergency may strike one building. The fire roll keeps the salts
   * it always had, so adding the other two did not move any fire.
   */
  private rollEmergencies(tick: number, seed: number): void {
    const { population, perBuilding, max } = services.fires;
    if (this.residents < population) return;
    const chance = Math.min(max, this.buildings.size * perBuilding);
    const ids = [...this.buildings.keys()];
    let changed = false;
    emergencies.forEach(({ service, trouble, handled }, index) => {
      if (roll(seed, tick, 7 + 2 * index) / 2 ** 32 >= chance) return;
      const id = ids[roll(seed, tick, 8 + 2 * index) % ids.length];
      const building = this.buildings.get(id);
      // It may have burned down a moment ago.
      if (!building) return;
      const cell = cellAt(id);
      const helped = this.covered[service][id] === 1;
      this.events.push({ tick, kind: helped ? handled : trouble, cell,
        station: helped ? this.nearestStation(cell, service) : undefined });
      if (this.events.length > EVENT_LOG) this.events.shift();
      if (helped) return;
      if (trouble === 'fire') {
        this.buildings.delete(id);
        changed = true;
      } else if (trouble === 'crime') {
        this.funds -= services.crime.loss;
      } else if (this.map.at(id) === 'residential' && building.occupants > 0) {
        building.occupants--;
        changed = true;
      }
    });
    if (changed) this.refresh();
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
    this.coverServices();
    this.assignJobs();
    this.spreadPollution();
    this.residents = 0;
    for (const [id, building] of this.buildings) {
      if (this.map.at(id) === 'residential') this.residents += building.occupants;
    }
  }

  /** Marks the tiles within reach of each fire station, police station, school and clinic. */
  private coverServices(): void {
    for (const service of SERVICES) this.covered[service].fill(0);
    this.busCover.fill(0);
    this.shore.fill(0);
    for (let id = 0; id < MAP_SIZE ** 2; id++) {
      const tile = this.map.at(id);
      const water = tile === 'river' || tile === 'bridge';
      if (!isService(tile) && tile !== 'bus' && !water) continue;
      const { x, y } = cellAt(id);
      if (!water && !this.hasRoadAccess({ x, y })) continue;
      const radius = water ? landValue.waterfront.radius :
        tile === 'bus' ? traffic.bus.radius : services.radius[tile as Service];
      const field = water ? this.shore : tile === 'bus' ? this.busCover : this.covered[tile as Service];
      for (let dy = -radius; dy <= radius; dy++) {
        const span = radius - Math.abs(dy);
        for (let dx = -span; dx <= span; dx++) {
          const cell = { x: x + dx, y: y + dy };
          if (this.map.get(cell) !== undefined) field[indexOf(cell)] = 1;
        }
      }
    }
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
      if (tile === 'power') {
        if (this.hasRoadAccess(cellAt(id))) spread(id, power.strength, power.radius);
      }
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
        if (!this.hasRoadAccess({ x, y })) continue;
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
    this.riders = 0;
    this.flows.fill(0);
    for (const flows of this.shiftFlows) flows.fill(0);
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
        const shift = shiftIndex(this.map.at(workId) as Zone, workId);
        const flows = this.shiftFlows[shift];
        // With a stop at both ends, part of them take the bus and leave the road to the rest.
        const riders = this.busCover[building.id] && this.busCover[workId] ?
          Math.floor(workers * traffic.bus.share) : 0;
        this.riders += riders;
        for (const cell of path) {
          const tile = indexOf(cell);
          flows[tile] += workers - riders;
          if (flows[tile] > this.flows[tile]) this.flows[tile] = flows[tile];
        }
        this.commutes.push({ homeId: building.id, workId, workers, path, minutes: 0, shift, riders });
      }
      vacancies -= building.occupants - remaining;
      this.employed.set(building.id, building.occupants - remaining);
    }

    // Times are read once everyone is on the road, so early homes feel later traffic too.
    for (const commute of this.commutes) {
      const flows = this.shiftFlows[commute.shift];
      for (const cell of commute.path) {
        const tile = indexOf(cell);
        commute.minutes += tileMinutes(flows[tile], this.map.at(tile) as Road);
      }
      this.commuteMinutes.set(commute.homeId, (this.commuteMinutes.get(commute.homeId) ?? 0) +
        commute.minutes * commute.workers / this.employed.get(commute.homeId)!);
    }
  }

  save(): Omit<SaveData, 'schemaVersion' | 'seed' | 'tick'> {
    return { tiles: this.map.save(), zones: [...this.zones.keys()],
      buildings: [...this.buildings.values()].map(building => ({ ...building })),
      funds: this.funds, rank: this.rank, taxRate: this.taxRate };
  }

  load({ tiles, zones, buildings, funds, rank, taxRate, tick }: SaveData): void {
    this.events.length = 0;
    this.clock = tick;
    this.funds = funds;
    this.rank = rank;
    this.taxRate = taxRate;
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

  /** Demand per zone, -100 to 100: what the city lacks, shifted by how heavy the tax is. */
  getDemand(supply = this.supply()): Demand {
    const { default: usual, above, below } = economy.taxRate;
    const shift = this.taxRate > usual ? (usual - this.taxRate) * above : (usual - this.taxRate) * below;
    const demand = zoneDemand(supply);
    for (const zone of zoneOrder) demand[zone] = Math.max(-100, Math.min(100, demand[zone] + shift));
    return demand;
  }

  /** What a month brings in and costs with the city as it is now. */
  budget() {
    const { population, employed } = this.supply();
    const tax = Math.round((population * economy.tax.resident + employed * economy.tax.job) *
      this.taxRate / economy.taxRate.default);
    let upkeep = 0;
    for (const kind of this.facilities.values()) upkeep += economy.upkeep[kind];
    for (let id = 0; id < MAP_SIZE ** 2; id++) {
      const tile = this.map.at(id);
      if (isRoad(tile) || tile === 'park' || isService(tile) || tile === 'bus') upkeep += economy.upkeep[tile];
    }
    return { tax, upkeep, net: tax - upkeep };
  }

  /** How many plants, towers and stations stand idle for want of a road beside them. */
  private idle(): number {
    let count = 0;
    for (let id = 0; id < MAP_SIZE ** 2; id++) {
      const tile = this.map.at(id);
      if ((isFacility(tile) || isService(tile) || tile === 'bus') && !this.hasRoadAccess(cellAt(id))) count++;
    }
    return count;
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
      demand: this.getDemand(supply), funds: this.funds, taxRate: this.taxRate, budget: this.budget(), rank: this.rank,
      complaints: this.complaints(), idle: this.idle(), riders: this.riders };
  }
}
