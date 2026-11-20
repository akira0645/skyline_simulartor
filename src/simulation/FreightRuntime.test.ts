import { describe, expect, it } from 'vitest';
import { FreightRuntime, parseFreightRuntime, type ShippingRoute } from './FreightRuntime';
import { SimulationEngine } from './SimulationEngine';
import { SCHEMA_VERSION } from './SaveData';
import { SimulationClock } from './SimulationClock';

const route = (to = 11, length = 4): ShippingRoute => ({ key: 'manual:1', lineId: 1, vehicles: 1,
  from: 8, to, goods: 240, trucks: 10, minutes: 8,
  path: Array.from({ length }, (_, x) => ({ x: x + 8, y: 1 })), stops: [{ to, index: length - 1 }] });
function prepared() {
  const runtime = new FreightRuntime();
  runtime.load({ time: 0, stocks: [[8, 24]], vehicles: [], current: [], previous: [] }, 0);
  runtime.sync([route()], [{ id: 8, amount: 240 }], [{ id: 11, amount: 240 }]);
  return runtime;
}
const empty = () => 0;

describe('actual freight', () => {
  it('deducts a finite manifest at departure and credits shop stock only upon reaching it', () => {
    const runtime = prepared();
    runtime.advance(100, empty);
    const moving = runtime.frames()[0];
    expect(moving.cargo.reduce((sum, cargo) => sum + cargo.amount, 0)).toBe(24);
    expect(runtime.stock(8)).toBeCloseTo(0.1);
    expect(runtime.stock(11)).toBe(0);
    expect(runtime.report().current[0].delivered).toBe(0);
    runtime.advance(1100, empty);
    expect(runtime.stock(11)).toBeCloseTo(24);
    expect(runtime.report().current[0].delivered).toBe(24);
    expect(runtime.report().inTransit).toBe(0);
    runtime.advance(3000, empty);
    expect(runtime.report().current[0].completed).toBe(1);
    expect(runtime.report().current[0].emptyDistance).toBeGreaterThan(0);
  });
  it('shares scarce factory stock between vehicles and reserves destination capacity', () => {
    const runtime = new FreightRuntime();
    runtime.load({ time: 0, stocks: [[8, 30]], vehicles: [], current: [], previous: [] }, 0);
    runtime.sync([{ ...route(), vehicles: 2 }], [{ id: 8, amount: 0 }], [{ id: 11, amount: 240 }]);
    runtime.advance(50, empty);
    expect(runtime.report().inTransit).toBe(24);
    expect(runtime.stock(8)).toBe(6);
    expect(runtime.report().current[0].departures).toBe(1);
  });
  it('unloads multiple shops in order and does not deliver the last stop early', () => {
    const runtime = prepared();
    runtime.sync([{ ...route(), stops: [{ to: 9, index: 1 }, { to: 11, index: 3 }] }], [{ id: 8, amount: 240 }], [{ id: 9, amount: 120 }, { id: 11, amount: 120 }]);
    runtime.advance(400, empty);
    expect(runtime.stock(9)).toBeGreaterThan(11);
    expect(runtime.stock(11)).toBe(0);
    expect(runtime.report().inTransit).toBeCloseTo(12);
    runtime.advance(800, empty);
    expect(runtime.stock(11)).toBeCloseTo(12);
  });
  it('restores en-route manifests without duplicating cargo or deliveries', () => {
    const runtime = prepared();runtime.advance(525, empty);
    const save = parseFreightRuntime(runtime.save())!;
    expect(save.pending).toBe(25);
    const loaded = new FreightRuntime();loaded.load(save, 0);
    loaded.sync([route()], [{ id: 8, amount: 240 }], [{ id: 11, amount: 240 }]);
    runtime.advance(2700, empty);loaded.advance(2700, empty);
    expect(loaded.save()).toEqual(runtime.save());
    expect(loaded.report().current[0].delivered).toBe(24);
  });
  it('returns cargo to the factory when a route is removed or changed, without ghost deliveries', () => {
    const runtime = prepared();runtime.advance(100, empty);
    runtime.sync([], [{ id: 8, amount: 240 }], [{ id: 11, amount: 240 }]);
    expect(runtime.report().inTransit).toBe(0);
    expect(runtime.stock(8)).toBeCloseTo(24.1);
    runtime.advance(5000, empty);
    expect(runtime.stock(11)).toBe(0);
    expect(runtime.report().current[0].cancelled).toBe(24);
  });
  it('preserves vehicles through unrelated replans and reports congestion delay and cost', () => {
    const runtime = prepared();runtime.advance(400, empty);
    const before = runtime.save();runtime.sync([route()], [{ id: 8, amount: 240 }], [{ id: 11, amount: 240 }]);
    expect(runtime.save()).toEqual(before);
    runtime.advance(400, () => 2);
    expect(runtime.report().current[0].delayMs).toBeGreaterThan(0);
    expect(runtime.report().current[0].cost).toBeGreaterThan(0);
    expect(runtime.report().current[0].delivered).toBe(0);
  });
  it('handles delivery at a shared road entrance without getting stuck', () => {
    const runtime = prepared();runtime.sync([route(11, 1)], [{ id: 8, amount: 240 }], [{ id: 11, amount: 240 }]);
    runtime.advance(100, empty);
    expect(runtime.report().current[0].completed).toBe(1);
    expect(runtime.report().current[0].delivered).toBe(24);
  });
  it('rolls monthly reports without deleting in-transit cargo and survives old-save migration', () => {
    const runtime = prepared();runtime.load({ ...runtime.save(), time: 237900 }, 237);
    runtime.sync([route()], [{ id: 8, amount: 240 }], [{ id: 11, amount: 240 }]);
    runtime.advance(100, empty);
    expect(runtime.report().previous[0].loaded).toBe(24);
    expect(runtime.report().inTransit).toBe(24);
    runtime.advance(1100, empty);
    expect(runtime.report().current[0].delivered).toBe(24);
    runtime.load(undefined, 240);
    expect(runtime.stock(8)).toBe(0);
    expect(runtime.report().inTransit).toBe(0);
  });
  it('rejects corrupted stock, overweight manifests and invalid paths before loading', () => {
    const runtime = prepared();runtime.advance(100, empty);
    const stock = runtime.save();stock.stocks[0][1] = NaN;
    expect(() => parseFreightRuntime(stock)).toThrow();
    const heavy = runtime.save();heavy.vehicles[0].cargo[0].amount = 25;
    expect(() => parseFreightRuntime(heavy)).toThrow();
    const path = runtime.save();path.vehicles[0].route.path[1].x = -1;
    expect(() => parseFreightRuntime(path)).toThrow();
  });
  it('advances with fractional clock progress and freezes when paused or hidden', () => {
    const engine = new SimulationEngine({ version: 1, seed: 42, tick: 0 });
    engine.city.shipments.load(prepared().save(), 0);
    engine.city.shipments.sync([route()], [{ id: 8, amount: 240 }], [{ id: 11, amount: 240 }]);
    const clock = new SimulationClock(engine);clock.speed = 0.25;
    clock.advance(400);
    expect(engine.getSnapshot().tick).toBe(0);
    expect(engine.city.shipments.frames()[0].along).toBeCloseTo(0.25);
    const before = engine.city.shipments.save();clock.speed = 0;clock.advance(1000);
    expect(engine.city.shipments.save()).toEqual(before);
    clock.speed = 1;clock.suspended = true;clock.advance(1000);
    expect(engine.city.shipments.save()).toEqual(before);
  });
});

it('loads v8 cities with empty stock and rejects a damaged new manifest atomically', () => {
  const engine = new SimulationEngine({ version: 1, seed: 7, tick: 0 });
  const old = engine.save();delete old.freightRuntime;old.schemaVersion = 8;
  engine.load(old);
  expect(engine.save().schemaVersion).toBe(SCHEMA_VERSION);
  expect(engine.city.shipments.report().inTransit).toBe(0);
  const before = engine.save();
  expect(() => engine.load({ ...before, freightRuntime: { ...before.freightRuntime, stocks: [[1, -1]] } })).toThrow('存檔物流資料損壞');
  expect(engine.save()).toEqual(before);
});

it('records signal waiting and releases a truck when the light turns green', () => {
  const runtime = prepared();
  runtime.advance(400, () => ({ load: 0, red: true }));
  expect(runtime.frames()[0].activity).toBe('red');
  expect(runtime.frames()[0].along).toBe(0);
  expect(runtime.stock(11)).toBe(0);
  expect(runtime.report().current[0].delayMs).toBe(400);
  runtime.advance(1200, empty);
  expect(runtime.report().current[0].delivered).toBe(24);
});

it('keeps shipment results independent of clock polling cadence at fractional and fast speeds', () => {
  for (const speed of [0.25, 4] as const) {
    const a = prepared(), b = prepared();
    a.advance(400 * speed, empty);
    for (let i = 0; i < 8; i++) b.advance(50 * speed, empty);
    expect(a.frames()[0].along).toBeCloseTo(b.frames()[0].along);
    expect(a.stock(8)).toBeCloseTo(b.stock(8));
    expect(a.stock(11)).toBeCloseTo(b.stock(11));
    expect(a.report().current[0].delivered).toBeCloseTo(b.report().current[0].delivered);
  }
});

it('rotates a shared automatic truck across eligible routes instead of starving later shops', () => {
  const runtime = prepared();
  const first = { ...route(), key: 'auto:8:11', lineId: undefined, vehicles: undefined };
  const second = { ...route(10), key: 'auto:8:10', lineId: undefined, vehicles: undefined, stops: [{ to: 10, index: 2 }] };
  runtime.sync([first, second], [{ id: 8, amount: 240 }], [{ id: 11, amount: 240 }, { id: 10, amount: 240 }]);
  runtime.advance(16000, empty);
  expect(runtime.report().current.find(record => record.key === first.key)?.delivered).toBeGreaterThan(0);
  expect(runtime.report().current.find(record => record.key === second.key)?.delivered).toBeGreaterThan(0);
});

it('delivers automatically at a shared entrance without a road truck and preserves its daily cooldown', () => {
  const runtime = prepared();
  const direct = { ...route(11, 1), key: 'auto:8:11', lineId: undefined, vehicles: undefined };
  runtime.sync([direct], [{ id: 8, amount: 240 }], [{ id: 11, amount: 240 }]);
  runtime.advance(100, empty);
  expect(runtime.frames()).toHaveLength(0);
  expect(runtime.report().current.find(m => m.key === direct.key)?.delivered).toBe(24);
  const restored = new FreightRuntime();restored.load(parseFreightRuntime(runtime.save()), 0);
  restored.sync([direct], [{ id: 8, amount: 240 }], [{ id: 11, amount: 240 }]);
  restored.advance(7000, empty);
  expect(restored.report().current.find(m => m.key === direct.key)?.departures).toBe(1);
});
