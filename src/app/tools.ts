import { isRoad, type Cell, type Facility, type Road, type Service, type Zone } from '../simulation/TileMap';

export type Tool = 'pan' | 'inspect' | Road | Zone | Facility | Service | 'park' | 'farm' | 'bus' | 'metro' | 'line' | 'demolish' | 'viaduct';
/** What the map tints on top of the tiles. */
export type Overlay = 'none' | 'traffic' | 'pollution' | 'value' | Facility | Service | 'bus' | 'metro' | 'lines';

const dragged = (tool: Tool): tool is Road | Zone | 'park' | 'farm' | 'viaduct' =>
  isRoad(tool) || tool === 'residential' || tool === 'commercial' || tool === 'industrial' ||
  tool === 'park' || tool === 'farm' || tool === 'viaduct';

export function selection(tool: Tool, start: Cell, end: Cell): Cell[] {
  if (!dragged(tool)) return [start];

  let { x, y } = end;
  if (isRoad(tool) || tool === 'viaduct') {
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
