import type { Doing } from './Mind';
import { cellId } from './FacilityAccess';
import type { Cell } from './TileMap';
import type { VisitReason } from './ActivityDiary';
import { delivery } from './Delivery';

/** One tick is three game hours. Nearby errands fit into a day, including the return walk. */
export const VISIT_WALK_TICKS = 0.08;
export const VISIT_STAY_TICKS = 1;
export const stayTicks = (doing: Doing): number =>
  doing === 'delivering' ? 0.05 : ['school', 'highschool', 'daycare', 'bank', 'clinic', 'bakery', 'flowers', 'cake'].includes(doing) ? 0.2 :
  ['shopping', 'reading', 'park', 'remembering'].includes(doing) ? 0.5 :
  doing === 'exhibition' ? 0.75 : VISIT_STAY_TICKS;
/**
 * Outings of this many road tiles or more are made on what the resident owns, a scooter or a
 * car, rather than on foot; `pace` is how many times a walker's speed each goes, by the kind
 * of vehicle (see Wealth.ts: 1 is a scooter, 2 and up are cars). Bicycles stay at home.
 */
export const outingRide = { from: 5, pace: [1, 3, 4, 4, 4] };
/** What a resident with this vehicle takes on an outing along this way; nothing if they walk. */
export const rideFor = (vehicle: number | undefined, path: readonly Cell[]) =>
  (vehicle ?? 0) >= 1 && path.length - 2 >= outingRide.from ? vehicle : undefined;

export interface FacilityVisit {
  home: number;
  slot: number;
  doing: Doing;
  destination: number;
  path: Cell[];
  transfer?: Cell[];
  transferDestination?: number;
  reason?: VisitReason;
  legs?: number;
  /** The vehicle they are on, by its kind, when they do not walk. */
  ride?: number;
}
export interface ActiveVisit extends FacilityVisit {
  started: number;
  arrived: boolean;
  returning: boolean;
}
export const visitKey = (visit: Pick<FacilityVisit, 'home' | 'slot'>) => `${visit.home}:${visit.slot}`;
/** How long a way takes: on foot, on two wheels for someone out with deliveries, or on their own vehicle. */
export const travelTicks = (path: readonly Cell[], doing?: Doing, ride?: number) =>
  Math.max(1, path.length - 1) * VISIT_WALK_TICKS / (doing === 'delivering' ? delivery.speed : outingRide.pace[ride ?? 0] ?? 1);

/** Pure simulation state: arriving once is the only event that increments monthly visits. */
export class VisitSystem {
  private readonly active = new Map<string, ActiveVisit>();
  /** Actual use intervals from the latest core step, including visits that already finished. */
  readonly usage: { visit: ActiveVisit; from: number; until: number }[] = [];

  /** People inside or on their way, by destination; counted afresh after any trip changes. */
  private tally?: Map<number, number>;
  /** The cars standing at each place or on their way to it, counted with the people. */
  private cars = new Map<number, number>();

  has(home: number, slot: number): boolean { return this.active.has(visitKey({ home, slot })); }

  /** How many people are at a place or on their way to it. */
  occupancy(destination: number): number {
    if (!this.tally) {
      this.tally = new Map();
      this.cars = new Map();
      for (const trip of this.active.values()) {
        if (trip.returning) continue;
        this.tally.set(trip.destination, (this.tally.get(trip.destination) ?? 0) + 1);
        if ((trip.ride ?? 0) >= 2) this.cars.set(trip.destination, (this.cars.get(trip.destination) ?? 0) + 1);
      }
    }
    return this.tally.get(destination) ?? 0;
  }

  /** How many visitors' cars stand at a place or are on their way to it; scooters are not counted. */
  carsAt(destination: number): number {
    this.occupancy(destination);
    return this.cars.get(destination) ?? 0;
  }

  /** Keeps the count right when one trip ends, starts or turns into another. */
  private recount(before: ActiveVisit | undefined, after: ActiveVisit | undefined): void {
    if (!this.tally) return;
    for (const [trip, change] of [[before, -1], [after, 1]] as const) {
      if (!trip || trip.returning) continue;
      this.tally.set(trip.destination, (this.tally.get(trip.destination) ?? 0) + change);
      if ((trip.ride ?? 0) >= 2) this.cars.set(trip.destination, (this.cars.get(trip.destination) ?? 0) + change);
    }
  }

  cancelResident(home: number, slot: number): void { this.active.delete(visitKey({ home, slot })); this.tally = undefined; }

  start(visits: readonly FacilityVisit[], tick: number): void {
    for (const visit of visits) {
      const key = visitKey(visit);
      if (!this.active.has(key)) this.active.set(key, { ...visit, started: tick, arrived: false, returning: false });
    }
    this.tally = undefined;
  }

  advance(tick: number, valid: (visit: ActiveVisit) => boolean,
    routeHome: (visit: ActiveVisit) => Cell[] | undefined,
    nextVisit?: (visit: ActiveVisit, departed: number) => FacilityVisit | undefined, step = 1): ActiveVisit[] {
    const arrivals: ActiveVisit[] = [];
    this.usage.length = 0;
    for (const [key, initial] of this.active) {
      let trip = initial;
      // A visit can cross arrival, a referral, and the return leg between two core ticks.
      for (let stage = 0; stage < 8; stage++) {
        if (!valid(trip)) { this.active.delete(key); this.recount(trip, undefined); break; }
        const travel = travelTicks(trip.path, trip.doing, trip.ride);
        const stay = stayTicks(trip.doing);
        const age = tick - trip.started;
        if (!trip.returning) {
          const from = Math.max(tick - step, trip.started + travel);
          const until = Math.min(tick, trip.started + travel + stay);
          if (until > from) this.usage.push({ visit: { ...trip }, from, until });
        }
        if (!trip.returning && !trip.arrived && age >= travel) {
          trip.arrived = true;
          arrivals.push({ ...trip });
        }
        if (trip.returning) {
          if (age >= travel) this.active.delete(key);
          break;
        } else if (age >= travel + stay) {
          const departed = trip.started + travel + stay;
          const next = !trip.transfer && (trip.legs ?? 1) < 3 ? nextVisit?.(trip, departed) : undefined;
          const before = trip;
          if (next) {
            trip = { ...next, legs: (trip.legs ?? 1) + 1, started: departed, arrived: false, returning: false };
            this.active.set(key, trip);
            this.recount(before, trip);
            continue;
          }
          const path = trip.transfer ?? routeHome(trip);
          if (!path) { this.active.delete(key); this.recount(trip, undefined); break; }
          const referral = !!trip.transfer;
          trip = { ...trip, path,
            started: trip.started + travel + stay,
            destination: referral ? trip.transferDestination! : trip.home,
            doing: referral ? 'referred' : trip.doing,
            transfer: undefined, transferDestination: undefined,
            arrived: false, returning: !referral };
          this.active.set(key, trip);
          this.recount(before, trip);
        } else {
          break;
        }
      }
    }
    return arrivals;
  }

  /** Every trip under way, there or back, without copying any. */
  each(seen: (trip: ActiveVisit) => void): void {
    for (const trip of this.active.values()) seen(trip);
  }

  cancelAt(cells: ReadonlySet<number>): void {
    this.tally = undefined;
    for (const [key, trip] of this.active) {
      if (cells.has(trip.home) || cells.has(trip.destination) ||
          (trip.transferDestination !== undefined && cells.has(trip.transferDestination)) ||
          trip.path.some(cell => cells.has(cellId(cell)))) this.active.delete(key);
    }
  }

  frames(tick: number) {
    return [...this.active.values()].map(trip => {
      const age = tick - trip.started;
      const travel = travelTicks(trip.path, trip.doing, trip.ride);
      const progress = Math.max(0, Math.min(1, age / travel));
      // Read-only sub-tick projection: even a short errand can appear as in use between core updates.
      return { ...trip, progress, phase: trip.returning || age >= travel + stayTicks(trip.doing) ? '回程' as const :
        trip.arrived || age >= travel ? '使用中' as const : '前往中' as const };
    });
  }

  save(): ActiveVisit[] {
    return [...this.active.values()].map(trip => ({ ...trip, path: trip.path.map(cell => ({ ...cell })),
      transfer: trip.transfer?.map(cell => ({ ...cell })) }));
  }

  load(visits: readonly ActiveVisit[]): void {
    this.tally = undefined;
    this.active.clear();
    this.usage.length = 0;
    for (const trip of visits) this.active.set(visitKey(trip), { ...trip,
      path: trip.path.map(cell => ({ ...cell })), transfer: trip.transfer?.map(cell => ({ ...cell })) });
  }
}
