import { expect, it } from 'vitest';
import { followingSpeed } from './RoadFollowing';
import { RoadOccupancy, clearRoadAdvance, bodiesOverlap, type RoadBody } from './RoadOccupancy';
import { passengerBodySize } from './VehicleGeometry';

it('matches the visible vehicle categories instead of assigning a large car body to motorcycles', () => {
  expect(passengerBodySize(0).length).toBe(9 / 32);
  expect(passengerBodySize(1).width).toBe(6 / 32);
  expect(passengerBodySize(4).length).toBe(15 / 32);
});

it('measures bumper gaps with both vehicle lengths and ignores the opposing lane', () => {
  const occupancy = new RoadOccupancy();
  const rear = { x: 1, y: 0.69, hx: 1, hy: 0, index: 1, ...passengerBodySize(1) };
  occupancy.add({ ...rear, x: 1.6, index: 2, speed: 0.001 });
  occupancy.add({ ...rear, x: 1.1, y: 0.31, hx: -1, index: 3 });
  expect(occupancy.leader(rear)?.gap).toBeCloseTo(0.6 - rear.length - 1 / 32);
  expect(occupancy.leader(rear)?.speed).toBe(0.001);
});

function queueRun(smooth: boolean) {
  const occupancy = new RoadOccupancy();
  const fleet: RoadBody[] = Array.from({ length: 8 }, (_, index) => ({ index, x: 10 - index * 0.75,
    y: 0.69, hx: 1, hy: 0, ...passengerBodySize(2), speed: index === 0 ? 0.0015 : 0.0022 }));
  let stopped = 0, distance = 0, samples = 0;
  for (let tick = 0; tick < 1500; tick++) {
    occupancy.reset(fleet);
    for (let i = 0; i < fleet.length; i++) {
      const body = fleet[i], before = body.x;
      const speed = i === 0 ? 0.0015 : smooth
        ? followingSpeed(body, body.speed!, 0.0022, 20, occupancy)
        : occupancy.ahead(body.x, body.y, 1, 0, body.index) ? 0 : 0.0022;
      body.x = clearRoadAdvance(before, before + speed * 20, x => ({ ...body, x }), occupancy);
      body.speed = (body.x - before) / 20;
      occupancy.add(body);
      if (tick > 500 && i > 0) { stopped += Number(body.speed < 1e-5); distance += body.x - before; samples++; }
      if (i > 0) expect(bodiesOverlap(body, fleet[i - 1])).toBe(false);
    }
  }
  return { stopped, distance, samples };
}

it('keeps a moving queue rolling with fewer full stops at the same top speed and no overlaps', () => {
  const legacy = queueRun(false), smooth = queueRun(true);
  expect(smooth.stopped).toBeLessThan(legacy.stopped / 4);
  expect(smooth.distance).toBeGreaterThan(legacy.distance * 0.95);
});

it('brakes for a stopped leader and accelerates gradually when it leaves', () => {
  const occupancy = new RoadOccupancy();
  let body: RoadBody = { index: 1, x: 0, y: 0.69, hx: 1, hy: 0, speed: 0.0025, ...passengerBodySize(2) };
  occupancy.add({ ...body, index: 0, x: 2, speed: 0 });
  for (let i = 0; i < 300; i++) {
    const speed = followingSpeed(body, body.speed!, 0.0025, 20, occupancy);
    const x = clearRoadAdvance(body.x, body.x + speed * 20, x => ({ ...body, x }), occupancy);
    body = { ...body, speed: (x - body.x) / 20, x };
  }
  expect(body.x).toBeLessThan(1.6);
  expect(body.speed).toBeLessThan(1e-5);
  occupancy.reset([]);
  const speed = followingSpeed(body, body.speed!, 0.0025, 20, occupancy);
  expect(speed).toBeGreaterThan(0);
  expect(speed).toBeLessThan(0.0025);
});
