import { travelTicks } from './VisitSystem';
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
  expect(block(10, 13, 10, 12).some(cell => city.parkAt(cell).fountain)).toBe(false);
  // A lot beside it is worth more, and a home there is a cabin.
  city.execute({ type: 'SET_ZONE', tiles: [{ x: 14, y: 10 }, { x: 30, y: 10 }], zone: 'residential' });
  expect(city.nickAt({ x: 14, y: 10 })).toBe('cabin');
  expect(city.nickAt({ x: 30, y: 10 })).toBeUndefined();
  // One tile fewer is only a big park again, but the handbook keeps the entry, also in a save.
  city.execute({ type: 'DEMOLISH', x: 10, y: 10 });
  expect(city.getStats()).toMatchObject({ combos: { forest: 0 }, combosSeen: ['forest'] });
  expect(block(10, 13, 10, 12).some(cell => city.parkAt(cell).fountain)).toBe(true);
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

it('forms Chinatown around connected homes and shops and remembers it after the road is cut', () => {
  const engine = new SimulationEngine({ version: 1, seed: 3, tick: 0 });
  const { city } = engine;
  engine.load({ ...engine.save(), rank: 1 });
  const temple = { x: 5, y: 4 };
  const homes = block(2, 4, 4, 4);
  const shops = [{ x: 6, y: 6 }, { x: 8, y: 6 }];
  city.execute({ type: 'BUILD_ROAD', path: block(2, 8, 5, 5) });
  expect(city.execute({ type: 'BUILD_SERVICE', ...temple, service: 'temple' }).error).toBeUndefined();
  city.execute({ type: 'SET_ZONE', tiles: homes, zone: 'residential' });
  city.execute({ type: 'SET_ZONE', tiles: shops, zone: 'commercial' });
  city.found([...homes, ...shops]);
  expect(city.getStats().combos.chinatown).toBe(1);
  expect(city.find({ combo: 'chinatown' })).toHaveLength(6);
  city.execute({ type: 'DEMOLISH', x: 6, y: 5 });
  expect(city.getStats().combos.chinatown).toBe(0);
  expect(city.getStats().combosSeen).toContain('chinatown');
});

it('sends residents to a reachable cultural centre and stops visits when the road is severed', () => {
  const engine = new SimulationEngine({ version: 1, seed: 3, tick: 0 });
  const { city } = engine;
  const home = { x: 3, y: 4 };
  const culturalCentre = { x: 6, y: 4 };
  city.execute({ type: 'BUILD_ROAD', path: block(3, 6, 5, 5) });
  city.execute({ type: 'SET_ZONE', tiles: [home], zone: 'residential' });
  expect(city.execute({ type: 'BUILD_SERVICE', ...culturalCentre, service: 'culture' }).error).toBeUndefined();
  city.found([home]);
  const planned = city.facilityVisits(13, () => true);
  expect(planned).toHaveLength(4);
  for (const trip of planned) expect(trip).toMatchObject(
    { doing: 'exhibition', path: [home, ...block(3, 6, 5, 5), culturalCentre] });
  expect(city.visitorsAt(culturalCentre, 13)).toEqual([]);
  city.visits.start(planned, 0);
  expect(city.visitorsAt(culturalCentre, 13)).toHaveLength(4);
  for (const visit of city.visitorsAt(culturalCentre)) expect(visit).toMatchObject({ doing: 'exhibition', name: expect.any(String) });
  engine.advance(Math.ceil(travelTicks(city.visits.save()[0].path)));
  expect(city.visitCountAt(culturalCentre)).toBe(4);
  const restored = new SimulationEngine({ version: 1, seed: 0, tick: 0 });
  restored.load(engine.save());
  expect(restored.city.visitCountAt(culturalCentre)).toBe(4);
  city.execute({ type: 'DEMOLISH', x: 5, y: 5 });
  expect(city.facilityVisits(13, () => true)).toEqual([]);
  expect(city.visitorsAt(culturalCentre, 13)).toEqual([]);
});
