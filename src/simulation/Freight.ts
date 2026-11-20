import type { FreightLine, FreightMode } from './FreightLines';
import { calendar } from './calendar';
import { MAP_SIZE, type Cell } from './TileMap';

export const freight = { load: 24, maxVehicles: 8 };
export interface FreightRoute {
  lineId?: number;
  vehicles?: number;
  deliveries?: { to: number; goods: number }[];
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

export interface FreightSite { id: number; amount: number }
export type FreightProblem = 'no-source' | 'disconnected' | 'shortage' | 'unrouted' | 'no-vehicles' | 'manual-limit';

/** A small shared representative fleet, sized by average daily trips rather than monthly routes. */
export function freightFleetSize(routes: readonly FreightRoute[]): number {
  if (routes.some(route => route.lineId !== undefined)) return routes.reduce((sum, route) => sum + (route.path.length > 1 ? route.vehicles ?? 0 : 0), 0);
  const trips = routes.reduce((sum, route) => sum + (route.path.length > 1 ? route.trucks : 0), 0);
  return Math.min(freight.maxVehicles, Math.ceil(trips / calendar.daysPerMonth));
}

/** Rotate assignments after a full round trip, weighted by each route's monthly runs. */
export function freightAssignment(routes: readonly FreightRoute[], slot: number, round: number): FreightRoute | undefined {
  const moving = routes.filter(route => route.path.length > 1);
  const total = moving.reduce((sum, route) => sum + route.trucks, 0);
  if (!total) return undefined;
  let pick = (slot + round * freightFleetSize(routes)) % total;
  for (const route of moving) {
    if (pick < route.trucks) return route;
    pick -= route.trucks;
  }
}

/** This reports planned shipments, not inventory or completed deliveries. */
export function summarizeFreight(sources: readonly FreightSite[], shops: readonly FreightSite[],
  routes: readonly FreightRoute[], connected: (shop: number) => boolean) {
  const assigned = new Map<number, number>();
  for (const route of routes) for (const delivery of route.deliveries ?? [{ to: route.to, goods: route.goods }]) {
    assigned.set(delivery.to, (assigned.get(delivery.to) ?? 0) + delivery.goods);
  }
  const supply = sources.reduce((sum, source) => sum + source.amount, 0);
  const demand = shops.reduce((sum, shop) => sum + shop.amount, 0);
  const shopIds = new Set(shops.map(shop => shop.id));
  const planned = [...assigned].reduce((sum, [id, amount]) => sum + (shopIds.has(id) ? amount : 0), 0);
  const sourceIds = new Set(sources.map(source => source.id));
  const dispatched = routes.reduce((sum, route) => sum + (sourceIds.has(route.from) ? route.goods : 0), 0);
  const handled = routes.reduce((sum, route) => sum + route.goods, 0);
  const destinations = shops.map<{ id: number; demand: number; allocated: number; missing: number; problem?: FreightProblem }>(shop => {
    const allocated = assigned.get(shop.id) ?? 0;
    const missing = Math.max(0, shop.amount - allocated);
    const problem: FreightProblem | undefined = !missing ? undefined : !sources.length ? 'no-source' :
      !connected(shop.id) ? 'disconnected' : 'shortage';
    return { id: shop.id, demand: shop.amount, allocated, missing, problem };
  });
  return { factories: sources.length, shops: shops.length, supply, demand, planned, handled,
    unused: Math.max(0, supply - dispatched), missing: Math.max(0, demand - planned),
    trips: routes.reduce((sum, route) => sum + route.trucks, 0), fleet: freightFleetSize(routes),
    routes, destinations };
}

export type FreightReport = ReturnType<typeof summarizeFreight> & { mode: FreightMode; lines: readonly FreightLine[]; vehicles: number; operations: ReturnType<import('./FreightRuntime').FreightRuntime['report']> };
