import { expect, it } from 'vitest';
import { planFacilityVisits, type CivicVisitContext } from './CivicVisits';
import { TileMap } from './TileMap';
import { RoadGraph } from './RoadGraph';
import { VisitSystem, travelTicks, stayTicks } from './VisitSystem';
import { SimulationEngine } from './SimulationEngine';
import { hourAt } from './calendar';

function neighbourhood() {
  const map = new TileMap();
  map.execute({ type: 'SET_ZONE', tiles: [{ x: 1, y: 1 }], zone: 'residential' });
  map.execute({ type: 'BUILD_ROAD', path: [{ x: 1, y: 2 }, { x: 2, y: 2 }] });
  map.execute({ type: 'BUILD_SERVICE', x: 2, y: 1, service: 'bank' });
  map.execute({ type: 'BUILD_SERVICE', x: 1, y: 3, service: 'library' });
  const system = new VisitSystem();
  const context: CivicVisitContext = { map, roadGraph: new RoadGraph(map), clock: 0, seed: 1,
    health: () => undefined, available: (home, slot) => !system.has(home, slot),
    buildings: new Map([[129, { id: 129, capacity: 4, occupants: 1, level: 1, nextSlot: 1,
      people: [{ slot: 0, job: -1, came: 0, hired: 0 }] }]]),
    daycareSeats: new Map(), hasCombo: () => false, kidsAt: () => [], ageOf: () => 30,
    roadAccess: () => ({ x: 1, y: 2 }) };
  return { context, system };
}

it('lets the same resident complete banking and reading in a single day, with a return between trips', () => {
  const { context, system } = neighbourhood();
  const arrived: string[] = [];
  for (let tick = 1; tick < 6; tick++) {
    context.clock = tick;
    arrived.push(...system.advance(tick, () => true, trip => [...trip.path].reverse()).map(trip => trip.doing));
    const plans = planFacilityVisits(context, hourAt(tick), () => true);
    system.start(plans, tick);
    expect(system.save().length).toBeLessThanOrEqual(1);
  }
  expect(arrived).toEqual(['bank', 'reading']);
  expect(system.save()).toEqual([]);
});

it('keeps leisure out of work, commute, closing and late-night periods', () => {
  const { context } = neighbourhood();
  expect(planFacilityVisits(context, 12, () => true)).toEqual([]); // Cannot finish banking by 13:00.
  expect(planFacilityVisits(context, 23, () => true)).toEqual([]);
  context.map.execute({ type: 'SET_ZONE', tiles: [{ x: 3, y: 0 }], zone: 'industrial' });
  context.buildings.get(129)!.people![0].job = 3; // 16:00–24:00, commute begins at 14:00.
  expect(planFacilityVisits(context, 15, () => true)).toEqual([]);
  expect(planFacilityVisits(context, 9, () => true)[0]?.doing).toBe('bank');
});

it('finishes sub-tick referrals and returns identically after a save without duplicate arrivals', () => {
  const { system } = neighbourhood();
  const path = [{ x: 1, y: 1 }, { x: 1, y: 2 }, { x: 2, y: 2 }, { x: 2, y: 1 }];
  system.start([{ home: 129, slot: 0, destination: 130, doing: 'clinic', path,
    transfer: [...path].reverse(), transferDestination: 129 }], 0);
  const first = system.advance(travelTicks(path), () => true, trip => [...trip.path].reverse());
  expect(first.map(trip => trip.destination)).toEqual([130]);
  const restored = new VisitSystem();
  restored.load(system.save());
  const later = restored.advance(4, () => true, trip => [...trip.path].reverse());
  expect(later.map(trip => trip.destination)).toEqual([129]);
  expect(restored.save()).toEqual([]);
  expect(restored.advance(5, () => true, () => path)).toEqual([]);
  expect(system.advance(4, () => true, trip => [...trip.path].reverse())).toEqual(later);
});

it('separates current use from approaching visitors and excludes the return leg', () => {
  const engine = new SimulationEngine({ version: 1, seed: 1, tick: 0 });
  const { city } = engine;
  city.map.execute({ type: 'BUILD_SERVICE', service: 'community', x: 4, y: 4 });
  const path = [{ x: 7, y: 4 }, { x: 6, y: 4 }, { x: 5, y: 4 }];
  city.visits.start([{ home: 519, slot: 0, doing: 'socializing', destination: 516, path }], 0);
  expect(city.visitorGroupsAt({ x: 5, y: 5 }).heading).toHaveLength(1);
  expect(city.visitorGroupsAt({ x: 4, y: 4 }).using).toEqual([]);
  expect(city.visitorGroupsAt({ x: 4, y: 4 }, 0.2).using).toHaveLength(1);
  expect(city.visits.save()[0].arrived).toBe(false); // Rendering does not mutate arrival accounting.
  city.visits.advance(travelTicks(path), () => true, () => [...path].reverse());
  expect(city.visitorGroupsAt({ x: 5, y: 5 }).using).toHaveLength(1);
  expect(city.visitorGroupsAt({ x: 4, y: 4 }).heading).toEqual([]);
  city.visits.advance(travelTicks(path) + stayTicks('socializing'), () => true, () => [...path].reverse());
  expect(city.visitorGroupsAt({ x: 4, y: 4 })).toEqual({ using: [], heading: [] });
  expect(city.visits.save()[0].returning).toBe(true);
});

it('keeps short shared activities social, without treating non-overlapping visits as meetings', () => {
  const run = (secondDeparture: number) => {
    const engine = new SimulationEngine({ version: 1, seed: 1, tick: 0 });
    const { city } = engine;
    city.execute({ type: 'BUILD_ROAD', path: [{ x: 1, y: 2 }, { x: 2, y: 2 }] });
    city.execute({ type: 'SET_ZONE', tiles: [{ x: 1, y: 1 }], zone: 'residential' });
    city.execute({ type: 'BUILD_SERVICE', x: 2, y: 1, service: 'bank' });
    city.found([{ x: 1, y: 1 }]);
    const path = [{ x: 1, y: 1 }, { x: 1, y: 2 }, { x: 2, y: 2 }, { x: 2, y: 1 }];
    for (const slot of [0, 1]) city.visits.start([{ home: 129, slot, doing: 'bank', destination: 130, path }], slot ? secondDeparture : 0);
    engine.advance(1);
    return city.person(129, 0, 9)!.contacts;
  };
  expect(run(0)).toHaveLength(1);
  expect(run(0.6)).toEqual([]);
});
