import { MAP_SIZE, type Cell } from '../simulation/TileMap';

const travelMsPerTile = 500;
const indoorMs = 1600;
const cellAt = (id: number): Cell => ({ x: id % MAP_SIZE, y: Math.floor(id / MAP_SIZE) });

export function commuterPosition(
  { homeId, workId, path }: { homeId: number; workId: number; path: readonly Cell[] },
  timeMs: number,
  mode?: 'walk' | 'drive',
): Cell | undefined {
  const steps = path.length + 1;
  const travelMs = steps * (mode === 'drive' ? 290 : travelMsPerTile);
  const halfCycle = travelMs + indoorMs;
  const phase = timeMs % (2 * halfCycle);
  const returning = phase >= halfCycle;
  const elapsed = phase % halfCycle;
  if (elapsed >= travelMs) return undefined;

  const progress = returning ? steps - (elapsed / travelMs) * steps : (elapsed / travelMs) * steps;
  const start = Math.floor(progress);
  const fraction = progress - start;
  const pointAt = (index: number) =>
    index === 0 ? cellAt(homeId) : index === steps ? cellAt(workId) : path[index - 1];
  const lanePoint = (index: number): Cell => {
    const point = pointAt(index);
    if (!mode || index === 0 || index === steps) return point;
    const before = pointAt(index - 1);
    const after = pointAt(index + 1);
    const offset = (mode === 'walk' ? 0.36 : 0.15) * (returning ? -1 : 1);
    return {
      x: point.x - Math.sign(after.y - before.y) * offset,
      y: point.y + Math.sign(after.x - before.x) * offset,
    };
  };
  const from = lanePoint(start);
  const to = lanePoint(Math.min(steps, start + 1));
  return { x: from.x + (to.x - from.x) * fraction, y: from.y + (to.y - from.y) * fraction };
}
