import { expect, it } from 'vitest';
import { streetBuilding, personDirection, truckColourRow } from './streetAppearance';
import { lineColour } from '../app/lineColours';

it('maps representative building families without replacing landmarks or taller towers', () => {
  expect(streetBuilding(0, 2)).toBe('house');
  expect(streetBuilding(3, 2)).toBe('apartment');
  expect(streetBuilding(0, 3)).toBe('shop');
  expect(streetBuilding(2, 3)).toBe('office');
  expect(streetBuilding(0, 11)).toBe('factory');
  expect(streetBuilding(4, 5)).toBe('school');
  expect(streetBuilding(10, 5)).toBeUndefined();
  expect(streetBuilding(5, 2)).toBeUndefined();
});

it('keeps person direction and all eight existing route colours consistent with the game', () => {
  expect([0, Math.PI / 2, Math.PI, -Math.PI / 2].map(personDirection)).toEqual([0, 1, 2, 3]);
  expect(personDirection(Math.PI * 2)).toBe(0);
  for (let id = 1; id <= 8; id++) expect(truckColourRow(lineColour(id))).toBe(id - 1);
});
