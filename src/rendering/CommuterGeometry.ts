import { MAP_SIZE, TILE_SIZE, type Cell } from '../simulation/TileMap';

export interface CommuteShape { homeId: number; workId: number; path: readonly Cell[] }

/** Immutable lane vertices for one trip. Sampling never rebuilds neighbouring tile geometry. */
export class CommuterGeometry {
  private readonly vertices: Float64Array;
  private readonly path: readonly Cell[];
  private readonly homeId: number;
  private readonly workId: number;
  readonly steps: number;
  constructor(route: CommuteShape, private readonly mode: 'walk' | 'drive', private readonly returning: boolean) {
    this.path = route.path; this.homeId = route.homeId; this.workId = route.workId;
    this.steps = route.path.length + 1;
    this.vertices = new Float64Array((this.steps + 1) * 2);
    const cell = (index: number): Cell => index === 0
      ? { x: route.homeId % MAP_SIZE, y: Math.floor(route.homeId / MAP_SIZE) }
      : index === this.steps ? { x: route.workId % MAP_SIZE, y: Math.floor(route.workId / MAP_SIZE) } : route.path[index - 1];
    const offset = (mode === 'walk' ? 0.4 : 0.19) * (returning ? -1 : 1);
    for (let i = 0; i <= this.steps; i++) {
      const point = cell(i);
      const dx = i === 0 || i === this.steps ? 0 : Math.sign(cell(i + 1).x - cell(i - 1).x) * offset;
      const dy = i === 0 || i === this.steps ? 0 : Math.sign(cell(i + 1).y - cell(i - 1).y) * offset;
      this.vertices[i * 2] = (point.x - dy + 0.5) * TILE_SIZE;
      this.vertices[i * 2 + 1] = (point.y + dx + 0.5) * TILE_SIZE;
    }
  }
  matches(route: CommuteShape, mode: 'walk' | 'drive', returning: boolean): boolean {
    return route.path === this.path && route.homeId === this.homeId && route.workId === this.workId &&
      mode === this.mode && returning === this.returning;
  }
  at(along: number): Cell {
    const progress = Math.max(0, Math.min(this.steps, along));
    const i = Math.floor(progress), next = Math.min(this.steps, i + 1), fraction = progress - i;
    const v = this.vertices;
    return { x: v[i * 2] + (v[next * 2] - v[i * 2]) * fraction,
      y: v[i * 2 + 1] + (v[next * 2 + 1] - v[i * 2 + 1]) * fraction };
  }
}
