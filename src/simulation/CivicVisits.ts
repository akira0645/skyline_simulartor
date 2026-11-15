import type { HealthRecord } from './LifeSystem';
import { calendar, weekendAt } from './calendar';
import { cellId as indexOf, cellFromId as cellAt, routeToSite } from './FacilityAccess';
import { SHOP_SHIFT, type Doing } from './Mind';
import { services } from './Services';
import { wantsOutdoor } from './Weather';
import { RUSH_HOURS, shiftIndex, shifts } from './WorkShift';
import { isService, type Cell, type TileMap, type Zone } from './TileMap';
import type { RoadGraph } from './RoadGraph';
import type { SavedBuilding, SavedPerson } from './SaveData';
import type { Combo } from './Combos';
import { stayTicks, travelTicks, type FacilityVisit } from './VisitSystem';

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
}
function roll(seed: number, tick: number, salt: number): number {
  let hash = Math.imul(seed ^ Math.imul(tick, 0x9e3779b1) ^ Math.imul(salt + 1, 0x85ebca6b), 0xc2b2ae35);
  hash = Math.imul(hash ^ (hash >>> 15), 0x27d4eb2f);
  return (hash ^ (hash >>> 13)) >>> 0;
}

/** The nearby building inventory changes with the layout, not with each resident's next errand. */
const neighbourhoods = new WeakMap<TileMap, { revision: number; homes: Map<number, Map<string, Cell[]>> }>();
function nearbySites(map: TileMap, origin: Cell, tile: string): readonly Cell[] {
  let cache = neighbourhoods.get(map);
  if (!cache || cache.revision !== map.layoutRevision) {
    cache = { revision: map.layoutRevision, homes: new Map() };
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

function medicalTrip(context: CivicVisitContext, origin: Cell, from: Cell, need: number) {
  const nearest = (tile: 'clinic' | 'hospital', start: Cell, entry: Cell, specialist = false) => {
    let best: { path: Cell[]; distance: number; specialized: boolean } | undefined;
    const reach = services.radius[tile];
    const checked = new Set<number>();
    for (let dy = -reach; dy <= reach; dy++) {
      const span = reach - Math.abs(dy);
      for (let dx = -span; dx <= span; dx++) {
        const part = { x: start.x + dx, y: start.y + dy };
        const dest = context.map.anchorOf(part) ?? part;
        if (!(context.map.get(dest) === tile || (tile === 'clinic' && context.map.get(dest) === 'familyclinic')) || checked.has(indexOf(dest))) continue;
        checked.add(indexOf(dest));
        const route = routeToSite(context.map, context.roadGraph, entry, dest, indexOf(origin));
        if (!route) continue;
        const specialized = specialist && context.hasCombo(dest, 'medical');
        if (best && (best.specialized !== specialized ? best.specialized : best.distance <= route.distance)) continue;
        best = { path: [start, ...route.path], distance: route.distance, specialized };
      }
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

/** Trips to facilities follow the road network; the first and last segments are driveways. */
export function planFacilityVisits(context: CivicVisitContext, hour: number, visible: (home: Cell) => boolean) {
  const day = Math.floor(context.clock / calendar.ticksPerDay);
  const visits: FacilityVisit[] = [];
  const scheduled: { tile: string; doing: Doing; from: number; until: number }[] = [
    { tile: 'community', doing: 'socializing', from: 10, until: 20 },
    { tile: 'eldercare', doing: 'care', from: 8, until: 18 },
    { tile: 'memorial', doing: 'remembering', from: 10, until: 17 },
    { tile: 'school', doing: 'school', from: 7, until: 9 },
    { tile: 'highschool', doing: 'highschool', from: 7, until: 9 },
    { tile: 'university', doing: 'university', from: 8, until: 11 },
    { tile: 'daycare', doing: 'daycare', from: 16, until: 18 },
    { tile: 'bank', doing: 'bank', from: 9, until: 13 },
    { tile: 'market', doing: 'shopping', from: 13, until: 16 },
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
    { tile: 'square', doing: 'nightmarket', from: 18, until: 21 },
  ];
  const options = scheduled.filter(visit => hour >= visit.from && hour < visit.until);
  for (const [home, building] of context.buildings) {
    if (!building.people?.length || context.map.at(home) !== 'residential' || !visible(cellAt(home))) continue;
    const from = context.roadAccess(cellAt(home));
    if (!from) continue;
    for (let offset = 0; offset < building.people.length; offset++) {
      const person = building.people[(day + offset) % building.people.length];
      if (!context.available(home, person.slot)) continue;
      const shift = person.job < 0 ? undefined : shiftIndex(context.map.at(person.job) as Zone, person.job);
      const hours = shift === undefined ? undefined : shifts[shift];
      const workingToday = hours && (!weekendAt(context.clock) || shift === SHOP_SHIFT);
      const busyStart = hours ? Math.max(0, hours.start - RUSH_HOURS) : 24;
      const busyEnd = hours ? hours.end + RUSH_HOURS : 24;
      if (!context.health(person) && workingToday && hour >= busyStart && hour < busyEnd) continue;
      const illness = context.health(person);
      if (illness?.state === 'ill' || (hour >= 9 && hour < 11 && (home + day) % 7 === 0)) {
        const need = illness ? (illness.severe ? 1 : 0) : roll(context.seed, day, home) % 3;
        const medical = medicalTrip(context, cellAt(home), from, need);
        if (medical) {
          visits.push({ home, slot: person.slot, ...medical,
            destination: indexOf(context.map.anchorOf(medical.path.at(-1)!) ?? medical.path.at(-1)!),
            transferDestination: medical.transfer ? indexOf(context.map.anchorOf(medical.transfer.at(-1)!) ?? medical.transfer.at(-1)!) : undefined });
          continue;
        }
      }
      if (illness) continue;
      const kinds = options.filter(visit => visit.tile !== 'clinic' &&
        (visit.tile !== 'eldercare' || context.ageOf(home, person) >= 65) &&
        (!['park', 'square', 'amusement', 'stadium', 'memorial'].includes(visit.tile) || wantsOutdoor(context.seed, home, person.slot, context.clock)) &&
        (visit.tile !== 'school' || (!weekendAt(context.clock) && context.kidsAt(home).some(child => child.age >= 6 && child.age < 13))) &&
        (visit.tile !== 'highschool' || (!weekendAt(context.clock) && context.kidsAt(home).some(child => child.age >= 13))) &&
        (visit.tile !== 'university' || (!weekendAt(context.clock) && context.ageOf(home, person) <= 26)) &&
        (visit.tile !== 'daycare' || (!weekendAt(context.clock) && (context.daycareSeats.get(home) ?? 0) > 0)));
      if (!kinds.length) continue;
      const origin = cellAt(home);
      const first = (home + person.slot + day + Math.floor(hour / 3)) % kinds.length;
      for (let next = 0; next < kinds.length; next++) {
        const { tile, doing, until } = kinds[(first + next) % kinds.length];
        let nearest: { path: Cell[]; distance: number; destination: number } | undefined;
        for (const dest of nearbySites(context.map, origin, tile)) {
            if (tile === 'square' && !context.hasCombo(dest, 'nightmarket')) continue;
            const route = routeToSite(context.map, context.roadGraph, from, dest, home + person.slot + day);
            if (!route || route.path.length > 16 || (nearest && nearest.distance <= route.path.length)) continue;
            nearest = { path: [origin, ...route.path], distance: route.path.length, destination: indexOf(dest) };
        }
        if (!nearest) continue;
        const travel = travelTicks(nearest.path) * 24 / calendar.ticksPerDay;
        const activityEnd = hour + travel + stayTicks(doing) * 24 / calendar.ticksPerDay;
        const homeBy = workingToday && hour < busyStart ? Math.min(23, busyStart) : 23;
        if (activityEnd > until || activityEnd + travel > homeBy) continue;
        visits.push({ home, slot: person.slot, doing, path: nearest.path, destination: nearest.destination });
        break;
      }
    }
  }
  return visits;
}
