import { isRoad, type Cell, type TileMap } from './TileMap';

/** Visit paths are immutable; road edits (including load) invalidate their results. */
export class RoadPathValidity {
  private readonly paths = new WeakMap<readonly Cell[], { revision: number; valid: boolean }>();
  constructor(private readonly map: TileMap) {}
  hasRoads(path: readonly Cell[]): boolean {
    const revision = this.map.roadRevision;
    const cached = this.paths.get(path);
    if (cached?.revision === revision) return cached.valid;
    let valid = true;
    // The first and last cells are doors, not road tiles.
    for (let i = 1; i < path.length - 1; i++) {
      if (!isRoad(this.map.get(path[i]))) { valid = false; break; }
    }
    this.paths.set(path, { revision, valid });
    return valid;
  }
}
