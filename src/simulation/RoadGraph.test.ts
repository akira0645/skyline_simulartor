import { expect, it } from 'vitest';
import { SimulationEngine } from './SimulationEngine';

it('finds the shortest route, updates after removal, and rebuilds after loading', () => {
  const engine = new SimulationEngine({ version: 1, seed: 42, tick: 0 });
  const { city, roadGraph } = engine;
  const start = { x: 1, y: 1 };
  const end = { x: 3, y: 1 };
  const bridge = { x: 2, y: 1 };
  city.execute({ type: 'BUILD_ROAD', path: [start, bridge, end,
    { x: 1, y: 2 }, { x: 2, y: 2 }, { x: 3, y: 2 }] });
  const saved = engine.save();
  expect(roadGraph.shortestPath(start, end)).toEqual({ path: [start, bridge, end], distance: 2 });
  expect(roadGraph.shortestPath(start, start)).toEqual({ path: [start], distance: 0 });
  city.execute({ type: 'DEMOLISH', ...bridge });
  expect(roadGraph.shortestPath(start, end)?.distance).toBe(4);
  city.execute({ type: 'DEMOLISH', x: 2, y: 2 });
  expect(roadGraph.componentAt(start)).not.toBe(roadGraph.componentAt(end));
  expect(roadGraph.shortestPath(start, end)).toBeUndefined();
  engine.load(saved);
  expect(roadGraph.shortestPath(start, end)?.distance).toBe(2);
});

it('does not connect diagonals, row boundaries, or non-road endpoints', () => {
  const engine = new SimulationEngine({ version: 1, seed: 42, tick: 0 });
  const edge = { x: 127, y: 0 };
  engine.city.execute({ type: 'BUILD_ROAD', path: [edge, { x: 126, y: 1 }, { x: 0, y: 1 }] });
  expect(engine.roadGraph.shortestPath(edge, { x: 126, y: 1 })).toBeUndefined();
  expect(engine.roadGraph.shortestPath(edge, { x: 0, y: 1 })).toBeUndefined();
  expect(engine.roadGraph.componentAt({ x: 128, y: 0 })).toBeUndefined();
  expect(engine.roadGraph.componentAt({ x: 125, y: 0 })).toBeUndefined();
});
