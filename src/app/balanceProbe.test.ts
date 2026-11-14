import { expect, it } from 'vitest';
import { demoCity } from './demoCity';
import { SimulationEngine } from '../simulation/SimulationEngine';
import { calendar } from '../simulation/calendar';

it('measures opening balance and one month with no player spending', () => {
  for (const size of ['small', 'medium', 'large'] as const) {
    const engine = new SimulationEngine({ version: 1, seed: 42, tick: 0 });
    demoCity(engine, size);
    const before = engine.city.getStats();
    engine.advance(calendar.daysPerMonth * calendar.ticksPerDay);
    const after = engine.city.getStats();
    expect(before.budget.net, size).toBeGreaterThan(0);
    expect(after.funds, size).toBeGreaterThan(before.funds);
  }
}, 120000);
