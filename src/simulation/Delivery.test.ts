import { expect, it } from 'vitest';
import { demoCity } from '../app/demoCity';
import { calendar } from './calendar';
import { delivery, ridesFor } from './Delivery';
import { eating, eatingOf, fatigueAt, type Eating } from './Needs';
import { SimulationEngine } from './SimulationEngine';
import { stayTicks, travelTicks, type FacilityVisit } from './VisitSystem';

it('gives each resident one way of eating, in about the shares set', () => {
  const count: Record<string, number> = {};
  for (let person = 0; person < 4000; person++) count[eatingOf(9, person)] = (count[eatingOf(9, person)] ?? 0) + 1;
  for (const habit of Object.keys(eating) as Eating[]) {
    expect(count[habit] / 4000).toBeGreaterThan(eating[habit].share - 0.04);
    expect(count[habit] / 4000).toBeLessThan(eating[habit].share + 0.04);
  }
  expect(eatingOf(9, 77)).toBe(eatingOf(9, 77));
});

it('lets only those on a bicycle or a scooter ride for money, and only some of them', () => {
  const riders = Array.from({ length: 2000 }, (_, person) => ridesFor(3, person, 1)).filter(Boolean).length;
  expect(riders / 2000).toBeGreaterThan(delivery.share - 0.05);
  expect(riders / 2000).toBeLessThan(delivery.share + 0.05);
  expect(Array.from({ length: 2000 }, (_, person) => ridesFor(3, person, 2)).some(Boolean)).toBe(false);
});

it('makes a rider quicker than someone on foot, and more tired for each run', () => {
  const path = Array.from({ length: 13 }, (_, x) => ({ x, y: 0 }));
  expect(travelTicks(path, 'delivering')).toBeCloseTo(travelTicks(path) / delivery.speed);
  expect(stayTicks('delivering')).toBeLessThan(stayTicks('bank'));
  expect(fatigueAt(19, undefined, 0, false, 2 * delivery.tiring)).toBe(fatigueAt(19, undefined, 0, false) + 2 * delivery.tiring);
});

it('brings meals in a town: riders set out, customers pay them and eat at home', () => {
  const engine = new SimulationEngine({ version: 1, seed: 42, tick: 0 });
  demoCity(engine, 'small');
  const city = engine.city;
  const runs: FacilityVisit[] = [];
  const start = city.visits.start.bind(city.visits);
  city.visits.start = (plans, tick) => { runs.push(...plans.filter(plan => plan.doing === 'delivering')); start(plans, tick); };
  const total = () => { let sum = 0; for (const building of city.save().buildings) for (const person of building.people ?? []) sum += person.money ?? 0; return sum; };
  // From six in the morning to nine in the evening: lunch and dinner are ordered, and nobody is paid yet.
  const before = total();
  engine.advance(calendar.ticksPerDay - 3);
  const today = city.deliveriesToday();
  expect(today.orders).toBeGreaterThan(0);
  expect(today.riders).toBeGreaterThan(0);
  expect(today.riders).toBeLessThanOrEqual(today.orders);
  expect(runs.length).toBe(today.riders);
  // The fee only changes hands between residents.
  expect(total()).toBe(before);
  for (const run of runs) {
    expect(run.reason).toBe('sidejob');
    expect(run.path.length).toBeLessThanOrEqual(delivery.longest + 1);
    expect(city.map.at(run.destination)).toBe('residential');
  }
});
