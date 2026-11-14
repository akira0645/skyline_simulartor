import type { Cell } from './TileMap';

export const industryNames = {
  food: '食品加工廠',
  metal: '金屬加工廠',
  warehouse: '物流倉庫',
} as const;

export function industryAt({ x, y }: Cell): keyof typeof industryNames {
  const hash = (Math.imul(x, 73856093) ^ Math.imul(y, 19349663)) >>> 0;
  const kinds = ['food', 'metal', 'warehouse'] as const;
  return kinds[hash % kinds.length];
}
