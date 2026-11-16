import { MAP_SIZE, type Cell } from './TileMap';

export const land = { size: 32, across: MAP_SIZE / 32, start: 5, basePrice: 2000, growth: 1.2 };
export const ALL_LAND = Array.from({ length: land.across ** 2 }, (_, id) => id);
export const parcelAt = ({ x, y }: Cell): number | undefined =>
  Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < MAP_SIZE && y < MAP_SIZE ?
    Math.floor(y / land.size) * land.across + Math.floor(x / land.size) : undefined;
export const parcelOrigin = (id: number): Cell => ({ x: id % land.across * land.size,
  y: Math.floor(id / land.across) * land.size });
export const parcelCentre = (id: number): Cell => {
  const cell = parcelOrigin(id);
  return { x: cell.x + land.size / 2, y: cell.y + land.size / 2 };
};
export function adjoining(id: number, owned: ReadonlySet<number>): boolean {
  return ALL_LAND.includes(id) && [...owned].some(other =>
    Math.abs(id % land.across - other % land.across) +
    Math.abs(Math.floor(id / land.across) - Math.floor(other / land.across)) === 1);
}
export const landPrice = (count: number, level: number) =>
  Math.round(land.basePrice * land.growth ** Math.max(0, count - 1) * level / 100) * 100;

export function parseLand(value: unknown): number[] {
  // Old saves and demo cities keep their existing unrestricted building rights.
  if (value === undefined) return [...ALL_LAND];
  if (!Array.isArray(value) || !value.length || value.length > ALL_LAND.length ||
      new Set(value).size !== value.length || !Array.from(value).every(id => Number.isInteger(id) && ALL_LAND.includes(id))) {
    throw new Error('存檔資料損壞。');
  }
  return [...value].sort((a, b) => a - b);
}
