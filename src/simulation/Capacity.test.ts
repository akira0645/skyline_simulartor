import { expect, it } from 'vitest';
import { seats } from './Capacity';
import { planFacilityVisits, type CivicVisitContext } from './CivicVisits';
import { RoadGraph } from './RoadGraph';
import { TileMap } from './TileMap';
import { VisitSystem } from './VisitSystem';

/** A home of `people` beside a bank and a clinic, at ten in the morning when both are open. */
function street(people: number, extra: Partial<CivicVisitContext> = {}) {
  const map = new TileMap();
  map.execute({ type: 'SET_ZONE', tiles: [{ x: 1, y: 1 }], zone: 'residential' });
  map.execute({ type: 'BUILD_ROAD', path: [{ x: 1, y: 2 }, { x: 2, y: 2 }] });
  map.execute({ type: 'BUILD_SERVICE', x: 2, y: 1, service: 'bank' });
  map.execute({ type: 'BUILD_SERVICE', x: 1, y: 3, service: 'clinic' });
  const turned: { site: number; slot: number; waiting: boolean }[] = [];
  const context: CivicVisitContext = { map, roadGraph: new RoadGraph(map), clock: 4 / 3, seed: 1,
    health: () => undefined, available: () => true,
    buildings: new Map([[129, { id: 129, capacity: 16, occupants: people, level: 1, nextSlot: people,
      people: Array.from({ length: people }, (_, slot) => ({ slot, job: -1, came: 0, hired: 0 })) }]]),
    daycareSeats: new Map(), hasCombo: () => false, kidsAt: () => [], ageOf: () => 30,
    roadAccess: () => ({ x: 1, y: 2 }),
    occupancy: () => 0,
    turnedAway: (site, _home, person, waiting) => turned.push({ site, slot: person.slot, waiting }),
    // Nobody here is due a check-up, so only the bank and illness send people out.
    visited: (_person, doing) => doing === 'clinic' || doing === 'hospital',
    ...extra };
  const bank = 1 * 128 + 2;
  return { visits: planFacilityVisits(context, 10, () => true), turned, bank, context };
}

it('fills a place only as far as it has room, counting those sent in the same hour', () => {
  const { visits, turned, bank } = street(9);
  expect(visits.every(visit => visit.doing === 'bank')).toBe(true);
  expect(visits).toHaveLength(seats.bank!);
  // The rest wanted to come and could not; nobody is told to wait for a bank.
  expect(turned).toHaveLength(9 - seats.bank!);
  expect(turned.every(entry => entry.site === bank && !entry.waiting)).toBe(true);
});

it('counts the people already there or on their way', () => {
  const almost = street(3, { occupancy: () => seats.bank! - 1 });
  expect(almost.visits).toHaveLength(1);
  expect(almost.turned).toHaveLength(2);
  expect(street(3, { occupancy: () => seats.bank! }).visits).toEqual([]);
});

it('takes everyone when nothing says how full a place is', () => {
  expect(street(9, { occupancy: undefined }).visits).toHaveLength(9);
});

it('keeps the sick waiting at home for a full clinic, and sees them once there is room', () => {
  const ill = { state: 'ill' as const, severe: false, since: 0 };
  const sick = (occupancy: number) => street(1, { occupancy: () => occupancy, health: () => ill as never });
  const full = sick(seats.clinic!);
  expect(full.visits).toEqual([]);
  expect(full.turned).toEqual([{ site: 3 * 128 + 1, slot: 0, waiting: true }]);
  const open = sick(seats.clinic! - 1);
  expect(open.visits.map(visit => [visit.doing, visit.reason])).toEqual([['clinic', 'medical']]);
  expect(open.turned).toEqual([]);
});

it('counts people at a place or heading there, but not those on their way home', () => {
  const system = new VisitSystem();
  const path = [{ x: 1, y: 1 }, { x: 1, y: 2 }, { x: 2, y: 2 }, { x: 2, y: 1 }];
  system.start([{ home: 129, slot: 0, doing: 'bank', destination: 130, path },
    { home: 129, slot: 1, doing: 'bank', destination: 130, path }], 0);
  expect(system.occupancy(130)).toBe(2);
  expect(system.occupancy(131)).toBe(0);
  // Long after the errand both are walking home, and the bank is empty again.
  system.advance(0.5, () => true, trip => [...trip.path].reverse(), undefined, 0.5);
  expect(system.occupancy(130)).toBe(0);
  system.cancelResident(129, 0);
  expect(system.occupancy(130)).toBe(0);
});
