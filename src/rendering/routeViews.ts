import type { FreightLine, FreightMode } from '../simulation/FreightLines';
import type { FreightRoute } from '../simulation/Freight';
import { MAP_SIZE, type Cell } from '../simulation/TileMap';

export interface MapRoute { id: number; kind: 'bus' | 'metro' | 'freight'; path: readonly Cell[]; stops: readonly number[]; dim?: boolean }
export const freightKey = (route: Pick<FreightRoute, 'from' | 'to' | 'lineId'>) =>
  route.lineId !== undefined ? `manual:${route.lineId}` : `auto:${route.from}:${route.to}`;
export const freightColourId = (route: Pick<FreightRoute, 'from' | 'to' | 'lineId'>) => route.lineId ?? route.from * MAP_SIZE ** 2 + route.to + 1;
export function freightMapRoutes(mode: FreightMode, lines: readonly FreightLine[], routes: readonly FreightRoute[], selected?: string, showAll = false): MapRoute[] {
  const items = mode === 'manual' ? lines.map(line => ({ key: `manual:${line.id}`, id: line.id, path: line.path, stops: line.stops })) :
    routes.map(route => ({ key: freightKey(route), id: freightColourId(route), path: route.path, stops: [route.from, route.to] }));
  const chosen = items.find(item => item.key === selected) ?? items[0];
  const visible = !chosen ? [] : showAll ? [...items.filter(item => item !== chosen), chosen] : [chosen];
  return visible.map(item => ({ id: item.id, kind: 'freight', path: item.path, stops: item.stops, dim: item !== chosen }));
}

export function selectedFreightKey(mode: FreightMode, lines: readonly FreightLine[], routes: readonly FreightRoute[], selected?: string): string | undefined {
  const keys = mode === 'manual' ? lines.map(line => `manual:${line.id}`) : routes.map(freightKey);
  return keys.includes(selected ?? '') ? selected : keys[0];
}
