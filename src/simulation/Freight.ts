import { MAP_SIZE, type Cell } from './TileMap';

export const freight = { load: 24 };
export interface FreightRoute {
  from: number;
  to: number;
  goods: number;
  /** Monthly runs, carrying at most `freight.load` goods each. */
  trucks: number;
  path: Cell[];
  minutes: number;
}

/** Allocate finite factory output to shops, nearest supplier first; unreachable goods stay put. */
export function planFreight(sources: readonly { id: number; amount: number }[],
  shops: readonly { id: number; amount: number }[],
  route: (from: number, to: number) => Cell[] | undefined): FreightRoute[] {
  const left = new Map(sources.map(source => [source.id, source.amount]));
  const result: FreightRoute[] = [];
  const distance = (a: number, b: number) => Math.abs(a % MAP_SIZE - b % MAP_SIZE) +
    Math.abs(Math.floor(a / MAP_SIZE) - Math.floor(b / MAP_SIZE));
  for (const shop of [...shops].sort((a, b) => a.id - b.id)) {
    let needed = shop.amount;
    const nearby = sources.filter(source => left.get(source.id)! > 0)
      .sort((a, b) => distance(a.id, shop.id) - distance(b.id, shop.id) || a.id - b.id);
    for (const source of nearby) {
      if (needed <= 0) break;
      const path = route(source.id, shop.id);
      if (!path?.length) continue;
      const amount = Math.min(needed, left.get(source.id)!);
      result.push({ from: source.id, to: shop.id, goods: amount, trucks: Math.ceil(amount / freight.load), path, minutes: 0 });
      left.set(source.id, left.get(source.id)! - amount);
      needed -= amount;
    }
  }
  return result;
}
