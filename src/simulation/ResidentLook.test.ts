import { expect, it } from 'vitest';
import { SimulationEngine } from './SimulationEngine';
import { YEAR_TICKS } from './ResidentIdentity';
import { residentAppearance } from '../rendering/residentAppearance';

it('gives the map and person card the same identity, including after moving and reloading', () => {
  const engine = new SimulationEngine({ version: 1, seed: 42, tick: 0 });
  engine.city.execute({ type: 'SET_ZONE', tiles: [{ x: 7, y: 4 }, { x: 7, y: 5 }], zone: 'residential' });
  engine.load({ ...engine.save(), buildings: [{ id: 519, capacity: 4, occupants: 1, nextSlot: 1,
    people: [{ slot: 0, job: -1, came: 0, hired: 0, identity: { id: 42, name: '居民甲', born: -30 * YEAR_TICKS } }] }] });
  const look = engine.city.residentLook(519, 0)!;
  const card = engine.city.person(519, 0, 6)!;
  expect(look).toEqual({ id: card.id, age: card.age, gender: card.gender });
  const profile = residentAppearance(engine.city.seed, look.id, look.age, look.gender);
  const save = engine.save();
  save.buildings = save.buildings.map(building => ({ ...building, id: 647 }));
  engine.load(structuredClone(save));
  const moved = engine.city.residentLook(647, 0)!;
  expect(moved).toEqual(look);
  expect(residentAppearance(engine.city.seed, moved.id, moved.age, moved.gender)).toBe(profile);
  expect(engine.city.residentLook(519, 0)).toBeUndefined();
});
