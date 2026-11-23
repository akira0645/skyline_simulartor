import { expect, it } from 'vitest';
import { SimulationEngine } from './SimulationEngine';
import { SimulationClock } from './SimulationClock';
import { YEAR_TICKS } from './ResidentIdentity';
import { MOTION_SCALE } from './TravelTiming';
import { FreightRuntime, parseFreightRuntime, type ShippingRoute } from './FreightRuntime';

function walkingVisit() {
  const engine = new SimulationEngine({ version: 1, seed: 42, tick: 0 });
  engine.load({ ...engine.save(), rank: 5, funds: 100000 });
  engine.city.execute({ type: 'BUILD_ROAD', path: [{ x: 6, y: 4 }, { x: 5, y: 4 }] });
  engine.city.execute({ type: 'SET_ZONE', tiles: [{ x: 7, y: 4 }], zone: 'residential' });
  expect(engine.city.execute({ type: 'BUILD_SERVICE', x: 4, y: 4, service: 'library' }).error).toBeUndefined();
  engine.load({ ...engine.save(), buildings: [{ id: 519, capacity: 4, occupants: 1, nextSlot: 1,
    people: [{ slot: 0, job: -1, came: 0, hired: 0, identity: { id: 42, name: '居民甲', born: -30 * YEAR_TICKS } }] }] });
  engine.city.visits.start([{ home: 519, slot: 0, destination: 516, doing: 'reading', legs: 3,
    path: [{ x: 7, y: 4 }, { x: 6, y: 4 }, { x: 5, y: 4 }, { x: 4, y: 4 }] }], 0);
  return engine;
}

it('shows arrival, use and the return walk continuously before the first core tick', () => {
  const engine = walkingVisit(), clock = new SimulationClock(engine);
  clock.advance(3700);
  expect(engine.getSnapshot().tick).toBe(0);
  expect(engine.city.visits.frames(engine.city.visitTime)[0]).toMatchObject({ arrived: true, returning: false });
  expect(engine.save().monthlyVisits).toEqual([[516, 1]]);
  clock.advance(8300);
  const frame = engine.city.visits.frames(engine.city.visitTime)[0];
  expect(frame.returning).toBe(true);
  expect(frame.progress).toBeCloseTo(0.25);
  expect(engine.city.person(519, 0, 2.4)?.journey?.phase).toBe('回程');
  expect(engine.getSnapshot().tick).toBe(0);

  const loaded = new SimulationEngine({ version: 1, seed: 0, tick: 0 });
  loaded.load(structuredClone(engine.save()));
  const resumed = new SimulationClock(loaded);
  expect(resumed.tickProgress).toBeCloseTo(0.8);
  expect(loaded.city.visits.frames(loaded.city.visitTime)).toEqual(engine.city.visits.frames(engine.city.visitTime));
  clock.advance(1000); resumed.advance(1000);
  expect(loaded.save()).toEqual(engine.save());
  const before = structuredClone(loaded.save());
  expect(() => loaded.load({ ...before, visitsAt: 2 })).toThrow('存檔資料損壞');
  expect(loaded.save()).toEqual(before);
});

it('migrates a v10 city without changing identity or replaying a partial tick', () => {
  const engine = walkingVisit(), old = engine.save();
  old.schemaVersion = 10;
  delete old.visitsAt;
  delete old.freightRuntime!.motionScale;
  engine.load(old);
  expect(engine.city.residentLook(519, 0)?.id).toBe(42);
  expect(new SimulationClock(engine).tickProgress).toBe(0);
  expect(engine.city.shipments.save().motionScale).toBe(MOTION_SCALE);
});

it('restores partial live time in legacy demo cities whose freight clock began years later', () => {
  const engine = new SimulationEngine({ version: 1, seed: 42, tick: 0 });
  const old = engine.save();
  old.schemaVersion = 10; old.tick = 8640;
  delete old.visitsAt; delete old.freightRuntime!.motionScale;
  engine.load(old);
  const clock = new SimulationClock(engine);
  clock.advance(6000);
  expect(clock.tickProgress).toBeCloseTo(0.4);
  const save = structuredClone(engine.save());
  engine.load(save);
  const restored = new SimulationClock(engine);
  expect(restored.tickProgress).toBeCloseTo(0.4);
  restored.advance(9000);
  expect(engine.getSnapshot().tick).toBe(8641);
  expect(restored.tickProgress).toBeCloseTo(0);
});

const route: ShippingRoute = { key: 'manual:1', lineId: 1, vehicles: 1, from: 8, to: 17,
  goods: 240, trucks: 10, minutes: 8,
  path: Array.from({ length: 10 }, (_, x) => ({ x: x + 8, y: 1 })), stops: [{ to: 17, index: 9 }] };

it('moves freight on the visible movement clock while keeping production on calendar time', () => {
  const runtime = new FreightRuntime(MOTION_SCALE);
  runtime.load({ time: 0, stocks: [[8, 24]], vehicles: [], current: [], previous: [] }, 0);
  runtime.sync([route], [{ id: 8, amount: 240 }], [{ id: 17, amount: 240 }]);
  runtime.advance(100, () => 0);
  expect(runtime.elapsedMotionMs).toBeCloseTo(1500);
  expect(runtime.stock(8)).toBeCloseTo(0.1);
  expect(runtime.stock(17)).toBe(0);
  expect(runtime.frames()[0].along).toBeGreaterThan(2);
  expect(runtime.frames()[0].along).toBeLessThan(4);
  const save = parseFreightRuntime(runtime.save())!;
  const loaded = new FreightRuntime(MOTION_SCALE);
  loaded.load(save, 0);
  loaded.sync([route], [{ id: 8, amount: 240 }], [{ id: 17, amount: 240 }]);
  runtime.advance(400, () => 0); loaded.advance(400, () => 0);
  expect(loaded.save()).toEqual(runtime.save());
  expect(runtime.report().current[0].delivered).toBe(24);
  expect(runtime.stock(8)).toBeCloseTo(0.5);
  // No vehicles: changing physical speed must not multiply factory production or shop consumption.
  const baseline = new FreightRuntime(), slowClock = new FreightRuntime(MOTION_SCALE);
  for (const fleet of [baseline, slowClock]) {
    fleet.load({ time: 0, stocks: [[8, 0], [17, 240]], vehicles: [], current: [], previous: [] }, 0);
    fleet.sync([], [{ id: 8, amount: 240 }], [{ id: 17, amount: 240 }]);
    fleet.advance(8000, () => 0);
  }
  expect(slowClock.stock(8)).toBeCloseTo(baseline.stock(8));
  expect(slowClock.stock(17)).toBeCloseTo(baseline.stock(17));
});

it('converts legacy junction request timestamps when loading onto the new movement clock', () => {
  const legacy = new FreightRuntime();
  legacy.load({ time: 0, stocks: [[8, 24]], vehicles: [], current: [], previous: [] }, 0);
  legacy.sync([route], [{ id: 8, amount: 240 }], [{ id: 17, amount: 240 }]);
  legacy.advance(1200, () => 0, { isJunction: cell => cell.x === 10, green: () => false });
  const save = parseFreightRuntime(legacy.save())!;
  expect(save.junctionFlow!.requests.length).toBeGreaterThan(0);
  const oldRequests = structuredClone(save.junctionFlow!.requests);
  delete save.motionScale;
  const loaded = new FreightRuntime(MOTION_SCALE);
  loaded.load(save, 0);
  const restored = loaded.save().junctionFlow!.requests;
  expect(restored.map(([actor, request]) => [actor, request.first, request.seen])).toEqual(
    oldRequests.map(([actor, request]) => [actor, request.first * MOTION_SCALE, request.seen * MOTION_SCALE]));
  expect(save.junctionFlow!.requests).toEqual(oldRequests);
  expect(() => parseFreightRuntime(loaded.save())).not.toThrow();
});

it('keeps slow-clock freight independent of frame cadence, including month rollover', () => {
  const create = () => {
    const fleet = new FreightRuntime(MOTION_SCALE);
    fleet.load({ time: 237000, stocks: [[8, 24]], vehicles: [], current: [], previous: [] }, 237);
    fleet.sync([route], [{ id: 8, amount: 240 }], [{ id: 17, amount: 240 }]);
    return fleet;
  };
  const whole = create(), frames = create();
  whole.advance(2000, () => 0);
  for (let at = 0; at < 2000; at += 25) frames.advance(25, () => 0);
  expect(frames.save()).toEqual(whole.save());
  expect(whole.elapsedMs).toBeCloseTo(239000);
  expect(whole.save().previous[0].delivered).toBe(24);
});
