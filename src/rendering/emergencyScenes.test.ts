import { expect, it } from 'vitest';
import { advanceScene, sceneLength, sceneVehicle, vehicleAt, type Scene } from './emergencyScenes';

const route = Array.from({ length: 6 }, (_, x) => ({ x: 3 + x, y: 7 }));
const scene = (): Scene => ({ event: { tick: 0, kind: 'fire-out', cell: { x: 8, y: 6 }, station: { x: 3, y: 6 } }, since: 0, route });

it('keeps a rescue vehicle in the right-hand lane, heading the way it drives', () => {
  // Heading east the right-hand lane is the lower one.
  expect(vehicleAt(route, 2.5)).toEqual({ x: 6, y: 7 + 0.19 + 0.5, hx: 1, hy: 0 });
  // At the end of the way it still faces the way it came.
  expect(vehicleAt(route, 5)).toMatchObject({ x: 8.5, hx: 1, hy: 0 });
});

it('stands behind a car in its lane, then is let by, and the scene waits for it', () => {
  const stuck = scene();
  for (let age = 100; age <= 1000; age += 100) advanceScene(stuck, age, () => true);
  expect(stuck.travelled ?? 0).toBe(0);
  expect(sceneLength(stuck)).toBe(Infinity);
  // After a moment with the siren on, the car in front lets it squeeze past.
  for (let age = 1100; age <= 2000; age += 100) advanceScene(stuck, age, () => true);
  expect(stuck.travelled).toBeGreaterThan(0);

  const free = scene();
  let at;
  for (let age = 100; age <= 3000 && free.arrived === undefined; age += 100) at = advanceScene(free, age, () => false);
  expect(free.arrived).toBeLessThan(2000);
  expect(at).toMatchObject({ hx: 1, hy: 0 });
  expect(sceneLength(free)).toBeGreaterThan(free.arrived!);
  // Once there it is no longer on the road for others to queue behind.
  expect(advanceScene(free, 3100, () => false)).toBeUndefined();
});

it('reports the response task, on-scene work and ambulance return for vehicle inspection', () => {
  const current = scene();
  advanceScene(current, 100, () => true);
  expect(sceneVehicle(current, 100)).toMatchObject({ activity: 'queued', returning: false });
  current.arrived = 500;
  expect(sceneVehicle(current, 600)?.activity).toBe('working');
  const ambulance = { ...current, event: { ...current.event, kind: 'crash-hospital' as const } };
  expect(sceneVehicle(ambulance, 3200)).toMatchObject({ activity: 'moving', returning: true, trouble: 'sick' });
});
