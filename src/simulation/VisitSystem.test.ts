import { expect, it } from 'vitest';
import { VisitSystem, stayTicks, travelTicks, type FacilityVisit } from './VisitSystem';
import { parseVisits } from './SavedVisits';

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

it('waits for the physical driver before recording arrival, use or the return trip', () => {
  const system = new VisitSystem();
  system.start([{ ...visit, ride: 2 }], 0);
  system.reportJourney(0, 0, 0, false, 0.4, 2);
  expect(system.advance(3, () => true, home)).toEqual([]);
  expect(system.usage).toEqual([]);
  expect(system.frames(3)[0]).toMatchObject({ phase: '前往中', progress: 0.4, arrived: false });
  system.reportJourney(0, 0, 0, false, 1, 3);
  expect(system.advance(3, () => true, home, undefined, 0.01)).toHaveLength(1);
  expect(system.usage).toEqual([]);
  expect(system.advance(3.1, () => true, home, undefined, 0.1)).toEqual([]);
  expect(system.usage[0].until - system.usage[0].from).toBeCloseTo(0.1);
  system.advance(3.5, () => true, home);
  expect(system.frames(3.5)[0].returning).toBe(true);
  system.reportJourney(0, 0, 0, false, 0, 4); // stale outward driver
  system.advance(4, () => true, home);
  expect(system.frames(4)).toEqual([]);
});

it('persists waiting time and drops transient driver handles on load or cancellation', () => {
  const system = new VisitSystem();
  system.start([visit], 0);
  system.reportJourney(0, 0, 0, false, 0.5, 2);
  const save = parseVisits(system.save(), 2);
  expect(save[0].delay).toBeCloseTo(2 - arrival / 2);
  system.load(save);
  expect(system.advance(2 + arrival / 2, () => true, home)).toHaveLength(1);
  system.cancelAt(new Set([3]));
  system.start([visit], 0);
  expect(system.advance(arrival, () => true, home)).toHaveLength(1);
  expect(() => parseVisits([{ ...save[0], delay: -1 }], 2)).toThrow('存檔資料損壞');
  expect(() => parseVisits([{ ...save[0], delay: 3 }], 2)).toThrow('存檔資料損壞');
});
