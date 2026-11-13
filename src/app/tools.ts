import { isRoad, type Cell, type Facility, type Road, type Zone } from '../simulation/TileMap';

export type Tool = 'pan' | 'inspect' | Road | Zone | Facility | 'park' | 'demolish';
/** What the map tints on top of the tiles. */
export type Overlay = 'none' | 'traffic' | 'pollution' | 'value' | Facility;

const dragged = (tool: Tool): tool is Road | Zone | 'park' =>
  isRoad(tool) || tool === 'residential' || tool === 'commercial' || tool === 'industrial' ||
  tool === 'park';

export function selection(tool: Tool, start: Cell, end: Cell): Cell[] {
  if (!dragged(tool)) return [start];

  let { x, y } = end;
  if (isRoad(tool)) {
    if (Math.abs(x - start.x) >= Math.abs(y - start.y)) y = start.y;
    else x = start.x;
  }

  const cells: Cell[] = [];
  for (let row = Math.min(y, start.y); row <= Math.max(y, start.y); row++) {
    for (let column = Math.min(x, start.x); column <= Math.max(x, start.x); column++) {
      cells.push({ x: column, y: row });
    }
  }
  return cells;
}
