import { expect, it } from 'vitest';
import { bodiesOverlap, clearRoadAdvance, RoadOccupancy, type RoadBody } from './RoadOccupancy';

const car = (index: number, x: number, y = 0.69, hx = 1, hy = 0): RoadBody => ({ index, x, y, hx, hy });

it('uses oriented body dimensions and leaves the opposing lane clear', () => {
  const bus = { ...car(1, 1), length: 19 / 32, width: 9 / 32 };
  expect(bodiesOverlap(bus, car(2, 1.5))).toBe(true);
  expect(bodiesOverlap(bus, car(2, 1.7))).toBe(false);
  expect(bodiesOverlap(bus, car(2, 1, 0.31, -1))).toBe(false);
  expect(bodiesOverlap(bus, car(2, 1.2, 0.8, 0, 1))).toBe(true);
});

it('stops before a vehicle even when one frame would move several tiles', () => {
  const occupancy = new RoadOccupancy();
  occupancy.add(car(1, 2));
  const accepted = clearRoadAdvance(0, 5, x => car(2, x), occupancy);
  expect(accepted).toBeGreaterThan(1.45);
  expect(accepted).toBeLessThanOrEqual(1.5);
  expect(bodiesOverlap(car(2, accepted), car(1, 2))).toBe(false);
  expect(clearRoadAdvance(accepted, 5, x => car(2, x), occupancy)).toBeCloseTo(accepted, 4);
});

it('reserves accepted moves immediately and removes stale bucket occupancy', () => {
  const occupancy = new RoadOccupancy();
  occupancy.reset(Array.from({ length: 8 }, (_, i) => car(i + 10, 100 + i * 2, 100)));
  occupancy.add(car(1, 1));
  occupancy.add(car(1, 3));
  expect(occupancy.canOccupy(car(2, 1))).toBe(true);
  expect(occupancy.canOccupy(car(2, 3))).toBe(false);
  expect(occupancy.canOccupy(car(1, 3))).toBe(true);
  occupancy.remove(1);
  expect(occupancy.canOccupy(car(2, 3))).toBe(true);
});

it('checks perpendicular crossings, turns and the entire swept movement', () => {
  const occupancy = new RoadOccupancy();
  occupancy.add(car(1, 2));
  expect(occupancy.canTravel(car(2, 2, -1, 0, 1), car(2, 2, 2, 0, 1))).toBe(false);
  occupancy.reset([car(1, 0.4, 0.4)]);
  const long = { ...car(2, 0, 0), length: 1, width: 0.2 };
  expect(occupancy.canOccupy(long)).toBe(true);
  expect(occupancy.canOccupy({ ...long, hx: 0, hy: 1 })).toBe(true);
  expect(occupancy.canTravel(long, { ...long, hx: 0, hy: 1 })).toBe(false);
});

it('allows an existing overlap to separate but never to pass through the other body', () => {
  const occupancy = new RoadOccupancy();
  occupancy.add(car(1, 0));
  expect(occupancy.canTravel(car(2, 0.2), car(2, 0.7))).toBe(true);
  expect(occupancy.canTravel(car(2, -0.2), car(2, 0.7))).toBe(false);
});

it('keeps a mixed-size queue separated for long waits and then releases it', () => {
  const occupancy = new RoadOccupancy();
  const fleet = [car(0, 6), { ...car(1, 4.5), length: 19 / 32 }, car(2, 3), car(3, 1.5)];
  for (let frame = 0; frame < 120; frame++) {
    occupancy.reset(fleet);
    for (let i = 0; i < fleet.length; i++) {
      const body = fleet[i];
      const advance = i === 0 && frame < 80 ? 0 : 0.7;
      body.x = clearRoadAdvance(body.x, body.x + advance, x => ({ ...body, x }), occupancy);
      occupancy.add({ ...body });
    }
    for (let i = 0; i < fleet.length; i++) for (let j = i + 1; j < fleet.length; j++) {
      expect(bodiesOverlap(fleet[i], fleet[j])).toBe(false);
    }
  }
  expect(fleet.at(-1)!.x).toBeGreaterThan(20);
});
