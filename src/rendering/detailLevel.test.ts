import { expect, it } from 'vitest';
import { DETAIL_ZOOM, terrainResolution } from './detailLevel';

it('preserves half-world-pixel building features in the cache once close-up art is visible', () => {
  for (const zoom of [DETAIL_ZOOM, 2, 3]) expect(terrainResolution(zoom) * 0.5).toBeGreaterThanOrEqual(1);
  expect(terrainResolution(DETAIL_ZOOM - 0.001)).toBe(1);
});

it('keeps the existing cheaper cache sizes for the wider city views', () => {
  expect(terrainResolution(1)).toBe(1);
  expect(terrainResolution(0.85)).toBe(0.5);
  expect(terrainResolution(0.5)).toBe(0.5);
  expect(terrainResolution(0.49)).toBe(0.25);
  expect(terrainResolution(0.25)).toBe(0.25);
});

it('preserves quarter-world-pixel actor art and small details at 3x through 6x', () => {
  expect(terrainResolution(2.99)).toBe(2);
  expect(terrainResolution(3)).toBe(4);
  expect(terrainResolution(6)).toBe(4);
});
