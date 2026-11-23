import { expect, it } from 'vitest';
import { JunctionFlow, parseJunctionFlow, type JunctionNetwork } from './JunctionFlow';
import { RoadOccupancy, bodiesOverlap } from './RoadOccupancy';
import { advancePathVehicle, roadVehiclePose, type RoadVehicle } from './RoadVehicle';
import type { Cell } from './TileMap';

const east = Array.from({ length: 5 }, (_, x) => ({ x, y: 2 }));
const south = Array.from({ length: 5 }, (_, y) => ({ x: 2, y }));
const west = [...east].reverse();
const turning = [{ x: 0, y: 2 }, { x: 1, y: 2 }, { x: 2, y: 2 }, { x: 2, y: 3 }, { x: 2, y: 4 }];
const network: JunctionNetwork = { isJunction: cell => cell.x === 2 && cell.y === 2, green: () => true };
const at = (path: Cell[], index: number) => (along: number) => ({
  ...roadVehiclePose(path, { along, returning: false, held: 0, wait: 0 }), index, length: 0.4, width: 0.2,
});

it('waits before the junction when the exit is occupied, even on green', () => {
  const flow = new JunctionFlow(), occupancy = new RoadOccupancy();
  occupancy.add(at(east, 2)(2.73125));
  const decision = flow.inspect('a', 1, east, 1, at(east, 1), occupancy, network, 0);
  expect(decision.stop).toBeLessThan(1.5);
  expect(at(east, 1)(decision.stop!).x + 0.2).toBeLessThan(2);
  occupancy.reset([]);
  expect(flow.inspect('a', 1, east, 1, at(east, 1), occupancy, network, 50).crossing).toBeDefined();
});

it('prevents cross traffic but permits independent opposing straight lanes, then releases', () => {
  const flow = new JunctionFlow(), occupancy = new RoadOccupancy();
  const decision = flow.inspect('east', 1, east, 1, at(east, 1), occupancy, network, 0);
  flow.commit('east', 1.4, decision);
  expect(flow.inspect('south', 1, south, 1, at(south, 2), occupancy, network, 20).stop).toBeDefined();
  expect(flow.inspect('west', 1, west, 1, at(west, 3), occupancy, network, 20).crossing).toBeDefined();
  flow.inspect('east', 2.8, east, 1, at(east, 1), occupancy, network, 100);
  expect(flow.inspect('south', 1, south, 1, at(south, 2), occupancy, network, 100).crossing).toBeDefined();
});

it('continues clearing after a light changes and prevents newer cars starving an old turn', () => {
  const flow = new JunctionFlow(), occupancy = new RoadOccupancy();
  flow.commit('first', 1.4, flow.inspect('first', 1, east, 1, at(east, 1), occupancy, network, 0));
  flow.inspect('turn', 1, turning, 1, at(turning, 2), occupancy, network, 0);
  expect(flow.inspect('first', 2, east, 1, at(east, 1), occupancy, { ...network, green: () => false }, 50).stop).toBeUndefined();
  flow.inspect('turn', 1, turning, 1, at(turning, 2), occupancy, network, 550);
  flow.inspect('first', 2.8, east, 1, at(east, 1), occupancy, network, 550);
  expect(flow.inspect('new', 1, east, 1, at(east, 3), occupancy, network, 560).stop).toBeDefined();
  expect(flow.inspect('turn', 1, turning, 1, at(turning, 2), occupancy, network, 560).crossing).toBeDefined();
});

it('treats consecutive junction tiles as one box and reserves room for the complete body', () => {
  const flow = new JunctionFlow(), occupancy = new RoadOccupancy();
  const adjacent = { ...network, isJunction: (cell: Cell) => cell.y === 2 && [2, 3].includes(cell.x) };
  occupancy.add(at(east, 2)(3.73125));
  expect(flow.inspect('a', 1, east, 1, at(east, 1), occupancy, adjacent, 0).stop).toBeDefined();
});

it('does not let an old turn trapped in a queue prevent the car ahead from leaving', () => {
  const flow = new JunctionFlow(), occupancy = new RoadOccupancy();
  occupancy.add(at(east, 1)(1.25));
  flow.inspect('a-turn-behind', 0.6, turning, 1, at(turning, 2), occupancy, network, 0);
  flow.inspect('a-turn-behind', 0.6, turning, 1, at(turning, 2), occupancy, network, 600);
  expect(flow.inspect('z-straight-ahead', 1.25, east, 1, at(east, 1), occupancy, network, 620).crossing).toBeDefined();
});

it('restores active reservations and rejects a forged actor in saved data', () => {
  const flow = new JunctionFlow(), occupancy = new RoadOccupancy();
  flow.commit('freight:a', 1.4, flow.inspect('freight:a', 1, east, 1, at(east, 1), occupancy, network, 0));
  const saved = parseJunctionFlow(flow.snapshot('freight:'), new Map([['freight:a', 4]]), 50);
  const loaded = new JunctionFlow(); loaded.restore(saved);
  expect(loaded.inspect('other', 1, south, 1, at(south, 2), occupancy, network, 50).stop).toBeDefined();
  expect(() => parseJunctionFlow(flow.snapshot('freight:'), new Map(), 50)).toThrow();
  loaded.leave('freight:a');
  expect(loaded.inspect('other', 1, south, 1, at(south, 2), occupancy, network, 100).crossing).toBeDefined();
});

it('keeps real moving vehicles outside a blocked box, then drains both crossing approaches without overlap', () => {
  const flow = new JunctionFlow(), occupancy = new RoadOccupancy();
  const paths = [east, south, turning];
  const cars: RoadVehicle[] = paths.map(() => ({ along: 0, returning: false, held: 0, wait: 0 }));
  // The turning car starts behind the straight one on their shared approach.
  cars[2].along = -0.8;
  const bodies = (i: number, state = cars[i]) => ({ ...at(paths[i], i)(state.along), speed: state.speed ?? 0.0025 });
  const finished = new Set<number>();
  for (let time = 0; time < 8000; time += 20) {
    occupancy.reset(cars.flatMap((_, i) => finished.has(i) || cars[i].along < 0 ? [] : [bodies(i)]));
    if (time < 1500) occupancy.add({ ...at(east, 99)(2.73125), speed: 0 });
    for (let i = 0; i < cars.length; i++) {
      if (finished.has(i)) continue;
      if (cars[i].along < 0) {
        if (cars[0].along < 0.8) continue;
        cars[i].along = 0;
      }
      advancePathVehicle(cars[i], paths[i], 20, 400, 0, false, false, 2600, undefined,
        { actor: `car:${i}`, time, occupancy, body: state => bodies(i, state), junctions: flow, network });
      occupancy.add(bodies(i));
      if (time < 1500 && i === 0) expect(cars[i].along).toBeLessThan(1.3);
      for (let j = 0; j < i; j++) if (!finished.has(j) && cars[j].along >= 0) expect(bodiesOverlap(bodies(i), bodies(j))).toBe(false);
      if (cars[i].along >= 3.5) { finished.add(i); flow.leave(`car:${i}`); }
    }
  }
  expect(finished.size).toBe(3);
});
