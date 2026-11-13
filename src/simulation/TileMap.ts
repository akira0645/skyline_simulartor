export const MAP_SIZE = 128;
export const TILE_SIZE = 32;

export interface Cell { x: number; y: number }
export type Zone = 'residential' | 'commercial' | 'industrial';
export type Facility = 'power' | 'water';
/** A street, an avenue that is faster and carries more, or a bridge that takes a street over water. */
export type Road = 'road' | 'avenue' | 'bridge';
/** Public services, which cover an area without a limit on buildings. */
export type Service = 'fire' | 'police' | 'school' | 'clinic';
export type Tile = 'grass' | Road | Zone | Facility | 'park' | Service | 'river' | 'bus' | 'metro';
/** Save files store tiles as indices into this list, so only append to it. */
export const TILES: readonly Tile[] =
  ['grass', 'road', 'residential', 'commercial', 'industrial', 'power', 'water', 'avenue', 'park',
    'fire', 'police', 'school', 'clinic', 'river', 'bridge', 'bus', 'metro'];
export const isZone = (tile: Tile | undefined): tile is Zone =>
  tile === 'residential' || tile === 'commercial' || tile === 'industrial';
export const isFacility = (tile: string | undefined): tile is Facility =>
  tile === 'power' || tile === 'water';
export const isService = (tile: string | undefined): tile is Service =>
  tile === 'fire' || tile === 'police' || tile === 'school' || tile === 'clinic';
export const isRoad = (tile: string | undefined): tile is Road =>
  tile === 'road' || tile === 'avenue' || tile === 'bridge';
export type GameCommand =
  /** Paves streets unless `road` says otherwise. A street never replaces an avenue. */
  | { type: 'BUILD_ROAD'; path: Cell[]; road?: Road }
  | { type: 'SET_ZONE'; tiles: Cell[]; zone: Zone }
  | { type: 'BUILD_FACILITY'; x: number; y: number; facility: Facility }
  | { type: 'BUILD_PARK'; tiles: Cell[] }
  | { type: 'BUILD_SERVICE'; x: number; y: number; service: Service }
  | { type: 'BUILD_BUS_STOP'; x: number; y: number }
  | { type: 'BUILD_METRO'; x: number; y: number }
  | { type: 'DEMOLISH'; x: number; y: number };

/** The part of a generated map, from the top left corner, that never gets water. */
export const DRY_CORNER = { width: 34, height: 16 };

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

  /** Turns cells into water, whatever they were. For laying out terrain, not for play. */
  flood(cells: readonly Cell[]): void {
    for (const cell of cells) if (this.get(cell) !== undefined) this.tiles[cell.y * MAP_SIZE + cell.x] = 'river';
    this.roadVersion++;
  }

  /**
   * Lays out water from a seed: one river that winds across the map, top to bottom or side to
   * side, and one to three ponds. Where it runs, how wide it is and how much it bends all come
   * from the seed, and the same seed gives the same map. The top left corner stays dry, so
   * there is always room to start a town there. Call it on a new map only.
   */
  generateTerrain(seed: number): void {
    // mulberry32: a small generator that is the same on every machine.
    let state = seed >>> 0;
    const random = () => {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
    };
    const between = (low: number, high: number) => low + random() * (high - low);
    const wet: Cell[] = [];

    const upright = random() < 0.5;
    const middle = between(40, 92);
    const width = 2 + Math.floor(random() * 3);
    const sweep = between(5, 11);
    const stretch = between(9, 15);
    const wobble = between(1.5, 4);
    const start = between(0, Math.PI * 2);
    for (let along = 0; along < MAP_SIZE; along++) {
      const centre = Math.round(middle + sweep * Math.sin(along / stretch + start) +
        wobble * Math.sin(along / 4.3 + 2 * start));
      for (let across = centre - (width >> 1); across < centre - (width >> 1) + width; across++) {
        wet.push(upright ? { x: across, y: along } : { x: along, y: across });
      }
    }

    const ponds = 1 + Math.floor(random() * 3);
    for (let pond = 0; pond < ponds; pond++) {
      const centre = { x: Math.round(between(12, MAP_SIZE - 12)), y: Math.round(between(12, MAP_SIZE - 12)) };
      const wide = between(3, 7);
      const tall = between(2, 5);
      for (let dy = -Math.ceil(tall); dy <= Math.ceil(tall); dy++) {
        for (let dx = -Math.ceil(wide); dx <= Math.ceil(wide); dx++) {
          if ((dx / wide) ** 2 + (dy / tall) ** 2 <= 1) wet.push({ x: centre.x + dx, y: centre.y + dy });
        }
      }
    }
    this.flood(wet.filter(({ x, y }) => x >= DRY_CORNER.width || y >= DRY_CORNER.height));
  }

  /**
   * Applies a command to all of its cells or to none. `approve` sees the cells that would
   * change with the tile each would become, and returns an error to refuse.
   *
   * Water takes nothing but a road, which becomes a bridge; demolishing a bridge leaves water.
   */
  execute(command: GameCommand,
    approve?: (changes: { cell: Cell; tile: Tile }[]) => string | undefined):
    { changed: Cell[]; error?: string } {
    const cells = command.type === 'BUILD_ROAD' ? command.path :
      command.type === 'SET_ZONE' || command.type === 'BUILD_PARK' ? command.tiles :
      [{ x: command.x, y: command.y }];
    const tile: Tile = command.type === 'BUILD_ROAD' ? command.road ?? 'road' :
      command.type === 'SET_ZONE' ? command.zone :
      command.type === 'BUILD_FACILITY' ? command.facility :
      command.type === 'BUILD_PARK' ? 'park' :
      command.type === 'BUILD_SERVICE' ? command.service :
      command.type === 'BUILD_BUS_STOP' ? 'bus' :
      command.type === 'BUILD_METRO' ? 'metro' : 'grass';

    for (const cell of cells) {
      const current = this.get(cell);
      if (current === undefined) return { changed: [], error: '超出地圖範圍了。' };
      if (current === 'river' && command.type !== 'BUILD_ROAD') {
        return { changed: [], error: command.type === 'DEMOLISH' ? '河流拆不掉。' :
          '水上不能蓋東西。只有道路可以過河，鋪過去會變成橋。' };
      }
      if (command.type === 'SET_ZONE' && isRoad(current)) {
        return { changed: [], error: '道路上不能劃分區，要先拆掉道路。' };
      }
      if ((command.type === 'BUILD_FACILITY' || command.type === 'BUILD_SERVICE' ||
          command.type === 'BUILD_BUS_STOP' || command.type === 'BUILD_METRO') && isRoad(current)) {
        return { changed: [], error: '道路上不能蓋東西，要先拆掉道路。' };
      }
      if (command.type === 'BUILD_PARK' && isRoad(current)) {
        return { changed: [], error: '道路上不能蓋公園，要先拆掉道路。' };
      }
    }

    // What each cell would become: over water a road is a bridge, and a bridge comes down to water.
    const becomes = (current: Tile): Tile =>
      isRoad(tile) && (current === 'river' || current === 'bridge') ? 'bridge' :
      tile === 'grass' && current === 'bridge' ? 'river' :
      tile === 'road' && current === 'avenue' ? 'avenue' : tile;
    const changes = cells.map(cell => ({ cell, tile: becomes(this.get(cell)!) }))
      .filter(({ cell, tile: next }) => this.get(cell) !== next);
    const error = changes.length ? approve?.(changes) : undefined;
    if (error) return { changed: [], error };
    if (changes.some(({ cell, tile: next }) => isRoad(next) || isRoad(this.get(cell)))) this.roadVersion++;
    for (const { cell: { x, y }, tile: next } of changes) this.tiles[y * MAP_SIZE + x] = next;
    return { changed: changes.map(({ cell }) => cell) };
  }

  save(): Uint8Array {
    return Uint8Array.from(this.tiles, tile => TILES.indexOf(tile));
  }

  load(codes: Uint8Array): void {
    this.roadVersion++;
    codes.forEach((code, index) => { this.tiles[index] = TILES[code]; });
  }
}
