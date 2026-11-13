import { Container, Graphics, Rectangle, Texture, type TextureSource } from 'pixi.js';
import { isFacility, isRoad, isService, MAP_SIZE, TILE_SIZE, type Cell, type Facility, type Service,
  type Zone } from '../simulation/TileMap';
import type { Overlay } from '../app/tools';
import { Camera } from './Camera';

import type { BuildingSystem } from '../simulation/BuildingSystem';
import type { Line } from '../simulation/Transit';
import { lineColour } from '../app/lineColours';

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
  residential: [[0, 1, 2, 10], [3, 4, 6, 7], [5, 8, 9]],
  commercial: [[0, 1, 3], [2, 4, 6, 7], [5, 8, 9]],
  industrial: [[1, 3, 5], [0, 2, 6], [4, 7, 8]],
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
// The colour each civic building's reach is outlined in, and its column in the civic row.
const FACILITY_ROOF: Record<Facility | Service | 'bus' | 'metro', number> = {
  power: 0xf4ca65, water: 0x74c7ed, fire: 0xe36a55, police: 0x6f8fd0, school: 0xf0a55a, clinic: 0xf4f6f8,
  bus: 0xf2c94c, metro: 0xe5484d,
};
const WATER = [0x3f8fc4, 0x6fb4dc, 0x2f78ab];
const SHORE = 0xd9cfa8;
const RAIL = 0x8a5a3a;
const CIVIC_ROW = 5;
// Where the two-by-two buildings start, and the column of the housing complex among them.
const BIG_ROW = 6;
const COMPLEX_ART = 0;
const FOUNTAIN = [0x8f97a1, 0x74c7ed, 0xdff3fb];
const CIVIC_ART: Record<Facility | Service | 'bus' | 'metro', number> =
  { power: 0, water: 1, fire: 2, police: 3, school: 4, clinic: 5, bus: 6, metro: 7 };


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

  /** A building of two tiles by two from the city sheet, by its place in the row of them. */
  private bigFrame(column: number): Texture {
    const key = -1 - column;
    let frames = this.frames.get(this.city);
    if (!frames) this.frames.set(this.city, frames = new Map());
    let texture = frames.get(key);
    if (!texture) {
      texture = new Texture({ source: this.city, frame: new Rectangle(
        column * 2 * SOURCE_TILE, BIG_ROW * SOURCE_TILE, 2 * SOURCE_TILE, 2 * SOURCE_TILE) });
      frames.set(key, texture);
    }
    return texture;
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
    range?: { centre: Cell; radius: number; kind: Facility | Service | 'bus' | 'metro' }, hour?: number,
    lines: readonly Line[] = []) {
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

    // Housing complexes in view, by their top left tile. They are drawn after the lots they cover.
    const complexes = new Set<number>();

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
        } else if (tile === 'river' || tile === 'bridge') {
          const left = x * TILE_SIZE;
          const top = y * TILE_SIZE;
          g.rect(left, top, TILE_SIZE, TILE_SIZE).fill(WATER[0]);
          // Two ripples per tile, placed by the tile's own hash so the water does not look tiled.
          g.rect(left + (seed >>> 3) % 20, top + 6 + (seed >>> 9) % 6, 10, 2).fill(WATER[1]);
          g.rect(left + (seed >>> 13) % 18, top + 20 + (seed >>> 17) % 6, 12, 2).fill(WATER[2]);
          // A strip of sand wherever the water meets land.
          roadSides.forEach(([dx, dy], side) => {
            const next = map.get({ x: x + dx, y: y + dy });
            if (next === undefined || next === 'river' || next === 'bridge') return;
            const across = side % 2 === 0;
            g.rect(left + (side === 1 ? TILE_SIZE - 3 : 0), top + (side === 2 ? TILE_SIZE - 3 : 0),
              across ? TILE_SIZE : 3, across ? 3 : TILE_SIZE).fill(SHORE);
          });
          if (tile === 'bridge') {
            let mask = 0;
            for (const [dx, dy, bit] of roadSides) {
              if (isRoad(map.get({ x: x + dx, y: y + dy }))) mask |= bit;
            }
            // The deck is the road tile for its neighbours, with a wooden rail on the open sides.
            const upright = (mask & 5) !== 0 && (mask & 10) === 0;
            cityAt(upright ? 5 : 10, ROAD_ROW, x, y);
            if (upright) g.rect(left, top, 4, TILE_SIZE).rect(left + 28, top, 4, TILE_SIZE).fill(RAIL);
            else g.rect(left, top, TILE_SIZE, 4).rect(left, top + 28, TILE_SIZE, 4).fill(RAIL);
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
          const park = city.parkAt({ x, y });
          if (park.big) {
            // One lawn: the pale path runs only along the outside of the whole park.
            roadSides.forEach(([dx, dy], side) => {
              if (map.get({ x: x + dx, y: y + dy }) === 'park') return;
              const across = side % 2 === 0;
              g.rect(left + (side === 1 ? TILE_SIZE - 3 : 0), top + (side === 2 ? TILE_SIZE - 3 : 0),
                across ? TILE_SIZE : 3, across ? 3 : TILE_SIZE).fill(0xd9cfa8);
            });
            if (park.fountain) {
              g.rect(left + 5, top + 5, 22, 22).fill(FOUNTAIN[0]);
              g.rect(left + 8, top + 8, 16, 16).fill(FOUNTAIN[1]);
              g.rect(left + 14, top + 12, 4, 8).rect(left + 12, top + 14, 8, 4).fill(FOUNTAIN[2]);
            } else if (seed % 4 === 0) {
              g.rect(left + 11, top + 11, 10, 10).fill(0xe8799a).rect(left + 14, top + 14, 4, 4).fill(0xf6e27a);
            } else if (seed % 4 < 3) {
              tileAt(BUSHES[(seed >>> 16) % BUSHES.length], x, y);
            }
          } else {
            // A lawn with a pale path round it and a shrub or a flower bed in the middle.
            g.rect(left, top, TILE_SIZE, 3).rect(left, top + 29, TILE_SIZE, 3)
              .rect(left, top, 3, TILE_SIZE).rect(left + 29, top, 3, TILE_SIZE).fill(0xd9cfa8);
            if (seed % 3) tileAt(BUSHES[(seed >>> 16) % BUSHES.length], x, y);
            else g.rect(left + 11, top + 11, 10, 10).fill(0xe8799a).rect(left + 14, top + 14, 4, 4).fill(0xf6e27a);
          }
        } else if (isFacility(tile) || isService(tile) || tile === 'bus' || tile === 'metro') {
          tileAt(GRASS[0], x, y);
          cityAt(CIVIC_ART[tile], CIVIC_ROW, x, y);
        } else {
          cityAt(zoneIndex[tile], LOT_ROW, x, y);
          const building = city.getBuilding({ x, y });
          if (building?.block !== undefined) {
            complexes.add(building.block);
          } else if (building) {
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

    for (const anchor of complexes) {
      g.texture(this.bigFrame(COMPLEX_ART), 0xffffff, anchor % MAP_SIZE * TILE_SIZE,
        Math.floor(anchor / MAP_SIZE) * TILE_SIZE, 2 * TILE_SIZE, 2 * TILE_SIZE);
    }

    if (layer !== 'none') {
      for (let y = Math.max(0, start.y); y <= Math.min(MAP_SIZE - 1, end.y); y++) {
        for (let x = Math.max(0, start.x); x <= Math.min(MAP_SIZE - 1, end.x); x++) {
          const cell = { x, y };
          let colour: number | undefined;
          if (layer === 'lines') continue;
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
            const load = city.congestionAt(cell, hour);
            colour = TRAFFIC_COLOURS.find(([limit]) => load <= limit)![1];
          } else if (city.hasBuilding(cell)) {
            colour = (layer === 'bus' || layer === 'metro' ? city.hasTransit(cell) :
              isService(layer) ? city.isCovered(cell, layer) : city.isServed(cell, layer)) ? SERVED : UNSERVED;
          }
          if (colour === undefined) continue;
          overlay.rect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE)
            .fill({ color: colour, alpha: 0.55 });
        }
      }
    }

    // Bus and metro lines: a coloured band along the route and a ring at each stop.
    const half = TILE_SIZE / 2;
    for (const line of lines) {
      const colour = lineColour(line.id);
      const band = line.kind === 'metro' ? 8 : 5;
      for (let step = 1; step < line.path.length; step++) {
        const from = line.path[step - 1];
        const to = line.path[step];
        const left = Math.min(from.x, to.x) * TILE_SIZE + half - band / 2;
        const top = Math.min(from.y, to.y) * TILE_SIZE + half - band / 2;
        overlay.rect(left, top, Math.abs(to.x - from.x) * TILE_SIZE + band, Math.abs(to.y - from.y) * TILE_SIZE + band)
          .fill({ color: colour, alpha: 0.85 });
      }
      for (const stop of line.stops) {
        const x = stop % MAP_SIZE * TILE_SIZE;
        const y = Math.floor(stop / MAP_SIZE) * TILE_SIZE;
        overlay.rect(x + 1, y + 1, TILE_SIZE - 2, TILE_SIZE - 2).stroke({ color: colour, width: 4 });
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
