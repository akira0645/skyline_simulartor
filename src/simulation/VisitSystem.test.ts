import { expect, it } from 'vitest';
import { VisitSystem, stayTicks, travelTicks, type FacilityVisit } from './VisitSystem';

const visit: FacilityVisit = { home: 0, slot: 0, doing: 'park', destination: 3,
  path: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }] };
const home = () => [...visit.path].reverse();
const arrival = travelTicks(visit.path);
const departure = arrival + stayTicks(visit.doing);
it('counts arrival once, independently of frame queries and across saves', () => {
  const system = new VisitSystem();
  system.start([visit], 0);
  expect(system.advance(arrival / 2, () => true, home)).toEqual([]);
  for (let frame = 0; frame < 100; frame++) system.frames(frame / 100);
  expect(system.advance(arrival, () => true, home)).toHaveLength(1);
  const loaded = new VisitSystem();
  loaded.load(system.save());
  expect(loaded.advance(arrival + stayTicks(visit.doing) / 2, () => true, home)).toEqual([]);
  loaded.advance(departure, () => true, home);
  expect(loaded.frames(departure)[0].returning).toBe(true);
  loaded.advance(20, () => true, home);
  expect(loaded.frames(20)).toEqual([]);
});
it('lets two members of a household travel and cancels trips through demolished cells', () => {
  const system = new VisitSystem();
  system.start([visit, { ...visit, slot: 1 }], 0);
  expect(system.frames(0)).toHaveLength(2);
  expect(system.advance(travelTicks(visit.path), () => true, home)).toHaveLength(2);
  system.cancelAt(new Set([2]));
  expect(system.frames(5)).toEqual([]);
});
