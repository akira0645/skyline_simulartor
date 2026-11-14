import { expect, it } from 'vitest';
import { bridge, demoCity, demoSizes, eastBank, powerPlant, waterTower, works } from './demoCity';
import { calendar, dateAt } from '../simulation/calendar';
import { economy } from '../simulation/Economy';
import { SimulationEngine } from '../simulation/SimulationEngine';
import { TILES } from '../simulation/TileMap';

const MONTH = calendar.daysPerMonth * calendar.ticksPerDay;
const demo = () => {
  const engine = new SimulationEngine({ version: 1, seed: 42, tick: 0 });
  demoCity(engine);
  return engine;
};

it('opens as a town that is lived in, pays its way and has work left to do', () => {
  const engine = demo();
  const { city } = engine;
  const opening = city.getStats();
  // Four months in: over a hundred people, most in work, and money coming in.
  expect(engine.getSnapshot().tick).toBe(4 * MONTH);
  expect(opening.population).toBeGreaterThan(100);
  expect(opening.employed).toBeGreaterThan(0.85 * opening.population);
  expect(opening.funds).toBe(economy.startingFunds);
  expect(opening.budget.net).toBeGreaterThan(0);
  expect(Math.max(...engine.save().buildings.map(building => building.level))).toBeGreaterThanOrEqual(3);
  expect(opening.riders).toBeGreaterThan(0);
  // What the town met by itself is ticked off; the larger goals are still to win.
  expect(opening.goals).toContain('jobs');
  expect(opening.goals).not.toContain('town');
  expect(opening.goals).not.toContain('big-park');

  // Everything the town was meant to have got built and is connected.
  expect(city.map.get(powerPlant)).toBe('power');
  expect(city.map.get(waterTower)).toBe('water');
  expect(city.map.get(bridge)).toBe('bridge');
  const count = (tile: string) => engine.save().tiles.filter(code => TILES[code] === tile).length;
  expect(['power', 'water', 'fire', 'police', 'school', 'clinic', 'market', 'highschool'].map(count))
    .toEqual([2, 2, 2, 2, 2, 1, 1, 1]);
  // Three metro stations, each under a road that is still a road.
  expect(engine.save().metros).toHaveLength(3);
  expect(engine.save().metros.every(tile => ['road', 'avenue'].includes(TILES[engine.save().tiles[tile]]))).toBe(true);
  // Homes are of more than one kind, by where they stand.
  expect(new Set(engine.save().buildings.filter(building => building.people).map(building => building.kind)).size)
    .toBeGreaterThan(2);
  expect(opening.idle).toBe(0);
  expect(city.getLines()).toMatchObject([{ kind: 'metro', active: true, vehicles: 2 }]);
  // People live and work somewhere in particular.
  const home = engine.save().buildings.find(building => building.people?.length)!;
  expect(home.people!.some(person => person.job >= 0)).toBe(true);

  const before = opening.employed;
  city.execute({ type: 'DEMOLISH', ...works });
  expect(city.getStats().employed).toBeLessThan(before);
});

it('leaves the far bank without power, water or police until the player sees to it', () => {
  const engine = demo();
  const { city } = engine;
  const opening = city.getStats();
  expect(opening.complaints['no-power']).toBeGreaterThan(0);
  expect(opening.complaints['no-water']).toBeGreaterThan(0);
  expect(opening.complaints.crime).toBeGreaterThan(0);

  // Left alone the town fills up what it has and then stays as it is, problems and all.
  engine.advance(12 * MONTH);
  const idle = city.getStats();
  expect(idle.funds).toBeGreaterThan(opening.funds);
  expect(idle.population).toBeGreaterThan(opening.population);
  expect(idle.complaints['no-power']).toBeGreaterThan(0);

  // A plant, a tower and the stations by the far bank's street set it right, and it grows.
  const { x, y } = eastBank;
  for (const [dy, facility] of [[3, 'power'], [2, 'water']] as const) {
    expect(city.execute({ type: 'BUILD_FACILITY', x, y: y + dy, facility }).error).toBeUndefined();
  }
  city.execute({ type: 'BUILD_SERVICE', x: x + 2, y: y + 3, service: 'police' });
  city.execute({ type: 'BUILD_SERVICE', x: x + 2, y: y + 2, service: 'fire' });
  const fixed = city.getStats();
  expect(fixed.idle).toBe(0);
  expect(fixed.complaints).toMatchObject({ 'no-power': 0, 'no-water': 0, crime: 0 });
  engine.advance(12 * MONTH);
  expect(city.getStats().population).toBeGreaterThan(idle.population);
});

it('comes in two larger sizes that are already cities, each with a new district to finish', () => {
  for (const [size, people, rank, lines] of [['medium', 500, 3, 2], ['large', 1500, 4, 5]] as const) {
    const engine = new SimulationEngine({ version: 1, seed: 42, tick: 0 });
    demoCity(engine, size);
    const { city } = engine;
    const opening = city.getStats();
    expect(opening.population).toBeGreaterThan(people);
    expect(opening.employed).toBeGreaterThan(0.85 * opening.population);
    expect(opening.rank).toBe(rank);
    expect(opening.funds).toBe(demoSizes[size].funds);
    expect(opening.budget.net).toBeGreaterThan(0);
    expect(opening.idle).toBe(0);
    expect(city.getLines().filter(line => line.active)).toHaveLength(lines);
    // People have been here for years, own cars and live in homes of several kinds.
    expect(dateAt(engine.getSnapshot().tick).year).toBeGreaterThan(3);
    expect(opening.cars[2] + opening.cars[3]).toBeGreaterThan(0.2 * opening.population);
    expect(new Set(engine.save().buildings.filter(building => building.people).map(building => building.kind)).size)
      .toBeGreaterThan(2);
    // The old town is the same in every size, so the outage buttons work in all of them.
    expect(city.map.get(powerPlant)).toBe('power');
    expect(city.map.get(works)).toBe('avenue');
    // The new district has streets and lots but no power, water or police.
    const { fresh } = demoSizes[size];
    expect(city.map.get(fresh)).toBe('avenue');
    const lot = { x: fresh.x, y: fresh.y - 1 };
    expect(city.map.get(lot)).toBe('residential');
    expect(city.isCovered(lot, 'police')).toBe(false);
    expect(opening.complaints['no-power']).toBeGreaterThan(0);
  }
  // The larger one has what only a big city may build.
  const engine = new SimulationEngine({ version: 1, seed: 42, tick: 0 });
  demoCity(engine, 'large');
  const count = (tile: string) => engine.save().tiles.filter(code => TILES[code] === tile).length;
  expect(['university', 'mall', 'casino', 'hospital'].map(count)).toEqual([1, 1, 1, 2]);
}, 60000);
