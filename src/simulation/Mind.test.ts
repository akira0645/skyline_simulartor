import { expect, it } from 'vitest';
import { calendar } from './calendar';
import { doingAt, mind, moodOf, thoughtsOf, type Facts } from './Mind';
import { SimulationEngine } from './SimulationEngine';
import { MAP_SIZE, type Cell } from './TileMap';

const id = ({ x, y }: Cell) => y * MAP_SIZE + x;
const row = (y: number, from: number, to: number): Cell[] =>
  Array.from({ length: to - from + 1 }, (_, index) => ({ x: from + index, y }));

const plain: Facts = { slot: 0, days: 100, jam: false, raise: false, forest: false, late: false, gas: true, fuelDear: false, troubles: [], park: false, water: false, shops: false,
  transit: false, shortOfShops: false, value: 50, business: 'normal', tax: 0, temple: false, places: 3, bond: 40,
  town: false, car: 2, fun: false, casino: false, school: false, kids: 0 };
/** Someone with an office job (09:00 to 17:00) a short drive away. */
const clerk: Facts = { ...plain, shift: 3, minutes: 8, way: 'drive' };

it('gives someone with a job a day built around the shift, and someone without one a day of looking', () => {
  const at = (hour: number, facts = clerk) => doingAt(facts, hour, 0);
  expect([3, 6.7, 7.5, 10, 13, 16, 17.5, 20, 23].map(hour => at(hour))).toEqual(
    ['sleeping', 'getting-ready', 'to-work', 'working', 'break', 'working', 'to-home', 'home', 'sleeping']);
  expect([3, 7.5, 10, 12.5, 15, 19, 23].map(hour => at(hour, plain))).toEqual(
    ['sleeping', 'getting-ready', 'job-hunting', 'break', 'job-hunting', 'home', 'sleeping']);
  // A free evening follows who they are and what is near, and is not the same every day.
  const gardener: Facts = { ...clerk, trait: 'gardener', park: true };
  const evenings = new Set([0, 1, 2, 3].map(day => doingAt(gardener, 20, day)));
  expect(evenings.has('gardening')).toBe(true);
  expect(evenings.has('park')).toBe(true);
  expect(evenings.has('shopping')).toBe(false);
});

it('reads thoughts and mood off the facts of a life, worries first', () => {
  expect(thoughtsOf(plain)[0]).toBe('need-job');
  expect(moodOf(thoughtsOf(plain))).toBeLessThan(mind.low);
  const happy = thoughtsOf({ ...clerk, content: true, park: true });
  expect(happy).toEqual(['love-job', 'park-near', 'near-commute']);
  expect(moodOf(happy)).toBeGreaterThanOrEqual(mind.glad);
  const troubled = thoughtsOf({ ...clerk, minutes: 55, jam: true, troubles: ['pollution', 'no-clinic'], tax: 3 });
  expect(troubled.slice(0, 2)).toEqual(['air-bad', 'far-commute']);
  expect(troubled).toEqual(expect.arrayContaining(['jam', 'no-clinic', 'tax-high']));
  expect(moodOf(troubled)).toBeLessThan(moodOf(thoughtsOf(clerk)));
  expect(thoughtsOf({ ...clerk, minutes: 20, days: 100 })).toEqual(['all-good']);
});

it('lets the player look into one resident, and hear the whole city', () => {
  const engine = new SimulationEngine({ version: 1, seed: 5, tick: 0 });
  const { city } = engine;
  const homes = row(4, 1, 10);
  const shops = row(6, 1, 10);
  city.execute({ type: 'BUILD_ROAD', path: row(5, 1, 10) });
  city.execute({ type: 'SET_ZONE', tiles: homes, zone: 'residential' });
  city.execute({ type: 'SET_ZONE', tiles: shops, zone: 'commercial' });
  // The last home has one more person than there are jobs.
  engine.load({ ...engine.save(), buildings: [
    ...homes.map((home, index) => ({ id: id(home), capacity: 8, occupants: index === 9 ? 3 : 2 })),
    ...shops.map(shop => ({ id: id(shop), capacity: 4, occupants: 0 })),
  ] });
  engine.advance(calendar.ticksPerDay);

  const listed = city.inspect(homes[0])!.residents![0];
  const person = city.person(listed.homeId, listed.slot, 10)!;
  expect(person).toMatchObject({ name: listed.name, way: 'walk' });
  expect(person.jobId).toBeGreaterThanOrEqual(0);
  expect(['working', 'break', 'to-work', 'sleeping', 'home', 'shopping', 'to-home', 'getting-ready'])
    .toContain(person.doing);
  expect(person.thoughts).toContain('near-commute');
  expect(city.personOn(listed.homeId, person.jobId)).toBeDefined();

  const voices = city.voices();
  expect(voices.people).toBe(city.getStats().population);
  const count = (thought: string) => voices.thoughts.find(([name]) => name === thought)?.[1] ?? 0;
  expect(count('need-job')).toBe(city.getStats().population - city.getStats().employed);
  expect(count('near-commute')).toBe(city.getStats().employed);

  // Someone whose home is gone is nobody.
  city.execute({ type: 'DEMOLISH', ...homes[0] });
  expect(city.person(listed.homeId, listed.slot, 10)).toBeUndefined();
});

it('gives offices and factories the weekend off, and keeps the shops open', () => {
  expect(doingAt(clerk, 12, 0, true)).toBe('day-off');
  expect(doingAt({ ...clerk, fun: true }, 12, 1, true)).toBe('outing');
  expect(doingAt(clerk, 3, 0, true)).toBe('sleeping');
  // Shop staff (11:00 to 20:00) are at work as on any other day.
  expect(doingAt({ ...clerk, shift: 2 }, 12, 0, true)).toBe('working');
  expect(thoughtsOf({ ...clerk, minutes: 20, kids: 1, school: true, park: true })).toContain('kids-happy');
  expect(thoughtsOf({ ...clerk, minutes: 20, kids: 1, town: true })).toContain('kids-nowhere');
});
