import { expect, it } from 'vitest';
import { PreviewTraffic } from './PreviewTraffic';
import { bodiesOverlap } from '../simulation/RoadOccupancy';

it('keeps the faster car behind the slower truck through repeated offscreen wraps', () => {
  const traffic = new PreviewTraffic();
  for (let frame = 0; frame < 1200; frame++) {
    traffic.advance(100);
    for (const a of traffic.vehicles) for (const b of traffic.vehicles) {
      if (a.index !== b.index) expect(bodiesOverlap(a, b)).toBe(false);
    }
  }
});

it('gives the same preview traffic at low frame rate and freezes when paused', () => {
  const regular = new PreviewTraffic(), slow = new PreviewTraffic();
  for (let i = 0; i < 600; i++) regular.advance(50);
  slow.advance(30000);
  expect(slow.vehicles).toEqual(regular.vehicles);
  const before = structuredClone(slow.vehicles);
  slow.advance(0);
  expect(slow.vehicles).toEqual(before);
});
