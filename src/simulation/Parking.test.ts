import { expect, it } from 'vitest';
import { demoCity } from '../app/demoCity';
import { calendar } from './calendar';
import { circling, parking, spacesAt } from './Parking';
import { SimulationEngine } from './SimulationEngine';
import type { Cell } from './TileMap';

const repeats = (path: readonly Cell[]) => new Set(path.map(cell => `${cell.x},${cell.y}`)).size < path.length;

it('gives a place its kerb, its own car park and the city car parks beside it', () => {
  const engine = new SimulationEngine({ version: 1, seed: 7, tick: 0 });
  demoCity(engine, 'small');
  const { map } = engine.city;
  // The cinema on the south street has a city car park next door; the temple two doors along does not.
  expect(map.get({ x: 13, y: 9 })).toBe('cinema');
  expect(spacesAt(map, { x: 13, y: 9 })).toBe(parking.kerb + parking.own.cinema!);
  expect(map.get({ x: 11, y: 9 })).toBe('highschool');
  expect(spacesAt(map, { x: 11, y: 9 })).toBe(parking.kerb + parking.own.highschool! + parking.lot);
});

it('sends a driver who finds no space on past the door and back', () => {
  const engine = new SimulationEngine({ version: 1, seed: 7, tick: 0 });
  const { map } = engine.city;
  expect(engine.city.execute({ type: 'BUILD_ROAD', path: Array.from({ length: 10 }, (_, at) => ({ x: 20 + at, y: 40 })) }).error).toBeUndefined();
  const way = [{ x: 20, y: 41 }, ...[20, 21, 22, 23, 24].map(x => ({ x, y: 40 })), { x: 24, y: 41 }];
  const round = circling(map, way);
  expect(round.length).toBe(way.length + parking.circle);
  expect(round.slice(0, 6)).toEqual(way.slice(0, 6));
  expect(round.at(-1)).toEqual(way.at(-1));
  expect(round.at(-2)).toEqual(way.at(-2));
  expect(round.every((cell, at) => !at || Math.abs(cell.x - round[at - 1].x) + Math.abs(cell.y - round[at - 1].y) === 1)).toBe(true);
  // Where the road ends at the door there is nowhere to go round.
  const end = [{ x: 22, y: 41 }, ...[22, 23, 24, 25, 26, 27, 28, 29].map(x => ({ x, y: 40 })), { x: 29, y: 41 }];
  expect(circling(map, end)).toEqual(end);
});

it('has drivers go round only where the spaces have run out, and never scooters', () => {
  const engine = new SimulationEngine({ version: 1, seed: 42, tick: 0 });
  demoCity(engine, 'medium');
  const { city } = engine;
  let looked = 0;
  let cars = 0;
  const start = city.visits.start.bind(city.visits);
  city.visits.start = (plans, tick) => {
    for (const plan of plans) {
      if (plan.doing === 'delivering') continue;
      const round = repeats(plan.path.slice(1, -1));
      if ((plan.ride ?? 0) >= 2) cars++;
      if (!round) continue;
      looked++;
      expect(plan.ride).toBeGreaterThanOrEqual(2);
      const place = { x: plan.destination % 128, y: Math.floor(plan.destination / 128) };
      // Full with the cars already there and those setting out for it this hour.
      const coming = plans.filter(other => other.destination === plan.destination && (other.ride ?? 0) >= 2).length;
      expect(city.visits.carsAt(plan.destination) + coming).toBeGreaterThan(spacesAt(city.map, place));
    }
    start(plans, tick);
  };
  engine.advance(3 * calendar.ticksPerDay);
  expect(cars).toBeGreaterThan(50);
  expect(looked).toBeGreaterThan(0);
  expect(looked).toBeLessThan(cars / 2);
});
