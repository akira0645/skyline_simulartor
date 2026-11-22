import { expect, it } from 'vitest';
import { carDirection, carFrame, carHeading } from './carAppearance';

it('keeps the nose on the path in all four directions, diagonals and across the angle seam', () => {
  for (const [dx, dy, frame] of [[1, 0, 0], [1, 1, 2], [0, 1, 4], [-1, 1, 6],
    [-1, 0, 8], [-1, -1, 10], [0, -1, 12], [1, -1, 14]]) {
    expect(carDirection(carHeading(dx, dy))).toBe(frame);
  }
  expect(carDirection(-0.01)).toBe(0);
  expect(carDirection(2 * Math.PI + 0.01)).toBe(0);
  expect(carDirection(2 * Math.PI - 0.01)).toBe(0);
  expect(carDirection(-Math.PI / 8)).toBe(15);
  expect(carDirection(Number.NaN)).toBe(0);
  expect(carHeading(0, 0, Math.PI)).toBe(Math.PI);
  expect(carHeading(0, 0)).toBe(0);
});

it('preserves ordinary colours, New York taxi frequency and luxury colours for each size', () => {
  expect(Array.from({ length: 5 }, (_, index) => carFrame(2, index, 'classic', 0).row)).toEqual([0, 1, 2, 3, 4]);
  expect(Array.from({ length: 5 }, (_, index) => carFrame(2, index, 'newyork', 0).row)).toEqual([8, 8, 8, 3, 4]);
  expect(carFrame(3, 4, 'california', Math.PI)).toEqual({ column: 8, row: 13 });
  expect(Array.from({ length: 3 }, (_, index) => carFrame(4, index, 'newyork', 0).row)).toEqual([23, 24, 25]);
  expect(() => carFrame(1, 0, 'classic', 0)).toThrow('Not an automobile');
});
