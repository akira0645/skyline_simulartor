import { isRoad, MAP_SIZE, type Cell, type TileMap } from './TileMap';

const size = MAP_SIZE ** 2;
const indexOf = ({ x, y }: Cell) => y * MAP_SIZE + x;
const cellAt = (id: number): Cell => ({ x: id % MAP_SIZE, y: Math.floor(id / MAP_SIZE) });
const directions = [[0, -1], [1, 0], [0, 1], [-1, 0]];

export class RoadGraph {
  private revision = -1;
  private readonly components = new Int32Array(size);
  private readonly edges = new Map<number, number[]>();
  // Scratch space for explore(); a tile's entry counts only when its stamp matches the search.
  private readonly best = new Float64Array(size);
  private readonly previous = new Int32Array(size);
  private readonly reached = new Uint32Array(size);
  private readonly settled = new Uint32Array(size);
  private search = 0;

  constructor(private readonly map: TileMap) {}

  componentAt(cell: Cell): number | undefined {
    this.sync();
    if (!isRoad(this.map.get(cell))) return undefined;
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

  /**
   * Visits road tiles outward from `from`, cheapest first, where a route costs the sum of
   * `cost` over every tile on it, both ends included. Tiles that cost more than `limit` to
   * reach are skipped. `visit` returns true to stop. Equal costs are visited in tile order.
   * `from` is one cell, or the indices of several road tiles to spread out from at once.
   */
  explore(from: Cell | readonly number[], cost: (id: number) => number, limit: number,
    visit: (id: number, cost: number) => boolean): void {
    this.sync();
    const starts = 'x' in from ? [indexOf(from)] : from;
    if ('x' in from && !isRoad(this.map.get(from))) return;
    const search = ++this.search;
    const { best, previous, reached, settled } = this;
    // A binary heap ordered by cost, then tile, kept as two parallel arrays.
    const costs: number[] = [];
    const ids: number[] = [];
    const before = (cost: number, id: number, at: number) =>
      cost < costs[at] || (cost === costs[at] && id < ids[at]);
    const push = (cost: number, id: number) => {
      let at = costs.length;
      costs.push(cost);
      ids.push(id);
      while (at > 0) {
        const parent = (at - 1) >> 1;
        if (!before(cost, id, parent)) break;
        costs[at] = costs[parent];
        ids[at] = ids[parent];
        at = parent;
      }
      costs[at] = cost;
      ids[at] = id;
    };
    /** Removes the top entry, which the caller has already read. */
    const pop = () => {
      const cost = costs.pop()!;
      const id = ids.pop()!;
      const count = costs.length;
      if (!count) return;
      let at = 0;
      for (;;) {
        let child = 2 * at + 1;
        if (child >= count) break;
        if (child + 1 < count && before(costs[child + 1], ids[child + 1], child)) child++;
        if (!before(costs[child], ids[child], count) && !(cost > costs[child] ||
            (cost === costs[child] && id > ids[child]))) break;
        costs[at] = costs[child];
        ids[at] = ids[child];
        at = child;
      }
      costs[at] = cost;
      ids[at] = id;
    };

    for (const start of starts) {
      if (reached[start] === search || !this.edges.has(start)) continue;
      best[start] = cost(start);
      if (best[start] > limit) continue;
      previous[start] = -1;
      reached[start] = search;
      push(best[start], start);
    }
    while (costs.length) {
      const value = costs[0];
      const id = ids[0];
      pop();
      if (settled[id] === search) continue;
      settled[id] = search;
      if (visit(id, value)) return;
      for (const next of this.edges.get(id)!) {
        if (settled[next] === search) continue;
        const total = value + cost(next);
        if (total > limit || (reached[next] === search && total >= best[next])) continue;
        best[next] = total;
        previous[next] = id;
        reached[next] = search;
        push(total, next);
      }
    }
  }

  /** The route the latest explore() took to a tile it visited, from its start. */
  pathTo(id: number): Cell[] {
    const path: Cell[] = [];
    for (let node = id; node !== -1; node = this.previous[node]) path.push(cellAt(node));
    return path.reverse();
  }

  private sync(): void {
    if (this.revision === this.map.roadRevision) return;
    this.edges.clear();
    this.components.fill(-1);

    for (let id = 0; id < size; id++) {
      const cell = cellAt(id);
      if (!isRoad(this.map.get(cell))) continue;
      const adjacent: number[] = [];
      for (const [dx, dy] of directions) {
        const neighbor = { x: cell.x + dx, y: cell.y + dy };
        if (isRoad(this.map.get(neighbor))) adjacent.push(indexOf(neighbor));
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
