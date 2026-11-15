import type { HealthRecord } from './LifeSystem';
import { calendar, weekendAt } from './calendar';
import { cellId as indexOf, cellFromId as cellAt, routeToSite } from './FacilityAccess';
import { SHOP_SHIFT, type Doing } from './Mind';
import { services } from './Services';
import { wantsOutdoor, weatherAt } from './Weather';
import type { VisitReason } from './ActivityDiary';
import { RUSH_HOURS, shiftIndex, shifts } from './WorkShift';
import { isService, type Cell, type TileMap, type Zone } from './TileMap';
import type { RoadGraph } from './RoadGraph';
import type { SavedBuilding, SavedPerson } from './SaveData';
import type { Combo } from './Combos';
import { stayTicks, travelTicks, type FacilityVisit } from './VisitSystem';
import { DUTIES, FOOD_PLACES, SOCIAL_PLACES } from './Needs';
import { seats } from './Capacity';

export interface CivicVisitContext {
  map: TileMap;
  roadGraph: RoadGraph;
  clock: number;
  seed: number;
  health: (person: SavedPerson) => HealthRecord | undefined;
  available: (home: number, slot: number) => boolean;
  buildings: ReadonlyMap<number, SavedBuilding>;
  daycareSeats: ReadonlyMap<number, number>;
  hasCombo: (cell: Cell, combo: Combo) => boolean;
  kidsAt: (home: number) => { age: number }[];
  ageOf: (home: number, person: SavedPerson) => number;
  roadAccess: (cell: Cell) => Cell | undefined;
  visited?: (person: SavedPerson, doing: Doing) => boolean;
  /**
   * What the resident lacks right now (see Needs.ts), asked one need at a time because each
   * takes some working out. Without it, outings only take turns.
   */
  needs?: { tired: (home: number, person: SavedPerson) => boolean;
    wantsFood: (home: number, person: SavedPerson) => boolean;
    lonely: (home: number, person: SavedPerson) => boolean;
    /** Whether they cook at home as a rule, and so go to market when it is open. */
    cooks?: (home: number, person: SavedPerson) => boolean };
  /** Whether someone at this home has a birthday today and nobody has fetched the cake yet. */
  celebrates?: (home: number) => boolean;
  /** Whether a meal is on its way to them this hour, so that they stay in for it. */
  staysIn?: (home: number, person: SavedPerson) => boolean;
  /** How many people are at a place or on their way to it. Without it, no place is ever full. */
  occupancy?: (site: number) => number;
  /** Told when someone wanted a place and found it full; `waiting` if they are ill and now wait at home. */
  turnedAway?: (site: number, home: number, person: SavedPerson, waiting: boolean) => void;
  origin?: (home: number, person: SavedPerson) => { cell: Cell; road: Cell } | undefined;
}

function reasonFor(doing: Doing, rainy: boolean): VisitReason {
  if (doing === 'school' || doing === 'highschool') return 'school';
  if (doing === 'daycare') return 'childcare';
  if (doing === 'shopping') return 'supplies';
  if (doing === 'bakery') return 'bread';
  if (doing === 'flowers') return 'flowers';
  if (doing === 'cake') return 'treat';
  if (doing === 'bank') return 'errands';
  if (doing === 'care') return 'care';
  if (['park', 'remembering', 'amusement', 'stadium', 'nightmarket'].includes(doing)) return 'outdoor';
  if (rainy) return 'indoor';
  if (doing === 'socializing') return 'social';
  if (doing === 'reading' || doing === 'university') return 'study';
  return 'leisure';
}
function roll(seed: number, tick: number, salt: number): number {
  let hash = Math.imul(seed ^ Math.imul(tick, 0x9e3779b1) ^ Math.imul(salt + 1, 0x85ebca6b), 0xc2b2ae35);
  hash = Math.imul(hash ^ (hash >>> 15), 0x27d4eb2f);
  return (hash ^ (hash >>> 13)) >>> 0;
}

/** The nearby building inventory changes with the layout, not with each resident's next errand. */
const neighbourhoods = new WeakMap<TileMap, { revision: number; homes: Map<number, Map<string, Cell[]>>; medical: Map<string, Cell[]> }>();
function nearbySites(map: TileMap, origin: Cell, tile: string): readonly Cell[] {
  let cache = neighbourhoods.get(map);
  if (!cache || cache.revision !== map.layoutRevision) {
    cache = { revision: map.layoutRevision, homes: new Map(), medical: new Map() };
    neighbourhoods.set(map, cache);
  }
  let sites = cache.homes.get(indexOf(origin));
  if (!sites) {
    sites = new Map();
    const checked = new Set<number>();
    for (let dy = -6; dy <= 6; dy++) for (let dx = -(6 - Math.abs(dy)); dx <= 6 - Math.abs(dy); dx++) {
      const part = { x: origin.x + dx, y: origin.y + dy };
      const dest = map.anchorOf(part) ?? part;
      const kind = map.get(dest);
      if ((!isService(kind) && kind !== 'park') || checked.has(indexOf(dest))) continue;
      checked.add(indexOf(dest));
      if (!sites.has(kind)) sites.set(kind, []);
      sites.get(kind)!.push(dest);
    }
    cache.homes.set(indexOf(origin), sites);
  }
  return sites.get(tile) ?? [];
}

/** The clinics or hospitals within their reach of a place, in the order a search outward meets them. */
function medicalSites(map: TileMap, start: Cell, tile: 'clinic' | 'hospital'): readonly Cell[] {
  nearbySites(map, start, tile);
  const cache = neighbourhoods.get(map)!.medical;
  const key = `${indexOf(start)}:${tile}`;
  let sites = cache.get(key);
  if (!sites) {
    sites = [];
    const reach = services.radius[tile];
    const checked = new Set<number>();
    for (let dy = -reach; dy <= reach; dy++) {
      const span = reach - Math.abs(dy);
      for (let dx = -span; dx <= span; dx++) {
        const part = { x: start.x + dx, y: start.y + dy };
        const dest = map.anchorOf(part) ?? part;
        if (!(map.get(dest) === tile || (tile === 'clinic' && map.get(dest) === 'familyclinic')) || checked.has(indexOf(dest))) continue;
        checked.add(indexOf(dest));
        sites.push(dest);
      }
    }
    cache.set(key, sites);
  }
  return sites;
}

function medicalTrip(context: CivicVisitContext, origin: Cell, from: Cell, need: number, urgent = false,
  full?: (dest: Cell) => boolean, blocked?: Cell[]) {
  const nearest = (tile: 'clinic' | 'hospital', start: Cell, entry: Cell, specialist = false) => {
    let best: { path: Cell[]; distance: number; specialized: boolean } | undefined;
    for (const dest of medicalSites(context.map, start, tile)) {
      const route = routeToSite(context.map, context.roadGraph, entry, dest, indexOf(origin));
      if (!route) continue;
      // A full waiting room turns away all but emergencies, and a referral is always seen.
      if (start === origin && !urgent && full?.(dest)) { blocked?.push(dest); continue; }
      const specialized = specialist && context.hasCombo(dest, 'medical');
      if (best && (best.specialized !== specialized ? best.specialized : best.distance <= route.distance)) continue;
      best = { path: [start, ...route.path], distance: route.distance, specialized };
    }
    return best?.path;
  };
  const clinic = need === 1 ? undefined : nearest('clinic', origin, from);
  if (clinic) {
    if (need !== 2) return { doing: 'clinic' as const, path: clinic };
    const referral = clinic.at(-1)!;
    return { doing: 'clinic' as const, path: clinic, transfer: nearest('hospital', referral, clinic.at(-2)!, true) };
  }
  const hospital = nearest('hospital', origin, from, need === 2);
  return hospital && { doing: 'hospital' as const, path: hospital };
}

/**
 * Where residents go of their own accord, and the hours each kind of place draws them. A visit
 * has to fit inside the hours, stay and all, so a place open for less than its stay plus the
 * walk there draws nobody: the night market's three hours did just that until they were made six.
 */
const scheduled: readonly { tile: string; doing: Doing; from: number; until: number }[] = [
    { tile: 'community', doing: 'socializing', from: 10, until: 20 },
    { tile: 'eldercare', doing: 'care', from: 8, until: 18 },
    { tile: 'memorial', doing: 'remembering', from: 10, until: 17 },
    { tile: 'school', doing: 'school', from: 7, until: 9 },
    { tile: 'highschool', doing: 'highschool', from: 7, until: 9 },
    { tile: 'university', doing: 'university', from: 8, until: 11 },
    { tile: 'daycare', doing: 'daycare', from: 16, until: 18 },
    { tile: 'bank', doing: 'bank', from: 9, until: 13 },
    // The market keeps a morning market's and an evening market's hours, so those who work can get to one of them.
    { tile: 'market', doing: 'shopping', from: 7, until: 19 },
    { tile: 'bakery', doing: 'bakery', from: 6, until: 19 },
    { tile: 'florist', doing: 'flowers', from: 10, until: 19 },
    { tile: 'cakeshop', doing: 'cake', from: 12, until: 20 },
    { tile: 'mall', doing: 'shopping', from: 12, until: 19 },
    { tile: 'clinic', doing: 'clinic', from: 9, until: 11 },
    { tile: 'culture', doing: 'exhibition', from: 13, until: 17 },
    { tile: 'library', doing: 'reading', from: 14, until: 17 },
    { tile: 'park', doing: 'park', from: 17, until: 20 },
    { tile: 'temple', doing: 'temple', from: 10, until: 17 },
    { tile: 'cinema', doing: 'cinema', from: 17, until: 22 },
    { tile: 'pool', doing: 'pool', from: 11, until: 18 },
    { tile: 'ktv', doing: 'ktv', from: 18, until: 23 },
    { tile: 'amusement', doing: 'amusement', from: 10, until: 18 },
    { tile: 'casino', doing: 'casino', from: 18, until: 23 },
    { tile: 'museum', doing: 'museum', from: 10, until: 17 },
    { tile: 'stadium', doing: 'stadium', from: 15, until: 21 },
    { tile: 'square', doing: 'nightmarket', from: 17, until: 23 },
];
const OUTDOORS = ['park', 'square', 'amusement', 'stadium', 'memorial'];

/** Trips to facilities follow the road network; the first and last segments are driveways. */
export function planFacilityVisits(context: CivicVisitContext, hour: number, visible: (home: Cell) => boolean) {
  const day = Math.floor(context.clock / calendar.ticksPerDay);
  const visits: FacilityVisit[] = [];
  // This runs for every resident every game hour, so what is the same for all of them is
  // worked out once, and what is the same for a home once per home.
  const options = scheduled.filter(visit => hour >= visit.from && hour < visit.until && visit.tile !== 'clinic');
  const weekend = weekendAt(context.clock);
  const checkupHour = hour >= 9 && hour < 11;
  // A place fills up with those already there or on their way, and with those sent this hour.
  const sent = new Map<number, number>();
  const full = (dest: Cell) => {
    const limit = context.occupancy && seats[context.map.get(dest)!];
    return !!limit && context.occupancy!(indexOf(dest)) + (sent.get(indexOf(dest)) ?? 0) >= limit;
  };
  const send = (visit: FacilityVisit) => {
    visits.push(visit);
    sent.set(visit.destination, (sent.get(visit.destination) ?? 0) + 1);
  };
  for (const [home, building] of context.buildings) {
    if (!building.people?.length || context.map.at(home) !== 'residential' || !visible(cellAt(home))) continue;
    const homeRoad = context.roadAccess(cellAt(home));
    if (!homeRoad) continue;
    let kids: { age: number }[] | undefined;
    // Only the kinds of place there are near this home are worth a thought; most homes have few.
    let near: typeof options | undefined;
    for (let offset = 0; offset < building.people.length; offset++) {
      const person = building.people[(day + offset) % building.people.length];
      if (!context.available(home, person.slot)) continue;
      const current = context.origin?.(home, person);
      const origin = current?.cell ?? cellAt(home);
      const from = current?.road ?? homeRoad;
      const shift = person.job < 0 ? undefined : shiftIndex(context.map.at(person.job) as Zone, person.job);
      const hours = shift === undefined ? undefined : shifts[shift];
      const workingToday = hours && (!weekend || shift === SHOP_SHIFT);
      const busyStart = hours ? Math.max(0, hours.start - RUSH_HOURS) : 24;
      const busyEnd = hours ? hours.end + RUSH_HOURS : 24;
      const illness = context.health(person);
      if (!illness && workingToday && hour >= busyStart && hour < busyEnd) continue;
      if (illness?.state === 'ill' || (checkupHour && (home + day) % 7 === 0 && !context.visited?.(person, 'clinic') && !context.visited?.(person, 'hospital'))) {
        const need = illness ? (illness.severe ? 1 : 0) : roll(context.seed, day, home) % 3;
        const blocked: Cell[] = [];
        const medical = medicalTrip(context, origin, from, need, !!illness?.severe, full, blocked);
        if (medical) {
          send({ home, slot: person.slot, ...medical, reason: illness ? 'medical' : 'checkup',
            destination: indexOf(context.map.anchorOf(medical.path.at(-1)!) ?? medical.path.at(-1)!),
            transferDestination: medical.transfer ? indexOf(context.map.anchorOf(medical.transfer.at(-1)!) ?? medical.transfer.at(-1)!) : undefined });
          continue;
        }
        // The sick wait at home for a place; a check-up is simply put off.
        if (illness && blocked.length) context.turnedAway?.(indexOf(blocked[0]), home, person, true);
      }
      if (illness) continue;
      if (context.staysIn?.(home, person)) continue;
      const around = current ? options.filter(visit => nearbySites(context.map, origin, visit.tile).length) :
        near ??= options.filter(visit => nearbySites(context.map, origin, visit.tile).length);
      if (!around.length) continue;
      const kinds = around.filter(visit => !context.visited?.(person, visit.doing) &&
        (visit.tile !== 'eldercare' || context.ageOf(home, person) >= 65) &&
        (!OUTDOORS.includes(visit.tile) || wantsOutdoor(context.seed, home, person.slot, context.clock)) &&
        (visit.tile !== 'school' || (!weekend && (kids ??= context.kidsAt(home)).some(child => child.age >= 6 && child.age < 13))) &&
        (visit.tile !== 'highschool' || (!weekend && (kids ??= context.kidsAt(home)).some(child => child.age >= 13))) &&
        (visit.tile !== 'university' || (!weekend && context.ageOf(home, person) <= 26)) &&
        (visit.tile !== 'daycare' || (!weekend && (context.daycareSeats.get(home) ?? 0) > 0)));
      if (!kinds.length) continue;
      const feel = context.needs;
      // Someone worn out only does what has to be done.
      const pool = feel?.tired(home, person) ? kinds.filter(visit => DUTIES.includes(visit.tile)) : kinds;
      if (!pool.length) continue;
      // Hunger and loneliness only matter when a place that answers them is open and on the list.
      const hungry = !!feel && pool.some(visit => FOOD_PLACES.includes(visit.tile)) && feel.wantsFood(home, person);
      const lonely = !!feel && pool.some(visit => SOCIAL_PLACES.includes(visit.tile)) && feel.lonely(home, person);
      // The kinds of outing take turns from day to day and hour to hour. What the resident
      // lacks goes to the front of the queue: food for the hungry, then company for the lonely,
      // then the market for those who cook and the cake for a birthday at home.
      const first = (home + person.slot + day + Math.floor(hour / 3)) % pool.length;
      const cooks = !!feel?.cooks && pool.some(visit => visit.tile === 'market') && feel.cooks(home, person);
      const party = pool.some(visit => visit.tile === 'cakeshop') && !!context.celebrates?.(home);
      const wanted = (tile: string) => hungry && FOOD_PLACES.includes(tile) ? 0 : lonely && SOCIAL_PLACES.includes(tile) ? 1 :
        (cooks && tile === 'market') || (party && tile === 'cakeshop') ? 2 : 3;
      const order = pool.map((_, next) => pool[(first + next) % pool.length]);
      if (hungry || lonely || cooks || party) order.sort((a, b) => wanted(a.tile) - wanted(b.tile));
      // Whether a kind of place they can get to has come up yet: the first such is their first choice.
      let choseBefore = false;
      for (const { tile, doing, until } of order) {
        let nearest: { path: Cell[]; distance: number; destination: number } | undefined;
        const firstChoice = !choseBefore;
        for (const dest of nearbySites(context.map, origin, tile)) {
            if (tile === 'square' && !context.hasCombo(dest, 'nightmarket')) continue;
            const route = routeToSite(context.map, context.roadGraph, from, dest, home + person.slot + day);
            if (!route || route.path.length > 16) continue;
            choseBefore = true;
            if (nearest && nearest.distance <= route.path.length) continue;
            if (full(dest)) {
              // Only those who meant to come here first are counted as turned away.
              if (firstChoice) context.turnedAway?.(indexOf(dest), home, person, false);
              continue;
            }
            nearest = { path: [origin, ...route.path], distance: route.path.length, destination: indexOf(dest) };
        }
        if (!nearest) continue;
        const travel = travelTicks(nearest.path) * 24 / calendar.ticksPerDay;
        const activityEnd = hour + travel + stayTicks(doing) * 24 / calendar.ticksPerDay;
        const homeBy = workingToday && hour < busyStart ? Math.min(23, busyStart) : 23;
        const back = current && routeToSite(context.map, context.roadGraph, nearest.path.at(-2)!, cellAt(home));
        if (current && !back) continue;
        const returnHours = back ? travelTicks([nearest.path.at(-1)!, ...back.path]) * 24 / calendar.ticksPerDay : travel;
        if (activityEnd > until || activityEnd + returnHours > homeBy) continue;
        send({ home, slot: person.slot, doing, path: nearest.path, destination: nearest.destination,
          reason: wanted(tile) === 0 ? 'hungry' : wanted(tile) === 1 ? 'lonely' : wanted(tile) === 2 ? (tile === 'market' ? 'groceries' : 'birthday') :
            reasonFor(doing, weatherAt(context.seed, context.clock) !== 'clear') });
        break;
      }
    }
  }
  return visits;
}
