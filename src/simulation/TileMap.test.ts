import { describe, expect, it } from 'vitest';
import { TileMap } from './TileMap';

describe('TileMap', () => {
  it('builds and demolishes a road', () => {
    const map = new TileMap();
    const cell = { x: 1, y: 2 };
    expect(map.execute({ type: 'BUILD_ROAD', path: [cell] }).changed).toEqual([cell]);
    expect(map.get(cell)).toBe('road');
    map.execute({ type: 'DEMOLISH', ...cell });
    expect(map.get(cell)).toBe('grass');
  });

  it('rejects a zoning selection that overlaps a road atomically', () => {
    const map = new TileMap();
    const grass = { x: 2, y: 3 };
    const road = { x: 3, y: 3 };
    map.execute({ type: 'BUILD_ROAD', path: [road] });
    expect(map.execute({ type: 'SET_ZONE', tiles: [grass, road], zone: 'residential' }).error).toBeDefined();
    expect(map.get(grass)).toBe('grass');
    expect(map.get(road)).toBe('road');
    expect(map.execute({ type: 'SET_ZONE', tiles: [grass], zone: 'residential' }).changed).toEqual([grass]);
    expect(map.get(grass)).toBe('residential');
  });

  it('does not wrap coordinates across rows', () => {
    const map = new TileMap();
    const result = map.execute({ type: 'BUILD_ROAD', path: [{ x: 128, y: 0 }] });
    expect(result.error).toBeDefined();
    expect(map.get({ x: 0, y: 1 })).toBe('grass');
  });
});
