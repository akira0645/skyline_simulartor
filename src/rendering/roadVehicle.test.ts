import { expect, it } from 'vitest';
import { advanceRoadVehicle, type RoadVehicle } from './roadVehicle';
const state = (): RoadVehicle => ({ along: 1, returning: false, held: 0, wait: 0 });
const advance = (car: RoadVehicle, elapsed = 40, load = 0, blocked = false, red = false) =>
  advanceRoadVehicle(car, 10, elapsed, 400, load, blocked, red, 1500);

it('waits behind cars and at red lights, then moves when the way is clear', () => {
  for (const red of [false, true]) {
    const car = state();
    advance(car, 40, 0, !red, red);
    expect(car.along).toBe(1);
    advance(car);
    expect(car.along).toBeGreaterThan(1);
  }
});
it('slows down in congestion and remains unchanged while paused', () => {
  const clear = state(); const jam = state();
  advance(clear); advance(jam, 40, 2);
  expect(jam.along).toBeLessThan(clear.along);
  const before = { ...jam };
  advance(jam, 0, 2, true);
  expect(jam).toEqual(before);
});
it('waits at the terminal before returning, and eventually releases a deadlock', () => {
  const car = { ...state(), along: 9.99 };
  advance(car);
  expect(car).toMatchObject({ along: 10, returning: true, wait: 650 });
  advance(car, 650);
  expect(car.along).toBe(10);
  advance(car);
  expect(car.along).toBeLessThan(10);
  const stuck = state();
  advance(stuck, 3600, 0, true);
  expect(stuck.along).toBeGreaterThan(1);
});
