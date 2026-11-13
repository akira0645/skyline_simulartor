export const MAP_SIZE = 128;
export const TILE_SIZE = 32;

export interface Cell { x: number; y: number }
export type Zone = 'residential' | 'commercial' | 'industrial';
export type Facility = 'power' | 'water';
/** A street, or an avenue that is faster and carries more. */
export type Road = 'road' | 'avenue';
export type Tile = 'grass' | Road | Zone | Facility | 'park';
/** Save files store tiles as indices into this list, so only append to it. */
export const TILES: readonly Tile[] =
  ['grass', 'road', 'residential', 'commercial', 'industrial', 'power', 'water', 'avenue', 'park'];
export const isZone = (tile: Tile | undefined): tile is Zone =>
  tile === 'residential' || tile === 'commercial' || tile === 'industrial';
export const isFacility = (tile: string | undefined): tile is Facility =>
  tile === 'power' || tile === 'water';
export const isRoad = (tile: string | undefined): tile is Road =>
  tile === 'road' || tile === 'avenue';
export type GameCommand =
  /** Paves streets unless `road` says otherwise. A street never replaces an avenue. */
  | { type: 'BUILD_ROAD'; path: Cell[]; road?: Road }
  | { type: 'SET_ZONE'; tiles: Cell[]; zone: Zone }
  | { type: 'BUILD_FACILITY'; x: number; y: number; facility: Facility }
  | { type: 'BUILD_PARK'; tiles: Cell[] }
  | { type: 'DEMOLISH'; x: number; y: number };

export class TileMap {
  private roadVersion = 0;

  get roadRevision(): number {
    return this.roadVersion;
  }

  private readonly tiles: Tile[] = Array<Tile>(MAP_SIZE ** 2).fill('grass');

  get({ x, y }: Cell): Tile | undefined {
    if (!Number.isInteger(x) || !Number.isInteger(y) ||
        x < 0 || y < 0 || x >= MAP_SIZE || y >= MAP_SIZE) return undefined;
    return this.tiles[y * MAP_SIZE + x];
  }

  /** The tile at a cell index that is known to be on the map. */
  at(id: number): Tile {
    return this.tiles[id];
  }

  /**
   * Applies a command to all of its cells or to none. `approve` sees the cells that would
   * change and the tile they would become, and returns an error to refuse.
   */
  execute(command: GameCommand, approve?: (changed: Cell[], tile: Tile) => string | undefined):
    { changed: Cell[]; error?: string } {
    const cells = command.type === 'BUILD_ROAD' ? command.path :
      command.type === 'SET_ZONE' || command.type === 'BUILD_PARK' ? command.tiles :
      [{ x: command.x, y: command.y }];
    const tile: Tile = command.type === 'BUILD_ROAD' ? command.road ?? 'road' :
      command.type === 'SET_ZONE' ? command.zone :
      command.type === 'BUILD_FACILITY' ? command.facility :
      command.type === 'BUILD_PARK' ? 'park' : 'grass';

    for (const cell of cells) {
      const current = this.get(cell);
      if (current === undefined) return { changed: [], error: '選取範圍超出地圖。' };
      if (command.type === 'SET_ZONE' && isRoad(current)) {
        return { changed: [], error: '分區不能覆蓋道路。' };
      }
      if (command.type === 'BUILD_FACILITY' && isRoad(current)) {
        return { changed: [], error: '設施不能蓋在道路上。' };
      }
      if (command.type === 'BUILD_PARK' && isRoad(current)) {
        return { changed: [], error: '公園不能覆蓋道路。' };
      }
    }

    const changed = cells.filter(cell => this.get(cell) !== tile &&
      !(tile === 'road' && this.get(cell) === 'avenue'));
    const error = changed.length ? approve?.(changed, tile) : undefined;
    if (error) return { changed: [], error };
    if (changed.some(cell => isRoad(tile) || isRoad(this.get(cell)))) this.roadVersion++;
    for (const { x, y } of changed) this.tiles[y * MAP_SIZE + x] = tile;
    return { changed };
  }

  save(): Uint8Array {
    return Uint8Array.from(this.tiles, tile => TILES.indexOf(tile));
  }

  load(codes: Uint8Array): void {
    this.roadVersion++;
    codes.forEach((code, index) => { this.tiles[index] = TILES[code]; });
  }
}
