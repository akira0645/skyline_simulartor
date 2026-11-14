import { expect, it } from 'vitest';
import { demoCity, eastBank } from '../app/demoCity';
import { calendar } from './calendar';
import { combos, taskList } from './Combos';
import { goods } from './Goods';
import { SimulationEngine } from './SimulationEngine';
import type { Cell } from './TileMap';

const block = (fromX: number, toX: number, fromY: number, toY: number): Cell[] => {
  const cells: Cell[] = [];
  for (let y = fromY; y <= toY; y++) for (let x = fromX; x <= toX; x++) cells.push({ x, y });
  return cells;
};

it('turns enough park into a forest, and remembers it in the handbook when it is gone', () => {
  const engine = new SimulationEngine({ version: 1, seed: 3, tick: 0 });
  const { city } = engine;
  city.execute({ type: 'BUILD_PARK', tiles: block(10, 13, 10, 12) });
  expect(city.getStats().combos.forest).toBe(1);
  expect(city.inspect({ x: 11, y: 11 })).toMatchObject({ combo: 'forest' });
  expect(city.find({ combo: 'forest' })).toHaveLength(combos.forest.tiles);
  // A lot beside it is worth more, and a home there is a cabin.
  city.execute({ type: 'SET_ZONE', tiles: [{ x: 14, y: 10 }, { x: 30, y: 10 }], zone: 'residential' });
  expect(city.nickAt({ x: 14, y: 10 })).toBe('cabin');
  expect(city.nickAt({ x: 30, y: 10 })).toBeUndefined();
  // One tile fewer is only a big park again, but the handbook keeps the entry, also in a save.
  city.execute({ type: 'DEMOLISH', x: 10, y: 10 });
  expect(city.getStats()).toMatchObject({ combos: { forest: 0 }, combosSeen: ['forest'] });
  const restored = new SimulationEngine({ version: 1, seed: 0, tick: 0 });
  restored.load(structuredClone(engine.save()));
  expect(restored.city.getStats().combosSeen).toEqual(['forest']);
});

it('makes a farmstead of a large field by the water, which grows half as much again', () => {
  const engine = new SimulationEngine({ version: 1, seed: 3, tick: 0 });
  const { city } = engine;
  city.map.flood([{ x: 10, y: 10 }]);
  city.execute({ type: 'BUILD_FARM', tiles: block(11, 15, 10, 10) });
  // Five tiles, three of them watered: not yet a farmstead.
  expect(city.getStats().goods.farmed).toBe(3 * goods.farm.watered + 2 * goods.farm.dry);
  city.execute({ type: 'BUILD_FARM', tiles: [{ x: 16, y: 10 }] });
  expect(city.getStats().combos.farmstead).toBe(1);
  expect(city.getStats().goods.farmed).toBe((3 * goods.farm.watered + 3 * goods.farm.dry) * combos.farmstead.times);
  expect(block(11, 16, 10, 10).filter(cell => city.barnAt(cell))).toHaveLength(1);
});

it('has a temple fair in the demo town, and gives out tasks that pay when they are done', () => {
  const engine = new SimulationEngine({ version: 1, seed: 42, tick: 0 });
  demoCity(engine);
  const { city } = engine;
  const opening = city.getStats();
  expect(opening.combos.fair).toBe(1);
  expect(opening.combosSeen).toContain('fair');
  expect(opening.budget.visitors).toBeGreaterThan(0);
  // The far bank has no power, water or police, and people ask for them.
  const asked = opening.tasks.map(task => task.id);
  expect(asked.length).toBeGreaterThan(0);
  expect(asked.every(id => ['power', 'water', 'police', 'jobs', 'staff', 'school', 'clinic', 'air', 'commute'].includes(id))).toBe(true);
  expect(opening.tasks.every(task => task.left > 0)).toBe(true);
  expect(city.find({ issue: 'no-power' }).length).toBe(opening.complaints['no-power']);

  const { x, y } = eastBank;
  city.execute({ type: 'BUILD_FACILITY', x, y: y + 3, facility: 'power' });
  city.execute({ type: 'BUILD_FACILITY', x, y: y + 2, facility: 'water' });
  city.execute({ type: 'BUILD_SERVICE', x: x + 2, y: y + 3, service: 'police' });
  const before = city.getStats().funds;
  engine.advance(calendar.ticksPerDay);
  const after = city.getStats();
  const { taskDone } = city.getNotices();
  expect(taskDone).toBeDefined();
  expect(after.tasks.map(task => task.id)).not.toContain(taskDone!.id);
  expect(after.funds).toBeGreaterThan(before + taskList.find(task => task.id === taskDone!.id)!.reward - 200);
  // What is being worked on is saved.
  const restored = new SimulationEngine({ version: 1, seed: 0, tick: 0 });
  restored.load(structuredClone(engine.save()));
  expect(restored.city.getStats().tasks).toEqual(after.tasks);
});
