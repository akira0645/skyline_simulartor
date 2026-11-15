export const MAP_SIZE = 128;
export const TILE_SIZE = 32;

export interface Cell { x: number; y: number }
export type Zone = 'residential' | 'commercial' | 'industrial';
export type Facility = 'power' | 'water';
/** A street, an avenue that is faster and carries more, or a bridge that takes a street over water. */
export type Road = 'road' | 'avenue' | 'bridge';
/** Public services, which cover an area without a limit on buildings. */
export type Service = 'fire' | 'police' | 'school' | 'clinic' |
  'market' | 'highschool' | 'hospital' | 'university' | 'museum' | 'stadium' | 'temple' |
  'mall' | 'casino' | 'cinema' | 'parking' | 'library' | 'pool' | 'ktv' | 'amusement' | 'gas' | 'cityhall' | 'bank' | 'culture' | 'coldstore' | 'square' | 'daycare' | 'recycling' | 'workshop' | 'community' | 'familyclinic' | 'eldercare' | 'memorial' | 'bakery' | 'florist' | 'cakeshop';
/**
 * `annex` is the rest of a building that takes two tiles by two: the building's own tile is
 * its top left corner, and the three others are annexes.
 */
export type Tile = 'grass' | Road | Zone | Facility | 'park' | Service | 'river' | 'bus' | 'metro' | 'annex' | 'farm' | 'viaduct';
/**
 * Save files store tiles as indices into this list, so only append to it. `metro` is no longer
 * a tile on the map: a metro station lies under a road tile, which stays a road. Old saves
 * that have the tile are turned into a road with a station under it when they are read.
 * `viaduct` is not a tile on the map either: an elevated road passes over a tile, whatever it is.
 */
export const TILES: readonly Tile[] =
  ['grass', 'road', 'residential', 'commercial', 'industrial', 'power', 'water', 'avenue', 'park',
    'fire', 'police', 'school', 'clinic', 'river', 'bridge', 'bus', 'metro',
    'annex', 'market', 'highschool', 'hospital', 'university', 'museum', 'stadium', 'temple',
    'mall', 'casino', 'cinema', 'parking', 'farm', 'library', 'pool', 'ktv', 'amusement', 'viaduct', 'gas', 'cityhall', 'bank', 'culture', 'coldstore', 'square', 'daycare', 'recycling', 'workshop', 'community', 'familyclinic', 'eldercare', 'memorial', 'bakery', 'florist', 'cakeshop'];
export const isZone = (tile: Tile | undefined): tile is Zone =>
  tile === 'residential' || tile === 'commercial' || tile === 'industrial';
export const isFacility = (tile: string | undefined): tile is Facility =>
  tile === 'power' || tile === 'water';
export const isService = (tile: string | undefined): tile is Service =>
  tile === 'fire' || tile === 'police' || tile === 'school' || tile === 'clinic' || tile === 'market' ||
  tile === 'highschool' || tile === 'hospital' || tile === 'university' || tile === 'museum' || tile === 'stadium' ||
  tile === 'temple' || tile === 'mall' || tile === 'casino' || tile === 'cinema' || tile === 'parking' ||
  tile === 'library' || tile === 'pool' || tile === 'ktv' || tile === 'amusement' || tile === 'gas' || tile === 'cityhall' || tile === 'bank' || tile === 'culture' || tile === 'coldstore' ||
  tile === 'square' || tile === 'daycare' || tile === 'recycling' || tile === 'workshop' || tile === 'community' || tile === 'familyclinic' || tile === 'eldercare' || tile === 'memorial' ||
  tile === 'bakery' || tile === 'florist' || tile === 'cakeshop';
/** The buildings that take two tiles by two. */
export const isBig = (tile: string | undefined): boolean =>
  tile === 'hospital' || tile === 'university' || tile === 'museum' || tile === 'stadium' || tile === 'mall' ||
  tile === 'casino' || tile === 'amusement' || tile === 'community' || tile === 'eldercare' || tile === 'memorial';
/** The four tiles of a big building whose top left corner is `cell`. */
export const footprint = ({ x, y }: Cell): Cell[] =>
  [{ x, y }, { x: x + 1, y }, { x, y: y + 1 }, { x: x + 1, y: y + 1 }];
export const isRoad = (tile: string | undefined): tile is Road =>
  tile === 'road' || tile === 'avenue' || tile === 'bridge';
export type GameCommand =
  /** Paves streets unless `road` says otherwise. A street never replaces an avenue. */
  | { type: 'BUILD_ROAD'; path: Cell[]; road?: Road }
  | { type: 'SET_ZONE'; tiles: Cell[]; zone: Zone }
  | { type: 'BUILD_FACILITY'; x: number; y: number; facility: Facility }
  | { type: 'BUILD_PARK'; tiles: Cell[] }
  | { type: 'BUILD_FARM'; tiles: Cell[] }
  | { type: 'BUILD_SERVICE'; x: number; y: number; service: Service }
  | { type: 'BUILD_BUS_STOP'; x: number; y: number }
  | { type: 'BUILD_METRO'; x: number; y: number }
  /** Raises an elevated road over these tiles, whatever is on them. */
  | { type: 'BUILD_VIADUCT'; path: Cell[] }
  | { type: 'DEMOLISH'; x: number; y: number };

/** The part of a generated map, from the top left corner, that never gets water. */
export const DRY_CORNER = { width: 34, height: 16 };

export class TileMap {
  private roadVersion = 0;
  private layoutVersion = 0;

  get layoutRevision(): number {
    return this.layoutVersion;
  }

  get roadRevision(): number {
    return this.roadVersion;
  }

  private readonly tiles: Tile[] = Array<Tile>(MAP_SIZE ** 2).fill('grass');
  /** The road tiles with a metro station under them. */
  private readonly stations = new Set<number>();

  /** The tiles an elevated road passes over. */
  private readonly spans = new Set<number>();

  /** Whether an elevated road passes over a cell. */
  hasSpan({ x, y }: Cell): boolean {
    return x >= 0 && y >= 0 && x < MAP_SIZE && y < MAP_SIZE && this.spans.has(y * MAP_SIZE + x);
  }

  /** The tiles an elevated road passes over, in order. */
  spanTiles(): number[] {
    return [...this.spans].sort((a, b) => a - b);
  }

  /** Whether there is a metro station under a cell. */
  hasStation({ x, y }: Cell): boolean {
    return this.stations.has(y * MAP_SIZE + x);
  }

  /** The tiles with a metro station under them, in order. */
  stationTiles(): number[] {
    return [...this.stations].sort((a, b) => a - b);
  }

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
   * The top left corner of the big building a cell is part of, if it is. An annex belongs to
   * the big building to its left, above it or up and to the left; buildings never overlap, so
   * only one of those can be one whose footprint reaches it.
   */
  anchorOf(cell: Cell): Cell | undefined {
    const tile = this.get(cell);
    if (isBig(tile)) return cell;
    if (tile !== 'annex') return undefined;
    const { x, y } = cell;
    // The tile above or to the left may itself be an annex of the same building.
    for (const anchor of [{ x: x - 1, y }, { x, y: y - 1 }, { x: x - 1, y: y - 1 }]) {
      if (isBig(this.get(anchor))) return anchor;
    }
  }

  /** Turns cells into water, whatever they were. For laying out terrain, not for play. */
  flood(cells: readonly Cell[]): void {
    this.layoutVersion++;
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
    { changed: Cell[]; error?: string; layer?: boolean } {
    // An elevated road goes over whatever is there and leaves it as it is.
    if (command.type === 'BUILD_VIADUCT') {
      if (command.path.some(cell => this.get(cell) === undefined)) return { changed: [], error: '超出地圖範圍了。' };
      const fresh = command.path.filter(cell => !this.hasSpan(cell));
      const error = fresh.length ? approve?.(fresh.map(cell => ({ cell, tile: 'viaduct' as const }))) : undefined;
      if (error) return { changed: [], error };
      for (const { x, y } of fresh) this.spans.add(y * MAP_SIZE + x);
      if (fresh.length) this.roadVersion++;
      return { changed: fresh, layer: true };
    }
    // Pulling down under an elevated road takes the elevated road first and leaves the rest.
    if (command.type === 'DEMOLISH' && this.hasSpan(command)) {
      const cell = { x: command.x, y: command.y };
      const error = approve?.([{ cell, tile: 'grass' }]);
      if (error) return { changed: [], error };
      this.spans.delete(cell.y * MAP_SIZE + cell.x);
      this.roadVersion++;
      return { changed: [cell], layer: true };
    }
    // A metro station goes under a road and leaves the road as it is.
    if (command.type === 'BUILD_METRO') {
      const cell = { x: command.x, y: command.y };
      const current = this.get(cell);
      if (current === undefined) return { changed: [], error: '超出地圖範圍了。' };
      if (current !== 'road' && current !== 'avenue') {
        return { changed: [], error: '捷運站要蓋在道路或大道上：入口在路邊，車站在地下。橋上不能蓋。' };
      }
      if (this.hasStation(cell)) return { changed: [] };
      const error = approve?.([{ cell, tile: 'metro' }]);
      if (error) return { changed: [], error };
      this.layoutVersion++;
      this.stations.add(cell.y * MAP_SIZE + cell.x);
      return { changed: [cell], layer: true };
    }
    // Pulling down a road that has a station takes the station first and leaves the road.
    if (command.type === 'DEMOLISH' && this.hasStation(command)) {
      const cell = { x: command.x, y: command.y };
      const error = approve?.([{ cell, tile: 'grass' }]);
      if (error) return { changed: [], error };
      this.layoutVersion++;
      this.stations.delete(cell.y * MAP_SIZE + cell.x);
      return { changed: [cell], layer: true };
    }
    const big = command.type === 'BUILD_SERVICE' && isBig(command.service);
    const cells = command.type === 'BUILD_ROAD' ? command.path :
      command.type === 'SET_ZONE' || command.type === 'BUILD_PARK' || command.type === 'BUILD_FARM' ? command.tiles :
      big ? footprint(command) : [{ x: command.x, y: command.y }];
    const tile: Tile = command.type === 'BUILD_ROAD' ? command.road ?? 'road' :
      command.type === 'SET_ZONE' ? command.zone :
      command.type === 'BUILD_FACILITY' ? command.facility :
      command.type === 'BUILD_PARK' ? 'park' :
      command.type === 'BUILD_FARM' ? 'farm' :
      command.type === 'BUILD_SERVICE' ? command.service :
      command.type === 'BUILD_BUS_STOP' ? 'bus' : 'grass';

    for (const cell of cells) {
      const current = this.get(cell);
      if (current === undefined) return { changed: [], error: '超出地圖範圍了。' };
      if (big && (current === 'annex' || isBig(current) || isRoad(current))) {
        return { changed: [], error: '這種建築要佔 2 × 2 四格，這裡被別的大建築或道路擋住了。' };
      }
      if (current === 'river' && command.type !== 'BUILD_ROAD') {
        return { changed: [], error: command.type === 'DEMOLISH' ? '河流拆不掉。' :
          '水上不能蓋東西。只有道路可以過河，鋪過去會變成橋。' };
      }
      if (command.type === 'SET_ZONE' && isRoad(current)) {
        return { changed: [], error: '道路上不能劃分區，要先拆掉道路。' };
      }
      if ((command.type === 'BUILD_FACILITY' || command.type === 'BUILD_SERVICE' ||
          command.type === 'BUILD_BUS_STOP') && isRoad(current)) {
        return { changed: [], error: '道路上不能蓋東西，要先拆掉道路。' };
      }
      if (command.type === 'BUILD_FARM' && isRoad(current)) {
        return { changed: [], error: '道路上不能種田，要先拆掉道路。' };
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
    const changes = cells.map((cell, index) => ({ cell, tile: big && index ? 'annex' as const : becomes(this.get(cell)!) }))
      .filter(({ cell, tile: next }) => this.get(cell) !== next);
    // Whatever touches part of a big building takes all of it down.
    const touched = new Set(changes.map(({ cell }) => cell.y * MAP_SIZE + cell.x));
    for (const { cell } of [...changes]) {
      const anchor = big ? undefined : this.anchorOf(cell);
      if (!anchor) continue;
      for (const part of footprint(anchor)) {
        const id = part.y * MAP_SIZE + part.x;
        if (touched.has(id)) continue;
        touched.add(id);
        changes.push({ cell: part, tile: 'grass' });
      }
    }
    const error = changes.length ? approve?.(changes) : undefined;
    if (error) return { changed: [], error };
    if (changes.some(({ cell, tile: next }) => isRoad(next) || isRoad(this.get(cell)))) this.roadVersion++;
    if (changes.length) this.layoutVersion++;
    for (const { cell: { x, y }, tile: next } of changes) this.tiles[y * MAP_SIZE + x] = next;
    return { changed: changes.map(({ cell }) => cell) };
  }

  save(): Uint8Array {
    return Uint8Array.from(this.tiles, tile => TILES.indexOf(tile));
  }

  load(codes: Uint8Array, stations: readonly number[] = [], spans: readonly number[] = []): void {
    this.roadVersion++;
    this.layoutVersion++;
    this.spans.clear();
    for (const id of spans) this.spans.add(id);
    this.stations.clear();
    for (const id of stations) this.stations.add(id);
    codes.forEach((code, index) => { this.tiles[index] = TILES[code]; });
  }
}
