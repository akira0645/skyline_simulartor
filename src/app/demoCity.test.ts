import { expect, it } from 'vitest';
import { demoCity } from './demoCity';
import { SimulationEngine } from '../simulation/SimulationEngine';

it('starts with both walking and driving routes and loses jobs when the main road closes', () => {
  const engine = new SimulationEngine({ version: 1, seed: 42, tick: 0 });
  demoCity(engine);
  const lengths = engine.city.getCommutes().map(route => route.path.length);
  expect(lengths.some(length => length < 5)).toBe(true);
  expect(lengths.some(length => length >= 5)).toBe(true);
  const before = engine.city.getStats().employed;
  engine.city.execute({ type: 'DEMOLISH', x: 6, y: 3 });
  expect(engine.city.getStats().employed).toBeLessThan(before);
});
