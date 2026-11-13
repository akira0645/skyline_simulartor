export const MAP_SIZE = 128;
export const TILE_SIZE = 32;

export interface Cell { x: number; y: number }
export type Zone = 'residential' | 'commercial' | 'industrial';
export type Tile = 'grass' | 'road' | Zone;
/** Save files store tiles as indices into this list, so only append to it. */
export const TILES: readonly Tile[] = ['grass', 'road', 'residential', 'commercial', 'industrial'];
export type GameCommand =
  | { type: 'BUILD_ROAD'; path: Cell[] }
  | { type: 'SET_ZONE'; tiles: Cell[]; zone: Zone }
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

  execute(command: GameCommand): { changed: Cell[]; error?: string } {
    const cells = command.type === 'BUILD_ROAD' ? command.path :
      command.type === 'SET_ZONE' ? command.tiles : [command];
    const tile = command.type === 'BUILD_ROAD' ? 'road' :
      command.type === 'SET_ZONE' ? command.zone : 'grass';

    for (const cell of cells) {
      const current = this.get(cell);
      if (current === undefined) return { changed: [], error: '選取範圍超出地圖。' };
      if (command.type === 'SET_ZONE' && current === 'road') {
        return { changed: [], error: '分區不能覆蓋道路。' };
      }
    }

    const changed = cells.filter(cell => this.get(cell) !== tile);
    if (changed.some(cell => tile === 'road' || this.get(cell) === 'road')) this.roadVersion++;
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
