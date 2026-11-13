import { MAP_SIZE, type Cell } from '../simulation/TileMap';

const travelMsPerTile = 500;
const indoorMs = 1600;
const cellAt = (id: number): Cell => ({ x: id % MAP_SIZE, y: Math.floor(id / MAP_SIZE) });

export function commuterPosition(
  { homeId, workId, path }: { homeId: number; workId: number; path: readonly Cell[] },
  timeMs: number,
): Cell | undefined {
  const steps = path.length + 1;
  const travelMs = steps * travelMsPerTile;
  const halfCycle = travelMs + indoorMs;
  const phase = timeMs % (2 * halfCycle);
  const returning = phase >= halfCycle;
  const elapsed = phase % halfCycle;
  if (elapsed >= travelMs) return undefined;

  const progress = returning ? steps - elapsed / travelMsPerTile : elapsed / travelMsPerTile;
  const start = Math.floor(progress);
  const fraction = progress - start;
  const pointAt = (index: number) =>
    index === 0 ? cellAt(homeId) : index === steps ? cellAt(workId) : path[index - 1];
  const from = pointAt(start);
  const to = pointAt(Math.min(steps, start + 1));
  return { x: from.x + (to.x - from.x) * fraction, y: from.y + (to.y - from.y) * fraction };
}
