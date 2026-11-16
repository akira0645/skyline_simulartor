import { expect, it } from 'vitest';
import { planFreightLines, parseFreightLines } from './FreightLines';
import { summarizeFreight } from './Freight';
import { SimulationEngine } from './SimulationEngine';
import { MAP_SIZE, type Cell } from './TileMap';

const source = [{ id: 1, amount: 1000 }];
const shops = [{ id: 2, amount: 500 }, { id: 3, amount: 500 }];
const kind = (id: number) => id === 1 ? 'factory' as const : 'shop' as const;
const road = (from: number, to: number) => [{ x: from, y: 1 }, { x: to, y: 1 }];

it('delivers to ordered stops with one finite load budget shared across lines', () => {
  const planned = planFreightLines([{ id: 1, stops: [1, 2, 3], vehicles: 1 }, { id: 2, stops: [1, 3], vehicles: 1 }], source, shops, kind, road, () => 20);
  expect(planned.lines[0]).toMatchObject({ active: true, capacity: 720, assigned: 720, trips: 30 });
  expect(planned.routes[0].deliveries).toEqual([{ to: 2, goods: 500 }, { to: 3, goods: 220 }]);
  expect(planned.lines[1].assigned).toBe(280);
  const report = summarizeFreight(source, shops, planned.routes, () => true);
  expect(report).toMatchObject({ supply: 1000, planned: 1000, missing: 0 });
  expect(report.destinations.map(shop => shop.allocated)).toEqual([500, 500]);
});

it('changes capacity with vehicle count, waits while paused, and loses throughput on long journeys', () => {
  const build = (vehicles: number, minutes = 20) => planFreightLines([{ id: 1, stops: [1, 2], vehicles }],
    [{ id: 1, amount: 5000 }], [{ id: 2, amount: 5000 }], kind, road, () => minutes);
  expect(build(2).lines[0].capacity).toBe(1440);
  expect(build(0).lines[0]).toMatchObject({ active: false, problem: 'paused', assigned: 0 });
  expect(build(0).routes).toEqual([]);
  expect(build(1, 1000).lines[0].capacity).toBeLessThan(build(1).lines[0].capacity);
});

it('keeps invalid or disconnected lines repairable and does not invent automatic deliveries', () => {
  const build = (stops: number[], path: (from: number, to: number) => readonly Cell[] | undefined = road) => planFreightLines([{ id: 1, stops, vehicles: 1 }], source, shops, kind, path, () => 20);
  expect(build([]).lines[0].problem).toBe('need-stops');
  expect(build([2, 3]).lines[0].problem).toBe('no-factory');
  expect(build([1]).lines[0].problem).toBe('need-stops');
  const broken = build([1, 2], () => undefined);
  expect(broken.routes).toEqual([]);
  expect(broken.lines[0]).toMatchObject({ problem: 'no-road', path: [] });
});

it('rejects corrupt modes, duplicate stops, invalid ids and a fleet over the city limit', () => {
  const line = { id: 1, stops: [1, 2], vehicles: 1 };
  expect(parseFreightLines(undefined, undefined)).toEqual({ freightMode: 'auto', freightLines: [] });
  expect(parseFreightLines('manual', [line]).freightLines).toEqual([line]);
  for (const value of [[{ ...line, vehicles: -1 }], [{ ...line, vehicles: 9 }], [{ ...line, stops: [1, 1] }],
    [{ ...line, stops: [MAP_SIZE ** 2] }], [{ ...line, stops: Array(1) }], [line, line], Array(1),
    [{ ...line, vehicles: 5 }, { ...line, id: 2, vehicles: 4 }]]) expect(() => parseFreightLines('manual', value)).toThrow();
  expect(() => parseFreightLines('broken', [])).toThrow();
});

function town() {
  const engine = new SimulationEngine({ version: 1, seed: 7, tick: 0 });
  const { city } = engine;
  city.execute({ type: 'BUILD_ROAD', path: Array.from({ length: 12 }, (_, x) => ({ x: x + 1, y: 2 })) });
  const zones = [{ x: 1, zone: 'residential' as const }, { x: 4, zone: 'industrial' as const },
    { x: 9, zone: 'commercial' as const }, { x: 12, zone: 'commercial' as const }];
  for (const { x, zone } of zones) city.execute({ type: 'SET_ZONE', tiles: [{ x, y: 1 }], zone });
  engine.load({ ...engine.save(), buildings: zones.map(({ x, zone }) => ({ id: MAP_SIZE + x,
    capacity: zone === 'residential' ? 24 : 24, occupants: zone === 'residential' ? 24 : 0 })) });
  return engine;
}

it('edits, pauses, saves and restores a real manual line without overwriting on invalid load', () => {
  const engine = town(); const { city } = engine;
  expect(city.getFreightMode()).toBe('auto');
  const id = city.addFreightLine().id!;
  expect(city.getFreightMode()).toBe('manual');
  expect(city.getFreight()).toEqual([]);
  expect(city.toggleFreightStop(id, { x: 9, y: 1 }).error).toBeTruthy();
  expect(city.toggleFreightStop(id, { x: 4, y: 1 })).toEqual({ added: true });
  expect(city.toggleFreightStop(id, { x: 9, y: 1 })).toEqual({ added: true });
  expect(city.getFreightLines()[0].active).toBe(true);
  expect(city.getFreight()[0].lineId).toBe(id);
  city.setFreightVehicles(id, 0);
  expect(city.getFreight()).toEqual([]);
  expect(city.getFreightLines()[0].problem).toBe('paused');
  city.setFreightVehicles(id, 2);
  const saved = engine.save(); const restored = town();
  restored.load(structuredClone(saved));
  expect(restored.city.getFreightLines()).toEqual(city.getFreightLines());
  expect(restored.city.getLogistics()).toEqual(city.getLogistics());
  expect(() => restored.load({ ...saved, freightLines: [{ id: 1, stops: [1, 1], vehicles: 9 }] })).toThrow();
  expect(restored.save()).toEqual(saved);
  city.setFreightMode('auto');
  expect(city.getFreight().every(route => route.lineId === undefined)).toBe(true);
  city.setFreightMode('manual');
  expect(city.getFreightLines()[0].vehicles).toBe(2);
  city.execute({ type: 'DEMOLISH', x: 6, y: 2 });
  expect(city.getFreight()).toEqual([]);
  expect(city.getFreightLines()[0].problem).toBe('no-road');
});

it('limits the whole fleet, reports unrouted shops, and migrates old saves to automatic freight', () => {
  const engine = town(); const { city } = engine;
  const first = city.addFreightLine().id!;
  expect(city.getLogistics().destinations.every(shop => shop.problem === 'unrouted')).toBe(true);
  city.setFreightVehicles(first, 8);
  const second = city.addFreightLine().id!;
  expect(city.getFreightLines().find(line => line.id === second)?.vehicles).toBe(0);
  expect(city.setFreightVehicles(second, 1).error).toBeTruthy();
  expect(city.getLogistics().vehicles).toBe(8);
  city.setFreightVehicles(first, 7);
  expect(city.setFreightVehicles(second, 1)).toEqual({});
  city.removeFreightLine(second);
  expect(city.getFreightLines().map(line => line.id)).toEqual([first]);
  const restored = town();
  restored.load({ ...engine.save(), schemaVersion: 7, freightMode: undefined, freightLines: undefined });
  expect(restored.city.getFreightMode()).toBe('auto');
  expect(restored.city.getFreightLines()).toEqual([]);
});
