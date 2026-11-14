import { MAP_SIZE, type Cell } from '../simulation/TileMap';

const travelMsPerTile = 500;
const indoorMs = 1600;
const cellAt = (id: number): Cell => ({ x: id % MAP_SIZE, y: Math.floor(id / MAP_SIZE) });

export function commuterPosition(
  { homeId, workId, path }: { homeId: number; workId: number; path: readonly Cell[] },
  timeMs: number,
  mode?: 'walk' | 'drive',
  scheduledProgress?: number,
  scheduledReturn?: boolean,
): Cell | undefined {
  const steps = path.length + 1;
  const travelMs = steps * (mode === 'drive' ? 290 : travelMsPerTile);
  const halfCycle = travelMs + indoorMs;
  const phase = timeMs % (2 * halfCycle);
  const returning = scheduledReturn ?? (phase >= halfCycle);
  const elapsed = phase % halfCycle;
  if (scheduledProgress === undefined && elapsed >= travelMs) return undefined;

  const progress = scheduledProgress === undefined ? (returning ? steps - (elapsed / travelMs) * steps : (elapsed / travelMs) * steps) : Math.max(0, Math.min(1, scheduledProgress)) * steps;
  const start = Math.floor(progress);
  const fraction = progress - start;
  const pointAt = (index: number) =>
    index === 0 ? cellAt(homeId) : index === steps ? cellAt(workId) : path[index - 1];
  const lanePoint = (index: number): Cell => {
    const point = pointAt(index);
    if (!mode || index === 0 || index === steps) return point;
    const before = pointAt(index - 1);
    const after = pointAt(index + 1);
    const offset = (mode === 'walk' ? 0.4 : 0.19) * (returning ? -1 : 1);
    return {
      x: point.x - Math.sign(after.y - before.y) * offset,
      y: point.y + Math.sign(after.x - before.x) * offset,
    };
  };
  const from = lanePoint(start);
  const to = lanePoint(Math.min(steps, start + 1));
  return { x: from.x + (to.x - from.x) * fraction, y: from.y + (to.y - from.y) * fraction };
}

/** Keep the walker on the near sidewalk until the junction admits their approach. */
export function advancePedestrian(
  roads: readonly Cell[], origin: Cell, along: number, advance: number, returning: boolean,
  canEnter: (junction: Cell, vertical: boolean) => boolean,
): number {
  const end = Math.min(roads.length + 1, along + advance);
  // A stop is slightly before the tile edge to account for the sprite's width.
  for (let step = Math.max(1, Math.ceil(along + 0.6 - 1e-9)); step <= roads.length; step++) {
    const stop = step - 0.6;
    if (end <= stop) break;
    const index = returning ? roads.length - step : step - 1;
    const approach = step === 1 ? origin : roads[index + (returning ? 1 : -1)];
    const entry = roads[index];
    const vertical = Math.abs(entry.y - approach.y) > Math.abs(entry.x - approach.x);
    if (!canEnter(entry, vertical)) return Math.max(along, stop);
  }
  return end;
}
