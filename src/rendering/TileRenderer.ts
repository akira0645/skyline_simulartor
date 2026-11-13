import { Container, Graphics, Rectangle, Texture, type TextureSource } from 'pixi.js';
import { isFacility, isRoad, MAP_SIZE, TILE_SIZE, type Cell, type Facility, type Zone } from '../simulation/TileMap';
import type { Overlay } from '../app/tools';
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
// Columns of each building row by level: small buildings first, the largest last.
const BUILDING_ART: Record<Zone, number[][]> = {
  residential: [[0, 1, 2], [3, 4], [5]],
  commercial: [[0, 1, 3], [2, 4], [5]],
  industrial: [[1, 3], [0, 2], [4]],
};
const zoneIndex: Record<Zone, number> = { residential: 0, commercial: 1, industrial: 2 };
// Bit per neighbouring road, matching the column order of the road row.
const roadSides = [[0, -1, 1], [1, 0, 2], [0, 1, 4], [-1, 0, 8]];

// Traffic tint by flow as a share of road capacity: free, busy, full, jammed.
const TRAFFIC_COLOURS: [number, number][] = [[0.5, 0x4fc46b], [1, 0xf2d04b], [1.5, 0xf08a3c], [Infinity, 0xd9423a]];
// The yellow median that tells an avenue from a street: [x, y, width, height] per road side.
const MEDIAN = 0xf2c94c;
const medianArms = [[15, 0, 2, 16], [16, 15, 16, 2], [15, 16, 2, 16], [0, 15, 16, 2]];
const SMOG = 0x6b3fa0;
// Land value from poor to prime.
const VALUE_COLOURS: [number, number][] = [[30, 0xd9423a], [45, 0xf08a3c], [65, 0xf2d04b], [Infinity, 0x4fc46b]];
const LEVEL_PIP = 0xffd95a;
const SERVED = 0x4fc46b;
const UNSERVED = 0xd9423a;
// Roof colours of the facilities, which are drawn here rather than taken from a sheet.
const FACILITY_ROOF = { power: 0xf4ca65, water: 0x74c7ed };

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
    selected?: Cell, layer: Overlay = 'none',
    range?: { centre: Cell; radius: number; kind: Facility }) {
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
        } else if (isRoad(tile)) {
          let mask = 0;
          for (const [dx, dy, bit] of roadSides) {
            if (isRoad(map.get({ x: x + dx, y: y + dy }))) mask |= bit;
          }
          cityAt(mask, ROAD_ROW, x, y);
          const left = x * TILE_SIZE;
          const top = y * TILE_SIZE;
          if (mask === 10) {
            g.rect(left, top, TILE_SIZE, 5).rect(left, top + 27, TILE_SIZE, 5).fill(0xa5a29a);
          } else if (mask === 5) {
            g.rect(left, top, 5, TILE_SIZE).rect(left + 27, top, 5, TILE_SIZE).fill(0xa5a29a);
          }
          if (tile === 'avenue') {
            g.rect(left + 14, top + 14, 4, 4);
            medianArms.forEach(([ax, ay, width, height], side) => {
              if (mask & (1 << side)) g.rect(left + ax, top + ay, width, height);
            });
            g.fill(MEDIAN);
          }
        } else if (tile === 'park') {
          tileAt(GRASS[1], x, y);
          const left = x * TILE_SIZE;
          const top = y * TILE_SIZE;
          // A lawn with a pale path round it and a shrub or a flower bed in the middle.
          g.rect(left, top, TILE_SIZE, 3).rect(left, top + 29, TILE_SIZE, 3)
            .rect(left, top, 3, TILE_SIZE).rect(left + 29, top, 3, TILE_SIZE).fill(0xd9cfa8);
          if (seed % 3) tileAt(BUSHES[(seed >>> 16) % BUSHES.length], x, y);
          else g.rect(left + 11, top + 11, 10, 10).fill(0xe8799a).rect(left + 14, top + 14, 4, 4).fill(0xf6e27a);
        } else if (isFacility(tile)) {
          tileAt(GRASS[0], x, y);
          const left = x * TILE_SIZE;
          const top = y * TILE_SIZE;
          g.rect(left + 4, top + 5, 24, 23).fill(0x26353e);
          g.rect(left + 8, top + 8, 16, 11).fill(FACILITY_ROOF[tile]);
          g.rect(left + 9, top + 20, 14, 5).fill(0x83949e);
        } else {
          cityAt(zoneIndex[tile], LOT_ROW, x, y);
          const building = city.getBuilding({ x, y });
          if (building) {
            const art = BUILDING_ART[tile][building.level - 1];
            cityAt(art[(seed >>> 4) % art.length], BUILDING_ROW + zoneIndex[tile], x, y);
            // One gold pip per level above the first, in the top right corner of the lot.
            for (let pip = 1; pip < building.level; pip++) {
              const left = x * TILE_SIZE + TILE_SIZE - 7 * pip;
              g.rect(left - 1, y * TILE_SIZE + 1, 7, 7).fill(0x25232b);
              g.rect(left, y * TILE_SIZE + 2, 5, 5).fill(LEVEL_PIP);
            }
          }
        }
      }
    }

    if (layer !== 'none') {
      for (let y = Math.max(0, start.y); y <= Math.min(MAP_SIZE - 1, end.y); y++) {
        for (let x = Math.max(0, start.x); x <= Math.min(MAP_SIZE - 1, end.x); x++) {
          const cell = { x, y };
          let colour: number | undefined;
          if (layer === 'pollution') {
            const level = city.pollutionAt(cell);
            if (level > 0) {
              overlay.rect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE)
                .fill({ color: SMOG, alpha: 0.15 + 0.6 * level / 100 });
            }
            continue;
          }
          if (layer === 'value') {
            const tile = map.get(cell);
            if (tile !== 'residential' && tile !== 'commercial' && tile !== 'industrial') continue;
            const value = city.landValueAt(cell);
            overlay.rect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE)
              .fill({ color: VALUE_COLOURS.find(([limit]) => value < limit)![1], alpha: 0.55 });
            continue;
          }
          if (layer === 'traffic') {
            if (!isRoad(map.get(cell))) continue;
            const load = city.congestionAt(cell);
            colour = TRAFFIC_COLOURS.find(([limit]) => load <= limit)![1];
          } else if (city.hasBuilding(cell)) {
            colour = city.isServed(cell, layer) ? SERVED : UNSERVED;
          }
          if (colour === undefined) continue;
          overlay.rect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE)
            .fill({ color: colour, alpha: 0.55 });
        }
      }
    }

    if (range) {
      // The reach of a facility: a tinted diamond with a solid edge.
      const { centre, radius } = range;
      const colour = FACILITY_ROOF[range.kind];
      const inside = (x: number, y: number) => Math.abs(x - centre.x) + Math.abs(y - centre.y) <= radius;
      for (let y = centre.y - radius; y <= centre.y + radius; y++) {
        for (let x = centre.x - radius; x <= centre.x + radius; x++) {
          if (!inside(x, y) || map.get({ x, y }) === undefined) continue;
          const left = x * TILE_SIZE;
          const top = y * TILE_SIZE;
          overlay.rect(left, top, TILE_SIZE, TILE_SIZE).fill({ color: colour, alpha: 0.16 });
          if (!inside(x, y - 1)) overlay.rect(left, top, TILE_SIZE, 3).fill({ color: colour, alpha: 0.95 });
          if (!inside(x, y + 1)) overlay.rect(left, top + TILE_SIZE - 3, TILE_SIZE, 3).fill({ color: colour, alpha: 0.95 });
          if (!inside(x - 1, y)) overlay.rect(left, top, 3, TILE_SIZE).fill({ color: colour, alpha: 0.95 });
          if (!inside(x + 1, y)) overlay.rect(left + TILE_SIZE - 3, top, 3, TILE_SIZE).fill({ color: colour, alpha: 0.95 });
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
