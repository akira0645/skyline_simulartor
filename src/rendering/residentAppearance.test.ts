import { expect, it } from 'vitest';
import { residentAppearance, residentSprite } from './residentAppearance';
import residents from '../assets/street/residents.json';

it('keeps the same identity appearance across reloads, display order and adult birthdays', () => {
  const original = residentAppearance(42, 123, 32);
  const identities = [700, 1, 123, 42].map(id => residentAppearance(42, id, 32));
  expect(identities[2]).toBe(original);
  expect(residentAppearance(42, 123, 33)).toBe(original);
});

it('retains the personal variant while choosing the age silhouette', () => {
  const child = residentAppearance(42, 123, 10), adult = residentAppearance(42, 123, 32), elder = residentAppearance(42, 123, 70);
  expect(adult - child).toBe(residents.variants);
  expect(elder - adult).toBe(residents.variants);
  expect(new Set(Array.from({ length: 500 }, (_, id) => residentAppearance(42, id, 30))).size).toBe(residents.variants);
});

it('packs every direction and walking pose within one small atlas without frame collisions', () => {
  const positions = new Set<string>();
  for (let profile = 0; profile < 24; profile++) for (let direction = 0; direction < 4; direction++) for (let phase = 0; phase < 7; phase++) {
    const frame = residentSprite(profile, direction, phase);
    expect(frame.x + frame.width).toBeLessThanOrEqual(3072);
    expect(frame.y + frame.height).toBeLessThanOrEqual(336);
    positions.add(`${frame.x}:${frame.y}`);
  }
  expect(positions.size).toBe(24 * 4 * 7);
});
