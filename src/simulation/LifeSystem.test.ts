import { expect, it } from 'vitest';
import { EMPTY_LIFE, LifeSystem, type LifeResident } from './LifeSystem';
import { YEAR_TICKS } from './ResidentIdentity';
import { calendar } from './calendar';
import { parseLife } from './SavedLife';

const DAY = calendar.ticksPerDay;
const resident = (id: number, age = 30, home = 1): LifeResident =>
  ({ identity: { id, name: `林${id}`, born: -age * YEAR_TICKS }, home, age });
const options = () => {
  let id = 100;
  return { allocateId: () => id++, freeRoom: () => 3, friends: () => false, polluted: () => false };
};

it('preserves a child through a save and promotes the same identity exactly once', () => {
  const life = new LifeSystem();
  const child = { identity: { id: 2, name: '林安', born: -18 * YEAR_TICKS + DAY, gender: 'female' as const }, home: 1, guardians: [1] };
  life.establish(1, [child]);
  const restored = new LifeSystem();
  restored.load(parseLife(life.save(), 0)!);
  expect(restored.advance(0, 1, [resident(1)], options()).adults).toEqual([]);
  expect(restored.advance(DAY, 1, [resident(1)], options()).adults).toEqual([child]);
  expect(restored.advance(2 * DAY, 1, [resident(1)], options()).adults).toEqual([]);
  expect(restored.events.filter(event => event.kind === 'adult')).toHaveLength(1);
});

it('requires a hospital for severe illness and preserves recovery across saves', () => {
  const life = new LifeSystem();
  const patient = resident(1);
  life.fallIll(patient, 0, true);
  life.treat(1, DAY, false);
  expect(life.health(1)?.state).toBe('ill');
  life.advance(31 * DAY, 1, [patient], options());
  expect(life.health(1)?.state).toBe('ill');
  life.treat(1, 31 * DAY, true);
  const restored = new LifeSystem();
  restored.load(parseLife(life.save(), 31 * DAY)!);
  expect(restored.health(1)?.state).toBe('recovering');
  restored.advance(36 * DAY, 1, [patient], options());
  expect(restored.health(1)).toBeUndefined();
  expect(restored.events.filter(event => event.kind === 'recovered')).toHaveLength(1);
});

it('reserves foster places and keeps children in outside care when housing is full', () => {
  const life = new LifeSystem();
  life.establish(1, [2, 3].map(id => ({ identity: { id, name: `林${id}`, born: 0 }, home: 1, guardians: [1] })));
  const opts = { ...options(), freeRoom: () => 1 };
  expect(life.advance(DAY, 1, [resident(1, 110), resident(4, 30, 4)], opts).deaths).toEqual([1]);
  expect(life.children.map(child => child.home)).toEqual([4, -1]);
  expect(life.children[0].guardians).toEqual([4]);
  life.advance(2 * DAY, 1, [resident(4, 30, 4)], { ...opts, freeRoom: () => 0 });
  expect(life.events.filter(event => event.kind === 'care')).toHaveLength(2);
});

it('delivers a planned birth once, retaining parents and identity after loading', () => {
  const life = new LifeSystem();
  life.load({ ...EMPTY_LIFE(), births: [{ home: 1, parents: [1, 2], due: DAY }] });
  const parents = [resident(1), resident(2)];
  life.advance(DAY, 4, parents, options());
  expect(life.children).toHaveLength(1);
  expect(life.children[0]).toMatchObject({ guardians: [1, 2], identity: { id: 100, born: DAY } });
  expect(['male', 'female']).toContain(life.children[0].identity.gender);
  const restored = new LifeSystem();
  restored.load(parseLife(life.save(), DAY)!);
  restored.advance(2 * DAY, 4, parents, options());
  expect(restored.children).toEqual(life.children);
  expect(restored.save().births).toEqual([]);
});

it('does not schedule births merely because adults share a home, and emits retirement once', () => {
  const life = new LifeSystem();
  for (let month = 0; month < 120; month++) {
    life.advance(month * 30 * DAY, 13, [resident(1), resident(2), resident(3, 65)], options());
  }
  expect(life.save().births).toEqual([]);
  expect(life.children).toEqual([]);
  expect(life.events.filter(event => event.kind === 'retired')).toHaveLength(1);
});

it('runs a reproducible century with bounded events and no surviving over-age residents', () => {
  const run = (reload: boolean) => {
    const life = new LifeSystem();
    let people = Array.from({ length: 20 }, (_, id) => resident(id));
    for (let day = 0; day < 36000; day++) {
      const tick = day * DAY;
      people = people.map(person => ({ ...person, age: Math.floor((tick - person.identity.born) / YEAR_TICKS) }));
      const { deaths } = life.advance(tick, 24, people, options());
      people = people.filter(person => !deaths.includes(person.identity.id));
      if (reload && day % 360 === 0) life.load(parseLife(life.save(), tick)!);
    }
    return { people, save: life.save() };
  };
  const uninterrupted = run(false);
  expect(run(true)).toEqual(uninterrupted);
  expect(uninterrupted.people).toEqual([]);
  expect(uninterrupted.save.events.length).toBeLessThanOrEqual(100);
});
