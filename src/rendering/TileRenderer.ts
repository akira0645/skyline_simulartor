import { numberBadge } from './routeBadges';
import { Container, Graphics, Rectangle, Texture, type TextureSource } from 'pixi.js';
import { isBig, isFacility, isRoad, isService, MAP_SIZE, TILE_SIZE, type Cell, type Facility, type Service,
  type Zone } from '../simulation/TileMap';
import type { HomeKind } from '../simulation/Residents';
import type { Overlay } from '../app/tools';
import { shiftIndex } from '../simulation/WorkShift';
import { industryAt } from '../simulation/Industry';
import { Camera } from './Camera';
import buildingAtlas from '../assets/buildings/atlas.json';
import { DETAIL_ZOOM, terrainResolution } from './detailLevel';
import type { StreetArt } from './StreetArt';
export { DETAIL_ZOOM } from './detailLevel';

import type { BuildingSystem } from '../simulation/BuildingSystem';
import type { MapRoute } from './routeViews';
import type { Theme } from '../simulation/SaveData';
import { seasonAt } from '../simulation/Seasons';
import { lineColour } from '../app/lineColours';

// The Kenney sheet holds 16px tiles, drawn at twice their size; our own sheet holds 32px tiles, drawn as they are.
const SOURCE_TILE = 16;
const CITY_TILE = 32;

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
const SHOP_ART = [[0, 1], [3], [4, 7]];
const OFFICE_ART = [[2], [6], [5, 8, 9]];
const zoneIndex: Record<Zone, number> = { residential: 0, commercial: 1, industrial: 2 };
// Bit per neighbouring road, matching the column order of the road row.
const roadSides = [[0, -1, 1], [1, 0, 2], [0, 1, 4], [-1, 0, 8]];

// Traffic tint by how full the map shows the road: free, busy, jammed, badly jammed.
const TRAFFIC_COLOURS: [number, number][] = [[0.5, 0x4fc46b], [1, 0xf2d04b], [1.5, 0xf08a3c], [Infinity, 0xd9423a]];
// The yellow median that tells an avenue from a street: [x, y, width, height] per road side.
const MEDIAN = 0xf2c94c;
const medianArms = [[15, 0, 2, 16], [16, 15, 16, 2], [15, 16, 2, 16], [0, 15, 16, 2]];
const SMOG = 0xd28a38;
// Land value from poor to prime.
const VALUE_COLOURS: [number, number][] = [[30, 0xd9423a], [45, 0xf08a3c], [65, 0xf2d04b], [Infinity, 0x4fc46b]];
const LEVEL_PIP = 0xffd95a;
const SERVED = 0x4fc46b;
const UNSERVED = 0xd9423a;
// Roof colours of the facilities, which are drawn here rather than taken from a sheet.
// The colour each civic building's reach is outlined in, and its column in the civic row.
const FACILITY_ROOF: Record<Facility | Service | 'bus' | 'metro', number> = {
  power: 0xf4ca65, water: 0x74c7ed, fire: 0xe36a55, police: 0x6f8fd0, school: 0xf0a55a, clinic: 0xf4f6f8,
  bus: 0xf2c94c, metro: 0xe5484d, market: 0xd9423a, highschool: 0x7f8fb8, hospital: 0xe04a3c,
  university: 0xc9735a, museum: 0xe6dfcf, stadium: 0x6fb565, temple: 0xe0782f,
  mall: 0xd9423a, casino: 0x8a5fd0, cinema: 0xc8322e, parking: 0x3f6fb0,
  library: 0xb98a4a, pool: 0x5bb6ce, ktv: 0xe8799a, amusement: 0xf2c94c, gas: 0xe5484d, cityhall: 0xb97a61, bank: 0x577d96, culture: 0x996694, coldstore: 0x568598, warehouse: 0x778da0, square: 0xad8f78, daycare: 0xb88449, recycling: 0x497c63, workshop: 0x80614f, community: 0xc78d54, familyclinic: 0x679f9a, eldercare: 0x8d9f68, memorial: 0x8a958e, bakery: 0xc08a4e, florist: 0x5fa873, cakeshop: 0xe88aa6,
};
const WATER = [0x3f8fc4, 0x6fb4dc, 0x2f78ab];
const SHORE = 0xd9cfa8;
const RAIL = 0x8a5a3a;
const CIVIC_ROW = 5;
// The signboard of each business a decision can bring: its board and the marks on it.
const BRAND_SIGN = { lottery: [0xf2c94c, 0xe5484d], kiosk: [0xf4f6f8, 0xe5484d], branch: [0x3f6fb0, 0xf4f6f8],
  studio: [0x25232b, 0xf2c94c] } as const;
const FLAGGED: readonly string[] = ['foodstreet', 'plaza', 'funcity', 'campus', 'medical', 'interchange'];
// Where the two-by-two buildings start, and the column of the housing complex among them.
const BIG_ROW = 6;
const COMPLEX_ART = 0;
const FOUNTAIN = [0x8f97a1, 0x74c7ed, 0xdff3fb];
const CIVIC_DETAIL_ART: Partial<Record<string, number>> = {
  cityhall: 0, bank: 1, culture: 2, coldstore: 3, square: 4, daycare: 5, recycling: 6, workshop: 7, gas: 8, familyclinic: 12, bakery: 13, florist: 14, cakeshop: 15,
};
const CIVIC_ART: Partial<Record<Facility | Service | 'bus' | 'metro', number>> =
  { power: 0, water: 1, fire: 2, police: 3, school: 4, clinic: 5, bus: 6, metro: 7, market: 8, highschool: 9, temple: 10, cinema: 11,
    parking: 12, library: 13, pool: 14, ktv: 15 };
// The buildings of two tiles by two, by their place in the row of them.
const BIG_ART: Partial<Record<Service, number>> = { hospital: 1, university: 2, museum: 3, stadium: 4,
  mall: 5, casino: 6, amusement: 7, community: 8, eldercare: 9, memorial: 10 };
// Homes of a kind have their own pictures, so a street tells you who lives on it: three rows
// from HOME_ROW, one per level, with two looks of each kind side by side. Ordinary homes take
// any of the level's pictures in the residential row.
const HOME_ROW = 8;
/** From this zoom on, small details are drawn that would only be noise from further away. */
const KIND_ART: Record<HomeKind, number> =
  { downtown: 0, villa: 1, worker: 2, garden: 3, riverside: 4, station: 5, campus: 6, suburb: 7 };


const hash = (x: number, y: number) =>
  (Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(x + y, 83492791)) >>> 0;

export class TileRenderer {
  readonly view = new Container();
  private readonly tiles = new Graphics();
  private readonly terrain = new Container();
  private cacheResolution = 0;
  // Highlights get their own layer: a Graphics keeps the alpha of its last fill, even
  // across clear(), and applies it to every texture drawn afterwards.
  private readonly overlay = new Graphics();
  private readonly frames = new Map<TextureSource, Map<number, Texture>>();

  /** Our own sheet in the colours of the city being drawn; `sheets` holds one for each look. */
  private city: TextureSource;
  private cityUnit = CITY_TILE;

  constructor(private readonly kenney: TextureSource, private readonly sheets: Record<Theme, TextureSource>,
    private readonly detailedSheets: Record<Theme, TextureSource>, private readonly streetArt: StreetArt) {
    this.city = sheets.classic;
    this.terrain.addChild(this.tiles);
    this.view.addChild(this.terrain, this.overlay);
  }

  /** A building of two tiles by two from the city sheet, by its place in the row of them. */
  private bigFrame(column: number): Texture {
    const key = -1 - column;
    let frames = this.frames.get(this.city);
    if (!frames) this.frames.set(this.city, frames = new Map());
    let texture = frames.get(key);
    if (!texture) {
      texture = new Texture({ source: this.city, frame: new Rectangle(
        (column % 8) * 2 * this.cityUnit, (column < 8 ? BIG_ROW : 15) * this.cityUnit,
        2 * this.cityUnit, 2 * this.cityUnit) });
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
      const unit = sheet === this.city ? this.cityUnit : SOURCE_TILE;
      texture = new Texture({ source: sheet, frame: new Rectangle(column * unit, row * unit, unit, unit) });
      frames.set(key, texture);
    }
    return texture;
  }

  draw(city: BuildingSystem, camera: Camera, width: number, height: number, preview: Cell[],
    selected?: Cell, layer: Overlay = 'none',
    range?: { centre: Cell; radius: number; kind: Facility | Service | 'bus' | 'metro' }, hour?: number,
    lines: readonly MapRoute[] = [], marks: readonly Cell[] = [], crowdOn?: (cell: Cell) => number,
    aim?: { cells: readonly Cell[]; ok: boolean }, focus?: (cell: Cell) => boolean) {
    // Terrain changes on a redraw, not every animation frame. Flatten its many atlas
    // switches into one cached texture; keep selections and overlays independent.
    const resolution = terrainResolution(camera.scale);
    if (resolution !== this.cacheResolution) {
      this.terrain.cacheAsTexture({ resolution, antialias: false, scaleMode: 'nearest' });
      this.cacheResolution = resolution;
    }
    this.terrain.updateCacheTexture();
    const map = city.map;
    const { theme } = city;
    const detailed = camera.scale >= DETAIL_ZOOM;
    this.city = (detailed ? this.detailedSheets : this.sheets)[theme];
    this.cityUnit = detailed ? buildingAtlas.tileSize : CITY_TILE;
    const start = camera.cellAt(0, 0);
    const end = camera.cellAt(width, height);
    const g = this.tiles.clear();
    const overlay = this.overlay.clear();
    this.view.position.set(Math.round(camera.x), Math.round(camera.y));
    this.view.scale.set(camera.scale);

    const put = (sheet: TextureSource, column: number, row: number, x: number, y: number) =>
      g.texture(this.frame(sheet, column, row), 0xffffff,
        x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
    const tileAt = ([column, row]: number[], x: number, y: number) => put(this.kenney, column, row, x, y);
    // Close up, every building keeps its own picture from the 128 px atlas (tools/draw_tiles_hd.py).
    const cityAt = (column: number, row: number, x: number, y: number) => put(this.city, column, row, x, y);

    // Housing complexes in view, by their top left tile. They are drawn after the lots they cover.
    const complexes = new Set<number>();
    // Big civic buildings in view, by their top left tile, with their picture.
    const bigs = new Map<number, number>();
    const flags: Cell[] = [];

    // One extra row below so trees rooted just off-screen still show their tops.
    for (let y = Math.max(0, start.y); y <= Math.min(MAP_SIZE - 1, end.y + 1); y++) {
      for (let x = Math.max(0, start.x); x <= Math.min(MAP_SIZE - 1, end.x); x++) {
        const tile = map.get({ x, y })!;
        const seed = hash(x, y);
        const combo = city.comboAt({ x, y });
        // A group that is one building or one station flies a pennant.
        if (combo && FLAGGED.includes(combo)) flags.push({ x, y });

        if (tile === 'grass') {
          tileAt(GRASS[seed % 7 === 0 ? 1 : 0], x, y);
          const roll = (seed >>> 8) % 100;
          const boulevardPalm = theme === 'california' && x % 2 === 0 &&
            (map.get({ x, y: y - 1 }) === 'avenue' || map.get({ x, y: y + 1 }) === 'avenue');
          // A tree's canopy covers the tile above, so it only grows below open grass.
          if (!boulevardPalm && theme === 'california' && roll >= 8 && roll < 30 &&
              roadSides.some(([dx, dy]) => map.get({ x: x + dx, y: y + dy }) === 'river')) {
            // By the water in California: a towel and a striped parasol on the grass.
            const left = x * TILE_SIZE + 6 + seed % 10;
            const top = y * TILE_SIZE + 8 + (seed >>> 4) % 10;
            g.rect(left + 1, top + 9, 9, 4).fill([0x5bb6ce, 0xf2c94c, 0xe8799a][seed % 3]);
            g.rect(left + 5, top + 3, 1, 8).fill(0x25232b);
            g.rect(left, top + 1, 11, 3).fill(0xe5484d).rect(left + 2, top + 1, 2, 3).rect(left + 7, top + 1, 2, 3).fill(0xf4f6f8)
              .rect(left + 2, top, 7, 1).fill(0xe5484d);
          } else if (boulevardPalm || (roll < 4 && theme === 'california')) {
            // A palm: a thin leaning trunk and a crown of fronds.
            const left = x * TILE_SIZE;
            const top = y * TILE_SIZE;
            g.rect(left + 16, top + 26, 8, 3).fill({ color: 0x101114, alpha: 0.25 });
            g.rect(left + 15, top + 12, 2, 16).rect(left + 14, top + 6, 2, 8).fill(0x8a6a44);
            g.rect(left + 15, top + 16, 2, 1).rect(left + 15, top + 21, 2, 1).fill(0x6b4a2c);
            g.rect(left + 6, top + 4, 8, 2).rect(left + 16, top + 4, 9, 2).rect(left + 4, top + 6, 4, 2).rect(left + 23, top + 6, 4, 2)
              .rect(left + 9, top + 1, 5, 2).rect(left + 16, top + 1, 5, 2).rect(left + 13, top - 1, 4, 3).fill(0x3f8f4a);
            g.rect(left + 8, top + 4, 5, 1).rect(left + 17, top + 4, 6, 1).rect(left + 13, top, 3, 1).fill(0x6fc46b);
          } else if (roll < 4 && map.get({ x, y: y - 1 }) === 'grass') {
            if (detailed) this.streetArt.drawTree(g, x * TILE_SIZE, (y - 1) * TILE_SIZE);
            else {
              const column = TREES[(seed >>> 16) % TREES.length];
              tileAt([column, 10], x, y - 1);
              tileAt([column, 11], x, y);
            }
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
            // San Francisco's bridges are its red one; New York's are grey steel.
            const rail = theme === 'sf' ? 0xc0362c : theme === 'newyork' ? 0x6d7078 : RAIL;
            if (upright) g.rect(left, top, 4, TILE_SIZE).rect(left + 28, top, 4, TILE_SIZE).fill(rail);
            else g.rect(left, top, TILE_SIZE, 4).rect(left, top + 28, TILE_SIZE, 4).fill(rail);
            if (theme === 'sf' || theme === 'newyork') {
              // A tower astride the deck on every other tile, with a cable slung from it.
              const tower = theme === 'sf' ? 0xd94a3a : 0x8d9199;
              if ((upright ? y : x) % 2 === 0) {
                if (upright) g.rect(left - 2, top + 12, 8, 8).rect(left + 26, top + 12, 8, 8).fill(0x25232b).rect(left - 1, top + 13, 6, 6).rect(left + 27, top + 13, 6, 6).fill(tower);
                else g.rect(left + 12, top - 2, 8, 8).rect(left + 12, top + 26, 8, 8).fill(0x25232b).rect(left + 13, top - 1, 6, 6).rect(left + 13, top + 27, 6, 6).fill(tower);
              }
              if (upright) g.rect(left + 1, top, 1, TILE_SIZE).rect(left + 30, top, 1, TILE_SIZE).fill(tower);
              else g.rect(left, top + 1, TILE_SIZE, 1).rect(left, top + 30, TILE_SIZE, 1).fill(tower);
            }
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
          if (theme === 'newyork') {
            // New York's pavements: a hydrant here and there, and a food cart under an umbrella by the shops.
            if (seed % 4 === 0) g.rect(left + 2, top + 26, 3, 4).fill(0xc8322e).rect(left + 1, top + 27, 5, 1).fill(0xe5484d);
            if (seed % 5 === 1 && roadSides.some(([dx, dy]) => map.get({ x: x + dx, y: y + dy }) === 'commercial')) {
              g.rect(left + 24, top + 24, 7, 5).fill(0x25232b).rect(left + 25, top + 25, 5, 3).fill(0xd6dbe6);
              g.rect(left + 23, top + 20, 9, 3).fill(0xf2c94c).rect(left + 25, top + 20, 2, 3).rect(left + 29, top + 20, 2, 3).fill(0x3f6fb0);
              g.rect(left + 27, top + 23, 1, 2).fill(0x25232b);
            }
          } else if (theme === 'sf' && tile === 'avenue') {
            // San Francisco's avenues carry the slot and rails of the cable cars.
            let ways = 0;
            for (const [dx, dy, bit] of roadSides) if (isRoad(map.get({ x: x + dx, y: y + dy }))) ways |= bit;
            if ((ways & 10) && !(ways & 5)) g.rect(left, top + 9, TILE_SIZE, 1).rect(left, top + 22, TILE_SIZE, 1).fill(0x8d9199);
            else if ((ways & 5) && !(ways & 10)) g.rect(left + 9, top, 1, TILE_SIZE).rect(left + 22, top, 1, TILE_SIZE).fill(0x8d9199);
          }
          if (map.hasStation({ x, y })) {
            // A metro station under the road: stairs down in one corner of the pavement and
            // a red sign on a post beside them. The road itself stays clear.
            g.rect(left + 1, top + 1, 13, 9).fill(0x1b1d22);
            g.rect(left + 2, top + 2, 11, 7).fill(0x3a3f47);
            g.rect(left + 3, top + 4, 9, 1).rect(left + 3, top + 6, 9, 1).fill(0x8d98a6);
            g.rect(left + 15, top + 1, 9, 9).fill(0x1b1d22);
            // New York's subway wears green; the others red.
            g.rect(left + 16, top + 2, 7, 7).fill(theme === 'newyork' ? 0x2f8f4a : 0xe5484d);
            g.rect(left + 17, top + 3, 1, 5).rect(left + 21, top + 3, 1, 5).rect(left + 18, top + 4, 1, 1)
              .rect(left + 20, top + 4, 1, 1).rect(left + 19, top + 5, 1, 1).fill(0xffffff);
          }
        } else if (tile === 'farm') {
          // Ploughed earth with rows of crops; some fields are green, some ripe.
          const left = x * TILE_SIZE;
          const top = y * TILE_SIZE;
          g.rect(left, top, TILE_SIZE, TILE_SIZE).fill(0x8a6a44);
          const crop = [0x6fb565, 0x9ccc5a, 0xe2c65a][(Math.floor(x / 3) + Math.floor(y / 2) * 2) % 3];
          for (let row = 3; row < TILE_SIZE; row += 6) {
            g.rect(left, top + row, TILE_SIZE, 3).fill(crop);
            g.rect(left, top + row + 3, TILE_SIZE, 1).fill(0x6e5234);
          }
          if (city.barnAt({ x, y })) {
            // The farmstead's barn: red walls, a pale roof and a dark door.
            g.rect(left + 6, top + 9, 20, 17).fill(0x25232b).rect(left + 7, top + 13, 18, 12).fill(0xb23a32);
            g.rect(left + 7, top + 10, 18, 3).fill(0xe6dfcf).rect(left + 13, top + 18, 6, 7).fill(0x4a2a22)
              .rect(left + 15, top + 18, 2, 7).fill(0xe6dfcf);
          }
        } else if (tile === 'park') {
          tileAt(GRASS[1], x, y);
          const left = x * TILE_SIZE;
          const top = y * TILE_SIZE;
          const park = city.parkAt({ x, y });
          if (combo === 'forest') {
            // A forest: dark ground and close-set pines, no paths.
            g.rect(left, top, TILE_SIZE, TILE_SIZE).fill(0x2f7a4a);
            for (const [dx, dy] of [[4 + seed % 5, 2], [18 + (seed >>> 3) % 5, 6 + (seed >>> 6) % 4], [9 + (seed >>> 9) % 6, 16]]) {
              g.rect(left + dx + 3, top + dy + 11, 2, 3).fill(0x5a3d26);
              g.rect(left + dx + 3, top + dy, 2, 3).rect(left + dx + 2, top + dy + 3, 4, 3).rect(left + dx + 1, top + dy + 6, 6, 3)
                .rect(left + dx, top + dy + 9, 8, 2).fill(0x1f5a36);
              g.rect(left + dx + 3, top + dy + 1, 1, 2).rect(left + dx + 2, top + dy + 4, 1, 2).rect(left + dx + 1, top + dy + 7, 1, 2).fill(0x3f9460);
            }
          } else if (park.big) {
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
        } else if (tile === 'annex' || isBig(tile)) {
          // Paving under the whole building; its picture goes on once all four tiles are down.
          tileAt(GRASS[0], x, y);
          g.rect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE).fill(0xb3b6bc);
          const anchor = map.anchorOf({ x, y });
          const art = anchor && BIG_ART[map.get(anchor) as Service];
          if (anchor && art !== undefined) bigs.set(anchor.y * MAP_SIZE + anchor.x, art);
        } else if (tile === 'warehouse') {
          tileAt(GRASS[0], x, y);
          cityAt(0, HOME_ROW + 5, x, y);
          if (!detailed) {
            g.rect(x * TILE_SIZE + 3, y * TILE_SIZE + 24, 26, 4).fill(0x668eac);
            g.rect(x * TILE_SIZE + 6, y * TILE_SIZE + 25, 4, 2).rect(x * TILE_SIZE + 22, y * TILE_SIZE + 25, 4, 2).fill(0xe8c589);
          }
        } else if (tile in CIVIC_DETAIL_ART) {
          tileAt(GRASS[0], x, y);
          cityAt(CIVIC_DETAIL_ART[tile]!, 14, x, y);
        } else if (isFacility(tile) || isService(tile) || tile === 'bus' || tile === 'metro') {
          tileAt(GRASS[0], x, y);
          cityAt(CIVIC_ART[tile]!, CIVIC_ROW, x, y);
          if (tile === 'library' && combo === 'bookquarter') {
            const left = x * TILE_SIZE;
            const top = y * TILE_SIZE;
            g.rect(left + 8, top + 21, 16, 4).fill(0x355563)
              .rect(left + 10, top + 22, 12, 1).fill(0xe2c78f);
          }
          if (combo === 'fair' || combo === 'chinatown') {
            // A temple fair: a string of red lanterns across the front.
            const left = x * TILE_SIZE;
            const top = y * TILE_SIZE;
            g.rect(left, top + 1, TILE_SIZE, 1).fill(0x25232b);
            for (let at = 2; at < TILE_SIZE; at += 6) g.rect(left + at, top + 2, 3, 4).fill(0xe5484d).rect(left + at + 1, top + 6, 1, 1).fill(0xf2c94c);
          }
        } else if (tile !== 'viaduct') {
          cityAt(zoneIndex[tile], LOT_ROW, x, y);
          const building = city.getBuilding({ x, y });
          if (building?.block !== undefined) {
            complexes.add(building.block);
          } else if (building) {
            const art = BUILDING_ART[tile][building.level - 1];
            if (building.kind) cityAt(KIND_ART[building.kind] * 2 + (seed >>> 4) % 2, HOME_ROW + building.level - 1, x, y);
            else if (tile === 'industrial') {
              const row = { metal: 0, food: 1, warehouse: 2 }[industryAt({ x, y })];
              cityAt(building.level - 1, HOME_ROW + 3 + row, x, y);
            } else {
              const shop = shiftIndex('commercial', y * MAP_SIZE + x) === 2;
              const variants = tile === 'commercial'
                ? (shop ? SHOP_ART : OFFICE_ART)[building.level - 1] : art;
              cityAt(variants[(seed >>> 4) % variants.length], BUILDING_ROW + zoneIndex[tile], x, y);
            }
            // Close up, a house shows the small things of the life in it.
            if (tile === 'residential' && building.level === 1 && camera.scale >= DETAIL_ZOOM) {
              const left = x * TILE_SIZE;
              const top = y * TILE_SIZE;
              g.rect(left + 1, top + 26, 1, 4).fill(0x55575b).rect(left, top + 25, 3, 2).fill(0xd9423a);
              if (seed % 3 === 0) g.rect(left + 24, top + 2, 7, 0.5).fill(0xf4f6f8).rect(left + 25, top + 2.5, 1.5, 2).fill(0x6fa8d0)
                .rect(left + 27.5, top + 2.5, 1.5, 2.5).fill(0xe8799a);
              if (city.kidsAt(y * MAP_SIZE + x).length) {
                g.rect(left + 27, top + 28, 2, 2).fill(0xe5484d).rect(left + 27.5, top + 28.5, 1, 1).fill(0xf4f6f8);
                g.rect(left + 21, top + 28, 4, 3).fill(0xb98a4a).rect(left + 21.5, top + 28.5, 3, 2).fill(0xf0dc9a);
              }
            }
            const left = x * TILE_SIZE;
            const top = y * TILE_SIZE;
            const group = combo;
            if (group === 'chinatown') {
              if (tile === 'commercial') {
                g.rect(left + 4, top + 19, 24, 3).fill(0x7e3033);
                g.rect(left + 2, top + 20, 28, 3).fill(0xb74c45);
                g.rect(left + 9, top + 15, 14, 3).fill(0x86403b)
                  .rect(left + 11, top + 16, 10, 1).fill(0xf1c371);
              } else {
                g.rect(left + 8, top + 22, 2, 6).rect(left + 22, top + 22, 2, 6).fill(0x893633);
                g.rect(left + 8, top + 22, 16, 2).fill(0xc15e4d);
              }
              for (const offset of [5, 25]) {
                g.rect(left + offset, top + 24, 3, 4).fill(0xd96b50)
                  .rect(left + offset, top + 27, 3, 1).fill(0xf1c371);
              }
            } else if (group === 'arcade') {
              // A shopping street: striped awnings along the foot of every shop.
              for (let at = 0; at < TILE_SIZE; at += 4) g.rect(left + at, top + 27, 4, 4).fill(at % 8 ? 0xf4f6f8 : 0xe5484d);
              g.rect(left, top + 31, TILE_SIZE, 1).fill(0x25232b);
            } else if (group === 'estate' || group === 'port') {
              // An industrial estate: a hazard-striped kerb round the works; a port's is blue and white.
              for (let at = 0; at < TILE_SIZE; at += 4) {
                g.rect(left + at, top + 29, 4, 3).fill(at % 8 ? (group === 'port' ? 0xf4f6f8 : 0x25232b) : group === 'port' ? 0x3f8fc4 : 0xf2c94c);
              }
            }
            if (building.brand) {
              // A business a decision brought: a signboard over the door, in its own colours.
              const [board, mark] = BRAND_SIGN[building.brand];
              g.rect(left + 3, top + 14, 15, 9).fill(0x25232b).rect(left + 4, top + 15, 13, 7).fill(board);
              g.rect(left + 6, top + 17, 3, 3).rect(left + 11, top + 17, 4, 3).fill(mark);
            }
            const nick = tile === 'residential' ? city.nickAt({ x, y }) : undefined;
            if (nick === 'cabin') {
              // A forest cabin: a pine by the door.
              g.rect(left + 3, top + 28, 2, 3).fill(0x5a3d26);
              g.rect(left + 3, top + 18, 2, 3).rect(left + 2, top + 21, 4, 3).rect(left + 1, top + 24, 6, 4).fill(0x1f5a36);
            } else if (nick === 'farmhouse') {
              // A farmhouse: a bale of hay by the door.
              g.rect(left + 1, top + 25, 7, 6).fill(0x25232b).rect(left + 2, top + 26, 5, 4).fill(0xe2c65a).rect(left + 2, top + 28, 5, 1).fill(0xb9973a);
            }
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

    for (const [anchor, art] of bigs) {
      const x = anchor % MAP_SIZE * TILE_SIZE, y = Math.floor(anchor / MAP_SIZE) * TILE_SIZE;
      g.texture(this.bigFrame(art), 0xffffff, x, y, 2 * TILE_SIZE, 2 * TILE_SIZE);
    }
    for (const anchor of complexes) {
      g.texture(this.bigFrame(COMPLEX_ART), 0xffffff, anchor % MAP_SIZE * TILE_SIZE,
        Math.floor(anchor / MAP_SIZE) * TILE_SIZE, 2 * TILE_SIZE, 2 * TILE_SIZE);
    }

    // The season shows on open ground: snow in winter, a warm cast in autumn.
    const season = seasonAt(city.now);
    if (season === 'winter' || season === 'autumn') {
      for (let y = Math.max(0, start.y); y <= Math.min(MAP_SIZE - 1, end.y); y++) {
        for (let x = Math.max(0, start.x); x <= Math.min(MAP_SIZE - 1, end.x); x++) {
          const tile = map.get({ x, y });
          if (tile !== 'grass' && tile !== 'park' && tile !== 'farm') continue;
          g.rect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE)
            .fill(season === 'winter' ? { color: 0xf4f8ff, alpha: 0.5 } : { color: 0xd98838, alpha: 0.16 });
        }
      }
    }
    // Elevated roads, over everything else: a deck on pillars with a shadow under it.
    for (let y = Math.max(0, start.y); y <= Math.min(MAP_SIZE - 1, end.y); y++) {
      for (let x = Math.max(0, start.x); x <= Math.min(MAP_SIZE - 1, end.x); x++) {
        if (!map.hasSpan({ x, y })) continue;
        const left = x * TILE_SIZE;
        const top = y * TILE_SIZE;
        const sides = roadSides.map(([dx, dy]) => map.hasSpan({ x: x + dx, y: y + dy }));
        const upright = (sides[0] || sides[2]) && !(sides[1] || sides[3]);
        const bend = (sides[0] || sides[2]) && (sides[1] || sides[3]);
        const decks = bend ? [true, false] : [upright];
        for (const tall of decks) {
          const [dx, dy, wide, high] = tall ? [6, 0, 20, TILE_SIZE] : [0, 6, TILE_SIZE, 20];
          g.rect(left + dx + 3, top + dy + 3, wide, high).fill({ color: 0x101114, alpha: 0.3 });
          g.rect(left + dx, top + dy, wide, high).fill(0x8d9199);
          if (tall) {
            g.rect(left + dx, top, 2, TILE_SIZE).rect(left + dx + wide - 2, top, 2, TILE_SIZE).fill(0xd6dbe6);
            g.rect(left + 15, top + 4, 2, 8).rect(left + 15, top + 20, 2, 8).fill(0xf2c94c);
          } else {
            g.rect(left, top + dy, TILE_SIZE, 2).rect(left, top + dy + high - 2, TILE_SIZE, 2).fill(0xd6dbe6);
            g.rect(left + 4, top + 15, 8, 2).rect(left + 20, top + 15, 8, 2).fill(0xf2c94c);
          }
        }
        // An end comes down to the ground: a darker ramp across it.
        if (sides.filter(Boolean).length <= 1) {
          const at = sides.indexOf(true);
          if (at === 0 || at === 2 || at < 0 && upright) g.rect(left + 6, top + (at === 0 ? 26 : 0), 20, 6).fill(0x6d7078);
          else g.rect(left + (at === 3 ? 26 : 0), top + 6, 6, 20).fill(0x6d7078);
        }
      }
    }
    for (const { x, y } of flags) {
      const left = x * TILE_SIZE + 24;
      const top = y * TILE_SIZE;
      g.rect(left, top, 2, 12).fill(0x25232b);
      g.rect(left + 2, top + 1, 6, 5).fill(0x25232b).rect(left + 2, top + 2, 5, 3).fill(0xf2c94c).rect(left + 2, top + 3, 3, 1).fill(0xe5484d);
    }

    if (layer !== 'none') {
      for (let y = Math.max(0, start.y); y <= Math.min(MAP_SIZE - 1, end.y); y++) {
        for (let x = Math.max(0, start.x); x <= Math.min(MAP_SIZE - 1, end.x); x++) {
          const cell = { x, y };
          let colour: number | undefined;
          if (layer === 'lines' || layer === 'freight') continue;
          if (layer === 'pollution') {
            const level = city.pollutionAt(cell);
            if (level > 0) {
              overlay.rect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE)
                .fill({ color: level >= 50 ? 0xe44f32 : SMOG, alpha: level >= 50 ? 0.48 + level / 400 : level / 160 });
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
            // The cars the map shows on this tile just now, so the colours agree with the picture.
            const load = crowdOn?.(cell) ?? 0;
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
          .fill({ color: colour, alpha: line.dim ? 0.15 : 0.85 });
        if (line.kind === 'freight' && !line.dim && step % 3 === 1) {
          const cx = (from.x + to.x + 1) * TILE_SIZE / 2;
          const cy = (from.y + to.y + 1) * TILE_SIZE / 2;
          const hx = Math.sign(to.x - from.x), hy = Math.sign(to.y - from.y);
          overlay.poly([cx + hx * 5, cy + hy * 5, cx - hx * 4 - hy * 4, cy - hy * 4 + hx * 4,
            cx - hx * 4 + hy * 4, cy - hy * 4 - hx * 4]).fill(0x1b1d22);
          overlay.poly([cx + hx * 4, cy + hy * 4, cx - hx * 2 - hy * 2, cy - hy * 2 + hx * 2,
            cx - hx * 2 + hy * 2, cy - hy * 2 - hx * 2]).fill(0xffffff);
        }
      }
      for (const [index, stop] of line.stops.entries()) {
        const x = stop % MAP_SIZE * TILE_SIZE;
        const y = Math.floor(stop / MAP_SIZE) * TILE_SIZE;
        overlay.rect(x + 1, y + 1, TILE_SIZE - 2, TILE_SIZE - 2).stroke({ color: colour, width: 4, alpha: line.dim ? 0.2 : 1 });
        if (line.kind === 'freight' && !line.dim) numberBadge(overlay, x + TILE_SIZE - 16, y - 5, index + 1, colour);
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

    if (focus) {
      for (let y = Math.max(0, start.y); y <= Math.min(MAP_SIZE - 1, end.y); y++) {
        for (let x = Math.max(0, start.x); x <= Math.min(MAP_SIZE - 1, end.x); x++) {
          const cell = { x, y };
          if (!focus(map.anchorOf(cell) ?? cell)) {
            overlay.rect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE)
              .fill({ color: 0x232833, alpha: 0.62 });
          }
        }
      }
    }
    for (const { x, y } of preview) {
      if (map.get({ x, y }) === undefined) continue;
      overlay.rect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE)
        .fill({ color: 0xffffff, alpha: 0.35 });
    }
    // Where the tool in hand would build if the button went down now: green where it can, red where it cannot.
    if (aim) {
      const colour = aim.ok ? 0x7ee08a : 0xff6b6b;
      for (const { x, y } of aim.cells) {
        if (map.get({ x, y }) === undefined) continue;
        overlay.rect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE).fill({ color: colour, alpha: 0.28 });
        overlay.rect(x * TILE_SIZE + 1, y * TILE_SIZE + 1, TILE_SIZE - 2, TILE_SIZE - 2).stroke({ color: 0x25232b, width: 4 });
        overlay.rect(x * TILE_SIZE + 1, y * TILE_SIZE + 1, TILE_SIZE - 2, TILE_SIZE - 2).stroke({ color: colour, width: 2 });
      }
    }
    if (!focus) for (const { x, y } of marks) {
      overlay.rect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE).stroke({ color: 0x25232b, width: 3 });
      overlay.rect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE).stroke({ color: 0xffe14d, width: 1.5 });
    }
    if (selected) {
      overlay.rect(selected.x * TILE_SIZE + 1, selected.y * TILE_SIZE + 1, TILE_SIZE - 2, TILE_SIZE - 2)
        .stroke({ color: 0xffffff, width: 2 });
    }
  }
}
