import { expect, it } from 'vitest';
import { brands, dilemmas } from './Dilemmas';
import { calendar } from './calendar';
import { demoCity } from '../app/demoCity';
import { SimulationEngine } from './SimulationEngine';
import type { Cell } from './TileMap';

const line = (y: number, from: number, to: number): Cell[] =>
  Array.from({ length: to - from + 1 }, (_, index) => ({ x: from + index, y }));
const column = (x: number, from: number, to: number): Cell[] =>
  Array.from({ length: to - from + 1 }, (_, index) => ({ x, y: from + index }));

it('carries an elevated road over a river, buildings and another road without joining them', () => {
  const engine = new SimulationEngine({ version: 1, seed: 1, tick: 0 });
  const { city } = engine;
  city.map.flood(column(10, 0, 40));
  // Two streets, one on each bank, and a third that runs along the west bank between them.
  city.execute({ type: 'BUILD_ROAD', path: line(5, 2, 6) });
  city.execute({ type: 'BUILD_ROAD', path: line(5, 14, 18) });
  city.execute({ type: 'BUILD_ROAD', path: column(8, 1, 9) });
  const graph = city.roadGraph;
  expect(graph.shortestPath({ x: 2, y: 5 }, { x: 18, y: 5 })).toBeUndefined();

  // From the end of the west street to the start of the east one, over the cross street and the water.
  const cost = city.getStats().funds;
  expect(city.execute({ type: 'BUILD_VIADUCT', path: line(5, 7, 13) }).error).toBeUndefined();
  expect(cost - city.getStats().funds).toBe(7 * 120);
  expect(city.map.get({ x: 10, y: 5 })).toBe('river');
  expect(city.map.get({ x: 8, y: 5 })).toBe('road');
  const over = graph.shortestPath({ x: 2, y: 5 }, { x: 18, y: 5 })!;
  expect(over.distance).toBe(16);
  // The street underneath is crossed, not joined: from it the only way up is round by an end.
  expect(graph.shortestPath({ x: 8, y: 1 }, { x: 18, y: 5 })).toBeUndefined();

  // It is saved, and pulling down under it takes the elevated road and leaves what was there.
  const restored = new SimulationEngine({ version: 1, seed: 0, tick: 0 });
  restored.load(structuredClone(engine.save()));
  expect(restored.city.roadGraph.shortestPath({ x: 2, y: 5 }, { x: 18, y: 5 })?.distance).toBe(16);
  city.execute({ type: 'DEMOLISH', x: 10, y: 5 });
  expect(city.map.get({ x: 10, y: 5 })).toBe('river');
  expect(city.map.hasSpan({ x: 10, y: 5 })).toBe(false);
  expect(graph.shortestPath({ x: 2, y: 5 }, { x: 18, y: 5 })).toBeUndefined();
});

it('lets people commute over an elevated road', () => {
  const engine = new SimulationEngine({ version: 1, seed: 1, tick: 0 });
  const { city } = engine;
  city.map.flood(column(10, 0, 40));
  city.execute({ type: 'BUILD_ROAD', path: line(5, 2, 6) });
  city.execute({ type: 'BUILD_ROAD', path: line(5, 14, 18) });
  city.execute({ type: 'SET_ZONE', tiles: line(4, 2, 5), zone: 'residential' });
  city.execute({ type: 'SET_ZONE', tiles: line(4, 15, 18), zone: 'commercial' });
  engine.advance(60 * calendar.ticksPerDay);
  expect(city.getStats().employed).toBe(0);
  city.execute({ type: 'BUILD_VIADUCT', path: line(5, 7, 13) });
  engine.advance(60 * calendar.ticksPerDay);
  expect(city.getStats().employed).toBeGreaterThan(0);
});

it('puts decisions to the city, which pay or cost and sway demand for a while', () => {
  const engine = new SimulationEngine({ version: 1, seed: 42, tick: 0 });
  demoCity(engine);
  const { city } = engine;
  let asked;
  for (let day = 0; day < 400 && !asked; day++) {
    engine.advance(calendar.ticksPerDay);
    asked = city.getStats().dilemma;
  }
  expect(asked).toBeDefined();
  const restored = new SimulationEngine({ version: 1, seed: 0, tick: 0 });
  restored.load(structuredClone(engine.save()));
  expect(restored.city.getStats().dilemma).toEqual(asked);

  const [first] = dilemmas.list.find(entry => entry.id === asked!.id)!.answers;
  const before = city.getStats();
  city.decide(0);
  const after = city.getStats();
  expect(after.dilemma).toBeUndefined();
  expect(after.funds - before.funds).toBeCloseTo(first.funds ?? 0);
  expect(after.boost).toBe(first.demand?.amount ?? 0);
  // An answer that brings a business opens it in one of the shops, where it shows and pays.
  if (first.brand) {
    const [shop] = city.find({ brand: first.brand });
    expect(city.inspect(shop)).toMatchObject({ tile: 'commercial', brand: first.brand });
    expect(city.getNotices().dilemmaEnd!.opened).toEqual(shop);
    expect(after.budget.visitors).toBe(before.budget.visitors + brands[first.brand]);
  }
  // Left alone, one simply passes.
  restored.advance((dilemmas.days + 1) * calendar.ticksPerDay);
  expect(restored.city.getStats().dilemma).toBeUndefined();
  expect(restored.city.getNotices().dilemmaEnd).toMatchObject({ answer: -1 });
});
