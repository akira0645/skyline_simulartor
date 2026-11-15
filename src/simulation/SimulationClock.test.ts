import { describe, expect, it } from 'vitest';
import { SimulationClock, TICK_MS } from './SimulationClock';
import { SimulationEngine } from './SimulationEngine';

function createClock() {
  return new SimulationClock(new SimulationEngine({ version: 1, seed: 42, tick: 0 }));
}

describe('SimulationClock', () => {
  it('limits catch-up work and ignores hidden time without changing the selected speed', () => {
    const clock = createClock();
    clock.speed = 4;
    expect(clock.advance(3000)).toBe(4);
    expect(clock.advance(0)).toBe(8);
    expect(clock.advance(0)).toBe(12);
    clock.suspended = true;
    expect(clock.advance(3600000)).toBe(12);
    expect(clock.speed).toBe(4);
    clock.suspended = false;
    expect(clock.advance(3600000)).toBe(12);
    expect(clock.speed).toBe(0);
    expect(clock.interrupted).toBe(true);
  });
  it('preserves partial ticks while paused', () => {
    const clock = createClock();
    expect(clock.advance(TICK_MS / 2)).toBe(0);
    clock.speed = 0;
    expect(clock.advance(TICK_MS * 10)).toBe(0);
    clock.speed = 1;
    expect(clock.advance(TICK_MS / 2)).toBe(1);
  });

  it.each([1, 2, 4] as const)('advances at %s× independently of polling cadence', speed => {
    const a = createClock();
    const b = createClock();
    a.speed = b.speed = speed;
    const tick = a.advance(TICK_MS);
    b.advance(TICK_MS / 4);
    expect(b.advance(TICK_MS * 3 / 4)).toBe(tick);
    expect(tick).toBe(speed);
  });
});
