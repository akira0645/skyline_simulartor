import { expect, it } from 'vitest';
import { acceptOutingForDisplay } from './outingDisplay';

it('keeps a bicycle visible even when motor trips occur first in the simulation list', () => {
  const shown: number[] = [];
  for (const vehicle of [1, 2, 3, 4, 1, 2, 3, 0, 0, 2]) {
    if (acceptOutingForDisplay(vehicle, shown.length, shown.filter(tier => tier !== 0).length, 6)) shown.push(vehicle);
  }
  expect(shown).toEqual([1, 2, 3, 4, 1, 0]);
});

it('keeps the same cap for all-bicycle traffic and does not create a bicycle if none exists', () => {
  const select = (candidates: number[]) => {
    const shown: number[] = [];
    for (const tier of candidates) if (acceptOutingForDisplay(tier, shown.length, shown.filter(v => v !== 0).length, 6)) shown.push(tier);
    return shown;
  };
  expect(select(Array(20).fill(0))).toHaveLength(6);
  expect(select(Array(20).fill(2))).toEqual(Array(5).fill(2));
});
