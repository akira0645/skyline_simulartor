import { describe, expect, it } from 'vitest';
import { SimulationEngine } from './SimulationEngine';

describe('SimulationEngine', () => {
  const initialState = { version: 1, seed: 42, tick: 0 };

  it('returns the initial state as cloneable data in Node', () => {
    const engine = new SimulationEngine(initialState);

    expect(structuredClone(engine.getSnapshot())).toEqual(initialState);
  });

  it('keeps engine state independent of edits to a snapshot', () => {
    const engine = new SimulationEngine(initialState);
    const snapshot = engine.getSnapshot();
    snapshot.tick = 10;

    expect(engine.getSnapshot().tick).toBe(0);
  });
});
