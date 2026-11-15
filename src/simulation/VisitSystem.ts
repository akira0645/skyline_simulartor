import type { Doing } from './Mind';
import { cellId } from './FacilityAccess';
import type { Cell } from './TileMap';

/** One tick is three game hours. Nearby errands fit into a day, including the return walk. */
export const VISIT_WALK_TICKS = 0.08;
export const VISIT_STAY_TICKS = 1;
export const stayTicks = (doing: Doing): number =>
  ['school', 'highschool', 'daycare', 'bank', 'clinic'].includes(doing) ? 0.2 :
  ['shopping', 'reading', 'park', 'remembering'].includes(doing) ? 0.5 :
  doing === 'exhibition' ? 0.75 : VISIT_STAY_TICKS;
export interface FacilityVisit {
  home: number;
  slot: number;
  doing: Doing;
  destination: number;
  path: Cell[];
  transfer?: Cell[];
  transferDestination?: number;
}
export interface ActiveVisit extends FacilityVisit {
  started: number;
  arrived: boolean;
  returning: boolean;
}
export const visitKey = (visit: Pick<FacilityVisit, 'home' | 'slot'>) => `${visit.home}:${visit.slot}`;
export const travelTicks = (path: readonly Cell[]) => Math.max(1, path.length - 1) * VISIT_WALK_TICKS;

/** Pure simulation state: arriving once is the only event that increments monthly visits. */
export class VisitSystem {
  private readonly active = new Map<string, ActiveVisit>();
  /** Actual use intervals from the latest core step, including visits that already finished. */
  readonly usage: { visit: ActiveVisit; from: number; until: number }[] = [];

  has(home: number, slot: number): boolean { return this.active.has(visitKey({ home, slot })); }

  cancelResident(home: number, slot: number): void { this.active.delete(visitKey({ home, slot })); }

  start(visits: readonly FacilityVisit[], tick: number): void {
    for (const visit of visits) {
      const key = visitKey(visit);
      if (!this.active.has(key)) this.active.set(key, { ...visit, started: tick, arrived: false, returning: false });
    }
  }

  advance(tick: number, valid: (visit: ActiveVisit) => boolean,
    routeHome: (visit: ActiveVisit) => Cell[] | undefined): ActiveVisit[] {
    const arrivals: ActiveVisit[] = [];
    this.usage.length = 0;
    for (const [key, initial] of this.active) {
      let trip = initial;
      // A visit can cross arrival, a referral, and the return leg between two core ticks.
      for (let stage = 0; stage < 3; stage++) {
        if (!valid(trip)) { this.active.delete(key); break; }
        const travel = travelTicks(trip.path);
        const stay = stayTicks(trip.doing);
        const age = tick - trip.started;
        if (!trip.returning) {
          const from = Math.max(tick - 1, trip.started + travel);
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
          const path = trip.transfer ?? routeHome(trip);
          if (!path) { this.active.delete(key); break; }
          const referral = !!trip.transfer;
          trip = { ...trip, path,
            started: trip.started + travel + stay,
            destination: referral ? trip.transferDestination! : trip.home,
            doing: referral ? 'referred' : trip.doing,
            transfer: undefined, transferDestination: undefined,
            arrived: false, returning: !referral };
          this.active.set(key, trip);
        } else {
          break;
        }
      }
    }
    return arrivals;
  }

  cancelAt(cells: ReadonlySet<number>): void {
    for (const [key, trip] of this.active) {
      if (cells.has(trip.home) || cells.has(trip.destination) ||
          (trip.transferDestination !== undefined && cells.has(trip.transferDestination)) ||
          trip.path.some(cell => cells.has(cellId(cell)))) this.active.delete(key);
    }
  }

  frames(tick: number) {
    return [...this.active.values()].map(trip => {
      const age = tick - trip.started;
      const travel = travelTicks(trip.path);
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
    this.active.clear();
    this.usage.length = 0;
    for (const trip of visits) this.active.set(visitKey(trip), { ...trip,
      path: trip.path.map(cell => ({ ...cell })), transfer: trip.transfer?.map(cell => ({ ...cell })) });
  }
}
