import { Container, Graphics, Rectangle, Texture, type TextureSource } from 'pixi.js';
import { MAP_SIZE, TILE_SIZE, type Cell, type Zone } from '../simulation/TileMap';
import { Camera } from './Camera';

import type { BuildingSystem } from '../simulation/BuildingSystem';

// Both sheets hold 16px tiles, drawn at twice their size.
const SOURCE_TILE = 16;
const SCALE = TILE_SIZE / SOURCE_TILE;

// Tile coordinates in src/assets/tiles.png (Kenney "Roguelike Modern City", CC0).
const GRASS = [[0, 24], [1, 24]];
// Light green and orange only: the pack's dark green foliage vanishes against the grass.
const TREES = [31, 31, 34, 32];
const BUSHES = [[31, 13], [34, 13], [31, 13], [32, 13]];

// Rows of src/assets/city.png, our own tiles; tools/draw_tiles.py documents the layout.
const ROAD_ROW = 0;
const LOT_ROW = 1;
const BUILDING_ROW = 2;
const BUILDING_VARIANTS = 4;
const zoneIndex: Record<Zone, number> = { residential: 0, commercial: 1, industrial: 2 };
// Bit per neighbouring road, matching the column order of the road row.
const roadSides = [[0, -1, 1], [1, 0, 2], [0, 1, 4], [-1, 0, 8]];

const hash = (x: number, y: number) =>
  (Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(x + y, 83492791)) >>> 0;

export class TileRenderer {
  readonly view = new Container();
  private readonly tiles = new Graphics();
  // Highlights get their own layer: a Graphics keeps the alpha of its last fill, even
  // across clear(), and applies it to every texture drawn afterwards.
  private readonly overlay = new Graphics();
  private readonly frames = new Map<TextureSource, Map<number, Texture>>();

  constructor(private readonly kenney: TextureSource, private readonly city: TextureSource) {
    this.view.addChild(this.tiles, this.overlay);
  }

  /** The tile at (column, row) of a sheet. */
  private frame(sheet: TextureSource, column: number, row: number): Texture {
    let frames = this.frames.get(sheet);
    if (!frames) this.frames.set(sheet, frames = new Map());
    const key = row * 1024 + column;
    let texture = frames.get(key);
    if (!texture) {
      texture = new Texture({ source: sheet, frame: new Rectangle(
        column * SOURCE_TILE, row * SOURCE_TILE, SOURCE_TILE, SOURCE_TILE) });
      frames.set(key, texture);
    }
    return texture;
  }

  draw(city: BuildingSystem, camera: Camera, width: number, height: number, preview: Cell[],
    selected?: Cell) {
    const map = city.map;
    const start = camera.cellAt(0, 0);
    const end = camera.cellAt(width, height);
    const g = this.tiles.clear();
    const overlay = this.overlay.clear();
    this.view.position.set(Math.round(camera.x), Math.round(camera.y));
    this.view.scale.set(camera.scale);

    const put = (sheet: TextureSource, column: number, row: number, x: number, y: number) =>
      g.texture(this.frame(sheet, column, row), 0xffffff,
        x * TILE_SIZE, y * TILE_SIZE, SOURCE_TILE * SCALE, SOURCE_TILE * SCALE);
    const tileAt = ([column, row]: number[], x: number, y: number) => put(this.kenney, column, row, x, y);
    const cityAt = (column: number, row: number, x: number, y: number) => put(this.city, column, row, x, y);

    // One extra row below so trees rooted just off-screen still show their tops.
    for (let y = Math.max(0, start.y); y <= Math.min(MAP_SIZE - 1, end.y + 1); y++) {
      for (let x = Math.max(0, start.x); x <= Math.min(MAP_SIZE - 1, end.x); x++) {
        const tile = map.get({ x, y })!;
        const seed = hash(x, y);

        if (tile === 'grass') {
          tileAt(GRASS[seed % 7 === 0 ? 1 : 0], x, y);
          const roll = (seed >>> 8) % 100;
          // A tree's canopy covers the tile above, so it only grows below open grass.
          if (roll < 4 && map.get({ x, y: y - 1 }) === 'grass') {
            const column = TREES[(seed >>> 16) % TREES.length];
            tileAt([column, 10], x, y - 1);
            tileAt([column, 11], x, y);
          } else if (roll < 8) {
            tileAt(BUSHES[(seed >>> 16) % BUSHES.length], x, y);
          }
        } else if (tile === 'road') {
          let mask = 0;
          for (const [dx, dy, bit] of roadSides) {
            if (map.get({ x: x + dx, y: y + dy }) === 'road') mask |= bit;
          }
          cityAt(mask, ROAD_ROW, x, y);
        } else {
          cityAt(zoneIndex[tile], LOT_ROW, x, y);
          const building = city.getBuilding({ x, y });
          if (building) {
            cityAt(((seed >>> 4) + building.level - 1) % BUILDING_VARIANTS, BUILDING_ROW + zoneIndex[tile], x, y);
          }
        }
      }
    }

    for (const { x, y } of preview) {
      if (map.get({ x, y }) === undefined) continue;
      overlay.rect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE)
        .fill({ color: 0xffffff, alpha: 0.35 });
    }
    if (selected) {
      overlay.rect(selected.x * TILE_SIZE + 1, selected.y * TILE_SIZE + 1, TILE_SIZE - 2, TILE_SIZE - 2)
        .stroke({ color: 0xffffff, width: 2 });
    }
  }
}
