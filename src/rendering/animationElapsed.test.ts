import { expect, it } from 'vitest';
import { animationElapsed } from './animationElapsed';
import { SimulationClock, TICK_MS } from '../simulation/SimulationClock';
import { SimulationEngine } from '../simulation/SimulationEngine';
import { hourAt } from '../simulation/calendar';
import { advancePathVehicle, type RoadVehicle } from './roadVehicle';

it.each([0, 0.25, 0.5, 1, 2, 4] as const)('keeps calendar and animation at the same %s× rate even at low FPS', speed => {
  const clock = new SimulationClock(new SimulationEngine({ version: 1, seed: 42, tick: 0 }));
  clock.speed = speed;
  let animation = 0;
  // 2.5 FPS; capped Pixi deltaMS would discard 75% of this elapsed time.
  for (let frame = 0; frame < 10; frame++) {
    clock.advance(400);
    animation += animationElapsed(400, speed);
  }
  const tick = clock.advance(0);
  expect(animation).toBe(4000 * speed);
  expect(tick + clock.tickProgress).toBeCloseTo(animation / TICK_MS);
  expect(hourAt(tick, clock.tickProgress)).toBeCloseTo(hourAt(animation / TICK_MS));
});

it('moves freight equally far at different frame rates and preserves turnaround timing', () => {
  const path = Array.from({ length: 30 }, (_, x) => ({ x, y: 0 }));
  const simulate = (frame: number) => {
    const vehicle: RoadVehicle = { along: 0, returning: false, held: 0, wait: 0 };
    for (let elapsed = 0; elapsed < 12000; elapsed += frame) {
      advancePathVehicle(vehicle, path, frame, 400, 0, false, false, 1500);
    }
    return vehicle;
  };
  expect(simulate(400)).toEqual(simulate(50));
  expect(simulate(400).returning).toBe(true);
});

it('does not animate paused, invalid or long-suspended frames', () => {
  expect(animationElapsed(400, 0)).toBe(0);
  for (const elapsed of [-1, NaN, Infinity, 60000]) expect(animationElapsed(elapsed, 1)).toBe(0);
});
