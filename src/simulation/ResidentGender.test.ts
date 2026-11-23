import { expect, it } from 'vitest';
import { createIdentity, identityAt, parseIdentity, YEAR_TICKS } from './ResidentIdentity';
import { legacyGender } from './ResidentGender';
import { genderForGeneratedName } from './Residents';
import { SimulationEngine } from './SimulationEngine';
import { residentAppearance } from '../rendering/residentAppearance';
import styles from '../assets/street/residents.json';

it('records gender when new residents are generated, with both categories and matching catalog names', () => {
  const people = Array.from({ length: 80 }, (_, id) => createIdentity(id, 42, 519, id, 0));
  expect(new Set(people.map(person => person.gender))).toEqual(new Set(['male', 'female']));
  for (const person of people) {
    expect(person.gender).toBe(genderForGeneratedName(person.name));
    expect(identityAt(person, YEAR_TICKS).gender).toBe(person.gender);
  }
});

it('migrates known generated names and unknown legacy names without guessing from arbitrary text', () => {
  expect(parseIdentity({ id: 5, name: '李美玲', born: -3000 })?.gender).toBe('female');
  expect(parseIdentity({ id: 5, name: '蔡信宏', born: -3000 })?.gender).toBe('male');
  for (const id of [0, 1, 42, 700]) {
    expect(parseIdentity({ id, name: '居民甲', born: 0 })?.gender).toBe(legacyGender(id));
  }
  expect(parseIdentity({ id: 5, name: '李美玲', born: -3000, gender: 'male' })?.gender).toBe('male');
  expect(() => parseIdentity({ id: 5, name: '居民甲', born: 0, gender: 'invalid' })).toThrow('存檔資料損壞');
});

it('uses the saved gender for the same map, portrait and rider profile at every age', () => {
  for (const gender of ['male', 'female'] as const) for (const age of [10, 30, 70]) {
    const profiles = Array.from({ length: 80 }, (_, id) => residentAppearance(42, id, age, gender));
    expect(new Set(profiles).size).toBe(4);
    expect(profiles.every(profile => styles.looks[profile % styles.variants].gender === gender)).toBe(true);
  }
});

it('keeps migrated gender and appearance when a resident moves, and rejects damaged data atomically', () => {
  const engine = new SimulationEngine({ version: 1, seed: 42, tick: 0 });
  engine.city.execute({ type: 'SET_ZONE', tiles: [{ x: 7, y: 4 }, { x: 7, y: 5 }], zone: 'residential' });
  const legacy = { ...engine.save(), schemaVersion: 11, buildings: [{ id: 519, capacity: 4, occupants: 1, nextSlot: 1,
    people: [{ slot: 0, job: -1, came: 0, hired: 0, identity: { id: 42, name: '李美玲', born: -30 * YEAR_TICKS } }] }] };
  engine.load(legacy);
  const look = engine.city.residentLook(519, 0)!;
  expect(look.gender).toBe('female');
  expect(engine.city.person(519, 0, 6)?.gender).toBe(look.gender);
  const save = engine.save();
  save.buildings[0].id = 647;
  engine.load(structuredClone(save));
  expect(engine.city.residentLook(647, 0)).toEqual(look);
  const before = structuredClone(engine.save());
  const damaged = structuredClone(before);
  (damaged.buildings[0].people![0].identity as unknown as { gender: string }).gender = 'invalid';
  expect(() => engine.load(damaged)).toThrow('存檔資料損壞');
  expect(engine.save()).toEqual(before);
});
