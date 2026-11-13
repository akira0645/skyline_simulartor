import { Graphics, Rectangle, Texture, type TextureSource } from 'pixi.js';
import { MAP_SIZE, TILE_SIZE, type Cell, type Zone } from '../simulation/TileMap';
import { Camera } from './Camera';

import type { BuildingSystem } from '../simulation/BuildingSystem';

// Tile coordinates in src/assets/tiles.png (Kenney "Roguelike Modern City", CC0).
const SOURCE_TILE = 16;
const SCALE = TILE_SIZE / SOURCE_TILE;
const HALF = SOURCE_TILE / 2;

const GRASS = [[0, 24], [1, 24]];
const ROAD_HORIZONTAL = [9, 19];
const ROAD_VERTICAL = [9, 20];
const ASPHALT = { x: 9 * SOURCE_TILE + HALF, y: 19 * SOURCE_TILE + HALF };
// Light green and orange only: the pack's dark green foliage vanishes against the grass.
const TREES = [31, 31, 34, 32];
const BUSHES = [[31, 13], [34, 13], [31, 13], [32, 13]];
const lots: Record<Zone, number[]> = {
  residential: [4, 20], commercial: [7, 20], industrial: [1, 20],
};
// Left column of each roof colour; its first 2×2 tiles are the four corners.
const roofs: Record<Zone, number> = { residential: 0, industrial: 8, commercial: 16 };
const ROOF_VENT = { column: 6, row: 1 };
// Wall tiles (left end, middle, right end); the part below ROOF_DEPTH is the south facade.
const ROOF_DEPTH = 6;
const walls: Record<Zone, { columns: number[]; row: number }> = {
  residential: { columns: [9, 10, 11], row: 8 },
  industrial: { columns: [5, 6, 7], row: 8 },
  commercial: { columns: [13, 14, 15], row: 10 },
};

const hash = (x: number, y: number) =>
  (Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(x + y, 83492791)) >>> 0;

export class TileRenderer {
  readonly graphic = new Graphics();
  private readonly frames = new Map<number, Texture>();

  constructor(private readonly sheet: TextureSource) {}

  private frame(x: number, y: number, width: number, height: number): Texture {
    const key = ((x * 1024 + y) * 32 + width) * 32 + height;
    let texture = this.frames.get(key);
    if (!texture) {
      texture = new Texture({ source: this.sheet, frame: new Rectangle(x, y, width, height) });
      this.frames.set(key, texture);
    }
    return texture;
  }

  draw(city: BuildingSystem, camera: Camera, width: number, height: number, preview: Cell[]) {
    const map = city.map;
    const start = camera.cellAt(0, 0);
    const end = camera.cellAt(width, height);
    const g = this.graphic.clear();
    g.position.set(Math.round(camera.x), Math.round(camera.y));
    g.scale.set(camera.scale);

    // Source pixels (sx, sy) → world pixels (dx, dy).
    const put = (sx: number, sy: number, w: number, h: number, dx: number, dy: number) =>
      g.texture(this.frame(sx, sy, w, h), 0xffffff, dx, dy, w * SCALE, h * SCALE);
    const tileAt = ([column, row]: number[], x: number, y: number) =>
      put(column * SOURCE_TILE, row * SOURCE_TILE, SOURCE_TILE, SOURCE_TILE, x * TILE_SIZE, y * TILE_SIZE);

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
          const isRoad = (dx: number, dy: number) => map.get({ x: x + dx, y: y + dy }) === 'road';
          const horizontal = isRoad(-1, 0) || isRoad(1, 0);
          const vertical = isRoad(0, -1) || isRoad(0, 1);
          if (horizontal && !vertical) tileAt(ROAD_HORIZONTAL, x, y);
          else if (vertical && !horizontal) tileAt(ROAD_VERTICAL, x, y);
          else {
            for (const [qx, qy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
              put(ASPHALT.x, ASPHALT.y, HALF, HALF,
                x * TILE_SIZE + qx * HALF * SCALE, y * TILE_SIZE + qy * HALF * SCALE);
            }
          }
        } else if (!city.hasBuilding({ x, y })) {
          tileAt(lots[tile], x, y);
        } else {
          // Neighbouring buildings of the same zone share one roof: each quarter of
          // the tile picks the corner, edge or centre piece that fits its two sides.
          const joined = (dx: number, dy: number) => {
            const cell = { x: x + dx, y: y + dy };
            return map.get(cell) === tile && city.hasBuilding(cell);
          };
          const left = joined(-1, 0), right = joined(1, 0);
          const up = joined(0, -1), down = joined(0, 1);
          const base = roofs[tile] * SOURCE_TILE;

          if (left && right && up && down && seed % 5 === 0) {
            tileAt([roofs[tile] + ROOF_VENT.column, ROOF_VENT.row], x, y);
          } else {
            const wx = x * TILE_SIZE, wy = y * TILE_SIZE, step = HALF * SCALE;
            const sxLeft = base + (left ? 16 : 0), sxRight = base + (right ? 8 : 24);
            const syTop = up ? 16 : 0;
            if (down) {
              put(sxLeft, syTop, HALF, HALF, wx, wy);
              put(sxRight, syTop, HALF, HALF, wx + step, wy);
              put(sxLeft, 8, HALF, HALF, wx, wy + step);
              put(sxRight, 8, HALF, HALF, wx + step, wy + step);
            } else {
              // The southern edge of a block shows its wall below a shorter strip of roof.
              const { columns, row } = walls[tile];
              const sy = row * SOURCE_TILE + ROOF_DEPTH;
              const wallY = wy + ROOF_DEPTH * SCALE, wallDepth = SOURCE_TILE - ROOF_DEPTH;
              put(sxLeft, syTop, HALF, ROOF_DEPTH, wx, wy);
              put(sxRight, syTop, HALF, ROOF_DEPTH, wx + step, wy);
              put(columns[left ? 1 : 0] * SOURCE_TILE, sy, HALF, wallDepth, wx, wallY);
              put(columns[right ? 1 : 2] * SOURCE_TILE + HALF, sy, HALF, wallDepth, wx + step, wallY);
            }
          }
        }
      }
    }

    for (const { x, y } of preview) {
      if (map.get({ x, y }) === undefined) continue;
      g.rect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE)
        .fill({ color: 0xffffff, alpha: 0.35 });
    }
  }
}
