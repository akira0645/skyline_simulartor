import { expect, it } from 'vitest';
import { calendar } from './calendar';
import { jobs } from './Jobs';
import { residentAt } from './Residents';
import { SimulationEngine } from './SimulationEngine';
import { MAP_SIZE, type Cell } from './TileMap';

const DAY = calendar.ticksPerDay;
const id = ({ x, y }: Cell) => y * MAP_SIZE + x;
const row = (y: number, from: number, to: number): Cell[] =>
  Array.from({ length: to - from + 1 }, (_, index) => ({ x: from + index, y }));

/** A home at the west end of a street and a workplace far down it, with room for another nearby. */
function street(seed = 1) {
  const engine = new SimulationEngine({ version: 1, seed, tick: 0 });
  const { city } = engine;
  const home = { x: 1, y: 1 };
  const far = { x: 12, y: 1 };
  const near = { x: 3, y: 1 };
  city.execute({ type: 'BUILD_ROAD', path: row(2, 1, 12) });
  city.execute({ type: 'SET_ZONE', tiles: [home], zone: 'residential' });
  city.execute({ type: 'SET_ZONE', tiles: [far, near], zone: 'commercial' });
  engine.load({ ...engine.save(), buildings: [
    { id: id(home), capacity: 12, occupants: 6 }, { id: id(far), capacity: 20, occupants: 0 },
  ] });
  return { engine, city, home, far, near };
}

it('keeps people in their jobs until they choose to move to a nearer one', () => {
  const { engine, city, home, far, near } = street();
  expect(city.inspect(home)!.residents!.every(person => person.work?.x === far.x)).toBe(true);
  expect(city.inspect(far)!.staff).toHaveLength(6);
  const slow = city.getStats().commute;

  // A workplace opens next door. Nobody is moved there on the spot.
  engine.load({ ...engine.save(), buildings: [...engine.save().buildings, { id: id(near), capacity: 20, occupants: 0 }] });
  expect(city.inspect(near)!.staff).toHaveLength(0);
  expect(city.getStats().commute).toBe(slow);

  // One person of the home is looked at each day; within a few months all have moved.
  engine.advance(120 * DAY);
  expect(city.inspect(near)!.staff).toHaveLength(6);
  expect(city.inspect(far)!.staff).toHaveLength(0);
  expect(city.getStats().commute).toBeLessThan(slow - jobs.nearer);
  const news = city.getNews().filter(item => item.kind === 'job-nearer');
  expect(news).toHaveLength(6);
  expect(new Set(news.map(item => item.name))).toEqual(
    new Set([0, 1, 2, 3, 4, 5].map(place => residentAt(1, id(home), place).name)));
  // They say how long they have had the job, and it is less than they have lived here.
  for (const person of city.inspect(home)!.residents!) {
    expect(person.workDays).toBeLessThan(person.days);
    expect(person.days).toBe(120);
  }
});

it('keeps the same people and jobs through a save', () => {
  const { engine, city, home } = street();
  engine.advance(10 * DAY);
  const restored = new SimulationEngine({ version: 1, seed: 0, tick: 0 });
  restored.load(structuredClone(engine.save()));
  expect(restored.city.inspect(home)!.residents).toEqual(city.inspect(home)!.residents);
  expect(restored.save()).toEqual(engine.save());
  // A person record that does not add up is refused.
  const save = engine.save();
  const broken = save.buildings.map(building => building.people ?
    { ...building, people: building.people.slice(1) } : building);
  expect(() => restored.load({ ...save, buildings: broken })).toThrow('存檔資料損壞。');
});

it('puts people out of work when their workplace goes, and it is they who leave town', () => {
  const { engine, city, home, far, near } = street();
  // No second workplace can be built.
  city.execute({ type: 'DEMOLISH', ...near });
  // The shop takes ten without power and water; make it take only four of the six.
  engine.load({ ...engine.save(), buildings: [
    { id: id(home), capacity: 12, occupants: 6 }, { id: id(far), capacity: 8, occupants: 0 },
  ] });
  const before = city.inspect(home)!.residents!;
  expect(before.map(person => person.shift !== undefined)).toEqual([true, true, true, true, false, false]);
  // Two are out of work, one more than a home puts up with: the last of them leaves.
  engine.advance(DAY);
  const after = city.inspect(home)!.residents!;
  expect(after.map(person => person.name)).toEqual(before.slice(0, 5).map(person => person.name));
  expect(city.getNews().at(-1)).toMatchObject({ kind: 'left-no-work', name: before[5].name });

  // The workplace is pulled down: everyone who worked there is told, and looks for work.
  city.execute({ type: 'DEMOLISH', ...far });
  expect(city.getNews().filter(item => item.kind === 'job-lost')).toHaveLength(4);
  expect(city.inspect(home)!.residents!.every(person => person.shift === undefined)).toBe(true);
  expect(city.getStats().employed).toBe(0);
});

it('lets someone take a longer ride for the kind of work they like, and stay there', () => {
  // Find a city whose first resident would rather work in a factory.
  let seed = 1;
  const home = { x: 1, y: 1 };
  while (residentAt(seed, id(home), 0).liking !== 'industrial') seed++;
  const engine = new SimulationEngine({ version: 1, seed, tick: 0 });
  const { city } = engine;
  const shop = { x: 2, y: 1 };
  const factory = { x: 4, y: 1 };
  city.execute({ type: 'BUILD_ROAD', path: row(2, 1, 4) });
  city.execute({ type: 'SET_ZONE', tiles: [home], zone: 'residential' });
  city.execute({ type: 'SET_ZONE', tiles: [shop], zone: 'commercial' });
  city.execute({ type: 'SET_ZONE', tiles: [factory], zone: 'industrial' });
  engine.load({ ...engine.save(), buildings: [
    { id: id(home), capacity: 2, occupants: 1 }, { id: id(shop), capacity: 4, occupants: 0 },
    { id: id(factory), capacity: 4, occupants: 0 },
  ] });
  expect(city.inspect(home)!.residents![0]).toMatchObject({ work: shop, content: false });
  engine.advance(DAY);
  expect(city.inspect(home)!.residents![0]).toMatchObject({ work: factory, content: true, workDays: 0 });
  expect(city.getNews().at(-1)).toMatchObject({ kind: 'job-liking' });
  // The shop next door is nearer, but not by enough, and it is not what they like.
  engine.advance(200 * DAY);
  expect(city.inspect(home)!.residents![0]).toMatchObject({ work: factory, workDays: 200 });
});
