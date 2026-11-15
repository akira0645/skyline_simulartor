import { expect, it } from 'vitest';
import { SimulationEngine } from './SimulationEngine';
import { YEAR_TICKS } from './ResidentIdentity';
import { EMPTY_LIFE } from './LifeSystem';
import { ActivityDiary, parseDiary } from './ActivityDiary';
import { isVisitDoing } from './SavedVisits';

function home() {
  const engine = new SimulationEngine({ version: 1, seed: 1, tick: 0 });
  const { city } = engine;
  city.execute({ type: 'BUILD_ROAD', path: [{ x: 1, y: 2 }, { x: 2, y: 2 }] });
  city.execute({ type: 'SET_ZONE', tiles: [{ x: 1, y: 1 }], zone: 'residential' });
  city.found([{ x: 1, y: 1 }]);
  return engine;
}

it('actually schedules the 07:00 school window and preserves the diary through a reload', () => {
  const engine = home();
  engine.city.execute({ type: 'BUILD_SERVICE', x: 2, y: 1, service: 'school' });
  const saved = engine.save();
  const parent = saved.buildings[0].people![0].identity!.id;
  engine.load({ ...saved, life: { ...EMPTY_LIFE(), families: [129], children: [
    { identity: { id: 1000, name: '小安', born: -8 * YEAR_TICKS }, home: 129, guardians: [parent] },
  ] } });
  engine.advance(1); // 06:00 -> 09:00, with the 07:00 opportunity inside the tick.
  const trip = engine.city.diary.today(parent, 1).find(entry => entry.doing === 'school');
  expect(trip?.started).toBeCloseTo(1 / 3);
  expect(trip?.reason).toBe('school');
  expect(trip?.arrived).toBeGreaterThan(trip!.started);
  expect(engine.city.visitCountAt({ x: 2, y: 1 })).toBeGreaterThan(0);
  const restored = home();
  restored.load(structuredClone(engine.save()));
  expect(restored.save()).toEqual(engine.save());
  engine.advance(1); restored.advance(1);
  expect(restored.save()).toEqual(engine.save());
  expect(engine.city.diary.today(parent, 2).filter(entry => entry.doing === 'school')).toHaveLength(1);
});

it('walks straight from shopping to another venue, keeping the real origin, identity and activity reasons', () => {
  const engine = home();
  const { city } = engine;
  engine.load({ ...engine.save(), rank: 1 });
  expect(city.execute({ type: 'BUILD_SERVICE', x: 2, y: 1, service: 'market' }).error).toBeUndefined();
  city.execute({ type: 'BUILD_SERVICE', x: 1, y: 3, service: 'community' });
  engine.load({ ...engine.save(), tick: 2 }); // Noon.
  const person = engine.save().buildings[0].people![0];
  city.visits.start([{ home: 129, slot: person.slot, doing: 'shopping', destination: 130, reason: 'supplies',
    path: [{ x: 1, y: 1 }, { x: 1, y: 2 }, { x: 2, y: 2 }, { x: 2, y: 1 }] }], 2 + 1 / 3);
  engine.advance(2);
  const next = city.visits.save().find(trip => trip.home === 129 && trip.slot === person.slot);
  expect(next).toMatchObject({ doing: 'socializing', legs: 2, returning: false, destination: 385 });
  expect(next?.path[0]).toEqual({ x: 2, y: 1 }); // The market, not a teleport home.
  const diary = city.diary.today(person.identity!.id, 4);
  expect(diary.map(entry => entry.doing)).toEqual(['shopping', 'socializing']);
  expect(diary.every(entry => entry.arrived !== undefined)).toBe(true);
  const saved = structuredClone(engine.save());
  engine.load(saved);
  expect(engine.save()).toEqual(saved);
});

it('bounds daily activity history and rejects malformed diary data before loading', () => {
  const diary = new ActivityDiary();
  for (let i = 0; i < 12; i++) diary.depart(1, { home: 129, slot: 0, destination: 130 + i,
    doing: 'shopping', path: [], reason: 'supplies' }, i / 10);
  expect(diary.today(1, 2)).toHaveLength(8);
  expect(parseDiary(diary.save(), 2, isVisitDoing)).toEqual(diary.save());
  expect(() => parseDiary([{ ...diary.save()[0], reason: 'invented' }], 2, isVisitDoing)).toThrow();
  diary.retain(8, new Set([1]));
  expect(diary.save()).toEqual([]);
});

it('does not replace today’s diary when yesterday’s trip arrives after midnight', () => {
  const diary = new ActivityDiary();
  const visit = { home: 129, slot: 0, destination: 130, doing: 'shopping' as const, path: [], reason: 'supplies' as const };
  diary.depart(1, visit, 6);
  diary.arrive(1, { ...visit, started: 5.9, arrived: true, returning: false }, 6.1);
  expect(diary.today(1, 6.1).map(entry => entry.started)).toEqual([6]);
});
