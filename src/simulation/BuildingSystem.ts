import { roadVehiclePose } from './RoadVehicle';
import { FreightRuntime, freightRuntimeKey, WAREHOUSE_CAPACITY, type FreightWarehouse } from './FreightRuntime';
import { freightLines as freightRules, planFreightLines, type FreightLine, type FreightMode, type SavedFreightLine } from './FreightLines';
import { LifeSystem, EMPTY_LIFE, type LifeResident } from './LifeSystem';
import { planFacilityVisits, type CivicVisitContext } from './CivicVisits';
import { ActivityDiary, activityDay, visitReasons } from './ActivityDiary';
import { createIdentity, identityAt, YEAR_TICKS } from './ResidentIdentity';
import { Relationships } from './Relationships';
import { seats } from './Capacity';
import { spacesAt } from './Parking';
import { birthdayOf, eatingOf, fatigueAt, hungerAt, mealPlan, meals, needs, socialAt, type Needs } from './Needs';
import { delivery, ridesFor } from './Delivery';

/** The outings that end with something to eat, and the meal brought to the door. */
const MEALS_OUT: readonly Doing[] = ['shopping', 'nightmarket', 'takeout', 'bakery'];
import { weatherAt, weatherTravel, wantsOutdoor } from './Weather';
import { entrances, routeToSite, siteCells, parkGroups } from './FacilityAccess';
import { VisitSystem, travelTicks, type ActiveVisit, type FacilityVisit } from './VisitSystem';
import { SHOP_SHIFT } from './Mind';
import { calendar, dateAt, hourAt, weekendAt } from './calendar';
import { bond, circle, PLACES, type Place } from './Community';
import { dayPay, pay, schooling, trade, vehicles, type Trade } from './Wealth';
import { challenges, disasters, festivals, nextFestival, policies, POLICIES, seasonAt, seasons, visitorsToday,
  type Challenge, type FestivalId, type Policy, type Season } from './Seasons';
import { cycle, economy, milestones, tileCost, type Mood } from './Economy';
import { goals } from './Goals';
import { fuelPrice, goodsPrice, prices } from './Prices';
import { brands, dilemmas, type Answer, type Boost, type Brand, type Dilemma } from './Dilemmas';
import { comboIncome, combos, comboValue, COMBOS, taskList, tasks, type Combo, type TaskId } from './Combos';
import { goods } from './Goods';
import { ALL_LAND, adjoining, land, landPrice, parcelAt } from './Land';
import { freight, planFreight, summarizeFreight, type FreightReport, type FreightRoute, type FreightSite } from './Freight';
import { jobs } from './Jobs';
import { COMPLEX_LEVEL, landValue, MAX_LEVEL } from './LandValue';
import { childrenAt, homeSites, residentAt, traits, TRAITS, type HomeKind, type Trait } from './Residents';
import { doingAt, mind, moodOf, thoughtsOf, type Doing, type Facts, type Thought, type Way } from './Mind';
import { pollution } from './Pollution';
import { ELEVATED, RoadGraph } from './RoadGraph';
import type { SaveData, SavedBuilding, SavedPerson, Theme } from './SaveData';
import { alsoServes, emergencies, expectations, scare, SCHOOLS, services, SERVICES } from './Services';
import { footprint, isBig, isFacility, isRoad, isService, isZone, MAP_SIZE, type Cell, type Facility, type GameCommand,
  type Road, type Service, type TileMap, type Zone } from './TileMap';
import { congestion, tileMinutes, traffic } from './Traffic';
import { transit, type Line, type SavedLine, type TransitKind } from './Transit';
import { utilities } from './Utilities';
import { RUSH_HOURS, rushShifts, shiftIndex, shifts } from './WorkShift';
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
  /** How many of the workers go by bus or metro, and on which line. */
  riders: number;
  line?: number;
  /** Minutes the ride takes, waiting included. */
  transitMinutes?: number;
  transfer?: number;
}

/** What holds a building back, most pressing first. */
export type Issue = 'no-road' | 'no-power' | 'no-water' | 'no-jobs' | 'long-commute' | 'pollution' |
  'crime' | 'scared' | 'no-school' | 'no-clinic' | 'no-highschool' | 'no-hospital' | 'vacancies' | 'no-park' | 'no-transit';
export const ISSUES: readonly Issue[] = ['no-road', 'no-power', 'no-water', 'no-jobs', 'long-commute',
  'pollution', 'crime', 'scared', 'no-school', 'no-clinic', 'no-highschool', 'no-hospital', 'vacancies', 'no-park', 'no-transit'];

/** Something that happened in the city, newest last. Not saved. */
export interface CityEvent {
  tick: number;
  /** An emergency nobody came to, or the one the service in reach dealt with. */
  kind: (typeof emergencies)[number]['trouble' | 'handled' | 'late'] | 'flood' | 'flood-helped' | 'flu' | 'robbery' | 'robbery-stopped' | 'nightmarket-open' | 'market-restocked' | 'crash' | 'crash-cleared' | 'crash-hospital' | 'crash-no-hospital';
  cell: Cell;
  /** The station that answered, when one did. */
  station?: Cell;
  /** How long the way from the station took, in minutes, traffic and all. */
  minutes?: number;
}
const EVENT_LOG = 20;

/** Something that happened to one resident, newest last. Not saved. */
export interface PersonNews {
  tick: number;
  /**
   * A move to a job that is nearer, of the kind they like, or just different; a job lost with
   * its workplace; or leaving town for want of work or of room at home.
   */
  kind: 'job-nearer' | 'job-liking' | 'job-change' | 'job-lost' | 'left-no-work' | 'left-no-room' |
    'left-unhappy' | 'new-car' | 'sold-car';
  name: string;
  home: Cell;
  /** For a move to another job: the shift of the new workplace, an index into `shifts`. */
  shift?: number;
  /** For a new vehicle: which, an index into Wealth's `vehicles`. */
  car?: number;
}
const NEWS_LOG = 30;

/** A deterministic 32-bit roll from the city seed, the tick and a salt. */
function roll(seed: number, tick: number, salt: number): number {
  let hash = Math.imul(seed ^ Math.imul(tick, 0x9e3779b1) ^ Math.imul(salt + 1, 0x85ebca6b), 0xc2b2ae35);
  hash = Math.imul(hash ^ (hash >>> 15), 0x27d4eb2f);
  return (hash ^ (hash >>> 13)) >>> 0;
}

export class BuildingSystem {
  private nextPersonId = 0;
  readonly relationships = new Relationships();
  readonly life = new LifeSystem();
  readonly diary = new ActivityDiary();
  private readonly peopleById = new Map<number, { home: number; person: SavedPerson }>();

  private ensureIdentities(): void {
    this.peopleById.clear();
    for (const child of this.life.children) this.nextPersonId = Math.max(this.nextPersonId, child.identity.id + 1);
    for (const building of this.buildings.values()) for (const person of building.people ?? []) {
      if (person.identity) this.nextPersonId = Math.max(this.nextPersonId, person.identity.id + 1);
    }
    for (const [home, building] of this.buildings) for (const person of building.people ?? []) {
      person.identity ??= createIdentity(this.nextPersonId++, this.seed, home, person.slot, person.came, building.kind);
      this.nextPersonId = Math.max(this.nextPersonId, person.identity.id + 1);
      this.peopleById.set(person.identity.id, { home, person });
    }
    this.relationships.retain(new Set(this.peopleById.keys()));
    this.diary.retain(this.clock, new Set(this.peopleById.keys()));
    for (const [home, building] of this.buildings) {
      const members = building.people;
      if (!members || this.life.hasFamily(home)) continue;
      if (members.length < 2) { this.life.establish(home, []); continue; }
      const first = members.reduce((a, b) => a.came < b.came ? a : b);
      const legacy = childrenAt(this.seed, home, building.kind, members.length,
        this.whoAt(home, first).name[0], Math.floor((this.clock - first.came) / YEAR_TICKS));
      this.life.establish(home, legacy.map(child => ({ home,
        guardians: members.slice(0, 2).map(person => person.identity!.id),
        identity: { id: this.nextPersonId++, name: child.name, born: this.clock - child.age * YEAR_TICKS },
      })));
    }
  }
  private whoAt(home: number, person: SavedPerson) {
    return person.identity ? identityAt(person.identity, this.clock) :
      { ...residentAt(this.seed, home, person.slot, this.buildings.get(home)?.kind),
        age: residentAt(this.seed, home, person.slot, this.buildings.get(home)?.kind).age + Math.floor((this.clock - person.came) / YEAR_TICKS) };
  }
  private canWork(home: number, person: SavedPerson): boolean {
    const age = this.whoAt(home, person).age;
    return age >= 18 && age < 65;
  }
  private joblessAt(home: number, building: SavedBuilding): number {
    return (building.people ?? []).filter(person => this.canWork(home, person) && person.job < 0).length;
  }
  private traitAt(home: number, slot: number) {
    const person = this.buildings.get(home)?.people?.find(person => person.slot === slot);
    return person ? this.whoAt(home, person).trait : undefined;
  }

  /** Moving within the city preserves identity, money and relationships. */
  relocateResident(home: number, slot: number, destination: number): boolean {
    const from = this.buildings.get(home), to = this.buildings.get(destination);
    const index = from?.people?.findIndex(person => person.slot === slot) ?? -1;
    if (home === destination || !from?.people || !to?.people || index < 0 ||
        to.occupants + this.kidsAt(destination).length >= this.capacityOf(to) || !this.hasRoadAccess(cellAt(destination))) return false;
    const [person] = from.people.splice(index, 1);
    this.visits.cancelAt(new Set([home]));
    person.slot = to.nextSlot!++;
    person.came = this.clock;
    to.people.push(person);
    from.occupants--; to.occupants++;
    this.refresh();
    return true;
  }

  private readonly zones = new Map<number, Cell>();
  private readonly buildings = new Map<number, SavedBuilding>();
  private readonly facilities = new Map<number, Facility>();
  private funds = economy.startingFunds;
  /** How many milestones the city has been paid for. */
  private rank = 0;
  private taxRate: number = economy.taxRate.default;
  /** The city's look (see `THEMES` in SaveData.ts). Saved; the simulation does not go by it. */
  theme: Theme = 'classic';
  /** The city's seed. It decides who lives where, so it must be set before anything is derived. */
  seed = 0;
  /** The ids of the goals already rewarded, and the months left on each loan. */
  private readonly goalsDone = new Set<string>();
  private readonly loans: number[] = [];
  /** The tasks being worked on, the day each finished one may come back, and the last one done. */
  private readonly tasksOn: TaskId[] = [];
  private readonly tasksRest = new Map<TaskId, number>();
  private taskDone?: { id: TaskId; tick: number };
  /** The decision waiting for an answer and what past answers still do to demand (both saved), and how the last one went (not saved). */
  private dilemma?: Dilemma;
  private readonly boosts: Boost[] = [];
  private dilemmaEnd?: { id: Dilemma['id']; answer: number; lost: number; tick: number; opened?: Cell };
  /** The price level (saved), and what the city's share of the fuel its people buy comes to in a month. */
  private level = 1;
  private fuelTax = 0;
  /** What the cars kept in the city's car parks pay it in a month. */
  private parkingFees = 0;
  /** The policies that are on. Saved. */
  private readonly policiesOn = new Set<Policy>();
  /** The challenge under way (saved), and how the last one ended (not saved). */
  private challenge?: Challenge;
  private challengeEnd?: { id: Challenge['id']; won: boolean; tick: number };
  /** The festivals held lately, newest last. Not saved. */
  private readonly feasts: { id: FestivalId; tick: number; income: number }[] = [];
  /** The season the city was last worked out in, to notice when it turns. */
  private lastSeason: Season = 'spring';
  /** How many tiles of each kind the map has, as of the last refresh. */
  private readonly bankSites: Cell[] = [];
  private readonly tileCounts = new Map<string, number>();
  /** Which special group each tile belongs to, as its place in `COMBOS` plus one; how many of each there are. */
  private readonly special = new Uint8Array(MAP_SIZE ** 2);
  private readonly nearNightMarket = new Uint8Array(MAP_SIZE ** 2);
  private readonly memberships = new Uint32Array(MAP_SIZE ** 2);
  private readonly coldRoutes = new Map<number, { farms: number[]; markets: number[] }>();
  private readonly coldStock = new Map<number, number>();
  private readonly marketStock = new Map<number, number>();
  private readonly daycareSeats = new Map<number, number>();
  private readonly recyclingRoutes = new Map<number, Set<number>>();
  private readonly transfers = new Map<number, number>();
  private readonly transferStops = new Map<number, { metroStop: number; busIndex: number; metroIndex: number;
    bus: Line & { loads: number[] }; metro: Line & { loads: number[] } }[]>();
  private readonly comboCounts = Object.fromEntries(COMBOS.map(combo => [combo, 0])) as Record<Combo, number>;
  /** The groups the city has ever had, for the handbook. Saved. */
  private readonly combosSeen = new Set<Combo>();
  /** Tiles in reach of each group that raises land value; tiles by a farmstead; the tile each farmstead's barn stands on. */
  private readonly near = Object.fromEntries(COMBOS.filter(comboValue).map(combo => [combo, new Uint8Array(MAP_SIZE ** 2)])) as
    Partial<Record<Combo, Uint8Array>>;
  private readonly wild = this.near.forest!;
  private readonly rural = new Uint8Array(MAP_SIZE ** 2);
  private readonly barns = new Set<number>();
  /** How many residents have each trait, and how many gardeners each home has. */
  private readonly traitCounts = Object.fromEntries(TRAITS.map(trait => [trait, 0])) as Record<Trait, number>;
  private readonly gardeners = new Map<number, number>();
  /** How many residents own each vehicle, and what the licences bring in a month. */
  private readonly carCounts: number[] = vehicles.map(() => 0);
  private licence = 0;
  /** What each home has within a walk, kept until the map or the buildings change. */
  private readonly circles = new Map<number, readonly Place[]>();
  /** How close-knit each home is, kept only until the clock moves or anyone moves. */
  private readonly bonds = new Map<number, number>();
  /** For each park tile, how many tiles its park has; the middle tile of each big park. */
  private readonly parkSize = new Uint16Array(MAP_SIZE ** 2);
  private readonly fountains = new Set<number>();
  /** Tiles near a big park. */
  private readonly grand = new Uint8Array(MAP_SIZE ** 2);
  private bigParks = 0;
  /** Monthly upkeep of everything on the map, and how many civic buildings have no road. */
  private tileUpkeep = 0;
  private idleCount = 0;
  /** Goods made and needed, residents the shops can serve, and the month's trade in money. */
  private market = { made: 0, needed: 0, farmed: 0, served: 0, trade: 0 };
  /** What the sights bring in a month. */
  private visitors = 0;
  /**
   * Where a fire burned or a thief got away, and the tick until which the neighbourhood stays
   * frightened (see `scare` in Services.ts). Saved so reloading cannot clear the effect.
   */
  private readonly scares: { id: number; until: number }[] = [];
  /** Tiles in a frightened neighbourhood. */
  private readonly scared = new Uint8Array(MAP_SIZE ** 2);
  /** The customers of each shop: residents in its reach, shared among the shops in theirs. */
  private readonly custom = new Map<number, number>();
  /** How business was when the city was last worked out, to notice when it turns. */
  private lastMood: Mood = 'normal';

  // Everything below is derived from the tiles and buildings, so none of it is saved.
  private readonly served: Record<Facility, Set<number>> = { power: new Set(), water: new Set() };
  /** Buildings each facility serves, by facility tile. */
  private readonly loads = new Map<number, number>();
  private readonly commutes: Commute[] = [];
  /** The same routes by home and workplace, for looking one resident's trip up quickly. */
  private readonly commuteByPair = new Map<number, Commute>();
  /** This hour: who wanted each place and found it full, and the sick who now wait at home for one. */
  private readonly crowded = new Map<number, Set<number>>();
  /** The drivers who set out for each place this hour with no space left for their car. */
  private readonly circled = new Map<number, number>();
  private readonly waitingFor = new Map<number, number>();
  /** Those whose meal is on its way to their door this hour. */
  private readonly fed = new Set<number>();
  /** Today's deliveries: orders brought, orders nobody could bring, and who rode. Not saved. */
  private deliveries = { day: -1, orders: 0, missed: new Set<number>(), riders: new Set<number>() };
  /** Commuters crossing each road tile, per shift: only people on one shift travel together. */
  private readonly shiftFlows = shifts.map(() => new Float32Array(MAP_SIZE ** 2));
  /** The busiest shift's commuters on each road tile. Routing and pollution go by this. */
  private readonly flows = new Float32Array(MAP_SIZE ** 2);
  readonly shipments = new FreightRuntime();
  private freightMode: FreightMode = 'auto';
  private readonly freightLines: SavedFreightLine[] = [];
  private freightPlans: FreightLine[] = [];
  private freight: FreightRoute[] = [];
  private freightSources: FreightSite[] = [];
  private freightShops: FreightSite[] = [];
  private readonly freightFlows = new Float32Array(MAP_SIZE ** 2);
  private freightRevision = -1;
  private warehouses: FreightWarehouse[] = [];
  private readonly freightPaths = new Map<string, Cell[] | undefined>();
  /** Residents with a job and their average commute, by home. */
  private readonly employed = new Map<number, number>();
  private readonly commuteMinutes = new Map<number, number>();
  /** Pollution per tile, 0 to 100. */
  private readonly smog = new Float32Array(MAP_SIZE ** 2);
  /** Whether each tile is within reach of a station of each service. */
  private readonly covered = Object.fromEntries(
    SERVICES.map(service => [service, new Uint8Array(MAP_SIZE ** 2)])) as Record<Service, Uint8Array>;
  /** Everyone living in the city, as of the last refresh. */
  private residents = 0;
  /** Tiles near water. */
  private readonly shore = new Uint8Array(MAP_SIZE ** 2);
  private readonly lines: SavedLine[] = [];
  /** The lines with their routes and timings worked out, and riders per shift. */
  private readonly plans: (Line & { loads: number[] })[] = [];
  /** Tiles within reach of a stop on a working line. */
  private readonly transitCover = new Uint8Array(MAP_SIZE ** 2);
  /** The stops of working lines each building can walk to. */
  private readonly stopsNear = new Map<number, { plan: Line & { loads: number[] }; index: number }[]>();
  /** Commuters who go by bus or metro, as of the last refresh. */
  private riders = 0;
  private readonly events: CityEvent[] = [];
  private readonly news: PersonNews[] = [];
  /** Who works at each workplace, as of the last refresh. */
  private readonly staff = new Map<number, { home: number; person: SavedPerson }[]>();
  /** The tick of the latest growth call, for showing how recent an event is. */
  private clock = 0;
  private readonly monthlyVisits = new Map<number, number>();
  /** Residents on an outing by scooter (half a car each) or car over each road tile this hour. */
  private readonly outingFlows = new Float32Array(MAP_SIZE ** 2);

  readonly visits = new VisitSystem();
  private parkRevision = -1;
  private parks = new Map<number, readonly number[]>();

  /** All cells whose statistics belong to the selected site, including residential complexes. */
  siteIds(cell: Cell): readonly number[] {
    if (this.map.get(cell) === 'park') {
      if (this.parkRevision !== this.map.layoutRevision) {
        this.parks = parkGroups(this.map);
        this.parkRevision = this.map.layoutRevision;
      }
      return this.parks.get(indexOf(cell)) ?? [indexOf(cell)];
    }
    const block = this.buildings.get(indexOf(cell))?.block;
    if (block !== undefined) return [block, block + 1, block + MAP_SIZE, block + MAP_SIZE + 1];
    return siteCells(this.map, cell).map(indexOf);
  }

  siteSummary(cell: Cell) {
    const ids = this.siteIds(cell);
    return { tiles: ids.length,
      occupants: ids.reduce((sum, id) => sum + (this.buildings.get(id)?.occupants ?? 0), 0),
      capacity: ids.reduce((sum, id) => sum + (this.buildings.has(id) ? this.capacityOf(this.buildings.get(id)!) : 0), 0) };
  }

  visitCountAt(cell: Cell): number | undefined {
    const anchor = this.map.anchorOf(cell) ?? cell;
    const tile = this.map.get(anchor);
    if (isService(tile) || isFacility(tile) || this.map.hasStation(anchor) ||
        tile === 'bus' || tile === 'park' || tile === 'farm' || (isZone(tile) && this.buildings.has(indexOf(anchor)))) {
      return this.siteIds(cell).reduce((sum, id) => sum + (this.monthlyVisits.get(id) ?? 0), 0);
    }
    return undefined;
  }

  private recordVisits(tick: number): void {
    // Schedule every game hour so 07:00 school and 16:00 childcare are not skipped.
    try {
      for (let part = 1; part <= 3; part++) {
        const at = tick - 1 + part / 3;
        const previous = tick - 1 + (part - 1) / 3;
        if (activityDay(previous) !== activityDay(at)) this.diary.retain(at, new Set(this.peopleById.keys()));
        if (dateAt(previous).month !== dateAt(at).month) this.monthlyVisits.clear();
        this.clock = at;
        this.advanceVisits(at);
      }
    } finally { this.clock = tick; }
  }

  private advanceVisits(tick: number): void {
    this.crowded.clear();
    this.circled.clear();
    this.waitingFor.clear();
    const count = (id: number, people: number) => {
      const anchor = indexOf(this.map.anchorOf(cellAt(id)) ?? cellAt(id));
      this.monthlyVisits.set(anchor, (this.monthlyVisits.get(anchor) ?? 0) + people);
    };
    const arrived = this.visits.advance(tick, trip =>
      !!this.buildings.get(trip.home)?.people?.some(person => person.slot === trip.slot) &&
      trip.path.slice(1, -1).every(cell => isRoad(this.map.get(cell))) &&
      (trip.returning || this.map.get(cellAt(trip.destination)) !== 'grass'), trip => {
        const start = trip.path.at(-1)!;
        const from = trip.path.at(-2)!;
        const route = routeToSite(this.map, this.roadGraph, from, cellAt(trip.home), trip.slot);
        return route && [start, ...route.path];
      }, (trip, departed) => this.continueVisit(trip, departed), 1 / 3);
    for (const trip of arrived) {
      // A rider at a customer's door is no visitor.
      if (trip.doing !== 'delivering') count(trip.destination, 1);
      const person = this.buildings.get(trip.home)?.people?.find(person => person.slot === trip.slot);
      if (person?.identity) this.diary.arrive(person.identity.id, trip, trip.started + travelTicks(trip.path, trip.doing, trip.ride));
      const site = this.map.at(trip.destination);
      if (person?.identity && ['clinic', 'familyclinic', 'hospital', 'eldercare'].includes(site)) this.life.treat(person.identity.id, Math.ceil(tick), site === 'hospital');
    }
    const meetings = new Map<number, { person: number; from: number; until: number }[]>();
    for (const { visit: trip, from, until } of this.visits.usage) {
      const person = this.buildings.get(trip.home)?.people?.find(person => person.slot === trip.slot);
      if (!person?.identity || trip.doing === 'delivering') continue;
      const venue = Math.min(...this.siteIds(cellAt(trip.destination)));
      if (!meetings.has(venue)) meetings.set(venue, []);
      meetings.get(venue)!.push({ person: person.identity.id, from, until });
    }
    for (const [venue, windows] of meetings) {
      // Meeting requires overlapping use, not just two arrivals somewhere within the same three-hour tick.
      for (const at of new Set(windows.map(window => window.from))) {
        const together = windows.filter(window => window.from <= at && window.until > at).map(window => window.person);
        if (together.length > 1) this.relationships.meet(new Map([[venue, together]]), Math.floor(tick / calendar.ticksPerDay));
      }
    }
    const hour = hourAt(tick);
    // Riders set out first, so that nobody is both out with deliveries and off on an errand.
    const runs = this.deliverMeals(tick);
    this.visits.start(runs, tick);
    const outings = this.facilityVisits(hour, () => true);
    this.visits.start(outings, tick);
    const plans = [...runs, ...outings];
    // Those out on a scooter or in a car are on the roads with everyone else this hour.
    this.outingFlows.fill(0);
    this.visits.each(trip => {
      // Parked at the place they went to, they are off the road.
      if (!trip.ride || (trip.arrived && !trip.returning)) return;
      const weight = trip.ride >= 2 ? 1 : 0.5;
      for (let step = 1; step < trip.path.length - 1; step++) this.outingFlows[indexOf(trip.path[step])] += weight;
    });
    for (const plan of plans) {
      const person = this.buildings.get(plan.home)?.people?.find(person => person.slot === plan.slot);
      if (person?.identity) this.diary.depart(person.identity.id, plan, tick);
    }
    for (const route of this.commutes) {
      const start = shifts[route.shift].start;
      if (start <= hour && start > hour - 1 &&
          (!weekendAt(tick) || route.shift === SHOP_SHIFT)) count(route.workId, route.workers);
    }
  }
  /**
   * Meals to the door (see Delivery.ts). In the hours of lunch and dinner, those who order in
   * and want this meal get it from a staffed shop near home, if a rider who lives near the
   * shop is free. Returns the riders' runs: from their door to the shop and on to the first
   * customer. A meal counts as eaten the hour it is ordered.
   */
  private deliverMeals(tick: number): FacilityVisit[] {
    this.fed.clear();
    const day = activityDay(tick);
    if (this.deliveries.day !== day) this.deliveries = { day, orders: 0, missed: new Set(), riders: new Set() };
    const hour = hourAt(tick);
    const lunch = hour >= meals.lunch.from && hour < meals.lunch.until;
    if (!lunch && !(hour >= meals.dinner.from && hour < meals.dinner.until)) return [];
    const weekend = weekendAt(tick);
    /** At home with nothing on: not out, not ill, and not at work or on the way there or back. */
    const free = (home: number, person: SavedPerson) => {
      if (this.visits.has(home, person.slot) || this.life.health(person.identity!.id)) return false;
      const shift = person.job < 0 || this.whoAt(home, person).age >= 65 ? undefined : shiftIndex(this.map.at(person.job) as Zone, person.job);
      if (shift === undefined || (weekend && shift !== SHOP_SHIFT)) return true;
      return hour < shifts[shift].start - RUSH_HOURS || hour >= shifts[shift].end + RUSH_HOURS;
    };
    const customers: { id: number; home: number; person: SavedPerson }[] = [];
    const riders: { id: number; home: number; person: SavedPerson; taken?: boolean }[] = [];
    for (const [id, { home, person }] of this.peopleById) {
      if (this.map.at(home) !== 'residential') continue;
      if (eatingOf(this.seed, id) === 'delivery') {
        if (person.car && (person.money ?? 0) >= delivery.fee && free(home, person) && this.hungerOf(home, person, tick).wantsFood) customers.push({ id, home, person });
      } else if (ridesFor(this.seed, id, person.car ?? 0) && this.whoAt(home, person).age < 65 && free(home, person) &&
          this.fatigueOf(home, person, tick) < needs.tired) riders.push({ id, home, person });
    }
    if (!customers.length) return [];
    const shops = new Map<number, number | undefined>();
    /** The nearest shop to a home that has staff and stands on a road. */
    const shopNear = (home: number) => {
      if (shops.has(home)) return shops.get(home);
      const at = cellAt(home);
      let best: number | undefined;
      let far = Infinity;
      for (let dy = -delivery.shopReach; dy <= delivery.shopReach; dy++) {
        const span = delivery.shopReach - Math.abs(dy);
        for (let dx = -span; dx <= span; dx++) {
          const cell = { x: at.x + dx, y: at.y + dy };
          if (this.map.get(cell) !== 'commercial' || Math.abs(dx) + Math.abs(dy) >= far) continue;
          if (!this.buildings.get(indexOf(cell))?.occupants || !this.roadAccess(cell)) continue;
          best = indexOf(cell);
          far = Math.abs(dx) + Math.abs(dy);
        }
      }
      shops.set(home, best);
      return best;
    };
    const runs = new Map<number, { rider: (typeof riders)[number]; load: number; visit: FacilityVisit }>();
    for (const customer of customers) {
      const shop = shopNear(customer.home);
      let run = shop === undefined ? undefined : runs.get(shop);
      if (shop !== undefined && (!run || run.load >= delivery.perRun)) {
        run = undefined;
        const at = cellAt(shop);
        const near = riders.filter(rider => !rider.taken)
          .map(rider => ({ rider, far: Math.abs(rider.home % MAP_SIZE - at.x) + Math.abs(Math.floor(rider.home / MAP_SIZE) - at.y) }))
          .filter(entry => entry.far <= delivery.riderReach).sort((a, b) => a.far - b.far || a.rider.id - b.rider.id);
        for (const { rider } of near.slice(0, 3)) {
          const door = this.roadAccess(cellAt(rider.home));
          const there = door && routeToSite(this.map, this.roadGraph, door, at, rider.id);
          const on = there && routeToSite(this.map, this.roadGraph, there.path.at(-2)!, cellAt(customer.home), rider.id);
          if (!there || !on || there.path.length + on.path.length > delivery.longest) continue;
          rider.taken = true;
          run = { rider, load: 0, visit: { home: rider.home, slot: rider.person.slot, doing: 'delivering', destination: customer.home,
            path: [cellAt(rider.home), ...there.path.slice(0, -1), ...on.path.slice(1)], reason: 'sidejob' } };
          runs.set(shop, run);
          break;
        }
      }
      if (shop === undefined || !run) {
        // Nobody to bring it: they will go out for it if they can, or make do at home.
        this.deliveries.missed.add(customer.id * 2 + (lunch ? 0 : 1));
        continue;
      }
      this.deliveries.missed.delete(customer.id * 2 + (lunch ? 0 : 1));
      run.load++;
      customer.person.money = (customer.person.money ?? 0) - delivery.fee;
      if (!customer.person.money) delete customer.person.money;
      run.rider.person.money = (run.rider.person.money ?? 0) + delivery.fee;
      this.diary.note(customer.id, 'takeout', shop, tick, 'delivery');
      this.fed.add(customer.id);
      this.deliveries.orders++;
      this.deliveries.riders.add(run.rider.id);
    }
    return [...runs.values()].map(run => run.visit);
  }

  /** Today's meals to the door: how many were brought, how many nobody could bring, and how many people rode. */
  deliveriesToday() {
    return { orders: this.deliveries.orders, unfilled: this.deliveries.missed.size, riders: this.deliveries.riders.size };
  }

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

  /** The road a civic building is reached by. A big one may touch a road with any of its four tiles. */
  private doorOf(cell: Cell): Cell | undefined {
    return entrances(this.map, cell)[0]?.road;
  }

  /** The rank from which a service may be built here, if the city has not reached it yet. */
  lockedUntil(service: Service): number | undefined {
    const rank = services.unlock[service];
    return rank !== undefined && rank > this.rank ? rank : undefined;
  }

  /** What kind of home a lot would get if one were built on it now. */
  private homeKindAt(id: number): HomeKind | undefined {
    const { x, y } = cellAt(id);
    const near = (zone: Zone, reach: number) => {
      for (let dy = -reach; dy <= reach; dy++) {
        const span = reach - Math.abs(dy);
        for (let dx = -span; dx <= span; dx++) if (this.map.get({ x: x + dx, y: y + dy }) === zone) return true;
      }
      return false;
    };
    if (this.smog[id] > homeSites.worker.smog || near('industrial', homeSites.worker.factoryWithin)) return 'worker';
    if (this.shore[id]) return 'riverside';
    if (this.green[id] >= homeSites.garden.green || this.grand[id]) return 'garden';
    if (this.covered.highschool[id] || this.covered.university[id]) return 'campus';
    if (this.valueOf(id) >= homeSites.villa.value) return 'villa';
    if (near('commercial', 1)) return 'downtown';
    if (this.transitCover[id]) return 'station';
    if (!SERVICES.some(service => this.covered[service][id]) && !near('commercial', homeSites.suburb.shopsBeyond)) {
      return 'suburb';
    }
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
    let flow = weekendAt(this.clock) ? this.shiftFlows[SHOP_SHIFT][id] : this.flows[id];
    if (hour !== undefined) {
      flow = 0;
      for (const shift of rushShifts(hour)) if (this.shiftRuns(shift)) flow += this.shiftFlows[shift][id];
      flow += this.outingFlows[id];
    }
    flow += this.freightFlows[id];
    return this.crashDelay(cell) ? Math.max(1, congestion(flow, tile)) : congestion(flow, tile);
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

  /** Whether a tile is within reach of a stop on a working line. */
  hasTransit(cell: Cell): boolean {
    return this.map.get(cell) !== undefined && this.transitCover[indexOf(cell)] === 1;
  }

  /** Building permissions; legacy saves retain every parcel. */
  private readonly ownedLand = new Set(ALL_LAND);

  /** Only a brand-new playable city starts with a restricted parcel. */
  startExpansion(): void {
    if (this.buildings.size || this.zones.size) throw new Error('只能在新城市設定起始土地。');
    this.ownedLand.clear();
    this.ownedLand.add(land.start);
  }

  owns(cell: Cell): boolean {
    const id = parcelAt(cell);
    return id !== undefined && this.ownedLand.has(id);
  }

  getLand() {
    const price = landPrice(this.ownedLand.size, this.level);
    return ALL_LAND.map(id => ({ id, owned: this.ownedLand.has(id),
      available: !this.ownedLand.has(id) && adjoining(id, this.ownedLand), price }));
  }

  buyLand(id: number): { error?: string; cost: number } {
    const plot = this.getLand().find(plot => plot.id === id);
    if (!plot) return { error: '這塊土地不在地圖裡。', cost: 0 };
    if (plot.owned) return { error: '這塊土地已經是你的。', cost: 0 };
    if (!plot.available) return { error: '只能購買與已有土地共邊相鄰的區塊。', cost: 0 };
    if (this.funds < plot.price) return { error: `錢不夠：買地要 $${plot.price}。`, cost: 0 };
    this.funds -= plot.price;
    this.ownedLand.add(id);
    return { cost: plot.price };
  }

  /** Factory-to-shop shipments derived from employment and road connectivity. */
  getFreight(): readonly FreightRoute[] { return this.freight; }

  getFreightMode(): FreightMode { return this.freightMode; }
  getFreightLines(): readonly FreightLine[] { return this.freightPlans; }

  setFreightMode(mode: FreightMode): { error?: string } {
    if (mode !== 'auto' && mode !== 'manual') return { error: '請選擇自動或手動配送。' };
    this.freightMode = mode;
    this.refresh();
    return {};
  }

  addFreightLine(): { id?: number; error?: string } {
    if (this.freightLines.length >= freightRules.maxLines) return { error: `最多 ${freightRules.maxLines} 條物流路線。` };
    const id = Math.max(0, ...this.freightLines.map(line => line.id)) + 1;
    const available = freight.maxVehicles - this.freightLines.reduce((sum, line) => sum + line.vehicles, 0);
    this.freightLines.push({ id, stops: [], vehicles: available > 0 ? 1 : 0 });
    this.freightMode = 'manual';
    this.refresh();
    return { id };
  }

  removeFreightLine(id: number): void {
    const at = this.freightLines.findIndex(line => line.id === id);
    if (at < 0) return;
    this.freightLines.splice(at, 1);
    this.refresh();
  }

  setFreightVehicles(id: number, count: number): { error?: string } {
    const line = this.freightLines.find(line => line.id === id);
    if (!line || !Number.isFinite(count)) return { error: '找不到這條物流路線或車輛數不正確。' };
    const vehicles = Math.max(0, Math.min(freight.maxVehicles, Math.round(count)));
    const others = this.freightLines.reduce((sum, item) => sum + (item.id === id ? 0 : item.vehicles), 0);
    if (others + vehicles > freight.maxVehicles) return { error: `全市最多 ${freight.maxVehicles} 輛物流車，請先減少其他路線的配車。` };
    line.vehicles = vehicles;
    this.refresh();
    return {};
  }

  toggleFreightStop(id: number, cell: Cell): { added?: boolean; error?: string } {
    const line = this.freightLines.find(line => line.id === id);
    if (!line || !Number.isInteger(cell.x) || !Number.isInteger(cell.y) || cell.x < 0 || cell.y < 0 || cell.x >= MAP_SIZE || cell.y >= MAP_SIZE) return { error: '找不到物流路線或站點。' };
    const stop = indexOf(cell);
    const at = line.stops.indexOf(stop);
    if (at >= 0) {
      line.stops.splice(at, 1);
      this.refresh();
      return { added: false };
    }
    const tile = this.map.get(cell);
    if (tile === 'industrial') {
      if (line.stops.length && this.map.at(line.stops[0]) !== 'commercial') line.stops[0] = stop;
      else {
        if (line.stops.length >= freightRules.maxStops) return { error: `每條最多 ${freightRules.maxStops} 個站點。` };
        line.stops.unshift(stop);
      }
    } else if (tile === 'warehouse') {
      if (!line.stops.length) line.stops.push(stop);
      else if (this.map.at(line.stops[0]) === 'warehouse') line.stops[0] = stop;
      else {
        if (line.stops.length >= freightRules.maxStops) return { error: `每條最多 ${freightRules.maxStops} 個站點。` };
        line.stops.push(stop);
      }
    } else if (tile === 'commercial') {
      if (!line.stops.length || !['industrial', 'warehouse'].includes(this.map.at(line.stops[0]))) return { error: '請先點工廠或物流倉庫作為出貨起點，再點商業區店鋪。' };
      if (line.stops.length >= freightRules.maxStops) return { error: `每條最多 ${freightRules.maxStops} 個站點。` };
      line.stops.push(stop);
    } else return { error: '物流站點請選工廠、物流倉庫或商業區店鋪。' };
    this.refresh();
    return { added: true };
  }

  getLogistics(): FreightReport {
    const components = new Set<number>();
    for (const source of this.freightSources) {
      const road = this.roadAccess(cellAt(source.id));
      const component = road && this.roadGraph.componentAt(road);
      if (component !== undefined) components.add(component);
    }
    const report = summarizeFreight(this.freightSources, this.freightShops, this.freight, id => {
      const road = this.roadAccess(cellAt(id));
      const component = road && this.roadGraph.componentAt(road);
      return component !== undefined && components.has(component);
    });
    if (this.freightMode === 'manual') for (const shop of report.destinations) {
      if (!shop.missing) continue;
      const serving = this.freightPlans.filter(line => line.stops.slice(1).includes(shop.id));
      if (!serving.length) shop.problem = 'unrouted';
      else if (serving.every(line => !line.vehicles)) shop.problem = 'no-vehicles';
      else if (serving.every(line => line.problem === 'no-road')) shop.problem = 'disconnected';
      else if (shop.problem === 'shortage') shop.problem = 'manual-limit';
    }
    return { ...report, mode: this.freightMode, lines: this.freightPlans,
      vehicles: this.freightLines.reduce((sum, line) => sum + line.vehicles, 0), operations: this.shipments.report() };
  }

  /** The bus and metro lines, with their routes, timings and riders. */
  getLines(): readonly Line[] {
    return this.plans;
  }

  /** Starts an empty line and returns its number, or says why not. */
  addLine(kind: TransitKind): { id?: number; error?: string } {
    if (this.lines.length >= transit.maxLines) return { error: `最多只能有 ${transit.maxLines} 條路線。` };
    const id = 1 + Math.max(0, ...this.lines.map(line => line.id));
    this.lines.push({ id, kind, stops: [], vehicles: 1 });
    this.refresh();
    return { id };
  }

  removeLine(id: number): void {
    const index = this.lines.findIndex(line => line.id === id);
    if (index < 0) return;
    this.lines.splice(index, 1);
    this.refresh();
  }

  /**
   * Adds the stop on a cell to the end of a line, or takes it off the line if it is already
   * on it. Returns what was done, or why nothing was.
   */
  toggleStop(id: number, cell: Cell): { added?: boolean; error?: string } {
    const line = this.lines.find(candidate => candidate.id === id);
    if (!line) return { error: '找不到這條路線。' };
    const name = line.kind === 'bus' ? '公車站' : '捷運站';
    if (this.stopAt(cell) !== line.kind) return { error: `這條路線只能連接${name}，請點地圖上的${name}。` };
    const stop = indexOf(cell);
    const at = line.stops.indexOf(stop);
    if (at >= 0) line.stops.splice(at, 1);
    else line.stops.push(stop);
    this.refresh();
    return { added: at < 0 };
  }

  /** The kind of stop on a cell: a bus stop beside the road, or a metro station under it. */
  private stopAt(cell: Cell): TransitKind | undefined {
    return this.map.hasStation(cell) ? 'metro' : this.map.get(cell) === 'bus' ? 'bus' : undefined;
  }

  /** Buys or sells vehicles so the line has `count` of them. Selling gives nothing back. */
  setVehicles(id: number, count: number): { error?: string; cost: number } {
    const line = this.lines.find(candidate => candidate.id === id);
    if (!line) return { error: '找不到這條路線。', cost: 0 };
    const wanted = Math.max(1, Math.min(transit.maxVehicles, Math.round(count)));
    const cost = Math.max(0, wanted - line.vehicles) * transit[line.kind].vehicleCost;
    if (cost > this.funds) return { error: `錢不夠：要 $${cost}，現在只有 $${Math.floor(this.funds)}。`, cost: 0 };
    this.funds -= cost;
    line.vehicles = wanted;
    this.refresh();
    return { cost };
  }

  /** Whether a tile is within reach of a station of the service. */
  isCovered(cell: Cell, service: Service): boolean {
    return this.map.get(cell) !== undefined && this.covered[service][indexOf(cell)] === 1;
  }

  /** The latest events, oldest first. */
  crashDelay(cell: Cell): boolean {
    return this.events.some(event => (event.kind === 'crash' || event.kind === 'crash-cleared') &&
      event.cell.x === cell.x && event.cell.y === cell.y &&
      this.clock - event.tick < (event.station ? 2 : calendar.ticksPerDay));
  }

  private rollCrash(tick: number, seed: number): void {
    const routes = this.commutes.filter(route => route.workers > route.riders && route.path.length >= mind.driveFrom);
    if (!routes.length || roll(seed, tick, 201) / 2 ** 32 >= Math.min(0.1, routes.length * 0.001)) return;
    const route = routes[roll(seed, tick, 202) % routes.length];
    const cell = route.path[roll(seed, tick, 203) % route.path.length];
    const component = this.roadGraph.componentAt(cell);
    const responder = (service: 'police' | 'hospital') => {
      const reach = services.radius[service];
      let best: Cell | undefined;
      let shortest = Infinity;
      for (let dy = -reach; dy <= reach; dy++) {
        const span = reach - Math.abs(dy);
        for (let dx = -span; dx <= span; dx++) {
          const station = { x: cell.x + dx, y: cell.y + dy };
          if (this.map.get(station) !== service) continue;
          const door = this.doorOf(station);
          if (!door || this.roadGraph.componentAt(door) !== component) continue;
          const path = this.roadGraph.shortestPath(cell, door);
          if (!path || path.distance >= shortest) continue;
          best = station;
          shortest = path.distance;
        }
      }
      return best;
    };
    const police = responder('police');
    this.events.push({ tick, kind: police ? 'crash-cleared' : 'crash', cell, station: police });
    if (roll(seed, tick, 204) % 3 === 0) {
      const hospital = responder('hospital');
      this.events.push({ tick, kind: hospital ? 'crash-hospital' : 'crash-no-hospital', cell, station: hospital });
      if (hospital) {
        const id = indexOf(hospital);
        this.monthlyVisits.set(id, (this.monthlyVisits.get(id) ?? 0) + 1);
      }
    }
    if (this.events.length > EVENT_LOG) this.events.splice(0, this.events.length - EVENT_LOG);
  }

  getEvents(): readonly CityEvent[] {
    return this.events;
  }

  /** What happened to residents lately, oldest first. */
  getNews(): readonly PersonNews[] {
    return this.news;
  }

  private tell(kind: PersonNews['kind'], home: number, person: SavedPerson, shift?: number): void {
    this.news.push({ tick: this.clock, kind,
      name: this.whoAt(home, person).name,
      home: cellAt(home), shift, car: kind === 'new-car' ? person.car : undefined });
    if (this.news.length > NEWS_LOG) this.news.shift();
  }

  /** A new resident takes the home's next place. */
  private moveIn(building: SavedBuilding, tick: number): void {
    this.bonds.clear();
    building.people!.push({ slot: building.nextSlot!++, job: -1, came: tick, hired: 0 });
    building.occupants++;
  }

  /** Someone leaves a home: one without work if there is one, the latest to arrive first. */
  private moveOut(building: SavedBuilding, why?: 'left-no-work' | 'left-no-room'): void {
    const people = building.people!;
    if (!people.length || (why === 'left-no-room' && people.some(person => (person.graceUntil ?? 0) > this.clock))) return;
    let index = people.length - 1;
    for (let at = index; at >= 0; at--) {
      if (people[at].job < 0 && this.canWork(building.id, people[at])) {
        index = at;
        break;
      }
    }
    this.bonds.clear();
    if (why && (people[index].graceUntil ?? 0) > this.clock) return;
    const [person] = people.splice(index, 1);
    this.visits.cancelResident(building.id, person.slot);
    building.occupants--;
    if (why) this.tell(why, building.id, person);
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

  /** What a city of this size expects that this home is out of reach of. */
  private unmet(id: number): typeof expectations {
    return expectations.filter(need => this.residents >= need.population && !this.covered[need.service][id]);
  }

  private valueOf(id: number): number {
    const zone = this.map.at(id);
    let value = landValue.base + this.green[id] + (this.shore[id] ? landValue.waterfront.value : 0) +
      (this.grand[id] ? landValue.bigPark.bonus : 0);
    if (this.served.power.has(id) && this.served.water.has(id)) value += landValue.utilities;
    for (const service of SERVICES) if (this.covered[service][id]) value += services.value[service];
    if (this.unsafe(id)) value -= services.crime.penalty;
    if (this.scared[id]) value -= scare.value;
    value += Math.min(12, COMBOS.reduce((bonus, combo) => bonus + (this.near[combo]?.[id] ? comboValue(combo)!.amount : 0), 0));
    if (zone !== 'industrial') value -= landValue.pollution * this.smog[id];
    if (zone === 'residential') {
      value -= Math.min(landValue.commute.max,
        landValue.commute.perMinute * (this.commuteMinutes.get(id) ?? 0));
      value += Math.min(traits.gardener.most, traits.gardener.value * (this.gardeners.get(id) ?? 0));
      // The share of residents no shop can serve.
      const { needed, served } = this.market;
      if (needed > served) value -= goods.shopPenalty * (needed - served) / needed;
      for (const need of this.unmet(id)) value -= need.penalty;
    }
    if (zone === 'residential' && this.bondOf(id) >= bond.close) value += bond.value;
    return Math.max(0, Math.min(100, value));
  }

  /** One resident as the panel shows them: who they are, how long here, and their work if any. */
  private describe(home: number, person: SavedPerson) {
    const who = this.whoAt(home, person);
    const zone = person.job >= 0 ? this.map.at(person.job) as Zone : undefined;
    return { ...who, id: person.identity?.id, age: who.age,
      /** Days since they moved in, and since they started the job they have. */
      days: Math.floor((this.clock - person.came) / calendar.ticksPerDay),
      shift: zone ? shiftIndex(zone, person.job) : undefined,
      workDays: zone ? Math.floor((this.clock - person.hired) / calendar.ticksPerDay) : undefined,
      /** Whether their job is of the kind they like; undefined if they do not care or have none. */
      content: who.liking && zone ? who.liking === zone : undefined,
      home: cellAt(home), work: zone ? cellAt(person.job) : undefined, homeId: home, slot: person.slot,
      /** What they own, what they have saved and what they earn a day. */
      car: person.car ?? 0, money: person.money ?? 0, bank: this.bankFor(cellAt(home)),
      pay: zone ? this.payAt(person.job, who.trait === 'rich', home) : 0, school: this.schoolOf(home),
      /** What the vehicle costs a day to keep, and where it is kept. */
      keep: Math.round(this.keepCost(home, person.car ?? 0,
        this.commutes.find(route => route.homeId === home && route.workId === person.job)?.path.length ?? 0).cost),
      parking: this.parkingOf(home) };
  }

  /** How business is at a workplace, when it is better or worse than usual (see `trade` in Wealth.ts). */
  tradeOf(id: number): Trade | undefined {
    const zone = this.map.at(id);
    const staff = this.buildings.get(id)?.occupants ?? 0;
    if (zone === 'industrial') return staff && this.market.made < this.market.needed ? 'good' : undefined;
    if (zone !== 'commercial' || !staff) return undefined;
    if (this.scared[id]) return 'quiet';
    const share = (this.custom.get(id) ?? 0) / (staff * goods.perClerk);
    return share >= trade.busy ? 'busy' : share >= trade.good ? 'good' : share < trade.quiet ? 'quiet' : undefined;
  }

  /** A day's pay at a workplace as business there is now. */
  private payAt(job: number, rich: boolean, home: number): number {
    const state = this.tradeOf(job);
    const school = this.schoolOf(home);
    return Math.round(dayPay(this.map.at(job) as 'commercial' | 'industrial', this.buildings.get(job)?.level ?? 1, rich) *
      (state ? trade.times[state] : 1) * (school ? schooling[school] : 1));
  }

  /** The schooling the people of a home are taken to have: the best school in whose reach it lies. */
  private schoolOf(home: number): 'university' | 'highschool' | undefined {
    return this.covered.university[home] ? 'university' : this.covered.highschool[home] ? 'highschool' : undefined;
  }

  /**
   * Answers the decision that is waiting: 0 for its first answer, 1 for its second. Money
   * changes hands at once; what it does to demand lasts as long as the answer says.
   */
  decide(answer: 0 | 1): void {
    if (!this.dilemma) return;
    const { id } = this.dilemma;
    const taken: Answer = dilemmas.list.find(entry => entry.id === id)!.answers[answer];
    this.funds += taken.funds ?? 0;
    if (taken.demand) {
      this.boosts.push({ amount: taken.demand.amount, until: this.clock + taken.demand.days * calendar.ticksPerDay });
    }
    const lost = taken.risk && roll(this.seed, this.clock, 91) / 2 ** 32 < taken.risk.chance ? -taken.risk.funds : 0;
    this.funds -= lost;
    // A business the answer brings opens in a shop that has none yet.
    const shops = this.freeShops();
    const shop = taken.brand && shops.length ? shops[roll(this.seed, this.clock, 94) % shops.length] : undefined;
    if (shop) shop.brand = taken.brand;
    this.dilemmaEnd = { id, answer, lost, tick: this.clock, opened: shop && cellAt(shop.id) };
    this.dilemma = undefined;
    if (shop) this.refresh();
  }

  /** The shops no business has moved into. */
  private freeShops(): SavedBuilding[] {
    return [...this.buildings.values()].filter(building => this.map.at(building.id) === 'commercial' && !building.brand);
  }

  /** Lets a decision nobody made pass, and now and then brings a new one. Once a day. */
  private reviewDilemma(tick: number): void {
    for (let index = this.boosts.length - 1; index >= 0; index--) {
      if (this.boosts[index].until <= tick) this.boosts.splice(index, 1);
    }
    if (this.dilemma) {
      if (tick >= this.dilemma.until) {
        this.dilemmaEnd = { id: this.dilemma.id, answer: -1, lost: 0, tick };
        this.dilemma = undefined;
      }
      return;
    }
    const day = Math.floor(tick / calendar.ticksPerDay);
    if (day % dilemmas.every || this.residents < dilemmas.population ||
        roll(this.seed, tick, 92) / 2 ** 32 >= dilemmas.chance) return;
    // What needs a shop to open in is not put to a city without one.
    const open = this.freeShops().length ? dilemmas.list : dilemmas.list.filter(entry => !entry.answers.some(answer => answer.brand));
    const pick = open[roll(this.seed, tick, 93) % open.length];
    this.dilemma = { id: pick.id as Dilemma['id'], until: tick + dilemmas.days * calendar.ticksPerDay };
  }

  /** What the month's goods bought and sold outside come to at today's prices. */
  private tradeNow(): number {
    return Math.round(this.market.trade * goodsPrice(this.clock) * this.level);
  }

  /** Whether a commute is held up: it takes this much longer than the empty road would. */
  private shiftRuns(shift: number): boolean {
    return !weekendAt(this.clock) || shift === SHOP_SHIFT;
  }

  private heldUp(route: Commute): boolean {
    return this.shiftRuns(route.shift) && route.minutes > mind.jam * route.path.length * traffic.minutesPerTile;
  }

  /** What a day's fuel costs someone with a vehicle and this far to drive, and whether a station is in reach of home. */
  private fuelFor(home: number, tiles: number): { cost: number; local: boolean } {
    const local = this.covered.gas[home] === 1;
    return { local, cost: prices.fuel.perTile * 2 * tiles * fuelPrice(this.clock) * this.level * (local ? 1 : prices.fuel.away) };
  }

  /** Where a home's cars are kept: in a city car park near by, under the building, or at the kerb. */
  private parkingOf(home: number): 'lot' | 'garage' | 'kerb' {
    const { x, y } = cellAt(home);
    const reach = prices.keep.lotReach;
    for (let dy = -reach; dy <= reach; dy++) {
      for (let dx = -reach; dx <= reach; dx++) if (this.map.get({ x: x + dx, y: y + dy }) === 'parking') return 'lot';
    }
    return (this.buildings.get(home)?.level ?? 1) >= 2 ? 'garage' : 'kerb';
  }

  /**
   * What keeping a vehicle of a tier costs a day for someone of this home with this far to
   * drive: licence, parking and fuel. `toCity` is the part of the parking that goes to the city.
   */
  private keepCost(home: number, tier: number, tiles: number): { cost: number; toCity: number } {
    if (!tier || tier >= vehicles.length) return { cost: 0, toCity: 0 };
    const where = this.parkingOf(home);
    const parking = where === 'kerb' ? 0 : prices.keep.parking[tier] * this.level / calendar.daysPerMonth;
    return { cost: vehicles[tier].licence * this.level / calendar.daysPerMonth + parking + this.fuelFor(home, tiles).cost,
      toCity: where === 'lot' ? parking : 0 };
  }

  /** Turns a policy on or off. */
  setPolicy(policy: Policy, on: boolean): void {
    if (on) this.policiesOn.add(policy);
    else this.policiesOn.delete(policy);
    this.refresh();
  }

  /** The last task done and how the last challenge ended, for telling the player. Not saved. */
  getNotices() {
    return { taskDone: this.taskDone, challengeEnd: this.challengeEnd, dilemmaEnd: this.dilemmaEnd };
  }

  /** The festivals held lately, newest last. Not saved. */
  getFeasts(): readonly { id: FestivalId; tick: number; income: number }[] {
    return this.feasts;
  }

  /** How good a place the city has for a festival: 0 for none, more for a better one. */
  private venueOf(id: FestivalId): number {
    const has = (tile: string) => (this.tileCounts.get(tile) ?? 0) > 0;
    const { comboCounts: groups } = this;
    switch (id) {
      case 'newyear': return this.bigParks ? (groups.forest || groups.riverpark ? 1.5 : 1) : 0;
      case 'temple': return has('temple') ? (groups.fair ? 1.5 : 1) : 0;
      case 'games': return has('stadium') ? 2 : has('highschool') ? 1 : 0;
      case 'harvest': return this.market.farmed ? (groups.farmstead ? 1.5 : 1) : 0;
      case 'market': return has('mall') || groups.arcade || groups.plaza || groups.foodstreet ? 1.5 : has('market') ? 1 : 0;
    }
  }

  /** Holds today's festival, if it is the day of one and the city has somewhere for it. */
  private holdFestival(tick: number): void {
    const next = nextFestival(tick);
    if (next.days !== 0 || !this.residents) return;
    const festival = festivals.find(entry => entry.id === next.id)!;
    const venue = this.venueOf(festival.id);
    const income = Math.round((festival.perResident * this.residents + festival.perGood * this.market.farmed) * venue *
      (this.policiesOn.has('festive') ? policies.festive.times : 1));
    this.funds += income;
    this.feasts.push({ id: festival.id, tick, income });
    if (this.feasts.length > 10) this.feasts.shift();
  }

  /** What a challenge measures. */
  private challengeFigure(id: Challenge['id']): number {
    return id === 'grow' ? this.residents : id === 'riders' ? this.riders : this.levelCounts()[2] + this.levelCounts()[3];
  }

  /** Pays for a challenge met, drops one that ran out, and now and then sets a new one. Once a day. */
  private reviewChallenge(tick: number): void {
    const day = Math.floor(tick / calendar.ticksPerDay);
    if (this.challenge) {
      const { id, target, until } = this.challenge;
      const won = this.challengeFigure(id) >= target;
      if (!won && tick < until) return;
      if (won) this.funds += challenges.list.find(entry => entry.id === id)!.reward;
      this.challengeEnd = { id, won, tick };
      this.challenge = undefined;
      return;
    }
    if (day % challenges.every || this.residents < challenges.population) return;
    const open = challenges.list.filter(entry => entry.id !== 'riders' || this.plans.some(plan => plan.active));
    const pick = open[roll(this.seed, tick, 81) % open.length];
    const now = this.challengeFigure(pick.id);
    this.challenge = { id: pick.id, target: Math.max(Math.ceil(now * pick.by), now + pick.least),
      until: tick + challenges.days * calendar.ticksPerDay };
  }

  /** Works out every shop's customers. */
  private shareCustom(): void {
    this.custom.clear();
    const { reach } = trade;
    for (const [home, building] of this.buildings) {
      if (this.map.at(home) !== 'residential' || !building.occupants) continue;
      const { x, y } = cellAt(home);
      const shops: SavedBuilding[] = [];
      let staff = 0;
      for (let dy = -reach; dy <= reach; dy++) {
        const span = reach - Math.abs(dy);
        for (let dx = -span; dx <= span; dx++) {
          const cell = { x: x + dx, y: y + dy };
          if (this.map.get(cell) !== 'commercial') continue;
          const shop = this.buildings.get(indexOf(cell));
          if (!shop?.occupants) continue;
          shops.push(shop);
          staff += shop.occupants;
        }
      }
      for (const shop of shops) {
        this.custom.set(shop.id, (this.custom.get(shop.id) ?? 0) + building.occupants * shop.occupants / staff);
      }
    }
  }

  /** Forgets the frights that are over and marks the neighbourhoods still frightened. */
  private markScares(): void {
    this.scared.fill(0);
    for (let index = this.scares.length - 1; index >= 0; index--) {
      if (this.scares[index].until <= this.clock) this.scares.splice(index, 1);
    }
    for (const { id } of this.scares) {
      const { x, y } = cellAt(id);
      for (let dy = -scare.reach; dy <= scare.reach; dy++) {
        const span = scare.reach - Math.abs(dy);
        for (let dx = -span; dx <= span; dx++) {
          const cell = { x: x + dx, y: y + dy };
          if (this.map.get(cell) !== undefined) this.scared[indexOf(cell)] = 1;
        }
      }
    }
  }

  /** The special group a tile belongs to, if any. */
  comboAt(cell: Cell): Combo | undefined {
    const code = this.map.get(cell) === undefined ? 0 : this.special[indexOf(cell)];
    return code ? COMBOS[code - 1] : undefined;
  }

  hasCombo(cell: Cell, combo: Combo): boolean {
    return this.map.get(cell) !== undefined && this.member(indexOf(cell), combo);
  }

  combosAt(cell: Cell): Combo[] {
    return COMBOS.filter(combo => this.hasCombo(cell, combo));
  }

  private member(id: number, combo: Combo): boolean {
    return (this.memberships[id] & (1 << COMBOS.indexOf(combo))) !== 0;
  }

  /** What a home on this tile is called for what it stands by: a forest cabin or a farmhouse. */
  nickAt(cell: Cell): 'cabin' | 'farmhouse' | undefined {
    const id = indexOf(cell);
    return this.wild[id] ? 'cabin' : this.rural[id] ? 'farmhouse' : undefined;
  }

  /** Whether a farmstead's barn stands on a tile. */
  barnAt(cell: Cell): boolean {
    return this.barns.has(indexOf(cell));
  }

  /** What one group of a kind brings in a month; nothing for the kinds that bring none. */
  private comboIncome(group: Combo): number {
    const income = comboIncome(group);
    return income ? Math.round(Math.min(income.most, this.residents * income.perResident)) : 0;
  }

  /**
   * Where on the map something is: the buildings with a problem, the tiles of a special group,
   * the homes of people with a trait, the civic buildings without a road, or where the people
   * of one home work. For pointing things out.
   */
  find(what: { issue: Issue } | { combo: Combo } | { trait: Trait } | { idle: true } | { worksOf: Cell } | { brand: Brand }): Cell[] {
    const found: number[] = [];
    if ('brand' in what) {
      for (const building of this.buildings.values()) if (building.brand === what.brand) found.push(building.id);
    } else if ('combo' in what) {
      const bit = 1 << COMBOS.indexOf(what.combo);
      this.memberships.forEach((value, id) => { if (value & bit) found.push(id); });
    } else if ('idle' in what) {
      for (let id = 0; id < MAP_SIZE ** 2; id++) {
        const tile = this.map.at(id);
        if ((isFacility(tile) || isService(tile) || tile === 'bus') && !this.doorOf(cellAt(id))) found.push(id);
      }
    } else if ('worksOf' in what) {
      for (const person of this.buildings.get(indexOf(what.worksOf))?.people ?? []) {
        if (person.job >= 0 && !found.includes(person.job)) found.push(person.job);
      }
    } else {
      for (const [id, building] of this.buildings) {
        if ('issue' in what ? this.issuesOf(id, building).includes(what.issue) :
          building.people?.some(person => this.traitAt(id, person.slot) === what.trait)) found.push(id);
      }
    }
    return found.sort((a, b) => a - b).map(cellAt);
  }

  /** Finds the special groups (see Combos.ts). Parks must have been grouped first. */
  private findCombos(): void {
    const { special, rural } = this;
    special.fill(0);
    this.memberships.fill(0);
    this.nearNightMarket.fill(0);
    this.coldRoutes.clear();
    for (const id of this.coldStock.keys()) if (this.map.at(id) !== 'coldstore') this.coldStock.delete(id);
    for (const id of this.marketStock.keys()) if (this.map.at(id) !== 'market') this.marketStock.delete(id);
    this.daycareSeats.clear();
    this.recyclingRoutes.clear();
    rural.fill(0);
    for (const field of Object.values(this.near)) field.fill(0);
    this.barns.clear();
    for (const combo of COMBOS) this.comboCounts[combo] = 0;
    const around = (id: number, reach: number, visit: (id: number) => void) => {
      const { x, y } = cellAt(id);
      for (let dy = -reach; dy <= reach; dy++) {
        const span = reach - Math.abs(dy);
        for (let dx = -span; dx <= span; dx++) {
          const cell = { x: x + dx, y: y + dy };
          if (this.map.get(cell) !== undefined) visit(indexOf(cell));
        }
      }
    };
    /** Marks the tiles of a group, and those its land value reaches. */
    const mark = (combo: Combo, group: readonly number[], showOn: readonly number[] = group) => {
      this.comboCounts[combo]++;
      this.combosSeen.add(combo);
      const value = comboValue(combo);
      for (const part of group) {
        this.memberships[part] |= 1 << COMBOS.indexOf(combo);
        if (value) around(part, value.reach, near => { this.near[combo]![near] = 1; });
      }
      for (const part of showOn) special[part] = COMBOS.indexOf(combo) + 1;
    };
    /** The tiles that touch `start` and pass `member`, `start` among them. */
    const seen = new Uint8Array(MAP_SIZE ** 2);
    const groupFrom = (start: number, member: (id: number) => boolean) => {
      const group = [start];
      seen[start] = 1;
      for (let next = 0; next < group.length; next++) {
        const { x, y } = cellAt(group[next]);
        for (const [dx, dy] of neighbors) {
          const cell = { x: x + dx, y: y + dy };
          if (this.map.get(cell) === undefined || seen[indexOf(cell)] || !member(indexOf(cell))) continue;
          seen[indexOf(cell)] = 1;
          group.push(indexOf(cell));
        }
      }
      return group;
    };
    /** Whether each of these tiles is within reach of a tile, and how many shop buildings are. */
    const has = (id: number, reach: number, ...tiles: string[]) => {
      const met = new Set<string>();
      around(id, reach, near => { met.add(this.map.at(near)); });
      return tiles.every(tile => met.has(tile));
    };
    const shopsBy = (id: number, reach: number) => {
      let count = 0;
      around(id, reach, near => { if (this.map.at(near) === 'commercial' && this.buildings.has(near)) count++; });
      return count;
    };
    const factory = (id: number) => this.map.at(id) === 'industrial' && this.buildings.has(id);
    const topShop = (id: number) => this.map.at(id) === 'commercial' && this.buildings.get(id)?.level === MAX_LEVEL &&
      !special[id];
    for (let id = 0; id < MAP_SIZE ** 2; id++) {
      const tile = this.map.at(id);
      const works = () => this.doorOf(cellAt(id)) !== undefined;
      if (tile === 'park' && !seen[id]) {
        const group = groupFrom(id, other => this.map.at(other) === 'park');
        if (group.length >= combos.forest.tiles) mark('forest', group);
        else if (group.length >= combos.riverpark.tiles && group.some(part => this.shore[part])) mark('riverpark', group);
      } else if (tile === 'farm' && !seen[id]) {
        const group = groupFrom(id, other => this.map.at(other) === 'farm');
        if (group.length < combos.farmstead.tiles || !group.some(part => this.shore[part])) continue;
        mark('farmstead', group);
        this.barns.add(group[group.length >> 1]);
        for (const part of group) around(part, combos.farmstead.reach, near => { rural[near] = 1; });
      } else if (tile === 'industrial' && !seen[id] && factory(id)) {
        const group = groupFrom(id, factory);
        if (group.length >= combos.estate.buildings) mark(group.some(part => this.shore[part]) ? 'port' : 'estate', group);
      } else if (tile === 'temple') {
        if (works() && has(id, combos.fair.reach, 'market', 'park')) mark('fair', [id]);
      } else if (tile === 'market') {
        if (works() && shopsBy(id, combos.foodstreet.reach) >= combos.foodstreet.shops) mark('foodstreet', [id]);
      } else if (tile === 'casino') {
        if (works() && has(id, combos.funcity.reach, 'cinema', 'mall')) mark('funcity', [id]);
      } else if (tile === 'highschool') {
        if (works() && has(id, combos.campus.reach, 'school', 'park')) mark('campus', [id]);
      } else if (tile === 'hospital') {
        if (works() && has(id, combos.medical.reach, 'clinic')) mark('medical', [id]);
      } else if (isRoad(tile) && this.map.hasStation(cellAt(id))) {
        if (shopsBy(id, combos.plaza.reach) >= combos.plaza.shops) mark('plaza', [id]);
      } else if (tile === 'commercial') {
        const { x, y } = cellAt(id);
        const { side } = combos.arcade;
        if (x + side > MAP_SIZE || y + side > MAP_SIZE) continue;
        const square: number[] = [];
        for (let dy = 0; dy < side; dy++) for (let dx = 0; dx < side; dx++) square.push(id + dy * MAP_SIZE + dx);
        if (square.every(topShop)) mark('arcade', square);
      }
    }

    const access = (id: number) => {
      const cell = cellAt(id);
      return isRoad(this.map.at(id)) ? cell : this.doorOf(cell);
    };
    const nearby = (id: number, reach: number, match: (lot: number) => boolean) => {
      const entry = access(id);
      const component = entry && this.roadGraph.componentAt(entry);
      const lots: number[] = [];
      if (component === undefined) return lots;
      around(id, reach, lot => {
        if (!match(lot)) return;
        const dest = access(lot);
        if (dest && this.roadGraph.componentAt(dest) === component) lots.push(lot);
      });
      return lots;
    };
    const built = (tile: Zone) => (id: number) => this.map.at(id) === tile && this.buildings.has(id);
    const lotOf = (id: number, reach: number, tile: string) => nearby(id, reach, lot => this.map.at(lot) === tile)[0];

    for (const [id, riders] of this.transfers) {
      const shops = nearby(id, combos.interchange.reach, built('commercial'));
      const bus = this.transferStops.get(id)?.map(link => link.bus.stops[link.busIndex]) ?? [];
      if (riders && shops.length) mark('interchange', [id, ...bus, ...shops], [id]);
    }

    for (let id = 0; id < MAP_SIZE ** 2; id++) {
      switch (this.map.at(id)) {
        case 'temple': {
          const reach = combos.nightmarket.reach;
          const square = lotOf(id, reach, 'square');
          const food = nearby(id, reach, lot => built('commercial')(lot) && shiftIndex('commercial', lot) === 2);
          if (square !== undefined && food.length) {
            mark('nightmarket', [id, square, ...food], [square]);
            for (const home of nearby(square, reach + 2, built('residential'))) this.nearNightMarket[home] = 1;
          }
          break;
        }
        case 'daycare': {
          const reach = combos.familyquarter.reach;
          const park = lotOf(id, reach, 'park');
          const homes = nearby(id, reach, built('residential'));
          if (park === undefined || !homes.length) break;
          mark('familyquarter', [id, park, ...homes], [id]);
          let seats = combos.familyquarter.seats;
          for (const home of homes) {
            const placed = Math.min(seats, this.kidsAt(home).length - (this.daycareSeats.get(home) ?? 0));
            this.daycareSeats.set(home, (this.daycareSeats.get(home) ?? 0) + placed);
            seats -= placed;
            if (!seats) break;
          }
          break;
        }
        case 'bank': {
          const reach = combos.localbusiness.reach;
          const homes = nearby(id, reach, built('residential'));
          const shops = nearby(id, reach, built('commercial'));
          if (homes.length && shops.length) mark('localbusiness', [id, ...homes, ...shops], [id]);
          break;
        }
        case 'workshop': {
          const reach = combos.workshop.reach;
          const depot = lotOf(id, reach, 'recycling');
          const factories = nearby(id, reach, factory);
          if (depot !== undefined && factories.length) {
            mark('workshop', [id, depot, ...factories], [id, depot]);
            const route = this.recyclingRoutes.get(depot) ?? new Set<number>();
            for (const lot of factories) route.add(lot);
            this.recyclingRoutes.set(depot, route);
          }
          break;
        }
      }

      const district = combos.chinatown;
      const centre = this.map.at(id);
      if (centre === 'culture' || centre === 'coldstore') {
        const component = this.roadGraph.componentAt(this.doorOf(cellAt(id)) ?? { x: -1, y: -1 });
        if (component === undefined) continue;
        const reach = centre === 'culture' ? combos.arts.reach : combos.coldchain.reach;
        const markets: number[] = [];
        const members: number[] = [];
        around(id, reach, lot => {
          const tile = this.map.at(lot);
          if (tile === 'park' && centre === 'culture') members.push(lot);
          if (tile !== 'market' && tile !== 'farm') return;
          const road = this.doorOf(cellAt(lot));
          if (!road || this.roadGraph.componentAt(road) !== component) return;
          if (tile === 'market') markets.push(lot);
          else if (centre === 'coldstore') members.push(lot);
        });
        if (markets.length && members.length) {
          mark(centre === 'culture' ? 'arts' : 'coldchain', [id, ...markets, ...members], [id]);
          if (centre === 'coldstore') {
            const distance = (lot: number) => Math.abs(cellAt(lot).x - cellAt(id).x) + Math.abs(cellAt(lot).y - cellAt(id).y);
            this.coldRoutes.set(id, { farms: members, markets: markets.sort((a, b) => distance(a) - distance(b)) });
          }
        }
        continue;
      }
      if (centre !== 'temple' && centre !== 'library') continue;
      const reach = centre === 'library' ? combos.bookquarter.reach : district.reach;
      const door = this.doorOf(cellAt(id));
      const component = door && this.roadGraph.componentAt(door);
      if (component === undefined) continue;
      const homes: number[] = [];
      const shops: number[] = [];
      around(id, reach, lot => {
        if (!this.buildings.has(lot)) return;
        const tile = this.map.at(lot);
        if (tile !== 'residential' && (tile !== 'commercial' || shiftIndex(tile, lot) !== 2)) return;
        const road = this.doorOf(cellAt(lot));
        if (!road || this.roadGraph.componentAt(road) !== component) return;
        (tile === 'residential' ? homes : shops).push(lot);
      });
      if (centre === 'library') {
        if (homes.length >= combos.bookquarter.homes && has(id, reach, 'park')) mark('bookquarter', [id, ...homes]);
        continue;
      }
      if (homes.length >= district.homes && shops.length >= district.shops) {
        mark('chinatown', [id, ...homes, ...shops], [...(special[id] ? [] : [id]), ...homes, ...shops]);
      }
    }
  }

  /** Takes up the tasks the city's troubles call for, and pays for the ones that are done. Once a day. */
  private reviewTasks(tick: number): void {
    const counts = this.complaints();
    const day = Math.floor(tick / calendar.ticksPerDay);
    for (let index = this.tasksOn.length - 1; index >= 0; index--) {
      const task = taskList.find(entry => entry.id === this.tasksOn[index])!;
      if (counts[task.issue] > task.to) continue;
      this.tasksOn.splice(index, 1);
      this.tasksRest.set(task.id, day + tasks.rest);
      this.funds += task.reward;
      this.taskDone = { id: task.id, tick };
    }
    for (const task of taskList) {
      if (this.tasksOn.length >= tasks.most) break;
      if (this.tasksOn.includes(task.id) || counts[task.issue] < task.from || (this.tasksRest.get(task.id) ?? 0) > day) continue;
      this.tasksOn.push(task.id);
    }
  }

  /** What a tile of farmland grows in a month. */
  private farmYield(id: number): number {
    return this.smog[id] > pollution.limit ? 0 :
      (this.shore[id] ? goods.farm.watered : goods.farm.dry) * (this.member(id, 'farmstead') ? combos.farmstead.times : 1) *
      seasons.farm[seasonAt(this.clock)];
  }

  /** Whether a sight has a car park near enough to bring it more visitors. */
  private parkingBy(id: number, tile: Service): boolean {
    const { reach } = services.parking;
    // A big building is measured from the middle of its four tiles.
    const { x, y } = cellAt(id);
    const from = isBig(tile) ? 0 : 1;
    for (let dy = -reach; dy <= reach + 1 - from; dy++) {
      for (let dx = -reach; dx <= reach + 1 - from; dx++) {
        if (this.map.get({ x: x + dx, y: y + dy }) === 'parking') return true;
      }
    }
    return false;
  }

  /** What a sight brings in a month: more with more residents, and more again with a car park by it. */
  private sightIncome(id: number, tile: Service): number {
    const sight = services.visitors[tile]!;
    return Math.round(Math.min(sight.most, this.residents * sight.perResident) *
      (this.parkingBy(id, tile) ? services.parking.boost : 1));
  }

  /** The children of a home (see Residents' `childrenAt`). They are not counted as residents. */
  kidsAt(home: number) {
    return this.life.childrenAt(home, this.clock);
  }

  /** The kinds of place a home has within a short walk (see Community.ts). */
  private circleOf(home: number): readonly Place[] {
    let found = this.circles.get(home);
    if (found) return found;
    const { x, y } = cellAt(home);
    const seen = new Set<Place>();
    for (let dy = -circle.reach; dy <= circle.reach; dy++) {
      const span = circle.reach - Math.abs(dy);
      for (let dx = -span; dx <= span; dx++) {
        const cell = { x: x + dx, y: y + dy };
        let tile = this.map.get(cell);
        if (tile === 'annex') tile = this.map.get(this.map.anchorOf(cell) ?? cell);
        if (tile === undefined) continue;
        if (this.map.hasStation(cell) || tile === 'bus') seen.add('stop');
        if (tile === 'commercial' ? this.buildings.has(indexOf(cell)) : tile === 'market') seen.add(tile === 'market' ? 'market' : 'shops');
        else if (tile === 'park' || tile === 'temple') seen.add(tile);
        else if (tile === 'school' || tile === 'highschool') seen.add('school');
        else if (tile === 'clinic' || tile === 'hospital') seen.add('clinic');
        else if (tile === 'cinema' || tile === 'mall' || tile === 'casino' || tile === 'museum' || tile === 'stadium' ||
          tile === 'library' || tile === 'pool' || tile === 'ktv' || tile === 'amusement') seen.add('fun');
      }
    }
    found = PLACES.filter(place => seen.has(place));
    this.circles.set(home, found);
    return found;
  }

  /** How close-knit a home is, 0 to 100 (see Community.ts). An empty home has no bond at all. */
  private bondOf(home: number): number {
    const known = this.bonds.get(home);
    if (known !== undefined) return known;
    const building = this.buildings.get(home);
    const people = building?.people;
    if (!building || !people?.length) return 0;
    const places = this.circleOf(home);
    let ticks = 0;
    let helpers = 0;
    for (const person of people) {
      ticks += this.clock - person.came;
      if (this.traitAt(home, person.slot) === 'helper') helpers++;
    }
    const months = ticks / people.length / (calendar.ticksPerDay * calendar.daysPerMonth);
    const value = bond.base + Math.min(bond.months, months * bond.perMonth) + places.length * bond.perPlace +
      (places.includes('temple') ? bond.temple : 0) + (places.includes('park') ? bond.park : 0) +
      Math.min(bond.helpers, helpers * bond.helper) + (this.unsafe(home) ? bond.unsafe : 0);
    const rounded = Math.round(Math.max(0, Math.min(100, value)));
    this.bonds.set(home, rounded);
    return rounded;
  }

  /** A day's pay and a day's bills for everyone; whoever has saved enough buys the next vehicle up. */
  bankFor(home: Cell): Cell | undefined {
    if (!this.isCovered(home, 'bank')) return undefined;
    const road = this.roadBeside(home);
    const component = road && this.roadGraph.componentAt(road);
    if (component === undefined) return undefined;
    let nearest: Cell | undefined;
    let distance = services.radius.bank + 1;
    for (const bank of this.bankSites) {
      const next = Math.abs(bank.x - home.x) + Math.abs(bank.y - home.y);
      if (next >= distance) continue;
      const entry = this.roadBeside(bank);
      if (entry && this.roadGraph.componentAt(entry) === component) {
        nearest = bank;
        distance = next;
      }
    }
    return nearest;
  }

  private payDay(): void {
    const routes = new Map(this.commutes.map(route => [route.homeId * MAP_SIZE ** 2 + route.workId, route]));
    for (const [id, building] of this.buildings) {
      if (this.map.at(id) !== 'residential') continue;
      for (const person of building.people!) {
        const zone = person.job >= 0 ? this.map.at(person.job) : undefined;
        let money = person.money ?? 0;
        let spare = 0;
        if (zone === 'commercial' || zone === 'industrial') {
          const route = routes.get(id * MAP_SIZE ** 2 + person.job);
          // Held up on the road, they are late and docked for it.
          const share = route && this.heldUp(route) ? 1 - prices.late.dock : 1;
          const earned = this.payAt(person.job, this.traitAt(id, person.slot) === 'rich', id) * share * this.level;
          money += earned - pay.living * this.level;
          const tiles = route?.path.length ?? 0;
          money -= this.keepCost(id, person.car ?? 0, tiles).cost;
          // A vehicle they cannot pay for is sold, and they go down to the next one.
          if (money < 0 && person.car) {
            money = Math.max(0, money) + prices.keep.resale * vehicles[person.car].price;
            person.car--;
            if (!person.car) delete person.car;
            this.tell('sold-car', id, person);
          }
          // What is left of a day's pay once the next vehicle up is paid for: nobody buys one they could not keep.
          spare = earned - pay.living * this.level - this.keepCost(id, (person.car ?? 0) + 1, tiles).cost;
          money = Math.round(Math.max(0, money));
        } else {
          // A basic outside pension covers a retiree's modest living costs; it does not create city tax revenue.
          money = Math.max(0, Math.round(money - (this.whoAt(id, person).age >= 65 ? 0 : pay.living / 2 * this.level)));
        }
        const next = vehicles[(person.car ?? 0) + 1];
        if (next && money >= next.price && spare > 0) {
          money -= next.price;
          person.car = (person.car ?? 0) + 1;
          // A scooter is no news; a car is.
          if (person.car > 1) this.tell('new-car', id, person);
        }
        // Residents with a reachable bank earn 0.5% on savings each game month.
        if (this.clock % (calendar.ticksPerDay * calendar.daysPerMonth) === 0 && money >= 200 &&
            this.bankFor(cellAt(id))) money += Math.floor(money * 0.005);
        if (money) person.money = money;
        else delete person.money;
      }
    }
    this.countCars();
  }

  private countCars(): void {
    this.carCounts.fill(0);
    this.licence = 0;
    this.fuelTax = 0;
    this.parkingFees = 0;
    const routes = new Map(this.commutes.map(route => [route.homeId * MAP_SIZE ** 2 + route.workId, route]));
    for (const [id, building] of this.buildings) {
      if (this.map.at(id) !== 'residential') continue;
      for (const person of building.people!) {
        this.carCounts[person.car ?? 0]++;
        this.licence += vehicles[person.car ?? 0].licence;
        const route = person.car ? routes.get(id * MAP_SIZE ** 2 + person.job) : undefined;
        if (!route) continue;
        // The city's share of the fuel bought at its own stations, as a month's figure.
        const fuel = this.fuelFor(id, route.path.length);
        if (fuel.local) this.fuelTax += fuel.cost * prices.fuel.tax * calendar.daysPerMonth;
        this.parkingFees += this.keepCost(id, person.car!, route.path.length).toCity * calendar.daysPerMonth;
      }
    }
  }

  /** In a town of some size, people who are miserable may give up and leave. */
  private leaveUnhappy(tick: number, seed: number): boolean {
    if (this.residents < mind.leave.population) return false;
    const routes = new Map<number, Commute>();
    for (const route of this.commutes) routes.set(route.homeId * MAP_SIZE ** 2 + route.workId, route);
    let left = false;
    for (const [id, building] of this.buildings) {
      if (this.map.at(id) !== 'residential' || !building.people!.length) continue;
      const facts = this.factsFor(id, building, job => routes.get(id * MAP_SIZE ** 2 + job));
      const moods = building.people!.map(person => moodOf(thoughtsOf(facts(person))));
      for (let index = moods.length - 1; index >= 0; index--) {
        const person = building.people![index];
        if (moods[index] >= mind.leave.mood ||
            roll(seed, tick, 40000 + id * 7 + person.slot) / 2 ** 32 >= mind.leave.chance) continue;
        this.bonds.clear();
        building.people!.splice(index, 1);
        building.occupants--;
        this.tell('left-unhappy', id, person);
        left = true;
      }
    }
    return left;
  }

  /** The vehicle of the commuter the map shows going from a home to a workplace. */
  carOn(homeId: number, workId: number): number {
    return this.buildings.get(homeId)?.people?.find(person => person.job === workId)?.car ?? 0;
  }

  /**
   * The facts the minds of a home's residents are read from (see Mind.ts). What the home has
   * and lacks is worked out once; the returned function adds what differs from person to person.
   */
  private factsFor(home: number, building: SavedBuilding,
    routeTo = (job: number) => this.commutes.find(route => route.homeId === home && route.workId === job)) {
    const places = this.circleOf(home);
    const shared = { troubles: this.issuesOf(home, building),
      shops: places.includes('shops') || places.includes('market'),
      park: places.includes('park') || this.grand[home] === 1, water: this.shore[home] === 1,
      chinatown: this.member(home, 'chinatown'),
      bookquarter: this.member(home, 'bookquarter'),
      arts: this.covered.culture[home] === 1 && this.comboCounts.arts > 0,
      nightmarket: this.nearNightMarket[home] === 1,
      daycare: this.daycareSeats.get(home) ?? 0,
      bank: this.covered.bank[home] === 1 && !!this.bankFor(cellAt(home)),
      temple: places.includes('temple'), places: places.length, bond: this.bondOf(home),
      town: this.residents >= circle.population, fun: places.includes('fun'),
      casino: this.covered.casino[home] === 1, school: places.includes('school'), kids: this.kidsAt(home).length,
      transit: this.transitCover[home] === 1, shortOfShops: this.market.needed > this.market.served,
      value: this.valueOf(home), business: this.mood(), tax: this.taxRate - economy.taxRate.default };
    const trips = new Map<number, { route: Commute; riders: Set<number>; ride?: Way; jam: boolean } | null>();
    const tripTo = (job: number) => {
      let trip = trips.get(job);
      if (trip !== undefined) return trip;
      const route = routeTo(job);
      trip = null;
      if (route) {
        // The route says how many of the home's workers ride: the keen ones first, drivers never.
        const rank = (slot: number) => {
          const trait = this.traitAt(home, slot);
          return trait === 'rider' ? 0 : trait === 'driver' ? 2 : 1;
        };
        const riders = building.people!.filter(person => person.job === job).map(person => person.slot)
          .sort((a, b) => rank(a) - rank(b) || a - b).slice(0, route.riders);
        trip = { route, riders: new Set(riders), ride: this.plans.find(plan => plan.id === route.line)?.kind,
          jam: route.minutes > mind.jam * route.path.length * traffic.minutesPerTile };
      }
      trips.set(job, trip);
      return trip;
    };
    return (person: SavedPerson): Facts => {
      const who = this.whoAt(home, person);
      const zone = person.job >= 0 ? this.map.at(person.job) as Zone : undefined;
      const trip = zone ? tripTo(person.job) : null;
      const rides = trip?.ride !== undefined && trip.riders.has(person.slot);
      return { ...shared, slot: person.slot, trait: who.trait, retired: who.age >= 65,
        days: Math.floor((this.clock - person.came) / calendar.ticksPerDay),
        shift: zone ? shiftIndex(zone, person.job) : undefined,
        content: who.liking && zone ? who.liking === zone : undefined,
        minutes: trip ? (rides ? trip.route.transitMinutes : undefined) ?? trip.route.minutes : undefined,
        way: !trip ? undefined : weatherTravel(weatherAt(this.seed, this.clock), person.car ?? 0,
          trip.route.path.length, rides ? trip.ride : undefined).way,
        car: person.car ?? 0, jam: trip?.jam ?? false,
        forest: this.wild[home] === 1, gas: this.covered.gas[home] === 1,
        fuelDear: fuelPrice(this.clock) >= prices.fuel.dear,
        late: trip?.jam === true && !rides,
        carDear: (person.car ?? 0) >= 2 && zone !== undefined &&
          this.keepCost(home, person.car!, trip?.route.path.length ?? 0).cost > 0.2 * this.payAt(person.job, who.trait === 'rich', home),
        raise: zone !== undefined && ['busy', 'good'].includes(this.tradeOf(person.job) ?? '') };
    };
  }

  /**
   * One resident up close: who they are, what they are doing at this hour of the day and what
   * is on their mind. Undefined once they have left town.
   */
  person(home: number, slot: number, hour: number) {
    const building = this.buildings.get(home);
    const person = this.map.at(home) === 'residential' ? building?.people?.find(entry => entry.slot === slot) : undefined;
    if (!building || !person) return undefined;
    const facts = this.factsFor(home, building)(person);
    const list = thoughtsOf(facts);
    const visit = this.visits.frames(this.clock).filter(entry => entry.home === home && !entry.returning)
      .find(trip => trip.slot === slot);
    const contacts = this.relationships.contacts(person.identity!.id).flatMap(contact => {
      const other = this.peopleById.get(contact.id);
      return other ? [{ ...contact, homeId: other.home, slot: other.person.slot, name: this.whoAt(other.home, other.person).name }] : [];
    });
    let activity = visit?.doing ?? doingAt(facts, hour, Math.floor(this.clock / calendar.ticksPerDay), weekendAt(this.clock));
    if (!visit && ['park', 'outing', 'nightmarket'].includes(activity) && !wantsOutdoor(this.seed, home, person.slot, this.clock)) activity = 'home';
    if (this.whoAt(home, person).age >= 65 && ['job-hunting', 'working', 'to-work'].includes(activity)) activity = 'home';
    const health = this.life.health(person.identity!.id);
    if (health && !visit) activity = 'home';
    const waiting = this.waitingFor.get(person.identity!.id);
    return { ...this.describe(home, person), contacts, health, needs: this.needsOf(home, person, this.clock),
      /** How they eat, and whether they ride with deliveries when free; with what that has earned them today. */
      eating: eatingOf(this.seed, person.identity!.id),
      birthday: birthdayOf(this.seed, person.identity!.id) === activityDay(this.clock) % (calendar.daysPerMonth * calendar.monthsPerYear),
      rider: ridesFor(this.seed, person.identity!.id, person.car ?? 0) && this.whoAt(home, person).age < 65 ?
        { runs: this.diary.count(person.identity!.id, 'delivering', this.clock) } : undefined,
      /** The kind of place they are ill and waiting at home to get into, because it is full. */
      waitingFor: waiting === undefined ? undefined : this.map.at(waiting),
      activityReason: visit?.reason ? visitReasons[visit.reason] : undefined, activityWhy: visit?.reason,
      activities: this.diary.today(person.identity!.id, this.clock),
      weatherReason: facts.way ? weatherTravel(weatherAt(this.seed, this.clock), person.car ?? 0,
        this.commutes.find(route => route.homeId === home && route.workId === person.job)?.path.length ?? 0,
        facts.way === 'bus' || facts.way === 'metro' ? facts.way : undefined).reason :
        weatherAt(this.seed, this.clock) !== 'clear' ? '下雨，休閒優先選室內，沒有適合的地方就留在家' : undefined, kind: building.kind, jobId: person.job, way: facts.way,
      minutes: facts.minutes, thoughts: list, mood: moodOf(list), kids: facts.kids,
      doing: activity };
  }

  /** What a resident lacks at a moment (see Needs.ts), read off their day so far. */
  private needsOf(home: number, person: SavedPerson, tick: number): Needs {
    const { hunger, wantsFood } = this.hungerOf(home, person, tick);
    const fatigue = this.fatigueOf(home, person, tick);
    const social = this.socialOf(home, person, tick);
    return { hunger, fatigue, social, wantsFood, tired: fatigue >= needs.tired, lonely: social >= needs.lonely };
  }

  private hungerOf(home: number, person: SavedPerson, tick: number) {
    const id = person.identity?.id ?? home * 64 + person.slot;
    const ateOut = person.identity ? this.diary.hoursOf(id, tick, MEALS_OUT, hourAt) : [];
    return hungerAt(hourAt(tick), mealPlan(this.seed, id, activityDay(tick)), ateOut);
  }

  private fatigueOf(home: number, person: SavedPerson, tick: number): number {
    const old = this.whoAt(home, person).age >= 65;
    const shift = person.job >= 0 && !old ? shiftIndex(this.map.at(person.job) as Zone, person.job) : undefined;
    const working = shift !== undefined && (!weekendAt(tick) || shift === SHOP_SHIFT);
    return fatigueAt(hourAt(tick), working ? { start: shifts[shift].start, end: shifts[shift].end,
      minutes: this.commuteByPair.get(home * MAP_SIZE ** 2 + person.job)?.minutes ?? 0 } : undefined,
      this.kidsAt(home).length, old,
      person.identity ? this.diary.count(person.identity.id, 'delivering', tick) * delivery.tiring : 0);
  }

  private socialOf(home: number, person: SavedPerson, tick: number): number {
    return socialAt(Math.floor(tick / calendar.ticksPerDay),
      person.identity ? this.relationships.lastMet(person.identity.id) : undefined, Math.floor(person.came / calendar.ticksPerDay));
  }

  facilityVisits(hour: number, visible: (home: Cell) => boolean) {
    return planFacilityVisits(this.visitContext(this.clock), hour, visible);
  }

  private visitContext(tick: number): CivicVisitContext {
    return { map: this.map, roadGraph: this.roadGraph, clock: tick,
      seed: this.seed, buildings: this.buildings, daycareSeats: this.daycareSeats,
      hasCombo: (cell, combo) => this.hasCombo(cell, combo), kidsAt: home => this.kidsAt(home),
      ageOf: (home, person) => this.whoAt(home, person).age,
      health: person => person.identity ? this.life.health(person.identity.id) : undefined,
      available: (home, slot) => !this.visits.has(home, slot),
      visited: (person, doing) => !!person.identity && this.diary.has(person.identity.id, doing, tick),
      roadAccess: cell => this.roadAccess(cell),
      needs: { tired: (home, person) => this.fatigueOf(home, person, tick) >= needs.tired,
        wantsFood: (home, person) => this.hungerOf(home, person, tick).wantsFood,
        lonely: (home, person) => this.socialOf(home, person, tick) >= needs.lonely,
        cooks: (_home, person) => !!person.identity && eatingOf(this.seed, person.identity.id) === 'cook' },
      staysIn: (_home, person) => !!person.identity && this.fed.has(person.identity.id),
      celebrates: home => this.birthdayAt(home, tick) &&
        !this.buildings.get(home)?.people?.some(person => person.identity && this.diary.has(person.identity.id, 'cake', tick)),
      occupancy: site => this.visits.occupancy(site),
      carsAt: site => this.visits.carsAt(site),
      noSpace: site => this.circled.set(site, (this.circled.get(site) ?? 0) + 1),
      turnedAway: (site, home, person, waiting) => {
        const who = person.identity?.id ?? home * 64 + person.slot;
        if (!this.crowded.has(site)) this.crowded.set(site, new Set());
        this.crowded.get(site)!.add(who);
        if (waiting) this.waitingFor.set(who, site);
      },
    };
  }

  /** Whether a grown-up or a child of this home has their birthday today. */
  private birthdayAt(home: number, tick: number): boolean {
    const today = activityDay(tick) % (calendar.daysPerMonth * calendar.monthsPerYear);
    return !!this.buildings.get(home)?.people?.some(person => person.identity && birthdayOf(this.seed, person.identity.id) === today) ||
      this.life.childrenAt(home, tick).some(child => birthdayOf(this.seed, child.id) === today);
  }

  private continueVisit(trip: ActiveVisit, departed: number) {
    if (['clinic', 'hospital', 'referred', 'care', 'delivering'].includes(trip.doing)) return undefined;
    const building = this.buildings.get(trip.home);
    const person = building?.people?.find(person => person.slot === trip.slot);
    if (!building || !person?.identity || this.life.health(person.identity.id)) return undefined;
    const context = this.visitContext(departed);
    context.buildings = new Map([[trip.home, building]]);
    context.available = (_home, slot) => slot === trip.slot;
    context.visited = (person, doing) => doing === trip.doing || this.diary.has(person.identity!.id, doing, departed);
    context.origin = () => ({ cell: trip.path.at(-1)!, road: trip.path.at(-2)! });
    const next = planFacilityVisits(context, hourAt(departed), () => true)[0];
    if (next) this.diary.depart(person.identity.id, next, departed);
    return next;
  }

  visitorsAt(cell: Cell, _hour?: number, tickProgress = 0) {
    const ids = new Set(this.siteIds(cell));
    return this.visits.frames(this.clock + Math.max(0, Math.min(1, tickProgress)))
      .filter(visit => visit.phase !== '回程' && ids.has(visit.destination))
      .map(visit => {
        const person = this.buildings.get(visit.home)?.people?.find(person => person.slot === visit.slot);
        return { ...visit, name: person ? this.whoAt(visit.home, person).name : '居民' };
      });
  }

  /**
   * How full a place is: how many it holds, how many are inside or on their way, and how many
   * wanted to come this hour and could not. Undefined for places that take everyone.
   */
  crowdAt(cell: Cell, tickProgress = 0): { seats: number; busy: number; turnedAway: number } | undefined {
    const anchor = this.map.anchorOf(cell) ?? cell;
    const limit = seats[this.map.get(anchor)!];
    if (!limit) return undefined;
    const site = indexOf(anchor);
    // Counted the way the lists of visitors are, so the panel's numbers agree between steps.
    return { seats: limit, busy: this.visitorsAt(cell, undefined, tickProgress).length, turnedAway: this.crowded.get(site)?.size ?? 0 };
  }

  /**
   * The visitors' cars at a place: how many it has room for, how many stand there or are on
   * their way, and how many drivers found it full this hour and went round looking.
   */
  carsAt(cell: Cell): { spaces: number; cars: number; looking: number } {
    const anchor = this.map.anchorOf(cell) ?? cell;
    const site = indexOf(anchor);
    return { spaces: spacesAt(this.map, anchor), cars: this.visits.carsAt(site), looking: this.circled.get(site) ?? 0 };
  }

  visitorGroupsAt(cell: Cell, tickProgress = 0) {
    const visitors = this.visitorsAt(cell, undefined, tickProgress);
    return { using: visitors.filter(visit => visit.phase === '使用中'), heading: visitors.filter(visit => visit.phase === '前往中') };
  }

  /** The place in a home of someone who lives there and works at `workId`, if anyone does. */
  personOn(homeId: number, workId: number): number | undefined {
    return this.buildings.get(homeId)?.people?.find(person => person.job === workId)?.slot;
  }

  /** Lightweight identity lookup for map appearance; avoids constructing the full person panel every frame. */
  residentLook(home: number, slot: number): { id: number; age: number } | undefined {
    const person = this.buildings.get(home)?.people?.find(person => person.slot === slot);
    return person ? { id: person.identity?.id ?? home * 64 + slot, age: this.whoAt(home, person).age } : undefined;
  }

  /** What the whole city thinks: the average mood, and how many people have each thought, most first. */
  voices() {
    const routes = new Map<number, Commute>();
    for (const route of this.commutes) routes.set(route.homeId * MAP_SIZE ** 2 + route.workId, route);
    const counts = new Map<Thought, number>();
    let people = 0;
    let mood = 0;
    let bonds = 0;
    for (const [id, building] of this.buildings) {
      if (this.map.at(id) !== 'residential' || !building.people!.length) continue;
      const facts = this.factsFor(id, building, job => routes.get(id * MAP_SIZE ** 2 + job));
      bonds += this.bondOf(id) * building.people!.length;
      for (const person of building.people!) {
        const list = thoughtsOf(facts(person));
        for (const thought of list) counts.set(thought, (counts.get(thought) ?? 0) + 1);
        mood += moodOf(list);
        people++;
      }
    }
    return { people, mood: people ? Math.round(mood / people) : mind.base,
      /** How close-knit the homes are, averaged over the people in them. */
      bond: people ? Math.round(bonds / people) : 0,
      thoughts: [...counts].sort((a, b) => b[1] - a[1]) };
  }

  /** The level of the building on a tile, or 0 where there is none. Cheap, for drawing. */
  levelAt(cell: Cell): number {
    return this.map.get(cell) === undefined ? 0 : this.buildings.get(indexOf(cell))?.level ?? 0;
  }

  /** What a park tile looks like: part of a big park or not, and whether the fountain stands on it. */
  parkAt(cell: Cell): { big: boolean; fountain: boolean } {
    const id = indexOf(cell);
    return { big: this.parkSize[id] >= landValue.bigPark.tiles, fountain: this.fountains.has(id) && this.comboAt(cell) !== 'forest' };
  }

  /** Borrows one loan's worth of money, if the city has not got too many already. */
  borrow(): { error?: string } {
    const { amount, months, max } = economy.loan;
    if (this.loans.length >= max) return { error: `最多只能同時借 ${max} 筆。` };
    this.loans.push(months);
    this.funds += amount;
    return {};
  }

  /** Takes a building away. A housing complex that loses a home goes back to four separate homes. */
  private removeBuilding(id: number): void {
    this.visits.cancelAt(new Set([id]));
    const block = this.buildings.get(id)?.block;
    this.buildings.delete(id);
    if (block === undefined) return;
    const usual = landValue.capacity.residential[MAX_LEVEL - 1];
    for (const member of [block, block + 1, block + MAP_SIZE, block + MAP_SIZE + 1]) {
      const building = this.buildings.get(member);
      if (!building || building.block !== block) continue;
      building.block = undefined;
      building.level = MAX_LEVEL;
      building.capacity = usual;
      while (building.occupants > usual) this.moveOut(building);
    }
  }

  /** Minutes to cross a road tile with the traffic now on it. */
  /** What kind of road a commuter is on at a tile of their route: an elevated road counts as an avenue. */
  private readonly roadAt = (id: number): Road => {
    const tile = this.map.at(id);
    return isRoad(tile) ? tile : 'avenue';
  };
  /** Minutes to cross a node of the road graph: a road tile, or the elevated road over one. */
  private readonly minutesAt = (node: number) => node >= ELEVATED ? tileMinutes(this.flows[node - ELEVATED], 'avenue') :
    tileMinutes(this.flows[node], this.roadAt(node));

  /** Whether a home accepts another resident: room, nobody waiting for work, a bearable commute. */
  private takesNewcomers(id: number, building: SavedBuilding): boolean {
    return building.occupants + this.kidsAt(id).length < this.capacityOf(building) &&
      this.joblessAt(id, building) < JOB_SEEKERS &&
      (this.commuteMinutes.get(id) ?? 0) <= traffic.longCommute &&
      this.smog[id] <= pollution.limit && !this.scared[id];
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
      if (this.joblessAt(id, building) > 0) issues.push('no-jobs');
      if ((this.commuteMinutes.get(id) ?? 0) > traffic.longCommute) issues.push('long-commute');
      if (this.smog[id] > pollution.limit) issues.push('pollution');
      if (this.residents >= 150 && !this.green[id]) issues.push('no-park');
      if (this.residents >= 300 && !this.transitCover[id]) issues.push('no-transit');
    }
    if (this.unsafe(id)) issues.push('crime');
    if (this.scared[id]) issues.push('scared');
    if (home) for (const need of this.unmet(id)) issues.push(`no-${need.service}`);
    if (!home && roadAccess && building.occupants < this.capacityOf(building)) issues.push('vacancies');
    return issues;
  }

  /**
   * How business is today: a slow wave that the city's seed places, felt only by a city of
   * some size. It changes at most once a day.
   */
  mood(): Mood {
    if (this.rank < cycle.rank) return 'normal';
    const day = Math.floor(this.clock / calendar.ticksPerDay);
    const wave = Math.sin(2 * Math.PI * (day / (cycle.months * calendar.daysPerMonth) + (this.seed >>> 0) % 997 / 997));
    return wave > cycle.turn ? 'boom' : wave < -cycle.turn ? 'slump' : 'normal';
  }

  /**
   * What a building can hold right now: all of its capacity only with both power and water,
   * and a workplace keeps fewer jobs in a slump.
   */
  private capacityOf({ id, capacity }: SavedBuilding): number {
    const room = this.served.power.has(id) && this.served.water.has(id) ? capacity :
      Math.ceil(capacity * utilities.unservedShare);
    const zone = this.map.at(id);
    // Customers keep away from a frightened neighbourhood, so its shops need fewer hands.
    const open = zone === 'commercial' && this.scared[id] ? Math.ceil(room * scare.shops) : room;
    return zone !== 'residential' && this.mood() === 'slump' ? Math.ceil(open * cycle.slump.jobs) : open;
  }

  getBuilding(cell: Cell) {
    const zone = this.map.get(cell);
    if (!isZone(zone)) return undefined;
    const record = this.buildings.get(indexOf(cell));
    if (!record) return undefined;
    return { ...record, ...cell, zone, road: this.roadAccess(cell) };
  }

  inspect(where: Cell) {
    // Any tile of a big building stands for the whole of it.
    const cell = this.map.anchorOf(where) ?? where;
    const tile = this.map.get(cell);
    if (!tile) return undefined;
    const id = indexOf(cell);
    if (tile === 'farm') {
      return { tile, pollution: Math.round(this.smog[id]), grows: this.farmYield(id), watered: this.shore[id] === 1,
        combo: this.comboAt(cell) };
    }
    if (tile === 'park') {
      return { tile, pollution: Math.round(this.smog[id]), parkTiles: this.parkSize[id],
        bigPark: this.parkSize[id] >= landValue.bigPark.tiles, combo: this.comboAt(cell) };
    }
    if (tile === 'grass' || tile === 'river' || tile === 'annex') return { tile, pollution: Math.round(this.smog[id]) };
    const stop = this.stopAt(cell);
    if (stop) {
      const tile = stop;
      const radius = transit[tile].radius;
      let reaching = 0;
      for (const building of this.buildings.keys()) {
        const other = cellAt(building);
        if (Math.abs(other.x - cell.x) + Math.abs(other.y - cell.y) <= radius) reaching++;
      }
      const running = tile === 'metro' || this.hasRoadAccess(cell);
      return { tile, reaching: running ? reaching : 0, radius, running,
        lines: this.plans.filter(plan => plan.stops.includes(id)).map(plan => plan.id) };
    }
    if (isRoad(tile)) {
      return { tile, flow: Math.round(weekendAt(this.clock) ? this.shiftFlows[SHOP_SHIFT][id] : this.flows[id]), congestion: this.congestionAt(cell),
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
      const running = this.doorOf(cell) !== undefined;
      const sight = services.visitors[tile];
      return { warehouseStock: tile === 'warehouse' ? this.shipments.stock(id) : undefined, warehouseCapacity: tile === 'warehouse' ? WAREHOUSE_CAPACITY : undefined, tile, reaching: running ? reaching : 0, radius, running,
        /** What a sight brings in a month, and how many a market lets do their shopping. */
        earns: sight && running ? this.sightIncome(id, tile) : undefined,
        parked: sight ? this.parkingBy(id, tile) : undefined,
        shoppers: tile === 'market' ? services.market.shoppers : undefined,
        combo: this.comboAt(cell), comboEarns: this.special[id] ? this.comboIncome(this.comboAt(cell)!) : undefined };
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
      services: SERVICES.filter(service => this.covered[service][id]), transit: this.transitCover[id] === 1,
      /** The land value the next level needs; undefined at the top level. */
      nextLevel: landValue.upgrade[record.level - 1] as number | undefined,
      complex: record.block !== undefined, kind: record.kind,
      /** For a home: the kinds of place within a walk, and how close-knit it is. */
      circle: home ? this.circleOf(id) : undefined, bond: home ? this.bondOf(id) : undefined,
      kids: home ? this.kidsAt(id) : undefined,
      /** For a workplace: business, when it is better or worse than usual, and a shop's customers. */
      combo: this.comboAt(cell), brand: record.brand,
      /** A home by a forest is a cabin, one by a farmstead a farmhouse. */
      nick: home ? this.nickAt(cell) : undefined,
      trade: this.tradeOf(id), custom: tile === 'commercial' ? Math.round(this.custom.get(id) ?? 0) : undefined,
      /** Who lives here, and who works here. */
      residents: home ? record.people!.map(person => this.describe(id, person)) : [],
      staff: home ? [] : (this.staff.get(id) ?? []).map(entry => this.describe(entry.home, entry.person)) };
  }

  /** Runs a command if the city can pay for it. `cost` is what was charged. */
  execute(command: GameCommand): { changed: Cell[]; error?: string; cost: number } {
    const locked = command.type === 'BUILD_SERVICE' ? this.lockedUntil(command.service) : undefined;
    if (locked !== undefined) {
      return { changed: [], cost: 0,
        error: `城市還不夠大：人口到過 ${milestones[locked - 1].population} 人以後才能蓋這個。` };
    }
    let cost = 0;
    const result = { ...this.map.execute(command, changes => {
      if (changes.some(({ cell }) => !this.owns(cell))) return '這裡還沒買下來，請先用「買地」擴張。';
      let price = 0;
      for (const { tile } of changes) price += tileCost(tile);
      price = Math.round(price * this.level);
      if (price > this.funds) return `錢不夠：要 $${price}，現在只有 $${Math.floor(this.funds)}。`;
      cost = price;
    }), cost };
    this.funds -= cost;
    this.visits.cancelAt(new Set(result.changed.map(indexOf)));
    for (const cell of result.changed) {
      const id = indexOf(cell);
      const tile = this.map.get(cell);
      // A station going in or coming out leaves the road above it, and all else, as it was.
      const stationOnly = result.layer === true || command.type === 'BUILD_METRO' || (command.type === 'DEMOLISH' && isRoad(tile));
      if (!stationOnly) this.removeBuilding(id);
      // A stop that is gone drops out of its lines.
      for (const line of this.lines) {
        const at = line.stops.indexOf(id);
        if (at >= 0 && this.stopAt(cell) !== line.kind) line.stops.splice(at, 1);
      }
      this.monthlyVisits.delete(id);
      if (stationOnly) continue;
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
   * Puts a full building on each of these zoned lots at once, as a city that has stood for
   * years would have: at the level the land is worth, with people who came at different
   * times and have saved different amounts. For ready-made cities only; a city that is
   * played grows through `grow`. Lots without a road, or with a building already, are skipped.
   */
  found(cells: readonly Cell[]): void {
    const made: SavedBuilding[] = [];
    const chance = (id: number, salt: number) => roll(this.seed, id, salt) / 2 ** 32;
    const fill = (building: SavedBuilding) => {
      if (!building.people) return;
      while (building.occupants < building.capacity) {
        const slot = building.nextSlot!++;
        // Most have been here a while; savings run from nothing to a good car's worth.
        const money = Math.floor(chance(building.id, 300 + slot) ** 3 * 16000);
        const person: SavedPerson = { slot, job: -1, hired: this.clock,
          came: Math.floor(this.clock * chance(building.id, 200 + slot) ** 2) };
        let left = money;
        while (vehicles[(person.car ?? 0) + 1] && left >= vehicles[(person.car ?? 0) + 1].price) {
          person.car = (person.car ?? 0) + 1;
          left -= vehicles[person.car].price;
        }
        if (left) person.money = left;
        building.people.push(person);
        building.occupants++;
      }
    };
    for (const cell of cells) {
      const id = indexOf(cell);
      const zone = this.map.get(cell);
      if (!isZone(zone) || this.buildings.has(id) || !this.roadAccess(cell)) continue;
      const building: SavedBuilding = zone === 'residential' ?
        { id, capacity: growth.capacity[zone], occupants: 0, level: 1, people: [], nextSlot: 0, kind: this.homeKindAt(id) } :
        { id, capacity: growth.capacity[zone], occupants: 0, level: 1 };
      fill(building);
      this.buildings.set(id, building);
      made.push(building);
    }
    this.refresh();
    // With everyone at work the land shows what it is worth, and the buildings grow to match.
    for (const building of made) {
      const value = this.valueOf(building.id);
      building.level = value >= landValue.upgrade[1] ? 3 : value >= landValue.upgrade[0] ? 2 : 1;
      building.capacity = landValue.capacity[this.map.at(building.id) as Zone][building.level - 1];
      fill(building);
    }
    this.refresh();
  }

  private advanceLives(tick: number): void {
    const residents: LifeResident[] = [...this.peopleById.values()].map(({ home, person }) =>
      ({ identity: person.identity!, home, age: this.whoAt(home, person).age }));
    const changes = this.life.advance(tick, this.seed, residents, {
      allocateId: () => this.nextPersonId++,
      freeRoom: home => {
        const building = this.buildings.get(home);
        return building ? this.capacityOf(building) - building.occupants - this.kidsAt(home).length : 0;
      },
      friends: (a, b) => this.relationships.contacts(a).some(contact => contact.id === b && contact.familiarity >= 60),
      polluted: home => this.smog[home] > pollution.limit,
      caredFor: home => this.covered.eldercare[home] === 1,
    });
    for (const id of changes.deaths) {
      const entry = this.peopleById.get(id);
      if (!entry) continue;
      const building = this.buildings.get(entry.home)!;
      const heir = building.people!.find(person => person.identity!.id !== id && !changes.deaths.includes(person.identity!.id));
      if (heir) {
        heir.money = (heir.money ?? 0) + (entry.person.money ?? 0);
        if ((entry.person.car ?? 0) > (heir.car ?? 0)) heir.car = entry.person.car;
      }
      building.people = building.people!.filter(person => person !== entry.person);
      building.occupants--;
      this.visits.cancelAt(new Set([entry.home]));
    }
    for (const child of changes.adults) {
      const building = this.buildings.get(child.home);
      if (!building?.people) continue;
      building.people.push({ slot: building.nextSlot!++, job: -1, came: tick, hired: 0, graceUntil: tick + 30 * calendar.ticksPerDay, identity: { ...child.identity } });
      building.occupants++;
    }
    const retirement = residents.some(resident => resident.age >= 65 && this.peopleById.get(resident.identity.id)?.person.job !== -1);
    if (changes.deaths.length || changes.adults.length || retirement) this.refresh();
  }

  /**
   * A growth step: residents move, then each zone type may get one building. Nothing changes
   * between steps, so what is derived from the city is always up to date, also after loading.
   */
  grow(tick: number, seed: number): void {
    this.clock = tick;
    if (tick % calendar.ticksPerDay === 0) this.advanceLives(tick);
    this.recordVisits(tick);
    this.bonds.clear();
    // A day's share of the month's tax and upkeep.
    if (tick % calendar.ticksPerDay === 0) {
      this.funds += this.budget().net / calendar.daysPerMonth;
      // The sights' month is an average: weekends bring more than a day's share of it, weekdays less.
      this.funds += this.visitors / calendar.daysPerMonth * (visitorsToday(tick) - 1);
      this.holdFestival(tick);
      this.deliverFood();
    }
    // At the end of a month every loan has one payment fewer to go.
    if (tick % (calendar.ticksPerDay * calendar.daysPerMonth) === 0 && this.rank >= cycle.rank) {
      this.level *= 1 + prices.level[this.mood()] / calendar.monthsPerYear;
    }
    if (tick % (calendar.ticksPerDay * calendar.daysPerMonth) === 0 && this.loans.length) {
      const left = this.loans.map(months => months - 1).filter(months => months > 0);
      this.loans.splice(0, this.loans.length, ...left);
    }
    if (tick % growth.interval !== 0) {
      // Calls come at any hour, not only when the town grows.
      this.rollEmergencies(tick, seed);
      return;
    }
    let changed = false;
    const daily = tick % calendar.ticksPerDay === 0;
    for (const [id, building] of this.buildings) {
      const cell = this.zones.get(id)!;
      if (this.map.get(cell) !== 'residential') continue;
      const capacity = this.capacityOf(building);
      const jobless = this.joblessAt(id, building);
      if (building.occupants > capacity || jobless > JOB_SEEKERS) {
        // Leaving is slower than arriving: once a day.
        if (!daily) continue;
        this.moveOut(building, building.occupants > capacity ? 'left-no-room' : 'left-no-work');
      } else if (this.takesNewcomers(id, building) && this.hasRoadAccess(cell)) {
        // People arrive one at a time, not every home at once.
        if (building.occupants && roll(seed, tick, id + 20000) / 2 ** 32 >= growth.moveIn) continue;
        this.moveIn(building, tick);
      } else continue;
      changed = true;
    }
    if (daily && this.reviewJobs(tick, seed)) changed = true;
    if (tick % (calendar.ticksPerDay * mind.leave.days) === 0 && this.leaveUnhappy(tick, seed)) changed = true;
    if (daily) this.payDay();

    // A full building on good enough land grows a level and holds more.
    for (const [id, building] of this.buildings) {
      const loan = this.map.at(id) === 'commercial' && this.member(id, 'localbusiness') && building.occupants > 0;
      if (building.level >= MAX_LEVEL || building.occupants < this.capacityOf(building) ||
          this.valueOf(id) < landValue.upgrade[building.level - 1] ||
          roll(seed, tick, id + 16) / 2 ** 32 >= landValue.chance * (loan ? 1.5 : 1)) continue;
      const larger = landValue.capacity[this.map.at(id) as Zone][building.level++];
      building.capacity = Math.max(building.capacity, larger);
      changed = true;
    }

    // Four full level 3 homes in a square join into one housing complex.
    const fullHome = (id: number) => {
      const home = this.buildings.get(id);
      return home && this.map.at(id) === 'residential' && home.level === MAX_LEVEL && home.block === undefined &&
        home.occupants >= this.capacityOf(home) ? home : undefined;
    };
    for (const id of [...this.buildings.keys()]) {
      if (id % MAP_SIZE === MAP_SIZE - 1 || !fullHome(id)) continue;
      const homes = [id, id + 1, id + MAP_SIZE, id + MAP_SIZE + 1].map(fullHome);
      if (homes.some(home => !home) || roll(seed, tick, id + 48) / 2 ** 32 >= landValue.chance) continue;
      for (const home of homes) {
        home!.level = COMPLEX_LEVEL;
        home!.block = id;
        home!.capacity = Math.max(home!.capacity, landValue.capacity.residential[COMPLEX_LEVEL - 1]);
      }
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
      this.buildings.set(id, zone === 'residential' ?
        { id, capacity: growth.capacity[zone], occupants: 0, level: 1, people: [], nextSlot: 0,
          kind: this.homeKindAt(id) } :
        { id, capacity: growth.capacity[zone], occupants: 0, level: 1 });
      if (zone === 'residential') this.life.establish(id, []);
      changed = true;
    });
    // Business turning changes how many jobs there are, so everything is worked out again.
    if (daily && this.mood() !== this.lastMood) changed = true;
    if (daily && seasonAt(tick) !== this.lastSeason) changed = true;
    if (daily && weatherAt(seed, tick) !== weatherAt(seed, tick - 1)) changed = true;
    // A neighbourhood gets over its fright.
    if (daily && this.scares.some(({ until }) => until <= tick)) changed = true;
    if (changed) this.refresh();
    this.rollEmergencies(tick, seed);
    if (daily) {
      this.rollCrash(tick, seed);
      if (Math.floor(tick / calendar.ticksPerDay) % 7 === 5) {
        const square = this.find({ combo: 'nightmarket' }).find(cell => this.map.get(cell) === 'square');
        if (square) this.addCityEvent('nightmarket-open', square);
      }
    }

    if (daily) this.reviewTasks(tick);
    if (daily) this.reviewChallenge(tick);
    if (daily) this.reviewDilemma(tick);
    if (daily && this.goalsDone.size < goals.length) {
      const view = this.getStats();
      for (const goal of goals) {
        if (this.goalsDone.has(goal.id) || !goal.done(view)) continue;
        this.goalsDone.add(goal.id);
        this.funds += goal.reward;
      }
    }

    const { population } = this.supply();
    while (this.rank < milestones.length && population >= milestones[this.rank].population) {
      this.funds += milestones[this.rank++].grant;
    }
  }

  /** The road tile beside a cell, if there is one. Vehicles drive between these. */
  roadBeside(cell: Cell): Cell | undefined {
    return this.doorOf(cell);
  }

  /**
   * Minutes an emergency vehicle needs from a station to a call at an hour of the day: the
   * shortest way by road, at `services.response.speed` times a car's pace, slowed on every
   * tile by the traffic of that hour as cars are; `held` is how much of it the traffic cost.
   * Nothing if no road joins the two.
   */
  responseMinutes(station: Cell, cell: Cell, hour: number): { minutes: number; held: number } | undefined {
    const from = this.doorOf(station);
    const to = isRoad(this.map.get(cell)) ? cell : this.doorOf(cell);
    const path = from && to && this.roadGraph.shortestPath(from, to)?.path;
    if (!path) return undefined;
    let clear = 0;
    let held = 0;
    for (const tile of path) {
      const base = (this.map.get(tile) === 'avenue' ? traffic.avenue.minutesPerTile : traffic.minutesPerTile) / services.response.speed;
      clear += base;
      held += base * traffic.alpha * this.congestionAt(tile, hour) ** traffic.beta;
    }
    return { minutes: clear + held, held };
  }

  /** The nearest working station of a service that has the cell in reach. */
  private nearestStation(cell: Cell, service: Service): Cell | undefined {
    let best: Cell | undefined;
    let bestDistance = services.radius[service] + 1;
    for (let id = 0; id < MAP_SIZE ** 2; id++) {
      const tile = this.map.at(id);
      if (tile !== service && alsoServes[tile as Service] !== service) continue;
      const station = cellAt(id);
      const distance = Math.abs(station.x - cell.x) + Math.abs(station.y - cell.y);
      if (distance < bestDistance && this.doorOf(station)) {
        best = station;
        bestDistance = distance;
      }
    }
    return best;
  }

  /**
   * Once a day each kind of emergency may strike one building, at an hour of its own, so that
   * some calls come in the rush. Whether and where is rolled for the day with the salts the
   * fire roll always had. Help has to get there by road in time (see `services.response`).
   * Floods, flu and the rest that follow are still settled at the start of the day.
   */
  private rollEmergencies(tick: number, seed: number): void {
    const { population, perBuilding, max } = services.fires;
    if (this.residents < population) return;
    const calm = Math.max(1 - traits.helper.most, 1 - traits.helper.calm * this.traitCounts.helper);
    const chance = Math.min(max, this.buildings.size * perBuilding) * calm;
    const ids = [...this.buildings.keys()];
    let changed = false;
    const dayStart = tick - tick % calendar.ticksPerDay;
    emergencies.forEach(({ service, trouble, handled, late }, index) => {
      if (tick - dayStart !== roll(seed, dayStart, 61 + index) % calendar.ticksPerDay) return;
      const odds = trouble === 'crime' && this.policiesOn.has('patrol') ? chance * policies.patrol.crime : chance;
      if (roll(seed, dayStart, 7 + 2 * index) / 2 ** 32 >= odds) return;
      const id = ids[roll(seed, dayStart, 8 + 2 * index) % ids.length];
      const building = this.buildings.get(id);
      // It may have burned down a moment ago.
      if (!building) return;
      const cell = cellAt(id);
      const station = this.covered[service][id] === 1 ? this.nearestStation(cell, service) : undefined;
      // A station with no road to the call is taken to get there as it always was.
      const way = station && this.responseMinutes(station, cell, hourAt(tick));
      const helped = this.covered[service][id] === 1 && (way?.held ?? 0) <= services.response[service];
      this.events.push({ tick, kind: helped ? handled : station ? late : trouble, cell, station,
        minutes: way && Math.round(way.minutes) });
      if (this.events.length > EVENT_LOG) this.events.shift();
      if (helped) return;
      if (trouble !== 'sick') {
        this.scares.push({ id, until: tick + scare.days * calendar.ticksPerDay });
        changed = true;
      }
      if (trouble === 'fire') {
        this.removeBuilding(id);
      } else if (trouble === 'crime') {
        this.funds -= services.crime.loss;
      } else if (this.map.at(id) === 'residential' && building.occupants > 0) {
        const person = building.people!.at(-1)!;
        this.life.fallIll({ identity: person.identity!, home: id, age: this.whoAt(id, person).age }, tick);
        changed = true;
      }
    });
    if (tick !== dayStart) {
      if (changed) this.refresh();
      return;
    }
    const season = seasonAt(tick);
    const struck = (salt: number, most: number, suits: (id: number) => boolean) => {
      const open = ids.filter(id => this.buildings.has(id) && suits(id));
      const picked: number[] = [];
      for (let count = 0; count < most && open.length; count++) {
        picked.push(...open.splice(roll(seed, tick, salt + count) % open.length, 1));
      }
      return picked;
    };
    const note = (kind: CityEvent['kind'], id: number, service?: Service) => {
      this.events.push({ tick, kind, cell: cellAt(id), station: service && this.nearestStation(cellAt(id), service) });
      if (this.events.length > EVENT_LOG) this.events.shift();
    };
    const robbery = services.robbery;
    if (this.residents >= robbery.population && (this.tileCounts.get('bank') ?? 0) > 0) {
      let financiallyStressed = 0;
      for (const building of this.buildings.values()) {
        for (const person of building.people ?? []) {
          if (person.job < 0 && (person.money ?? 0) < robbery.lowSavings) financiallyStressed++;
        }
      }
      const hardship = financiallyStressed / this.residents;
      const patrol = this.policiesOn.has('patrol') ? policies.patrol.crime : 1;
      if (roll(seed, tick, 67) / 2 ** 32 < (robbery.baseChance + hardship * robbery.hardshipBonus) * patrol) {
        const banks: number[] = [];
        for (let id = 0; id < MAP_SIZE ** 2; id++) {
          if (this.map.at(id) === 'bank' && this.doorOf(cellAt(id))) banks.push(id);
        }
        if (banks.length) {
          const bank = banks[roll(seed, tick, 68) % banks.length];
          const station = this.nearestStation(cellAt(bank), 'police');
          const from = station && this.roadBeside(station);
          const to = this.roadBeside(cellAt(bank));
          const helped = this.covered.police[bank] === 1 && !!(from && to && this.roadGraph.shortestPath(from, to));
          note(helped ? 'robbery-stopped' : 'robbery', bank, helped ? 'police' : undefined);
          if (!helped) {
            this.funds -= robbery.loss;
            this.scares.push({ id: bank, until: tick + scare.days * calendar.ticksPerDay });
            changed = true;
          }
        }
      }
    }
    const { flood, flu } = disasters;
    if (season === flood.season && this.residents >= flood.population && roll(seed, tick, 61) / 2 ** 32 < flood.chance) {
      for (const id of struck(62, flood.most, id => this.shore[id] === 1)) {
        const helped = this.covered.fire[id] === 1;
        note(helped ? 'flood-helped' : 'flood', id, helped ? 'fire' : undefined);
        if (helped) continue;
        this.scares.push({ id, until: tick + scare.days * calendar.ticksPerDay });
        changed = true;
      }
    }
    if (season === flu.season && this.residents >= flu.population && roll(seed, tick, 71) / 2 ** 32 < flu.chance) {
      for (const id of struck(72, flu.most, id => this.map.at(id) === 'residential' && !this.covered.clinic[id] &&
          this.buildings.get(id)!.occupants > 0)) {
        note('flu', id);
        this.moveOut(this.buildings.get(id)!);
        changed = true;
      }
    }
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
      const wanted = home ? this.joblessAt(id, building) > 0 || this.takesNewcomers(id, building) :
        building.occupants < this.capacityOf(building);
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
  /** The layout and the frightened blocks that `covered` and `shore` were last worked out for. */
  private coveredFor?: { layout: number; scared: Uint8Array };

  private refresh(): void {
    this.ensureIdentities();
    this.circles.clear();
    this.bonds.clear();
    // Who lives here does not change in what follows, and how business is depends on it.
    this.residents = 0;
    for (const [id, building] of this.buildings) {
      if (this.map.at(id) === 'residential') this.residents += building.occupants;
    }
    this.lastMood = this.mood();
    this.lastSeason = seasonAt(this.clock);
    this.markScares();
    this.connectUtilities();
    this.coverServices();
    this.planLines();
    this.connectTransfers();
    this.assignJobs();
    this.planFreight();
    // A bounded two-pass estimate: empty-road demand first, then the traffic it creates.
    // Always start afresh, so loading a save cannot inherit a previous refresh's timings.
    if (this.lines.some(line => line.kind === 'bus' && line.stops.length >= 2)) {
      const traffic = Float32Array.from(this.flows, (flow, id) => flow + this.freightFlows[id]);
      this.planLines(traffic);
      this.connectTransfers();
      this.assignJobs();
    }
    for (const route of this.freight) route.minutes = route.path.reduce((sum, cell) => sum + tileMinutes(
      this.flows[indexOf(cell)] + this.freightFlows[indexOf(cell)], this.roadAt(indexOf(cell))), 0);
    this.syncShipments();
    this.shareCustom();
    // Vehicles and the fuel they burn, which needs the routes and the stations' reach.
    this.countCars();
    this.spreadPollution();
    this.residents = 0;
    for (const trait of TRAITS) this.traitCounts[trait] = 0;
    this.gardeners.clear();
    let factoryHands = 0;
    let clerks = 0;
    for (const [id, building] of this.buildings) {
      const zone = this.map.at(id);
      if (zone === 'industrial') factoryHands += building.occupants * (this.member(id, 'estate') || this.member(id, 'port') ? combos.estate.goods : 1);
      else if (zone === 'commercial') clerks += building.occupants;
      if (zone !== 'residential') continue;
      this.residents += building.occupants;
      for (const { slot } of building.people!) {
        const trait = this.traitAt(id, slot);
        if (!trait) continue;
        this.traitCounts[trait]++;
        if (trait === 'gardener') this.gardeners.set(id, (this.gardeners.get(id) ?? 0) + 1);
      }
    }
    this.tileUpkeep = this.map.stationTiles().length * economy.upkeep.metro +
      this.map.spanTiles().length * economy.upkeep.viaduct;
    this.tileCounts.clear();
    this.bankSites.length = 0;
    this.idleCount = 0;
    this.visitors = 0;
    let markets = 0;
    let farmed = 0;
    for (let id = 0; id < MAP_SIZE ** 2; id++) {
      const tile = this.map.at(id);
      if (tile === 'grass' || tile === 'river' || isZone(tile)) continue;
      // Plants burn more in the cold and in the heat.
      this.tileUpkeep += economy.upkeep[tile] * (tile === 'power' ? seasons.heating[this.lastSeason] : 1);
      this.tileCounts.set(tile, (this.tileCounts.get(tile) ?? 0) + 1);
      if (tile === 'farm') farmed += this.farmYield(id);
      if (!(isFacility(tile) || isService(tile) || tile === 'bus')) continue;
      if (!this.doorOf(cellAt(id))) {
        this.idleCount++;
        continue;
      }
      if (tile === 'bank') this.bankSites.push(cellAt(id));
      if (tile === 'market') markets++;
      const sight = services.visitors[tile as Service];
      if (sight) this.visitors += this.sightIncome(id, tile as Service);
    }
    let repaired = 0;
    const reused = new Map<number, number>();
    for (const factories of this.recyclingRoutes.values()) {
      let material = combos.workshop.materials;
      for (const id of factories) {
        const used = reused.get(id) ?? 0;
        const work = Math.min(material, (this.buildings.get(id)?.occupants ?? 0) - used);
        reused.set(id, used + work);
        repaired += work * combos.workshop.goodsPerMaterial;
        material -= work;
        if (!material) break;
      }
    }
    const made = Math.round(factoryHands * goods.perWorker + farmed + repaired);
    farmed = Math.round(farmed);
    for (const group of COMBOS) this.visitors += this.comboCounts[group] * this.comboIncome(group);
    for (const building of this.buildings.values()) if (building.brand) this.visitors += brands[building.brand];
    const needed = this.residents * goods.perResident;
    this.market = { made, needed, farmed,
      served: Math.min(needed, clerks * goods.perClerk + markets * services.market.shoppers),
      trade: made >= needed ? (made - needed) * goods.exportPrice : -(needed - made) * goods.importCost };
  }

  private syncShipments(): void {
    this.shipments.sync(this.freight.map(route => {
      const stops = (route.deliveries ?? [{ to: route.to, goods: route.goods }]).map(delivery => delivery.to);
      let cursor = 0;
      return { ...route, key: freightRuntimeKey(route), stops: stops.map(to => {
        const road = this.roadAccess(cellAt(to));
        const index = road ? route.path.findIndex((cell, at) => at >= cursor && cell.x === road.x && cell.y === road.y) : -1;
        cursor = Math.max(cursor, index);
        return { to, index: Math.max(0, index) };
      }) };
    }), this.freightSources, this.freightShops, this.warehouses);
  }

  private freightJunctionRevision = -1;
  private readonly freightJunctions = new Set<number>();
  advanceFreight(elapsedMs: number): void {
    if (this.freightJunctionRevision !== this.map.roadRevision) {
      this.freightJunctionRevision = this.map.roadRevision;
      this.freightJunctions.clear();
      for (let y = 0; y < MAP_SIZE; y++) for (let x = 0; x < MAP_SIZE; x++) {
        if (!isRoad(this.map.get({ x, y }))) continue;
        let roads = 0;
        for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) if (isRoad(this.map.get({ x: x + dx, y: y + dy }))) roads++;
        if (roads >= 3) this.freightJunctions.add(y * MAP_SIZE + x);
      }
      this.shipments.junctionFlow.revalidate(key => {
        const [x, y] = key.split(',').map(Number); return this.freightJunctions.has(y * MAP_SIZE + x);
      });
    }
    this.shipments.advance(elapsedMs, (route, along, vehicle, time) => {
      const cell = route.path[Math.min(route.path.length - 1, Math.floor(along))];
      const pose = roadVehiclePose(route.path, vehicle);
      const x = Math.floor(pose.x + pose.hx * 0.55), y = Math.floor(pose.y + pose.hy * 0.55);
      const red = (x !== Math.floor(pose.x) || y !== Math.floor(pose.y)) && this.freightJunctions.has(y * MAP_SIZE + x) &&
        ((Math.floor(time / 2600) + x + y) % 2 === 0) !== pose.upright;
      return { load: cell ? this.congestionAt(cell) : 0, red };
    }, { isJunction: cell => this.freightJunctions.has(cell.y * MAP_SIZE + cell.x),
      green: (cell, hx, hy, time) => ((Math.floor(time / 2600) + cell.x + cell.y) % 2 === 0) === (Math.abs(hy) > Math.abs(hx)) });
  }

  private planFreight(): void {
    if (this.freightRevision !== this.map.layoutRevision) {
      this.freightRevision = this.map.layoutRevision;
      this.freightPaths.clear();
      this.warehouses = [];
      for (let id = 0; id < MAP_SIZE ** 2; id++) if (this.map.at(id) === 'warehouse') this.warehouses.push({ id, capacity: WAREHOUSE_CAPACITY });
    }
    const sources: { id: number; amount: number }[] = [];
    const shops: { id: number; amount: number }[] = [];
    for (const [id, building] of this.buildings) {
      if (!building.occupants) continue;
      if (this.map.at(id) === 'industrial') sources.push({ id, amount: building.occupants * goods.perWorker });
      if (this.map.at(id) === 'commercial') shops.push({ id, amount: building.occupants * goods.perClerk });
    }
    this.freightSources = sources;
    this.freightShops = shops;
    const path = (from: number, to: number) => {
      const key = `${from}:${to}`;
      if (!this.freightPaths.has(key)) {
        const start = this.roadAccess(cellAt(from));
        const end = this.roadAccess(cellAt(to));
        this.freightPaths.set(key, start && end ? this.roadGraph.shortestPath(start, end)?.path : undefined);
      }
      return this.freightPaths.get(key);
    };
    if (this.freightMode === 'manual') {
      const planned = planFreightLines(this.freightLines, sources, shops, id => this.map.at(id) === 'industrial' ? 'factory' :
        this.map.at(id) === 'commercial' ? 'shop' : this.map.at(id) === 'warehouse' ? 'warehouse' : undefined, path,
        route => route.reduce((sum, cell) => sum + tileMinutes(this.flows[indexOf(cell)], this.roadAt(indexOf(cell))), 0),
        this.warehouses.map(site => ({ ...site, stock: this.shipments.stock(site.id) })));
      this.freightPlans = planned.lines;
      this.freight = planned.routes;
    } else {
      this.freightPlans = [];
      this.freight = planFreight(sources, shops, path);
    }
    this.freightFlows.fill(0);
    for (const route of this.freight) for (const cell of route.path) this.freightFlows[indexOf(cell)] += route.trucks / calendar.daysPerMonth;
  }

  /**
   * Works out each line's route and timings. A bus runs along the roads from stop to stop at
   * the supplied road traffic pace (empty on the first pass); a metro train runs along the row and then the column between
   * stations. A vehicle goes to the end of the line and back, so the time between departures
   * is the round trip divided among the vehicles.
   */
  private planLines(roadFlows?: Float32Array): void {
    this.plans.length = 0;
    this.transferStops.clear();
    this.transitCover.fill(0);
    this.stopsNear.clear();
    for (const line of this.lines) {
      const spec = transit[line.kind];
      const path: Cell[] = [];
      const times: number[] = [];
      let freeMinutes = 0;
      let active = line.stops.length >= 2;
      let minutes = 0;
      for (let index = 0; active && index < line.stops.length; index++) {
        const cell = cellAt(line.stops[index]);
        if (index === 0) {
          times.push(0);
          if (line.kind === 'metro') path.push(cell);
          continue;
        }
        const before = cellAt(line.stops[index - 1]);
        let leg: Cell[] | undefined;
        let legMinutes = 0;
        if (line.kind === 'bus') {
          const from = this.roadAccess(before);
          const to = this.roadAccess(cell);
          leg = from && to ? this.roadGraph.shortestPath(from, to)?.path : undefined;
          for (const tile of leg ?? []) legMinutes += tileMinutes(roadFlows?.[indexOf(tile)] ?? 0, this.roadAt(indexOf(tile)));
        } else {
          leg = [];
          let { x, y } = before;
          while (x !== cell.x) leg.push({ x: x += Math.sign(cell.x - x), y });
          while (y !== cell.y) leg.push({ x, y: y += Math.sign(cell.y - y) });
          legMinutes = leg.length * transit.metro.minutesPerTile;
        }
        if (!leg) {
          active = false;
          break;
        }
        for (const tile of leg) {
          const last = path.at(-1);
          if (!last || last.x !== tile.x || last.y !== tile.y) path.push(tile);
        }
        freeMinutes += (line.kind === 'bus' ? (leg ?? []).reduce((sum, cell) =>
          sum + tileMinutes(0, this.roadAt(indexOf(cell))), 0) : legMinutes) + transit.dwell;
        minutes += legMinutes + transit.dwell;
        times.push(minutes);
      }
      const headway = active ? 2 * minutes / line.vehicles : 0;
      const plan = { ...line, stops: [...line.stops], active, path: active ? path : [], times, headway,
        delay: active ? Math.max(0, minutes - freeMinutes) : 0,
        capacity: active ? Math.floor(transit.peakMinutes / headway * spec.capacity) : 0,
        busiest: 0, riders: 0, loads: shifts.map(() => 0) };
      this.plans.push(plan);
      if (!active) continue;
      plan.stops.forEach((stop, index) => {
        const { x, y } = cellAt(stop);
        for (let dy = -spec.radius; dy <= spec.radius; dy++) {
          const span = spec.radius - Math.abs(dy);
          for (let dx = -span; dx <= span; dx++) {
            const cell = { x: x + dx, y: y + dy };
            if (this.map.get(cell) === undefined) continue;
            const id = indexOf(cell);
            this.transitCover[id] = 1;
            if (!this.buildings.has(id)) continue;
            const near = this.stopsNear.get(id);
            if (near) near.push({ plan, index });
            else this.stopsNear.set(id, [{ plan, index }]);
          }
        }
      });
    }
  }

  private connectTransfers(): void {
    const buses = this.plans.filter(plan => plan.active && plan.kind === 'bus');
    const metros = this.plans.filter(plan => plan.active && plan.kind === 'metro');
    for (const bus of buses) for (const metro of metros) {
      metro.stops.forEach((metroStop, metroIndex) => {
        const station = cellAt(metroStop);
        bus.stops.forEach((busStop, busIndex) => {
          const access = this.roadAccess(cellAt(busStop));
          if (!access || Math.abs(access.x - station.x) + Math.abs(access.y - station.y) > 3 ||
              this.roadGraph.componentAt(access) !== this.roadGraph.componentAt(station)) return;
          const walk = this.roadGraph.shortestPath(access, station);
          if (!walk || walk.path.length > 4) return;
          const link = { metroStop, bus, metro, busIndex, metroIndex };
          const links = this.transferStops.get(metroStop);
          if (links) links.push(link);
          else this.transferStops.set(metroStop, [link]);
        });
      });
    }
  }

  private addCityEvent(kind: CityEvent['kind'], cell: Cell): void {
    this.events.push({ tick: this.clock, kind, cell });
    if (this.events.length > EVENT_LOG) this.events.shift();
  }

  private deliverFood(): void {
    const { capacity, marketPerDay, batchDays, cratesPerYield } = combos.coldchain;
    const farmsUsed = new Set<number>();
    const emptyMarkets = new Set([...this.marketStock].filter(([, stock]) => stock === 0).map(([id]) => id));
    for (const id of this.marketStock.keys()) {
      if (this.map.at(id) !== 'market') this.marketStock.delete(id);
      else this.marketStock.set(id, Math.max(0, this.marketStock.get(id)! - marketPerDay));
    }
    const day = Math.floor(this.clock / calendar.ticksPerDay);
    for (const [store, { farms, markets }] of this.coldRoutes) {
      let stock = this.coldStock.get(store) ?? 0;
      for (const market of [...markets].sort((a, b) => (this.marketStock.get(a) ?? 0) - (this.marketStock.get(b) ?? 0))) {
        const current = this.marketStock.get(market) ?? 0;
        const delivered = Math.min(stock, marketPerDay * batchDays - current);
        this.marketStock.set(market, current + delivered);
        if (delivered > 0 && emptyMarkets.delete(market)) this.addCityEvent('market-restocked', cellAt(market));
        stock -= delivered;
      }
      for (const farm of farms) {
        if (farmsUsed.has(farm) || stock >= capacity || day % batchDays !== farm % batchDays) continue;
        stock = Math.min(capacity, stock + Math.round(this.farmYield(farm) * cratesPerYield));
        farmsUsed.add(farm);
      }
      this.coldStock.set(store, stock);
    }
  }

  transferRidersAt(cell: Cell): number {
    return this.transfers.get(indexOf(cell)) ?? 0;
  }

  daycareSeatsAt(cell: Cell): number | undefined {
    const id = indexOf(cell);
    const tile = this.map.get(cell);
    if (!this.hasCombo(cell, 'familyquarter')) return undefined;
    if (tile === 'residential') return this.daycareSeats.get(id) ?? 0;
    if (tile === 'daycare') return combos.familyquarter.seats;
    return undefined;
  }

  foodStockAt(cell: Cell): number | undefined {
    const id = indexOf(cell);
    const tile = this.map.get(cell);
    if (tile === 'coldstore') return this.coldStock.get(id) ?? 0;
    if (tile === 'market' && (this.member(id, 'coldchain') || this.marketStock.has(id))) {
      return this.marketStock.get(id) ?? 0;
    }
    return undefined;
  }

  /** Marks the tiles within reach of each fire station, police station, school and clinic. */
  private coverServices(): void {
    // What is covered follows from the layout and from which blocks are frightened, and most
    // steps change neither, so the last answer is kept until one of them does.
    const scared = this.scared;
    const last = this.coveredFor;
    if (last && last.layout === this.map.layoutRevision && last.scared.every((value, id) => value === scared[id])) return;
    this.coveredFor = { layout: this.map.layoutRevision, scared: Uint8Array.from(scared) };
    for (const service of SERVICES) this.covered[service].fill(0);
    this.shore.fill(0);
    for (let id = 0; id < MAP_SIZE ** 2; id++) {
      const tile = this.map.at(id);
      const water = tile === 'river' || tile === 'bridge';
      if (!isService(tile) && !water) continue;
      const { x, y } = cellAt(id);
      if (!water && !this.doorOf({ x, y })) continue;
      // Nobody sends a child to school in a frightened neighbourhood.
      if (this.scared[id] && SCHOOLS.includes(tile as Service)) continue;
      const radius = water ? landValue.waterfront.radius : services.radius[tile as Service];
      const field = water ? this.shore : this.covered[tile as Service];
      const second = water ? undefined : alsoServes[tile as Service];
      const also = second && this.covered[second];
      for (let dy = Math.max(-radius, -y); dy <= radius && y + dy < MAP_SIZE; dy++) {
        const span = radius - Math.abs(dy);
        const row = (y + dy) * MAP_SIZE;
        for (let cx = Math.max(0, x - span); cx <= x + span && cx < MAP_SIZE; cx++) {
          field[row + cx] = 1;
          if (also) also[row + cx] = 1;
        }
      }
    }
  }

  /** Groups park tiles that touch, and marks the big parks' surroundings and middles. */
  private findParks(): void {
    this.parkSize.fill(0);
    this.grand.fill(0);
    this.fountains.clear();
    this.bigParks = 0;
    const { tiles, radius } = landValue.bigPark;
    for (let start = 0; start < MAP_SIZE ** 2; start++) {
      if (this.map.at(start) !== 'park' || this.parkSize[start]) continue;
      const group = [start];
      this.parkSize[start] = 1;
      for (let next = 0; next < group.length; next++) {
        const { x, y } = cellAt(group[next]);
        for (const [dx, dy] of neighbors) {
          const cell = { x: x + dx, y: y + dy };
          if (this.map.get(cell) !== 'park' || this.parkSize[indexOf(cell)]) continue;
          this.parkSize[indexOf(cell)] = 1;
          group.push(indexOf(cell));
        }
      }
      for (const id of group) this.parkSize[id] = Math.min(65535, group.length);
      if (group.length < tiles) continue;
      this.bigParks++;
      // The fountain goes on the park's tile nearest its middle.
      let sumX = 0;
      let sumY = 0;
      for (const id of group) {
        sumX += id % MAP_SIZE;
        sumY += Math.floor(id / MAP_SIZE);
      }
      const far = (id: number) =>
        Math.abs(id % MAP_SIZE - sumX / group.length) + Math.abs(Math.floor(id / MAP_SIZE) - sumY / group.length);
      this.fountains.add(group.reduce((best, id) => far(id) < far(best) ? id : best));
      for (const id of group) {
        const { x, y } = cellAt(id);
        for (let dy = -radius; dy <= radius; dy++) {
          const span = radius - Math.abs(dy);
          for (let dx = -span; dx <= span; dx++) {
            const cell = { x: x + dx, y: y + dy };
            if (this.map.get(cell) !== undefined) this.grand[indexOf(cell)] = 1;
          }
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
    this.findParks();
    this.findCombos();
    const { industry, power, road, park } = pollution;
    for (const id of this.buildings.keys()) {
      if (this.map.at(id) !== 'industrial') continue;
      spread(id, industry.strength * (this.member(id, 'estate') || this.member(id, 'port') ? combos.estate.smog : 1) *
        (this.policiesOn.has('recycle') ? policies.recycle.smog : 1), industry.radius);
    }
    for (let id = 0; id < MAP_SIZE ** 2; id++) {
      const tile = this.map.at(id);
      if (tile === 'power') {
        if (this.hasRoadAccess(cellAt(id))) spread(id, power.strength, power.radius);
      }
      else if (tile === 'park') {
        const big = this.parkSize[id] >= landValue.bigPark.tiles;
        spread(id, -park.strength * (big ? landValue.bigPark.clean : 1), park.radius);
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
   * Once a day a few homes are looked at, and one person in each may change jobs: to a
   * workplace that is clearly nearer, to the kind of work they like, or just for a change.
   * Only workplaces with room count, so nobody is pushed out. Returns whether anyone moved.
   */
  private reviewJobs(tick: number, seed: number): boolean {
    const homes: SavedBuilding[] = [];
    /** The workplaces reached by each road tile. */
    const doors = new Map<number, SavedBuilding[]>();
    for (const [id, building] of this.buildings) {
      if (this.map.at(id) === 'residential') {
        if ((this.employed.get(id) ?? 0) > 0) homes.push(building);
        continue;
      }
      const road = this.roadAccess(cellAt(id));
      if (!road) continue;
      const sharing = doors.get(indexOf(road));
      if (sharing) sharing.push(building);
      else doors.set(indexOf(road), [building]);
    }
    if (!homes.length) return false;
    const { share, min, max } = jobs.review;
    const looks = Math.min(homes.length, max, Math.max(min, Math.ceil(homes.length * share)));
    const seen = new Set<number>();
    let moved = false;
    for (let look = 0; look < looks; look++) {
      const home = homes[roll(seed, tick, 100 + 3 * look) % homes.length];
      if (seen.has(home.id)) continue;
      seen.add(home.id);
      const person = home.people![roll(seed, tick, 101 + 3 * look) % home.people!.length];
      const road = this.roadAccess(cellAt(home.id));
      const door = person.job >= 0 ? this.roadAccess(cellAt(person.job)) : undefined;
      if (!road || !door) continue;
      const own = indexOf(door);
      const zone = this.map.at(person.job);
      const { liking } = this.whoAt(home.id, person);
      // Every workplace with room, nearest first, out to a little beyond the job they have.
      let reach: number | undefined;
      const offers: { work: SavedBuilding; minutes: number }[] = [];
      this.roadGraph.explore(road, this.minutesAt, traffic.maxCommute, (at, minutes) => {
        if (at === own) reach = minutes;
        if (reach !== undefined && minutes > reach + jobs.extra) return true;
        for (const work of doors.get(at) ?? []) {
          if (work.id !== person.job && work.occupants < this.capacityOf(work)) offers.push({ work, minutes });
        }
        return false;
      });
      if (reach === undefined) continue;
      const limit: number = reach;
      const kind = (offer: { work: SavedBuilding }) => this.map.at(offer.work.id);
      // Someone in the work they like does not leave it for another kind.
      const fine = (offer: { work: SavedBuilding; minutes: number }) =>
        offer.minutes <= limit + jobs.extra && (liking !== zone || kind(offer) === liking);
      let why: PersonNews['kind'] = 'job-nearer';
      let pick = offers.find(offer => offer.minutes <= limit - jobs.nearer && fine(offer));
      if (!pick && liking && liking !== zone) {
        why = 'job-liking';
        pick = offers.find(offer => kind(offer) === liking && fine(offer));
      }
      if (!pick && roll(seed, tick, 102 + 3 * look) / 2 ** 32 < jobs.restless) {
        why = 'job-change';
        pick = offers.find(fine);
      }
      if (!pick) continue;
      this.buildings.get(person.job)!.occupants--;
      pick.work.occupants++;
      person.job = pick.work.id;
      person.hired = tick;
      this.tell(why, home.id, person, shiftIndex(kind(pick) as Zone, pick.work.id));
      moved = true;
    }
    return moved;
  }

  /**
   * Matches residents to jobs and loads their commutes onto the roads, starting from empty
   * roads every time. Whoever has a job keeps it while the workplace stands, has room and can
   * be reached. Homes go in the order they were built; those in each without work take the
   * vacancies that are quickest to reach given the traffic of the homes before it.
   */
  private assignJobs(): void {
    // A job that turns out to be out of reach frees a vacancy that homes already dealt with
    // could have taken, so the matching runs again until nothing more comes loose.
    for (let pass = 0; pass < 8 && this.matchJobs(); pass++);
  }

  /** One round of matching. Returns true if a job came loose and the round must be run again. */
  private matchJobs(): boolean {
    this.transfers.clear();
    this.commutes.length = 0;
    this.commuteByPair.clear();
    this.riders = 0;
    this.flows.fill(0);
    for (const flows of this.shiftFlows) flows.fill(0);
    this.employed.clear();
    this.commuteMinutes.clear();
    this.staff.clear();
    for (const plan of this.plans) {
      plan.riders = 0;
      plan.loads.fill(0);
    }
    const homes: { building: SavedBuilding; road: Cell }[] = [];
    const jobsAt = new Map<number, SavedBuilding[]>();
    /** The road tile each workplace is reached by. */
    const doorOf = new Map<number, number>();
    let vacancies = 0;
    let loose = false;

    for (const [id, building] of this.buildings) {
      const cell = this.zones.get(id)!;
      const road = this.roadAccess(cell);
      if (this.map.get(cell) === 'residential') {
        if (road && building.occupants > 0) homes.push({ building, road });
        // Nobody gets to work from a home without a road.
        else for (const person of building.people!) person.job = -1;
      } else {
        building.occupants = 0;
        if (!road) continue;
        const at = indexOf(road);
        const sharing = jobsAt.get(at);
        if (sharing) sharing.push(building);
        else jobsAt.set(at, [building]);
        doorOf.set(id, at);
        vacancies += this.capacityOf(building);
      }
    }
    for (const sharing of jobsAt.values()) sharing.sort((a, b) => a.id - b.id);

    // First everyone who has a job takes their place, while the workplace is there and has room.
    for (const { building } of homes) {
      for (const person of building.people!) {
        if (!this.canWork(building.id, person)) person.job = -1;
        if (person.job < 0) continue;
        const work = this.buildings.get(person.job);
        if (work && doorOf.has(work.id) && work.occupants < this.capacityOf(work)) {
          work.occupants++;
          vacancies--;
        } else {
          person.job = -1;
          this.tell('job-lost', building.id, person);
        }
      }
    }

    const { minutesAt } = this;
    for (const { building, road } of homes) {
      const people = building.people!;
      const seekers = people.filter(person => person.job < 0 && this.canWork(building.id, person));
      const kept = new Map<number, SavedPerson[]>();
      /** The doors of the workplaces people here already work at, until each is reached. */
      const wanted = new Set<number>();
      for (const person of people) {
        if (person.job < 0) continue;
        const group = kept.get(person.job);
        if (group) group.push(person);
        else kept.set(person.job, [person]);
        wanted.add(doorOf.get(person.job)!);
      }
      let placed = 0;
      const taken: { workId: number; staff: SavedPerson[]; at: number }[] = [];
      if (wanted.size || (seekers.length && vacancies)) {
        this.roadGraph.explore(road, minutesAt, traffic.maxCommute, at => {
          const here = jobsAt.get(at);
          if (here && wanted.delete(at)) {
            for (const work of here) {
              const group = kept.get(work.id);
              if (group) taken.push({ workId: work.id, staff: group, at });
            }
          }
          if (here && placed < seekers.length && vacancies) {
            for (const work of here) {
              const count = Math.min(seekers.length - placed, this.capacityOf(work) - work.occupants);
              if (count <= 0) continue;
              const hired = seekers.slice(placed, placed + count);
              for (const person of hired) {
                person.job = work.id;
                person.hired = this.clock;
              }
              placed += count;
              work.occupants += count;
              vacancies -= count;
              const group = taken.find(entry => entry.workId === work.id);
              if (group) group.staff.push(...hired);
              else taken.push({ workId: work.id, staff: hired, at });
            }
          }
          return !wanted.size && (placed >= seekers.length || !vacancies);
        });
      }
      // A workplace the roads no longer lead to within a bearable commute is a job lost.
      // Its door was never reached, so nobody was hired there just now.
      if (wanted.size) {
        for (const person of people) {
          if (person.job < 0 || !wanted.has(doorOf.get(person.job)!)) continue;
          this.buildings.get(person.job)!.occupants--;
          vacancies++;
          person.job = -1;
          this.tell('job-lost', building.id, person);
          loose = true;
        }
      }
      for (const { workId, staff, at } of taken) {
        const workers = staff.length;
        const path = this.roadGraph.pathTo(at);
        const shift = shiftIndex(this.map.at(workId) as Zone, workId);
        const flows = this.shiftFlows[shift];
        const entries = staff.map(person => ({ home: building.id, person }));
        const list = this.staff.get(workId);
        if (list) list.push(...entries);
        else this.staff.set(workId, entries);
        // The quickest ride on one line with a stop near home and another near work, if any.
        let ride: { plan: Line & { loads: number[] }; minutes: number;
          second?: Line & { loads: number[] }; transfer?: number } | undefined;
        for (const from of this.stopsNear.get(building.id) ?? []) {
          for (const to of this.stopsNear.get(workId) ?? []) {
            if (from.plan === to.plan) {
              if (from.index === to.index) continue;
              const minutes = from.plan.headway / 2 + Math.abs(from.plan.times[from.index] - to.plan.times[to.index]);
              if (!ride || minutes < ride.minutes) ride = { plan: from.plan, minutes };
              continue;
            }
            if (from.plan.kind === to.plan.kind) continue;
            for (const links of this.transferStops.values()) for (const link of links) {
              const busFirst = from.plan === link.bus && to.plan === link.metro;
              const metroFirst = from.plan === link.metro && to.plan === link.bus;
              if (!busFirst && !metroFirst) continue;
              const start = busFirst ? link.busIndex : link.metroIndex;
              const end = busFirst ? link.metroIndex : link.busIndex;
              if (from.index === start || to.index === end) continue;
              const minutes = 3 + (from.plan.headway + to.plan.headway) / 2 +
                Math.abs(from.plan.times[from.index] - from.plan.times[start]) +
                Math.abs(to.plan.times[to.index] - to.plan.times[end]);
              if (!ride || minutes < ride.minutes) {
                ride = { plan: from.plan, second: to.plan, transfer: link.metroStop, minutes };
              }
            }
          }
        }
        // How many ride depends on how it compares with driving now, and on the room left.
        let riders = 0;
        if (ride) {
          let drive = 0;
          for (const cell of path) drive += minutesAt(indexOf(cell));
          const shares = this.policiesOn.has('freeride') ? policies.freeride.share : transit.share;
          const baseShare = ride.minutes <= drive ? shares.faster : ride.minutes <= drive * transit.closeFactor ? shares.close : 0;
          const share = weatherAt(this.seed, this.clock) === 'clear' ? baseShare :
            Math.min(1, baseShare + (ride.minutes <= drive * 2 ? 0.25 : 0));
          // Some never ride and some always do; the share applies to everyone else.
          const having = (trait: Trait) =>
            staff.filter(person => this.traitAt(building.id, person.slot) === trait).length;
          const keen = having('rider');
          const willing = Math.floor((workers - having('driver') - keen) * share) + keen;
          riders = Math.max(0, Math.min(willing, ride.plan.capacity - ride.plan.loads[shift]));
          if (ride.second) {
            riders = Math.max(0, Math.min(riders, ride.second.capacity - ride.second.loads[shift]));
            ride.second.loads[shift] += riders;
            ride.second.riders += riders;
          }
          ride.plan.loads[shift] += riders;
          ride.plan.riders += riders;
        }
        this.riders += riders;
        for (const cell of path) {
          const tile = indexOf(cell);
          flows[tile] += workers - riders;
          if (flows[tile] > this.flows[tile]) this.flows[tile] = flows[tile];
        }
        this.commutes.push({ homeId: building.id, workId, workers, path, minutes: 0, shift, riders,
          line: riders ? ride!.plan.id : undefined, transfer: riders ? ride!.transfer : undefined, transitMinutes: riders ? ride!.minutes : undefined });
        this.commuteByPair.set(building.id * MAP_SIZE ** 2 + workId, this.commutes.at(-1)!);
      }
      this.employed.set(building.id, people.filter(person => person.job >= 0).length);
    }
    if (loose) return true;

    for (const { transfer, riders } of this.commutes) {
      if (transfer !== undefined && riders) this.transfers.set(transfer, riders + (this.transfers.get(transfer) ?? 0));
    }
    for (const plan of this.plans) plan.busiest = Math.max(...plan.loads);

    // Times are read once everyone is on the road, so early homes feel later traffic too.
    for (const commute of this.commutes) {
      const flows = this.shiftFlows[commute.shift];
      for (const cell of commute.path) {
        const tile = indexOf(cell);
        commute.minutes += tileMinutes(flows[tile], this.roadAt(tile));
      }
      // The average over those who drive and those who ride.
      if (commute.riders) {
        commute.minutes = (commute.minutes * (commute.workers - commute.riders) +
          commute.transitMinutes! * commute.riders) / commute.workers;
      }
      this.commuteMinutes.set(commute.homeId, (this.commuteMinutes.get(commute.homeId) ?? 0) +
        commute.minutes * commute.workers / this.employed.get(commute.homeId)!);
    }
    return false;
  }

  save(): Omit<SaveData, 'schemaVersion' | 'seed' | 'tick'> {
    return { tiles: this.map.save(), metros: this.map.stationTiles(), spans: this.map.spanTiles(), zones: [...this.zones.keys()],
      buildings: [...this.buildings.values()].map(building => building.people ?
        { ...building, people: building.people.map(person => ({ ...person, identity: person.identity && { ...person.identity } })) } : { ...building }),
      freightRuntime: this.shipments.save(), freightMode: this.freightMode, freightLines: this.freightLines.map(line => ({ ...line, stops: [...line.stops] })),
      ownedLand: [...this.ownedLand].sort((a, b) => a - b),
      funds: this.funds, rank: this.rank, taxRate: this.taxRate,
      lines: this.lines.map(line => ({ ...line, stops: [...line.stops] })),
      goals: [...this.goalsDone], loans: [...this.loans], tasks: [...this.tasksOn],
      combos: [...this.combosSeen], policies: [...this.policiesOn], challenge: this.challenge && { ...this.challenge },
      dilemma: this.dilemma && { ...this.dilemma }, boosts: this.boosts.map(boost => ({ ...boost })), level: this.level, theme: this.theme,
      coldStock: [...this.coldStock], marketStock: [...this.marketStock], monthlyVisits: [...this.monthlyVisits], activeVisits: this.visits.save(), dailyActivities: this.diary.save(),
      scares: this.scares.map(entry => ({ ...entry })), tasksRest: [...this.tasksRest], nextPersonId: this.nextPersonId, relationships: this.relationships.save(), life: this.life.save() };
  }

  load({ freightRuntime, freightMode, freightLines, ownedLand, tiles, zones, buildings, funds, rank, taxRate, tick, lines, goals: done, loans, seed, metros, tasks: saved, combos: known, policies: chosen, challenge, spans, dilemma, boosts, level, theme, coldStock, marketStock, monthlyVisits, activeVisits, dailyActivities, scares, tasksRest, nextPersonId, relationships, life }: SaveData): void {
    this.shipments.load(freightRuntime, tick);
    this.freightMode = freightMode ?? 'auto';
    this.freightLines.splice(0, this.freightLines.length, ...(freightLines ?? []).map(line => ({ ...line, stops: [...line.stops] })));
    this.ownedLand.clear();
    for (const id of ownedLand ?? ALL_LAND) this.ownedLand.add(id);
    this.seed = seed;
    this.nextPersonId = nextPersonId ?? 0;
    this.life.load(life ?? EMPTY_LIFE());
    this.relationships.load(relationships ?? []);
    this.goalsDone.clear();
    for (const goal of done) this.goalsDone.add(goal);
    this.loans.splice(0, this.loans.length, ...loans);
    this.lines.length = 0;
    for (const line of lines) this.lines.push({ ...line, stops: [...line.stops] });
    this.tasksOn.splice(0, this.tasksOn.length, ...taskList.map(task => task.id).filter(id => saved.includes(id)));
    this.tasksRest.clear();
    for (const [task, until] of tasksRest ?? []) this.tasksRest.set(task as TaskId, until);
    this.combosSeen.clear();
    this.policiesOn.clear();
    for (const policy of POLICIES) if (chosen.includes(policy)) this.policiesOn.add(policy);
    this.challenge = challenge && { ...challenge };
    this.challengeEnd = undefined;
    this.level = level;
    this.theme = theme;
    this.dilemma = dilemma && { ...dilemma };
    this.dilemmaEnd = undefined;
    this.boosts.splice(0, this.boosts.length, ...boosts.map(boost => ({ ...boost })));
    this.feasts.length = 0;
    for (const combo of COMBOS) if (known.includes(combo)) this.combosSeen.add(combo);
    this.taskDone = undefined;
    this.events.length = 0;
    this.scares.splice(0, this.scares.length, ...(scares ?? []).map(entry => ({ ...entry })));
    this.visits.load(activeVisits ?? []);
    this.diary.load(dailyActivities ?? []);
    this.clock = tick;
    this.funds = funds;
    this.rank = rank;
    this.taxRate = taxRate;
    this.map.load(tiles, metros, spans);
    this.monthlyVisits.clear();
    for (const [id, count] of monthlyVisits ?? []) {
      const anchor = indexOf(this.map.anchorOf(cellAt(id)) ?? cellAt(id));
      this.monthlyVisits.set(anchor, (this.monthlyVisits.get(anchor) ?? 0) + count);
    }
    this.coldStock.clear();
    this.marketStock.clear();
    for (const [id, stock] of coldStock ?? []) if (this.map.at(id) === 'coldstore') this.coldStock.set(id, stock);
    for (const [id, stock] of marketStock ?? []) if (this.map.at(id) === 'market') this.marketStock.set(id, stock);
    this.zones.clear();
    this.buildings.clear();
    this.facilities.clear();
    for (const id of zones) this.zones.set(id, cellAt(id));
    for (const building of buildings) {
      const record: SavedBuilding = { ...building };
      delete record.people;
      delete record.nextSlot;
      if (this.map.at(building.id) === 'residential') {
        // A save from before people were kept: the first places, all yet to find their work.
        record.people = building.people?.map(person => ({ ...person, identity: person.identity && { ...person.identity } })) ??
          Array.from({ length: building.occupants }, (_, slot) => ({ slot, job: -1, came: tick, hired: tick }));
        record.nextSlot = building.nextSlot ?? building.occupants;
      }
      this.buildings.set(building.id, record);
    }
    for (let id = 0; id < MAP_SIZE ** 2; id++) {
      const tile = this.map.get(cellAt(id));
      if (isFacility(tile)) this.facilities.set(id, tile);
    }
    this.refresh();
    this.news.length = 0;
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
        if (this.takesNewcomers(id, building)) openings += capacity - building.occupants - this.kidsAt(id).length;
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
    const mood = this.mood();
    const shift = (this.taxRate > usual ? (usual - this.taxRate) * above : (usual - this.taxRate) * below) +
      (mood === 'boom' ? cycle.boom.demand : mood === 'slump' ? cycle.slump.demand : 0) +
      this.boosts.reduce((sum, boost) => boost.until > this.clock ? sum + boost.amount : sum, 0);
    const demand = zoneDemand(supply);
    for (const zone of zoneOrder) demand[zone] = Math.max(-100, Math.min(100, demand[zone] + shift));
    return demand;
  }

  /** What a month brings in and costs with the city as it is now. */
  budget() {
    const { population, employed } = this.supply();
    const taxpayers = population + this.traitCounts.rich * (traits.rich.taxTimes - 1);
    const tax = Math.round((taxpayers * economy.tax.resident + employed * economy.tax.job) * this.level *
      this.taxRate / economy.taxRate.default * (this.mood() === 'boom' ? cycle.boom.tax : 1));
    let upkeep = this.tileUpkeep * this.level;
    // Lines cost by the vehicle and earn by the rider.
    let fares = 0;
    for (const plan of this.plans) {
      upkeep += plan.vehicles * transit[plan.kind].vehicleUpkeep;
      if (!this.policiesOn.has('freeride')) fares += plan.riders * transit[plan.kind].fare;
    }
    const trade = this.tradeNow();
    for (const policy of this.policiesOn) upkeep += Math.round(policies[policy].fixed + policies[policy].perResident * population);
    const loans = this.loans.length * economy.loan.payment;
    const { visitors, licence } = this;
    const fuel = Math.round(this.fuelTax);
    const parking = Math.round(this.parkingFees);
    upkeep = Math.round(upkeep);
    return { tax, fares, trade, visitors, licence, fuel, parking, loans, upkeep,
      net: tax + fares + trade + visitors + licence + fuel + parking - upkeep - loans };
  }

  /** How many buildings stand at each level, 1 to 4. */
  private levelCounts(): number[] {
    const counts = [0, 0, 0, 0];
    for (const building of this.buildings.values()) counts[building.level - 1]++;
    return counts;
  }

  private complexes(): number {
    let count = 0;
    for (const [id, building] of this.buildings) if (building.block === id) count++;
    return count;
  }

  /** How many plants, towers and stations stand idle for want of a road beside them. */
  private idle(): number {
    return this.idleCount;
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
    const complaints = this.complaints();
    let minutes = 0;
    for (const commute of this.commutes) minutes += commute.minutes * commute.workers;
    const children = this.life.children.filter(child => child.home >= 0).length;
    const retired = [...this.peopleById.values()].filter(({ home, person }) => this.whoAt(home, person).age >= 65).length;
    return { population: supply.population, totalPopulation: supply.population + children, children, retired, housing: supply.housing,
      jobs: supply.commercialJobs + supply.industrialJobs, employed: supply.employed,
      buildings: this.buildings.size,
      /** Average minutes to work over everyone with a job; 0 when nobody has one. */
      commute: supply.employed ? minutes / supply.employed : 0,
      demand: this.getDemand(supply), funds: this.funds, taxRate: this.taxRate, budget: this.budget(), rank: this.rank,
      complaints, idle: this.idle(), riders: this.riders,
      goods: { ...this.market, trade: this.tradeNow() }, traits: { ...this.traitCounts }, levels: this.levelCounts(),
      /** How many residents own each vehicle, by its index in Wealth's `vehicles`. */
      cars: [...this.carCounts],
      bigParks: this.bigParks, complexes: this.complexes(), goals: [...this.goalsDone],
      combos: { ...this.comboCounts }, combosSeen: COMBOS.filter(combo => this.combosSeen.has(combo)),
      /** The tasks being worked on with how many buildings still have the trouble. */
      tasks: this.tasksOn.map(id => ({ id, left: complaints[taskList.find(task => task.id === id)!.issue] })),
      /** Prices: the level of all of them, fuel and goods as multiples of the usual. */
      prices: { level: this.level, fuel: fuelPrice(this.clock), goods: goodsPrice(this.clock) },
      /** Commuters held up on the road, who are late and docked for it. */
      late: this.commutes.reduce((sum, route) => this.heldUp(route) ? sum + route.workers - route.riders : sum, 0),
      season: seasonAt(this.clock), policies: POLICIES.filter(policy => this.policiesOn.has(policy)),
      /** The next festival, how many days off it is, and whether the city has somewhere to hold it. */
      festival: { ...nextFestival(this.clock), ready: this.venueOf(nextFestival(this.clock).id) > 0 },
      /** The challenge under way with where its figure stands. */
      challenge: this.challenge && { ...this.challenge, now: this.challengeFigure(this.challenge.id) },
      /** The decision waiting for an answer, and what past answers add to demand just now. */
      dilemma: this.dilemma && { ...this.dilemma },
      boost: this.boosts.reduce((sum, boost) => boost.until > this.clock ? sum + boost.amount : sum, 0),

      loans: [...this.loans], bankrupt: this.funds < economy.bankrupt, mood: this.mood() };
  }
}
