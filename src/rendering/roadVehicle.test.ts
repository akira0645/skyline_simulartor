import { expect, it } from 'vitest';
import { advanceRoadVehicle, advancePathVehicle, roadVehiclePose, roadPathKey, TURN_MS, type RoadVehicle } from './roadVehicle';
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
it('waits at the terminal before returning and never drives through a blocked body', () => {
  const car = { ...state(), along: 9.99 };
  advance(car);
  expect(car).toMatchObject({ along: 10, returning: true, wait: 650 });
  advance(car, 650);
  expect(car.along).toBe(10);
  advance(car);
  expect(car.along).toBeLessThan(10);
  const stuck = state();
  advance(stuck, 3600, 0, true);
  expect(stuck.along).toBe(1);
  advance(stuck, 20000, 0, true);
  expect(stuck.along).toBe(1);
  advance(stuck);
  expect(stuck.along).toBeGreaterThan(1);
});

it('continues to obey red lights after several cycles', () => {
  const car = state();
  advance(car, 20000, 0, false, true);
  expect(car.along).toBe(1);
  advance(car);
  expect(car.along).toBeGreaterThan(1);
});

it('checks every substep before accepting motion or a turn completion', () => {
  const path = Array.from({ length: 6 }, (_, x) => ({ x, y: 0 }));
  const car = state();
  advancePathVehicle(car, path, 4000, 400, 0, false, false, 1500, (_before, after) => after.along <= 2);
  expect(car.along).toBe(2);
  const turning = { ...state(), along: 5, returning: true, turnFrom: false, wait: TURN_MS };
  advancePathVehicle(turning, path, TURN_MS, 400, 0, false, false, 1500, () => false);
  expect(turning).toMatchObject({ along: 5, returning: true, turnFrom: false, wait: TURN_MS });
});


it('turns through a continuous arc and returns facing forward in the opposing lane', () => {
  const path = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }];
  const car = { ...state(), along: 1.99 };
  advancePathVehicle(car, path, 40, 400, 0, false, false, 1500);
  const start = roadVehiclePose(path, car);
  expect(start.hx).toBeCloseTo(1); expect(start.y).toBeGreaterThan(0.5);
  advancePathVehicle(car, path, TURN_MS / 2, 400, 0, true, true, 1500);
  const middle = roadVehiclePose(path, car);
  expect(middle.x).toBeGreaterThan(start.x); expect(middle.y).toBeCloseTo(0.5);
  expect(middle.hy).toBeCloseTo(-1);
  advancePathVehicle(car, path, TURN_MS / 2, 400, 0, false, false, 1500);
  const end = roadVehiclePose(path, car);
  expect(end.hx).toBe(-1); expect(end.y).toBeLessThan(0.5);
  const before = end.x;
  advancePathVehicle(car, path, 40, 400, 0, false, false, 1500);
  expect(roadVehiclePose(path, car).x).toBeLessThan(before);
});

it('does not reassign an automatic truck until its home turn is completed, and freezes turns when paused', () => {
  const path = [{ x: 0, y: 0 }, { x: 1, y: 0 }];
  const car = { ...state(), along: 0.01, returning: true };
  expect(advancePathVehicle(car, path, 40, 400, 0, false, false, 1500)).toBeUndefined();
  const paused = { ...car };
  advancePathVehicle(car, path, 0, 400, 0, true, true, 1500);
  expect(car).toEqual(paused);
  expect(advancePathVehicle(car, path, TURN_MS, 400, 0, false, false, 1500)).toBe('home');
  expect(advancePathVehicle(car, path, 40, 400, 0, false, false, 1500)).toBeUndefined();
});

it('turns at an intermediate delivery stop when an itinerary doubles back', () => {
  const path = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 1 }];
  const car = { ...state(), along: 0.99 };
  advancePathVehicle(car, path, 40, 400, 0, false, false, 1500);
  expect(car).toMatchObject({ along: 1, turnNode: 1, returning: false });
  advancePathVehicle(car, path, TURN_MS, 400, 0, false, false, 1500);
  expect(roadVehiclePose(path, car).hx).toBe(-1);
  advancePathVehicle(car, path, 40, 400, 0, false, false, 1500);
  expect(car.along).toBeGreaterThan(1);
  expect(car.returning).toBe(false);
});

it('identifies the same route after unrelated map edits, but detects a changed road itinerary', () => {
  const original = [{ x: 0, y: 0 }, { x: 1, y: 0 }];
  expect(roadPathKey(original.map(cell => ({ ...cell })))).toBe(roadPathKey(original));
  expect(roadPathKey([{ x: 0, y: 0 }, { x: 0, y: 1 }])).not.toBe(roadPathKey(original));
});
