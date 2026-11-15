import { SCHEMA_VERSION } from './SaveData';
import { taskList } from './Combos';
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

it('preserves neighbourhood scares and task cooldowns and rejects invalid visits atomically', () => {
  const engine = grownCity();
  const scares = [{ id: 259, until: 240 }];
  const tasksRest = [[taskList[0].id, 30]];
  engine.load({ ...engine.save(), scares, tasksRest });
  expect(engine.save()).toMatchObject({ scares, tasksRest });
  const before = structuredClone(engine.save());
  expect(() => engine.load({ ...before, activeVisits: [{ home: 1, slot: 0, path: [] }] })).toThrow('存檔資料損壞');
  expect(engine.save()).toEqual(before);
});

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

it('migrates a legacy city while preserving its full homes and employment', () => {
  const engine = grownCity();
  const save = engine.save();
  engine.load({ ...save, schemaVersion: 1, buildings: save.buildings.map(b => b.id) });
  const migrated = engine.save();
  expect(migrated.schemaVersion).toBe(SCHEMA_VERSION);
  const stats = engine.city.getStats();
  const homes = migrated.buildings.filter(b => migrated.tiles[b.id] === 2);
  expect(stats.population).toBe(homes.length * 4);
  expect(stats.employed).toBe(Math.min(stats.population, stats.jobs));
});
