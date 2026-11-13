import { MAP_SIZE, type Cell, type TileMap } from './TileMap';

const size = MAP_SIZE ** 2;
const indexOf = ({ x, y }: Cell) => y * MAP_SIZE + x;
const cellAt = (id: number): Cell => ({ x: id % MAP_SIZE, y: Math.floor(id / MAP_SIZE) });
const directions = [[0, -1], [1, 0], [0, 1], [-1, 0]];

export class RoadGraph {
  private revision = -1;
  private readonly components = new Int32Array(size);
  private readonly edges = new Map<number, number[]>();

  constructor(private readonly map: TileMap) {}

  componentAt(cell: Cell): number | undefined {
    this.sync();
    if (this.map.get(cell) !== 'road') return undefined;
    return this.components[indexOf(cell)];
  }

  shortestPath(from: Cell, to: Cell): { path: Cell[]; distance: number } | undefined {
    const component = this.componentAt(from);
    if (component === undefined || component !== this.componentAt(to)) return undefined;

    const start = indexOf(from);
    const end = indexOf(to);
    const previous = new Map<number, number>([[start, -1]]);
    const queue = [start];
    for (let i = 0; i < queue.length; i++) {
      const id = queue[i];
      if (id === end) {
        const path: Cell[] = [];
        for (let node = end; node !== -1; node = previous.get(node)!) path.push(cellAt(node));
        return { path: path.reverse(), distance: path.length - 1 };
      }
      for (const next of this.edges.get(id)!) {
        if (previous.has(next)) continue;
        previous.set(next, id);
        queue.push(next);
      }
    }
  }

  distancesFrom(from: Cell): ReadonlyMap<number, number> {
    const distances = new Map<number, number>();
    if (this.componentAt(from) === undefined) return distances;

    const start = indexOf(from);
    distances.set(start, 0);
    const queue = [start];
    for (let i = 0; i < queue.length; i++) {
      const id = queue[i];
      for (const next of this.edges.get(id)!) {
        if (distances.has(next)) continue;
        distances.set(next, distances.get(id)! + 1);
        queue.push(next);
      }
    }
    return distances;
  }

  private sync(): void {
    if (this.revision === this.map.roadRevision) return;
    this.edges.clear();
    this.components.fill(-1);

    for (let id = 0; id < size; id++) {
      const cell = cellAt(id);
      if (this.map.get(cell) !== 'road') continue;
      const adjacent: number[] = [];
      for (const [dx, dy] of directions) {
        const neighbor = { x: cell.x + dx, y: cell.y + dy };
        if (this.map.get(neighbor) === 'road') adjacent.push(indexOf(neighbor));
      }
      this.edges.set(id, adjacent);
    }

    for (const start of this.edges.keys()) {
      if (this.components[start] !== -1) continue;
      this.components[start] = start;
      const queue = [start];
      for (let i = 0; i < queue.length; i++) {
        for (const next of this.edges.get(queue[i])!) {
          if (this.components[next] !== -1) continue;
          this.components[next] = start;
          queue.push(next);
        }
      }
    }
    this.revision = this.map.roadRevision;
  }
}
