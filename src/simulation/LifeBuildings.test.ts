import { expect, it } from 'vitest';
import { SimulationEngine } from './SimulationEngine';
import { footprint, TILES, type Service } from './TileMap';
import { YEAR_TICKS } from './ResidentIdentity';
import { cellId, routeToSite } from './FacilityAccess';
import { travelTicks } from './VisitSystem';

function town(service: Service = 'community') {
  const engine = new SimulationEngine({ version: 1, seed: 1, tick: 0 });
  const { city } = engine;
  engine.load({ ...engine.save(), funds: 100000, rank: 5 });
  city.execute({ type: 'BUILD_ROAD', path: [{ x: 6, y: 4 }, { x: 6, y: 5 }] });
  city.execute({ type: 'SET_ZONE', tiles: [{ x: 7, y: 4 }], zone: 'residential' });
  expect(city.execute({ type: 'BUILD_SERVICE', x: 4, y: 4, service }).error).toBeUndefined();
  engine.load({ ...engine.save(), buildings: [{ id: 519, capacity: 4, occupants: 2, nextSlot: 2,
    people: [0, 1].map(slot => ({ slot, job: -1, came: 0, hired: 0,
      identity: { id: slot, name: `居民${slot}`, born: -30 * YEAR_TICKS } })) }] });
  return engine;
}

it('shares arrivals and visitors across every cell, including after reloading, and cancels on demolition', () => {
  const engine = town();
  const { city } = engine;
  const site = { x: 4, y: 4 };
  const route = routeToSite(city.map, city.roadGraph, { x: 6, y: 4 }, site)!;
  expect(route.path.at(-1)).toEqual({ x: 5, y: 4 });
  const path = [{ x: 7, y: 4 }, ...route.path];
  city.visits.start([0, 1].map(slot => ({ home: 519, slot, doing: 'socializing', destination: cellId(site), path })), 0);
  for (const part of footprint(site)) {
    expect(city.visitorsAt(part)).toHaveLength(2);
    expect(city.visitCountAt(part)).toBe(0);
  }
  engine.advance(Math.ceil(travelTicks(path)));
  for (const part of footprint(site)) expect(city.visitCountAt(part)).toBe(2);
  const saved = structuredClone(engine.save());
  const restored = town();
  restored.load(saved);
  expect(restored.save()).toEqual(saved);
  for (const part of footprint(site)) expect(restored.city.visitCountAt(part)).toBe(2);
  expect(city.execute({ type: 'DEMOLISH', x: 5, y: 5 }).error).toBeUndefined();
  expect(city.visits.frames(engine.getSnapshot().tick)).toEqual([]);
});

it('migrates annex counts into one building and aggregates a connected park', () => {
  const engine = town();
  const parts = footprint({ x: 4, y: 4 });
  engine.load({ ...engine.save(), monthlyVisits: parts.map((part, i) => [cellId(part), i + 1]) });
  for (const part of parts) expect(engine.city.visitCountAt(part)).toBe(10);
  engine.city.execute({ type: 'BUILD_PARK', tiles: [{ x: 8, y: 8 }, { x: 9, y: 8 }] });
  engine.load({ ...engine.save(), monthlyVisits: [[1032, 3], [1033, 4]] });
  expect(engine.city.visitCountAt({ x: 8, y: 8 })).toBe(7);
  expect(engine.city.visitCountAt({ x: 9, y: 8 })).toBe(7);
});

it('appends new tile identifiers and gives the new services usable footprints and clinic coverage', () => {
  expect(TILES.slice(44)).toEqual(['community', 'familyclinic', 'eldercare', 'memorial', 'bakery', 'florist', 'cakeshop']);
  for (const service of ['community', 'eldercare', 'memorial'] as const) {
    const engine = town(service);
    expect(engine.city.map.anchorOf({ x: 5, y: 5 })).toEqual({ x: 4, y: 4 });
    expect(engine.city.isCovered({ x: 7, y: 4 }, service)).toBe(true);
  }
  const engine = town('familyclinic');
  engine.city.execute({ type: 'BUILD_ROAD', path: [{ x: 5, y: 4 }] });
  expect(engine.city.isCovered({ x: 7, y: 4 }, 'clinic')).toBe(true);
});

it('retires residents without job-hunting complaints and saves their health', () => {
  const engine = town('familyclinic');
  const saved = engine.save();
  for (const person of saved.buildings[0].people!) person.identity!.born = -65 * YEAR_TICKS;
  engine.load(saved);
  const person = engine.city.person(519, 0, 12)!;
  expect(person.thoughts).not.toContain('need-job');
  expect(person.doing).not.toBe('job-hunting');
  expect(engine.city.getStats().retired).toBe(2);
  engine.city.life.fallIll({ identity: saved.buildings[0].people![0].identity!, home: 519, age: 65 }, 0);
  engine.load(engine.save());
  expect(engine.city.person(519, 0, 12)?.health?.state).toBe('ill');
  engine.city.execute({ type: 'BUILD_ROAD', path: [{ x: 5, y: 4 }] });
  // Medical trips remain eligible overnight and on a day when leisure would be skipped.
  expect(engine.city.facilityVisits(0, () => true)).toContainEqual(expect.objectContaining({ home: 519, slot: 0, doing: 'clinic' }));
});

it('shows complex totals without replacing the identities in each home', () => {
  const engine = new SimulationEngine({ version: 1, seed: 3, tick: 0 });
  const parts = footprint({ x: 1, y: 1 });
  engine.city.execute({ type: 'SET_ZONE', tiles: parts, zone: 'residential' });
  engine.load({ ...engine.save(), buildings: parts.map(part => ({ id: cellId(part), capacity: 20,
    occupants: 2, level: 4, block: 129 })) });
  for (const part of parts) {
    // Unpowered housing has half its nominal capacity, consistently across all four homes.
    expect(engine.city.siteSummary(part)).toMatchObject({ tiles: 4, occupants: 8, capacity: 40 });
    expect(engine.city.inspect(part)?.residents).toHaveLength(2);
  }
});
