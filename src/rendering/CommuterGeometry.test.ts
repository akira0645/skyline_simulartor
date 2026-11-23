import { expect, it } from 'vitest';
import { CommuterGeometry } from './CommuterGeometry';
import { commuterPosition } from './commuterPosition';
import { TILE_SIZE } from '../simulation/TileMap';

it('matches existing straight, corner, reversal and doorway positions on both lanes and sidewalks', () => {
  for (const path of [
    [{ x: 2, y: 2 }, { x: 3, y: 2 }, { x: 4, y: 2 }],
    [{ x: 2, y: 2 }, { x: 3, y: 2 }, { x: 3, y: 3 }, { x: 3, y: 4 }],
    [{ x: 2, y: 2 }, { x: 3, y: 2 }, { x: 2, y: 2 }, { x: 2, y: 3 }],
  ]) for (const mode of ['walk', 'drive'] as const) for (const returning of [false, true]) {
    const route = { homeId: 130, workId: 128 * 5 + 3, path };
    const geometry = new CommuterGeometry(route, mode, returning);
    for (let i = -1; i <= 1001; i++) {
      const progress = i / 1000;
      const old = commuterPosition(route, 0, mode, progress, returning)!;
      const point = geometry.at(progress * geometry.steps);
      expect(point.x).toBeCloseTo((old.x + 0.5) * TILE_SIZE, 10);
      expect(point.y).toBeCloseTo((old.y + 0.5) * TILE_SIZE, 10);
    }
    expect(geometry.matches(route, mode, returning)).toBe(true);
    expect(geometry.matches({ ...route, path: [...path] }, mode, returning)).toBe(false);
    expect(geometry.matches({ ...route, homeId: 131 }, mode, returning)).toBe(false);
    expect(geometry.matches(route, mode === 'walk' ? 'drive' : 'walk', returning)).toBe(false);
    expect(geometry.matches(route, mode, !returning)).toBe(false);
  }
});

it('invalidates changed endpoints even when the caller reuses the route object', () => {
  const route = { homeId: 130, workId: 133, path: [{ x: 3, y: 1 }] };
  const geometry = new CommuterGeometry(route, 'drive', false);
  route.workId = 134;
  expect(geometry.matches(route, 'drive', false)).toBe(false);
});
