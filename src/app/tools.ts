import type { Cell, Zone } from '../simulation/TileMap';

export type Tool = 'pan' | 'road' | Zone | 'demolish';

export function selection(tool: Tool, start: Cell, end: Cell): Cell[] {
  if (tool === 'demolish') return [start];

  let { x, y } = end;
  if (tool === 'road') {
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
