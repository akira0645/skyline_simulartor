import { describe, expect, it } from 'vitest';
import { SimulationClock, MAX_TICKS_PER_POLL, SUSPEND_GAP_MS } from './SimulationClock';
import { REAL_TICK_MS as TICK_MS } from './TravelTiming';
import { SimulationEngine } from './SimulationEngine';

function createClock() {
  return new SimulationClock(new SimulationEngine({ version: 1, seed: 42, tick: 0 }));
}

function advanceFrames(clock: SimulationClock, elapsed: number) {
  for (let remaining = elapsed; remaining > 0; remaining -= 1000) clock.advance(Math.min(1000, remaining));
  return clock.advance(0);
}

describe('SimulationClock', () => {
  it.each([0.25, 0.5] as const)('slows the actual simulation at %s× and preserves paused progress', speed => {
    const clock = createClock();
    clock.speed = speed;
    expect(advanceFrames(clock, TICK_MS / speed / 2)).toBe(0);
    expect(clock.tickProgress).toBeCloseTo(0.5);
    clock.speed = 0;
    expect(clock.advance(10000)).toBe(0);
    clock.speed = speed;
    expect(advanceFrames(clock, TICK_MS / speed / 2)).toBe(1);
    expect(clock.tickProgress).toBe(0);
    clock.suspended = true;
    expect(clock.advance(60000)).toBe(1);
    expect(clock.speed).toBe(speed);
  });
  it('limits catch-up work and ignores hidden time without changing the selected speed', () => {
    const clock = createClock();
    clock.speed = 4;
    expect(clock.advance(SUSPEND_GAP_MS)).toBe(MAX_TICKS_PER_POLL);
    expect(clock.advance(0)).toBe(4);
    clock.suspended = true;
    expect(clock.advance(3600000)).toBe(4);
    expect(clock.speed).toBe(4);
    clock.suspended = false;
    expect(clock.advance(3600000)).toBe(4);
    expect(clock.speed).toBe(0);
    expect(clock.interrupted).toBe(true);
  });

  it('takes two real minutes for one game day at 1x', () => {
    const clock = createClock();
    expect(advanceFrames(clock, 120000)).toBe(8);
    expect(clock.tickProgress).toBe(0);
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
