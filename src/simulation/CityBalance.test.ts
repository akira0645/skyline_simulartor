import { expect, it } from 'vitest';
import { demoCity, works, type DemoSize } from '../app/demoCity';
import { SimulationEngine } from './SimulationEngine';
import { calendar } from './calendar';

// Each case constructs two cities, warms them for months, advances another month and verifies a
// save/load replay. The large case takes about 62s here; retain headroom without reducing its work.
it.each<DemoSize>(['small', 'medium', 'large'])('keeps the %s city finite and reproducible across a month and a road interruption', { timeout: 90000 }, size => {
  for (const seed of [7, 42]) {
    const engine = new SimulationEngine({ version: 1, seed, tick: 0 });
    demoCity(engine, size);
    const start = performance.now();
    const opening = engine.city.getStats();
    engine.advance(30 * calendar.ticksPerDay);
    const stats = engine.city.getStats();
    expect(Number.isFinite(stats.funds)).toBe(true);
    expect(Number.isFinite(stats.budget.net)).toBe(true);
    expect(stats.population).toBeGreaterThan(0);
    expect(stats.employed).toBeLessThanOrEqual(stats.jobs);
    expect(stats.employed).toBeLessThanOrEqual(stats.population - stats.retired);
    const saved = engine.save();
    const people = saved.buildings.flatMap(building => building.people ?? []);
    expect(new Set(people.map(person => person.identity!.id)).size).toBe(people.length);
    expect(people.every(person => Number.isFinite(person.money ?? 0))).toBe(true);
    const loaded = new SimulationEngine({ version: 1, seed: 0, tick: 0 });
    loaded.load(structuredClone(saved));
    engine.advance(calendar.ticksPerDay);
    loaded.advance(calendar.ticksPerDay);
    expect(loaded.save()).toEqual(engine.save());
    // A reversible road outage must reconnect the graph and restore reachable jobs.
    engine.load({ ...engine.save(), funds: 100000 });
    engine.city.execute({ type: 'DEMOLISH', ...works });
    expect(engine.city.map.get(works)).toBe('grass');
    expect(engine.city.execute({ type: 'BUILD_ROAD', path: [works], road: 'avenue' }).error).toBeUndefined();
    expect(engine.city.roadGraph.componentAt(works)).toBeGreaterThanOrEqual(0);
    expect(engine.city.getStats().employed).toBeGreaterThan(0);
    console.info(`${size}, seed=${seed}: ${Math.round(performance.now() - start)}ms; adults ${opening.population}->${stats.population}; funds ${Math.round(opening.funds)}->${Math.round(stats.funds)}`);
  }
});
