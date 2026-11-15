import { expect, it } from 'vitest';
import { Relationships, MAX_CONTACTS } from './Relationships';
import { SimulationEngine } from './SimulationEngine';

it('builds symmetric friendships from repeated meetings, once per day', () => {
  const graph = new Relationships();
  const group = new Map([[1, [1, 2]]]);
  graph.meet(group, 0);
  graph.meet(group, 0);
  expect(graph.contacts(1)[0]).toMatchObject({ id: 2, familiarity: 5 });
  for (let day = 1; day < 5; day++) graph.meet(group, day);
  expect(graph.contacts(2)[0]).toMatchObject({ id: 1, label: '朋友', familiarity: 25 });
  const restored = new Relationships();
  restored.load(graph.save());
  expect(restored.contacts(1)).toEqual(graph.contacts(1));
  restored.retain(new Set([1]));
  expect(restored.contacts(1)).toEqual([]);
});
it('bounds contacts in a large gathering', () => {
  const graph = new Relationships();
  for (let day = 0; day < 50; day++) graph.meet(new Map([[1, Array.from({ length: 100 }, (_, id) => id)]]), day);
  expect(graph.save().length).toBeLessThanOrEqual(100 * MAX_CONTACTS / 2);
  for (let id = 0; id < 100; id++) expect(graph.contacts(id).length).toBeLessThanOrEqual(MAX_CONTACTS);
});
it('preserves names, ages, identity and contacts when a resident moves and reloads', () => {
  const engine = new SimulationEngine({ version: 1, seed: 42, tick: 0 });
  const { city } = engine;
  const homes = [{ x: 3, y: 4 }, { x: 5, y: 4 }];
  city.execute({ type: 'BUILD_ROAD', path: [{ x: 3, y: 5 }, { x: 4, y: 5 }, { x: 5, y: 5 }] });
  city.execute({ type: 'SET_ZONE', tiles: homes, zone: 'residential' });
  engine.load({ ...engine.save(), buildings: homes.map(({ x, y }) => ({ id: y * 128 + x, capacity: 12, occupants: 2 })) });
  const before = city.inspect(homes[0])!.residents![0];
  const neighbour = city.inspect(homes[1])!.residents![0];
  city.relationships.meet(new Map([[1, [before.id!, neighbour.id!]]]), 0);
  expect(city.relocateResident(before.homeId, before.slot, neighbour.homeId)).toBe(true);
  const moved = city.inspect(homes[1])!.residents!.find(person => person.id === before.id)!;
  expect(moved).toMatchObject({ name: before.name, age: before.age, trait: before.trait });
  const saved = structuredClone(engine.save());
  engine.load(saved);
  expect(city.person(moved.homeId, moved.slot, 12)!.contacts[0]).toMatchObject({ name: neighbour.name });
  expect(engine.save()).toEqual(saved);
});
