import { expect, it } from 'vitest';
import { SimulationEngine } from './SimulationEngine';

function grownCity() {
  const engine = new SimulationEngine({ version: 1, seed: 7, tick: 0 });
  engine.city.execute({ type: 'BUILD_ROAD', path: [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 3, y: 1 }] });
  engine.city.execute({ type: 'SET_ZONE', tiles: [{ x: 3, y: 2 }, { x: 1, y: 2 }, { x: 9, y: 9 }], zone: 'residential' });
  engine.city.execute({ type: 'SET_ZONE', tiles: [{ x: 2, y: 0 }, { x: 2, y: 2 }], zone: 'industrial' });
  engine.advance(4);
  return engine;
}

it('restores a city that keeps growing exactly like the original', () => {
  const original = grownCity();
  const restored = new SimulationEngine({ version: 1, seed: 0, tick: 0 });
  // structuredClone stands in for the IndexedDB round trip.
  restored.load(structuredClone(original.save()));

  expect(restored.getSnapshot()).toEqual(original.getSnapshot());
  expect(restored.save()).toEqual(original.save());
  expect(restored.city.getStats().buildings).toBe(2);

  original.advance(20);
  restored.advance(20);
  expect(restored.save()).toEqual(original.save());
});

it('rejects incompatible or damaged saves without touching the city', () => {
  const engine = grownCity();
  const before = engine.save();
  const damaged: [string, unknown][] = [
    ['存檔資料損壞。', null],
    ['存檔資料損壞。', 'city'],
    ['存檔版本不相容。', { ...before, schemaVersion: 99 }],
    ['存檔資料損壞。', { ...before, tick: -1 }],
    ['存檔資料損壞。', { ...before, tiles: before.tiles.slice(1) }],
    ['存檔資料損壞。', { ...before, tiles: before.tiles.map(() => 200) }],
    ['存檔資料損壞。', { ...before, zones: before.zones.slice(1) }],
    ['存檔資料損壞。', { ...before, zones: [...before.zones, 0] }],
    ['存檔資料損壞。', { ...before, buildings: [0] }],
    ['存檔資料損壞。', { ...before, buildings: [before.buildings[0], before.buildings[0]] }],
  ];

  for (const [message, data] of damaged) expect(() => engine.load(data)).toThrow(message);
  expect(engine.save()).toEqual(before);
});
