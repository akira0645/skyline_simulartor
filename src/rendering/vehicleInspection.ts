import type { Cell } from '../simulation/TileMap';
export type VehicleActivity = 'moving' | 'turning' | 'red' | 'queued' | 'slow' | 'working';
export interface VehicleInfo {
  key: string;
  kind: 'freight' | 'bus' | 'metro' | 'rescue';
  name: string;
  routeName?: string;
  routeKey?: string;
  lineId?: number;
  colour: number;
  x: number;
  y: number;
  angle: number;
  length: number;
  width: number;
  visible: boolean;
  cell: Cell;
  destination: Cell;
  returning: boolean;
  activity: VehicleActivity;
  progress: number;
  held: number;
  plannedGoods?: number;
  plannedTrips?: number;
}

/** Match the actual rotated body, with a small screen-sized click margin, and prefer the nearest. */
export function hitVehicle(vehicles: readonly VehicleInfo[], x: number, y: number, scale: number): VehicleInfo | undefined {
  let best: VehicleInfo | undefined;
  let distance = Infinity;
  const padding = Math.min(5, 4 / Math.max(0.25, scale));
  for (const vehicle of vehicles) {
    if (!vehicle.visible) continue;
    const dx = x - vehicle.x, dy = y - vehicle.y;
    const along = dx * Math.cos(vehicle.angle) + dy * Math.sin(vehicle.angle);
    const across = -dx * Math.sin(vehicle.angle) + dy * Math.cos(vehicle.angle);
    if (Math.abs(along) > vehicle.length / 2 + padding || Math.abs(across) > vehicle.width / 2 + padding) continue;
    const squared = dx * dx + dy * dy;
    if (squared < distance) { distance = squared; best = vehicle; }
  }
  return best;
}

/** Precompute ordered stop positions once for a route, not for every rendered vehicle frame. */
export function deliveryStopIndices(path: readonly Cell[], stops: readonly number[], access: (cell: Cell) => Cell | undefined, mapSize: number): number[] {
  let cursor = 0;
  return stops.slice(1).map(stop => {
    const road = access({ x: stop % mapSize, y: Math.floor(stop / mapSize) });
    const index = road ? path.findIndex((point, at) => at >= cursor && point.x === road.x && point.y === road.y) : -1;
    if (index >= 0) cursor = index;
    return index;
  });
}

/** Resolve the next ordered delivery stop from the actual road progress, including doubled-back paths. */
export function nextDeliveryStop(path: readonly Cell[], stops: readonly number[], along: number, returning: boolean,
  access: (cell: Cell) => Cell | undefined, mapSize: number, indices = deliveryStopIndices(path, stops, access, mapSize)): Cell {
  const cellAt = (id: number): Cell => ({ x: id % mapSize, y: Math.floor(id / mapSize) });
  if (returning) return cellAt(stops[0]);
  for (let at = 0; at < indices.length; at++) {
    if (indices[at] < 0 || indices[at] > along + 0.001) return cellAt(stops[at + 1]);
  }
  return cellAt(stops.at(-1)!);
}
