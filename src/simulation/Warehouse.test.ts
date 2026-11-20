import { expect, it } from 'vitest';
import { FreightRuntime, parseFreightRuntime, type ShippingRoute } from './FreightRuntime';
import { planFreightLines } from './FreightLines';
import { summarizeFreight } from './Freight';
import { SimulationEngine } from './SimulationEngine';
import { MAP_SIZE } from './TileMap';

const path = (from: number, to: number) => Array.from({ length: Math.abs(to - from) + 1 }, (_, at) => ({ x: Math.min(from, to) + at, y: 1 }));
const kind = (id: number) => id === 1 ? 'factory' as const : id === 3 || id === 4 ? 'warehouse' as const : 'shop' as const;
const upstream: ShippingRoute = { key: 'manual:2', lineId: 2, vehicles: 1, from: 1, to: 3, goods: 24, trucks: 1, minutes: 5, path: path(1, 3), stops: [{ to: 3, index: 2 }] };
const downstream: ShippingRoute = { key: 'manual:1', lineId: 1, vehicles: 1, from: 3, to: 5, goods: 24, trucks: 1, minutes: 5, path: path(3, 5), stops: [{ to: 5, index: 2 }] };

it('plans factory arrivals before warehouse departures regardless of line creation order, without double counting shop demand', () => {
  const planned = planFreightLines([{ id: 1, stops: [3, 5], vehicles: 1 }, { id: 2, stops: [1, 3], vehicles: 1 }],
    [{ id: 1, amount: 24 }], [{ id: 5, amount: 24 }], kind, path, () => 5, [{ id: 3, capacity: 240, stock: 0 }]);
  expect(planned.lines.map(line => line.id)).toEqual([1, 2]);
  expect(planned.lines.map(line => line.assigned)).toEqual([24, 24]);
  expect(summarizeFreight([{ id: 1, amount: 24 }], [{ id: 5, amount: 24 }], planned.routes, () => true))
    .toMatchObject({ planned: 24, handled: 48, missing: 0, unused: 0 });
});

it('keeps an empty warehouse route ready without promising stock or creating warehouse cycles', () => {
  const planned = planFreightLines([{ id: 1, stops: [3, 5], vehicles: 1 }, { id: 2, stops: [3, 4], vehicles: 1 }], [],
    [{ id: 5, amount: 24 }], kind, path, () => 5, [{ id: 3, capacity: 240, stock: 0 }, { id: 4, capacity: 240, stock: 0 }]);
  expect(planned.lines[0]).toMatchObject({ active: true, assigned: 0, problem: 'waiting-stock' });
  expect(planned.routes[0].deliveries).toEqual([{ to: 5, goods: 0 }]);
  expect(planned.lines[1].problem).toBe('no-shop');
});

it('loads a warehouse departure only after upstream arrival and preserves finite goods across both legs', () => {
  const runtime = new FreightRuntime();
  runtime.load({ time: 0, stocks: [[1, 24]], vehicles: [], current: [], previous: [] }, 0);
  runtime.sync([upstream, downstream], [{ id: 1, amount: 0 }], [{ id: 5, amount: 240 }], [{ id: 3, capacity: 240 }]);
  runtime.advance(750, () => 0);
  expect(runtime.stock(3)).toBe(0);
  expect(runtime.frames().find(v => v.route.from === 3)?.cargo).toEqual([]);
  runtime.advance(50, () => 0);
  expect(runtime.stock(5)).toBe(0);
  expect(runtime.report().current.find(m => m.key === upstream.key)?.delivered).toBe(24);
  expect(runtime.report().inTransit + runtime.stock(3)).toBeCloseTo(24);
  runtime.advance(2000, () => 0);
  expect(runtime.stock(5)).toBeGreaterThan(22);
  expect(runtime.report().current.find(m => m.key === downstream.key)?.delivered).toBe(24);
  expect(runtime.stock(1)).toBe(0);
});

it('reserves receiving capacity across trucks and never produces or consumes warehouse stock', () => {
  const runtime = new FreightRuntime();
  runtime.load({ time: 0, stocks: [[1, 100]], vehicles: [], current: [], previous: [] }, 0);
  runtime.sync([{ ...upstream, vehicles: 2 }], [{ id: 1, amount: 0 }], [], [{ id: 3, capacity: 10 }]);
  runtime.advance(20000, () => 0);
  expect(runtime.stock(3)).toBeCloseTo(10);
  expect(runtime.stock(1)).toBeCloseTo(90);
  expect(runtime.report().inTransit).toBe(0);
  expect(runtime.report().current[0].loaded).toBeCloseTo(10);
  runtime.sync([], [], [], [{ id: 3, capacity: 10 }]);
  runtime.advance(8000, () => 0);
  expect(runtime.stock(3)).toBeCloseTo(10);
});

it('restores warehouse stock, reserved capacity and partial shipments without duplication', () => {
  const runtime = new FreightRuntime();
  runtime.load({ time: 0, stocks: [[3, 12]], vehicles: [], current: [], previous: [] }, 0);
  runtime.sync([downstream], [], [{ id: 5, amount: 240 }], [{ id: 3, capacity: 240 }]);
  runtime.advance(325, () => 0);
  const clone = new FreightRuntime();clone.load(parseFreightRuntime(runtime.save()), 0);
  clone.sync([downstream], [], [{ id: 5, amount: 240 }], [{ id: 3, capacity: 240 }]);
  runtime.advance(4000, () => 0);clone.advance(4000, () => 0);
  expect(clone.save()).toEqual(runtime.save());
  expect(clone.report().current[0].delivered).toBeCloseTo(12);
});

it('returns cancelled outbound freight to its existing warehouse and discards stock only after demolition', () => {
  const runtime = new FreightRuntime();
  runtime.load({ time: 0, stocks: [[3, 12]], vehicles: [], current: [], previous: [] }, 0);
  runtime.sync([downstream], [], [{ id: 5, amount: 240 }], [{ id: 3, capacity: 240 }]);
  runtime.advance(100, () => 0);
  runtime.sync([], [], [{ id: 5, amount: 240 }], [{ id: 3, capacity: 240 }]);
  expect(runtime.stock(3)).toBeCloseTo(12);
  expect(runtime.stock(5)).toBe(0);
  runtime.sync([], [], [], []);
  expect(runtime.stock(3)).toBe(0);
});

it('builds, connects, saves and demolishes a real warehouse with repairable lines', () => {
  const engine = new SimulationEngine({ version: 1, seed: 7, tick: 0 });
  const city = engine.city;
  city.execute({ type: 'BUILD_ROAD', path: path(1, 9) });
  for (const [x, zone] of [[1, 'residential'], [3, 'industrial'], [9, 'commercial']] as const) city.execute({ type: 'SET_ZONE', tiles: [{ x, y: 2 }], zone });
  city.execute({ type: 'BUILD_SERVICE', service: 'warehouse', x: 6, y: 2 });
  engine.load({ ...engine.save(), buildings: [{ id: 2 * MAP_SIZE + 1, capacity: 20, occupants: 20 },
    { id: 2 * MAP_SIZE + 3, capacity: 12, occupants: 0 }, { id: 2 * MAP_SIZE + 9, capacity: 8, occupants: 0 }] });
  const outgoing = city.addFreightLine().id!;
  expect(city.toggleFreightStop(outgoing, { x: 6, y: 2 }).error).toBeUndefined();
  city.toggleFreightStop(outgoing, { x: 9, y: 2 });
  const incoming = city.addFreightLine().id!;
  city.toggleFreightStop(incoming, { x: 3, y: 2 });city.toggleFreightStop(incoming, { x: 6, y: 2 });
  expect(city.getFreightLines().every(line => line.active)).toBe(true);
  expect(city.inspect({ x: 6, y: 2 })?.warehouseCapacity).toBe(240);
  const snapshot = engine.save();const restored = new SimulationEngine({ version: 1, seed: 0, tick: 0 });restored.load(snapshot);
  expect(restored.save()).toEqual(snapshot);
  const damaged = structuredClone(snapshot);damaged.freightRuntime!.stocks.push([2 * MAP_SIZE + 6, 241]);
  expect(() => restored.load(damaged)).toThrow('存檔倉庫容量損壞');
  expect(restored.save()).toEqual(snapshot);
  city.execute({ type: 'DEMOLISH', x: 6, y: 2 });
  expect(city.getFreightLines().every(line => !line.active)).toBe(true);
  expect(city.getLogistics().operations.warehouses).toEqual([]);
});

it('keeps room for cancelled outgoing cargo while other routes replenish a warehouse', () => {
  const runtime = new FreightRuntime();
  runtime.load({ time: 0, stocks: [[1, 10], [3, 10]], vehicles: [], current: [], previous: [] }, 0);
  runtime.sync([upstream, downstream], [{ id: 1, amount: 0 }], [{ id: 5, amount: 240 }], [{ id: 3, capacity: 10 }]);
  runtime.advance(100, () => 0);
  expect(runtime.stock(1)).toBe(10);
  runtime.sync([upstream], [{ id: 1, amount: 0 }], [{ id: 5, amount: 240 }], [{ id: 3, capacity: 10 }]);
  expect(runtime.stock(3)).toBe(10);
  expect(runtime.report().inTransit).toBe(0);
});
