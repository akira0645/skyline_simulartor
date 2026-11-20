import { calendar } from './calendar';
import { freight, type FreightRoute, type FreightSite } from './Freight';
import { MAP_SIZE, type Cell } from './TileMap';

export type FreightMode = 'auto' | 'manual';
export interface SavedFreightLine { id: number; stops: number[]; vehicles: number }
export const freightLines = { maxLines: 8, maxStops: 16, dailyMinutes: 480, dwell: 5 };
export type FreightLineProblem = 'need-stops' | 'no-factory' | 'no-shop' | 'no-road' | 'paused' | 'no-supply' | 'no-demand' | 'capacity' | 'waiting-stock';
export interface FreightLine extends SavedFreightLine {
  path: Cell[];
  minutes: number;
  capacity: number;
  assigned: number;
  trips: number;
  active: boolean;
  problem?: FreightLineProblem;
}

/** Validate settings before a load can replace the current city. Removed buildings may leave a repairable line. */
export function parseFreightLines(mode: unknown, value: unknown): { freightMode: FreightMode; freightLines: SavedFreightLine[] } {
  if (mode !== undefined && mode !== 'auto' && mode !== 'manual') throw new Error('存檔資料損壞。');
  if (value === undefined) return { freightMode: mode ?? 'auto', freightLines: [] };
  if (!Array.isArray(value) || value.length > freightLines.maxLines) throw new Error('存檔資料損壞。');
  const ids = new Set<number>();
  let vehicles = 0;
  const lines = Array.from(value).map(entry => {
    if (!entry || !Number.isSafeInteger(entry.id) || entry.id < 1 || entry.id >= 1e9 || ids.has(entry.id) ||
        !Number.isInteger(entry.vehicles) || entry.vehicles < 0 || entry.vehicles > freight.maxVehicles ||
        !Array.isArray(entry.stops) || entry.stops.length > freightLines.maxStops ||
        new Set(entry.stops).size !== entry.stops.length || !Array.from(entry.stops).every(id =>
          typeof id === 'number' && Number.isInteger(id) && id >= 0 && id < MAP_SIZE ** 2)) throw new Error('存檔資料損壞。');
    ids.add(entry.id);
    vehicles += entry.vehicles;
    return { id: entry.id as number, stops: [...entry.stops] as number[], vehicles: entry.vehicles as number };
  });
  if (vehicles > freight.maxVehicles) throw new Error('存檔資料損壞。');
  return { freightMode: mode ?? 'auto', freightLines: lines };
}

/** Assign finite factory output to the player's ordered delivery stops, sharing supply across lines. */
export function planFreightLines(saved: readonly SavedFreightLine[], sources: readonly FreightSite[], shops: readonly FreightSite[],
  kind: (id: number) => 'factory' | 'shop' | 'warehouse' | undefined,
  route: (from: number, to: number) => readonly Cell[] | undefined,
  minutes: (path: readonly Cell[]) => number,
  warehouses: readonly { id: number; capacity: number; stock: number }[] = []): { lines: FreightLine[]; routes: FreightRoute[] } {
  const supply = new Map(sources.map(site => [site.id, site.amount]));
  for (const warehouse of warehouses) supply.set(warehouse.id, warehouse.stock);
  const warehouseIds = new Set(warehouses.map(site => site.id));
  const demand = new Map(shops.map(site => [site.id, site.amount]));
  for (const warehouse of warehouses) demand.set(warehouse.id, warehouse.capacity);
  const routes: FreightRoute[] = [];
  const lines: FreightLine[] = [];
  for (const line of [...saved].sort((a, b) => Number(kind(a.stops[0]) === 'warehouse') - Number(kind(b.stops[0]) === 'warehouse') || a.id - b.id)) {
    const plan: FreightLine = { ...line, stops: [...line.stops], path: [], minutes: 0, capacity: 0, assigned: 0, trips: 0, active: false };
    lines.push(plan);
    const depot = kind(line.stops[0]) === 'warehouse';
    if (!line.stops.length || !(kind(line.stops[0]) === 'factory' || depot)) { plan.problem = line.stops.length ? 'no-factory' : 'need-stops'; continue; }
    if (line.stops.length < 2) { plan.problem = 'need-stops'; continue; }
    if (line.stops.slice(1).some(id => kind(id) !== 'shop' && (depot || kind(id) !== 'warehouse'))) { plan.problem = 'no-shop'; continue; }
    for (let at = 1; at < line.stops.length; at++) {
      const leg = route(line.stops[at - 1], line.stops[at]);
      if (!leg?.length) { plan.problem = 'no-road'; plan.path = []; break; }
      for (const cell of leg) {
        const last = plan.path.at(-1);
        if (!last || cell.x !== last.x || cell.y !== last.y) plan.path.push(cell);
      }
    }
    if (plan.problem) continue;
    plan.minutes = minutes(plan.path);
    // One departure per vehicle per day; a round trip longer than a working day reduces throughput.
    plan.capacity = Math.floor(line.vehicles * calendar.daysPerMonth * freight.load * Math.min(1,
      freightLines.dailyMinutes / Math.max(1, 2 * plan.minutes + line.stops.length * freightLines.dwell)));
    if (!line.vehicles) { plan.problem = 'paused'; continue; }
    if (!plan.capacity) { plan.problem = 'capacity'; continue; }
    if (!depot && !(supply.get(line.stops[0]) ?? 0)) { plan.problem = 'no-supply'; continue; }
    if (!depot && !line.stops.slice(1).some(id => (demand.get(id) ?? 0) > 0)) { plan.problem = 'no-demand'; continue; }
    const deliveries: { to: number; goods: number }[] = [];
    for (const to of line.stops.slice(1)) {
      const goods = Math.min(plan.capacity - plan.assigned, supply.get(line.stops[0]) ?? 0, demand.get(to) ?? 0);
      deliveries.push({ to, goods });
      if (warehouseIds.has(to)) supply.set(to, (supply.get(to) ?? 0) + goods);
      supply.set(line.stops[0], supply.get(line.stops[0])! - goods);
      demand.set(to, demand.get(to)! - goods);
      plan.assigned += goods;
    }
    plan.trips = Math.ceil(plan.assigned / freight.load);
    plan.active = depot || plan.assigned > 0;
    if (depot && !plan.assigned) plan.problem = 'waiting-stock';
    if (plan.active) routes.push({ lineId: line.id, vehicles: line.vehicles, from: line.stops[0], to: line.stops.at(-1)!,
      goods: plan.assigned, trucks: plan.trips, path: plan.path, minutes: plan.minutes, deliveries });
  }
  lines.sort((a, b) => a.id - b.id);
  return { lines, routes };
}
