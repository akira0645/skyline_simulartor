import { expect, it } from 'vitest';
import { demoCity } from '../app/demoCity';
import { calendar } from './calendar';
import { SimulationEngine } from './SimulationEngine';
import { outingRide, rideFor, travelTicks, type FacilityVisit } from './VisitSystem';

it('takes the scooter or the car on a longer outing, and gets there sooner', () => {
  const far = Array.from({ length: outingRide.from + 2 }, (_, x) => ({ x, y: 0 }));
  expect(rideFor(0, far)).toBeUndefined();
  expect(rideFor(undefined, far)).toBeUndefined();
  expect(rideFor(1, far)).toBe(1);
  expect(rideFor(3, far)).toBe(3);
  // A short way is walked whatever stands in the garage.
  expect(rideFor(3, far.slice(1))).toBeUndefined();
  expect(travelTicks(far, 'shopping', 1)).toBeCloseTo(travelTicks(far) / outingRide.pace[1]);
  expect(travelTicks(far, 'shopping', 2)).toBeLessThan(travelTicks(far, 'shopping', 1));
});

it('puts those out on wheels on the roads of the hour', () => {
  const engine = new SimulationEngine({ version: 1, seed: 42, tick: 0 });
  demoCity(engine, 'medium');
  const { city } = engine;
  const rides: FacilityVisit[] = [];
  let busiest = 0;
  const start = city.visits.start.bind(city.visits);
  city.visits.start = (plans, tick) => {
    start(plans, tick);
    for (const plan of plans) {
      if (!plan.ride || plan.doing === 'delivering') continue;
      rides.push(plan);
      // At an hour when nobody commutes, the road outside their door carries them all the same.
      busiest = Math.max(busiest, city.congestionAt(plan.path[1], 3));
    }
  };
  engine.advance(2 * calendar.ticksPerDay);
  expect(rides.length).toBeGreaterThan(50);
  expect(rides.every(plan => plan.path.length - 2 >= outingRide.from)).toBe(true);
  expect(rides.some(plan => plan.ride === 1)).toBe(true);
  expect(rides.some(plan => plan.ride! >= 2)).toBe(true);
  expect(busiest).toBeGreaterThan(0);
  // The trips survive a save and come back as they were.
  const restored = new SimulationEngine({ version: 1, seed: 42, tick: 0 });
  restored.load(engine.save());
  expect(restored.save().activeVisits).toEqual(engine.save().activeVisits);
});
