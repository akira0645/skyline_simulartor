import { Application, Assets, Graphics, type Texture } from 'pixi.js';
import cityUrl from '../assets/city.png';
import tilesUrl from '../assets/tiles.png';
import { footprint, isBig, isFacility, isRoad, isService, MAP_SIZE, TILE_SIZE, type Cell } from '../simulation/TileMap';
import { services } from '../simulation/Services';
import { transit } from '../simulation/Transit';
import { lineColour } from '../app/lineColours';

/** Milliseconds a line's vehicle takes per tile at 1× speed. */
const LINE_PACE = { bus: 320, metro: 110 };
import { drawScene, sceneLength, type Scene } from './emergencyScenes';

/** An emergency older than this many ticks when first seen is not played back. */
const FRESH_TICKS = 16;
import { selection, type Overlay, type Tool } from '../app/tools';
import { Camera } from './Camera';
import { DETAIL_ZOOM, TileRenderer } from './TileRenderer';
import { commuterPosition } from './commuterPosition';
import { shiftIndex, shifts, workShift } from '../simulation/WorkShift';
import { weekendAt } from '../simulation/calendar';
import { seasonAt } from '../simulation/Seasons';
import { utilities } from '../simulation/Utilities';
import { mind, SHOP_SHIFT } from '../simulation/Mind';

/**
 * How long a commuter takes per tile, in milliseconds at 1× speed. Trips start by the game
 * clock but run at this pace: a game day lasts eight seconds, so a commute timed in game hours
 * would be over in a blink.
 */
const PACE = { walk: 900, drive: 450 };
/** The same for each vehicle, in the order of Wealth's `vehicles`: a bicycle is slow, a car quick. */
const VEHICLE_PACE = [700, 520, 450, 450, 430];
/** How long a traffic light stays green each way, in milliseconds at 1× speed. */
const LIGHT = 2600;
/** Commuters set out this many game hours before their shift. */
const HEAD_START = 2;

import type { BuildingSystem } from '../simulation/BuildingSystem';

export class CityRenderer {
  refresh?: () => void;
  /** Called with the cell clicked while the line tool is in use. */
  onLineClick?: (cell: Cell) => void;
  /** Clears the inspected tile. */
  deselect?: () => void;
  /** Called when a commuter on the map is clicked, with their home and workplace. */
  onPerson?: (homeId: number, workId: number) => void;
  /** Tiles to frame on the map, and a way to bring one of them to the middle of the view. */
  marks: Cell[] = [];
  lookAt?: (cell: Cell) => void;
  /** The commuter to point out on the map, as `home:workplace`. */
  follow?: string;
  /** Where the map shows a commuter: settled at home or at work, or on the way to either. */
  tripOf?: (homeId: number, workId: number) => 'home' | 'work' | 'to-work' | 'to-home' | undefined;

  constructor(private readonly city: BuildingSystem, private readonly speed: () => number,
    private readonly hour: () => number, private readonly overlay: () => Overlay) {}
  private app?: Application;
  private observer?: ResizeObserver;

  async mount(host: HTMLElement, signal: AbortSignal, getTool: () => Tool,
    report: (message: string) => void, inspect: (cell: Cell) => void): Promise<void> {
    const app = new Application();
    await app.init({ width: host.clientWidth, height: host.clientHeight,
      background: '#1d1f24', antialias: false, autoStart: false });
    const sheets = await Promise.all([tilesUrl, cityUrl].map(url => Assets.load<Texture>(url)))
      .catch((error: unknown) => {
        app.destroy(true);
        throw error;
      });
    for (const sheet of sheets) sheet.source.scaleMode = 'nearest';
    if (signal.aborted) {
      app.destroy(true);
      return;
    }

    this.app = app;
    const map = this.city.map;
    const camera = new Camera();
    // The panels float over the map: leave room to drag any corner out from under them, and
    // start with the map's corner clear of the top bar.
    camera.margin = 260;
    camera.pan(24, 96, app.screen.width, app.screen.height);
    const tiles = new TileRenderer(sheets[0].source, sheets[1].source);
    const canvas = app.canvas;
    app.stage.addChild(tiles.view);
    const people = new Graphics();
    // Flames, smoke and emergency vehicles, above the commuters.
    const effects = new Graphics();
    app.stage.addChild(people, effects);
    const scenes = new Map<string, Scene>();
    host.appendChild(canvas);

    let animationTime = 0;
    /** Whether routes are drawn: in their own map view, and while laying out transport. */
    const routesShown = () => {
      const tool = getTool();
      return this.overlay() === 'lines' || tool === 'line' || tool === 'bus' || tool === 'metro';
    };
    // Where each commuter is, by home and workplace: settled at one end, or how far along the
    // way to the other, counted in tiles from the end they left.
    const trips = new Map<string, { at: 'home' | 'work'; along?: number; wait: number }>();
    /** The cars that were on the road in the last frame, for the ones behind to keep clear of. */
    let cars: { x: number; y: number; hx: number; hy: number; index: number }[] = [];
    /** Where each commuter in sight was last drawn, for clicking on them. */
    let spots: { x: number; y: number; homeId: number; workId: number }[] = [];
    this.tripOf = (homeId, workId) => {
      const trip = trips.get(`${homeId}:${workId}`);
      if (!trip) return undefined;
      return trip.along === undefined || trip.wait > 0 ? trip.at : trip.at === 'home' ? 'to-work' : 'to-home';
    };
    const cellOf = (id: number): Cell => ({ x: id % MAP_SIZE, y: Math.floor(id / MAP_SIZE) });
    /** How long and how wide each vehicle is drawn, in the order of Wealth's `vehicles`. */
    const SIZES = [[8, 3], [9, 5], [13, 9], [16, 10], [18, 10]];
    const drawCar = (cx: number, cy: number, vertical: boolean, index: number, tier: number) => {
      const [long, wide] = SIZES[tier];
      const width = vertical ? wide : long;
      const height = vertical ? long : wide;
      const left = Math.round(cx - width / 2);
      const top = Math.round(cy - height / 2);
      people.rect(left, top, width, height).fill(0x232831);
      if (tier < 2) {
        // A bicycle or a scooter: a thin frame and the rider's head.
        if (tier) people.rect(left + 1, top + 1, width - 2, height - 2).fill([0xd87856, 0x5bb6ce, 0xe6c15a][index % 3]);
        people.rect(Math.round(cx) - 1, Math.round(cy) - 1, 3, 3).fill(0xffd1a0);
        return;
      }
      people.rect(left + 1, top + 1, width - 2, height - 2).fill(tier === 4 ? [0x2b2f3a, 0x8a1f2b, 0xf4f6f8][index % 3] :
        [0x5bb6ce, 0xd87856, 0xe6c15a, 0x8fbf6a, 0xd6d9de][index % 5]);
      people.rect(left + (vertical ? 2 : 4), top + (vertical ? 4 : 2), width - (vertical ? 4 : 8), height - (vertical ? 8 : 4))
        .fill(0xa9d8de);
      if (camera.scale >= DETAIL_ZOOM) {
        // Close up: tyres at the corners.
        for (const end of [2, long - 4]) {
          for (const side of [0, wide - 0.5]) {
            people.rect(left + (vertical ? side : end), top + (vertical ? end : side), vertical ? 0.5 : 2, vertical ? 2 : 0.5)
              .fill(0x0c0d10);
          }
        }
      }
      // The dearest cars carry a gold trim.
      if (tier === 4) people.rect(left + 1, top + 1, vertical ? width - 2 : 2, vertical ? 2 : height - 2).fill(0xe0b23e);
    };
    /** Road tiles where three or four roads meet, which get traffic lights; looked up again now and then. */
    let junctions = new Set<number>();
    let junctionsAt = -Infinity;
    const findJunctions = () => {
      if (performance.now() - junctionsAt < 500) return;
      junctionsAt = performance.now();
      junctions = new Set();
      for (let y = 0; y < MAP_SIZE; y++) {
        for (let x = 0; x < MAP_SIZE; x++) {
          if (!isRoad(map.get({ x, y }))) continue;
          let roads = 0;
          for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) if (isRoad(map.get({ x: x + dx, y: y + dy }))) roads++;
          if (roads >= 3) junctions.add(y * MAP_SIZE + x);
        }
      }
    };
    /** Whether the light at a junction is green for traffic going up and down; otherwise for across. */
    const greenUpright = (x: number, y: number) => (Math.floor(animationTime / LIGHT) + x + y) % 2 === 0;
    const drawWalker = (cx: number, cy: number, index: number) => {
      // A person is small beside a house: three pixels across and nine tall.
      const x = Math.round(cx) - 1;
      const y = Math.round(cy) - 4;
      const stride = Math.floor(animationTime / 140 + index) % 2;
      people.rect(x - 1, y - 1, 5, 10).fill(0x25232b);
      people.rect(x, y, 3, 3).fill(0xffd1a0);
      people.rect(x, y + 3, 3, 3).fill([0x7edbed, 0xf6ba67, 0xe8799a, 0x8fbf6a, 0xd6d9de][index % 5]);
      people.rect(x, y + 6, 1, 1 + stride).rect(x + 2, y + 6, 1, 2 - stride).fill(0xece6dd);
      if (camera.scale < DETAIL_ZOOM) return;
      // Close up: hair, eyes, arms, and a bag for some.
      people.rect(x, y, 3, 1).rect(x, y, 0.5, 2).fill([0x3a2a1c, 0x1b1d22, 0x8a5a3a, 0xd9c08a][index % 4]);
      people.rect(x + 0.5, y + 1.5, 0.5, 0.5).rect(x + 2, y + 1.5, 0.5, 0.5).fill(0x25232b);
      people.rect(x - 0.5, y + 3, 0.5, 2 + stride * 0.5).rect(x + 3, y + 3, 0.5, 2.5 - stride * 0.5).fill(0xffd1a0);
      if (index % 3 === 0) people.rect(x + 3, y + 4.5, 1, 1.5).fill(0x8a5a3a);
    };
    /**
     * When the map last showed someone of each shift on the road. The traffic view and the
     * queues on busy roads go by this, so a road is only shown jammed while people are seen
     * travelling on it, and a little after, so it does not flicker between two of them.
     */
    const lastMoved = shifts.map(() => -Infinity);
    const rushNow = () => shifts.map((_, index) => index).filter(index => animationTime - lastMoved[index] < 1500);

    const drawPeople = (elapsed = 0) => {
      people.clear();
      people.position.set(camera.x, camera.y);
      people.scale.set(camera.scale);
      const routes = this.city.getCommutes();
      findJunctions();
      const moving: typeof cars = [];
      spots = [];
      /** Where the commuter being followed is: on the way, or the building they are in. */
      let pin: { x: number; y: number } | undefined;
      /** Kerb spots that already show a parked car. */
      const kerbs = new Set<string>();
      const centre = (cell: Cell) => ({ x: (cell.x + 0.5) * TILE_SIZE, y: (cell.y + 0.5) * TILE_SIZE });
      for (let i = 0; i < Math.min(routes.length, 80); i++) {
        const route = routes[i];
        const tiles = route.path.length;
        const steps = tiles + 1;
        const driving = tiles >= mind.driveFrom;
        const home = cellOf(route.homeId);
        const workplace = cellOf(route.workId);
        const zone = this.city.map.get(workplace);
        if (zone !== 'commercial' && zone !== 'industrial') continue;
        const { start, end } = workShift(zone, route.workId);
        const tier = this.city.carOn(route.homeId, route.workId);
        const sinceStart = (this.hour() - start + 24) % 24;
        // At the weekend only the shops are open, so only their people go to work.
        const dayOff = weekendAt(this.city.now) && shiftIndex(zone, route.workId) !== SHOP_SHIFT;
        const wanted = !dayOff && (sinceStart < end - start || sinceStart >= 24 - HEAD_START) ? 'work' : 'home';
        const key = `${route.homeId}:${route.workId}`;
        let trip = trips.get(key);
        if (!trip) trips.set(key, trip = { at: 'home', wait: 0 });
        const followed = key === this.follow;
        if (followed) pin = centre(trip.at === 'home' ? home : workplace);
        /** Notes where this commuter is drawn. */
        const seenAt = (spot: { x: number; y: number }) => {
          spots.push({ x: spot.x, y: spot.y, homeId: route.homeId, workId: route.workId });
          if (followed) pin = spot;
        };

        // A car waits at the kerb in front of the building its driver is in: on the edge of
        // the road tile, on the building's side, lined up with the road.
        const kerb = (at: 'home' | 'work') => {
          const road = at === 'home' ? route.path[0] : route.path[tiles - 1];
          const next = at === 'home' ? route.path[1] : route.path[tiles - 2];
          const building = at === 'home' ? home : workplace;
          const spot = centre({ x: road.x + (building.x - road.x) * 0.3, y: road.y + (building.y - road.y) * 0.3 });
          return { ...spot, vertical: next.x === road.x, key: `${road.x},${road.y},${building.x - road.x},${building.y - road.y}` };
        };
        const park = (at: 'home' | 'work') => {
          const spot = kerb(at);
          if (kerbs.has(spot.key)) return;
          kerbs.add(spot.key);
          drawCar(spot.x, spot.y, spot.vertical, i, tier);
        };

        if (trip.along === undefined) {
          if (trip.at === wanted) {
            if (driving) park(trip.at);
            continue;
          }
          // Stagger departures a little so a household does not leave as one.
          trip.along = 0;
          trip.wait = (i % 7) * 260;
        }
        if (trip.wait > 0) {
          trip.wait -= elapsed;
          if (driving) park(trip.at);
          continue;
        }
        // This shift has people on the road, as far as the map shows.
        lastMoved[shiftIndex(zone, route.workId)] = animationTime;
        const returning = trip.at === 'work';
        const from = trip.at;
        const to = from === 'home' ? 'work' : 'home';
        /** Where on the road the commuter is after `along` tiles of the trip. */
        const onRoad = (along: number) => {
          const index = returning ? steps - along : along;
          const position = commuterPosition(route, 0, driving ? 'drive' : 'walk', index / steps, returning)!;
          return centre(position);
        };
        const along = trip.along;
        let speed = 1 / PACE.walk;

        if (!driving) {
          const spot = onRoad(along);
          drawWalker(spot.x, spot.y, i);
          seenAt(spot);
        } else if (along < 1) {
          // Out of the door and over to the car.
          const door = centre(from === 'home' ? home : workplace);
          const car = kerb(from);
          park(from);
          const spot = { x: door.x + (car.x - door.x) * along, y: door.y + (car.y - door.y) * along };
          drawWalker(spot.x, spot.y, i);
          seenAt(spot);
        } else if (along > steps - 1) {
          // Parked; the last few steps are on foot.
          const door = centre(to === 'home' ? home : workplace);
          const car = kerb(to);
          const part = along - (steps - 1);
          park(to);
          const spot = { x: car.x + (door.x - car.x) * part, y: car.y + (door.y - car.y) * part };
          drawWalker(spot.x, spot.y, i);
          seenAt(spot);
        } else {
          // On the road: pulling out from the kerb, driving in lane, pulling in at the other end.
          let spot = onRoad(along);
          const ahead = onRoad(Math.min(steps - 1, along + 0.1));
          const behind = onRoad(Math.max(1, along - 0.1));
          const dx = ahead.x - behind.x;
          const dy = ahead.y - behind.y;
          const vertical = Math.abs(dy) > Math.abs(dx);
          const hx = vertical ? 0 : Math.sign(dx);
          const hy = vertical ? Math.sign(dy) : 0;
          const out = along - 1;
          const inn = steps - 1 - along;
          let inLane = true;
          if (out < 0.5 || inn < 0.5) {
            const car = kerb(out < 0.5 ? from : to);
            const part = Math.min(out, inn) / 0.5;
            spot = { x: car.x + (spot.x - car.x) * part, y: car.y + (spot.y - car.y) * part };
            inLane = part > 0.6;
          }
          // Keep clear of the car in front. Two cars side by side on one spot: the earlier one goes first.
          const tileX = spot.x / TILE_SIZE;
          const tileY = spot.y / TILE_SIZE;
          const blocked = cars.some(other => {
            if (other.index === i || other.hx !== hx || other.hy !== hy) return false;
            const offX = other.x - tileX;
            const offY = other.y - tileY;
            if (Math.abs(offX * hy - offY * hx) > 0.2) return false;
            const forward = offX * hx + offY * hy;
            return (forward > 0.03 && forward < 0.68) || (Math.abs(forward) <= 0.03 && other.index < i);
          });
          // A red light ahead: wait at the edge of the junction. Whoever is in it already goes on.
          const aheadX = Math.floor(tileX + hx * 0.55);
          const aheadY = Math.floor(tileY + hy * 0.55);
          const red = (aheadX !== Math.floor(tileX) || aheadY !== Math.floor(tileY)) &&
            junctions.has(aheadY * MAP_SIZE + aheadX) && greenUpright(aheadX, aheadY) !== vertical;
          speed = blocked || red ? 0 : 1 / VEHICLE_PACE[tier];
          drawCar(spot.x, spot.y, vertical, i, tier);
          seenAt(spot);
          if (inLane) moving.push({ x: tileX, y: tileY, hx, hy, index: i });
        }

        trip.along = along + elapsed * speed;
        if (trip.along >= steps) trips.set(key, { at: to, wait: 0 });
      }
      if (elapsed > 0) cars = moving;
      if (pin) {
        // A yellow arrow bobbing over the one being followed.
        const x = Math.round(pin.x);
        const y = Math.round(pin.y) - 13 - Math.floor(animationTime / 300) % 2;
        people.rect(x - 5, y - 8, 11, 6).rect(x - 3, y - 2, 7, 2).rect(x - 1, y, 3, 2).fill(0x25232b);
        people.rect(x - 4, y - 7, 9, 4).rect(x - 2, y - 3, 5, 2).rect(x, y - 1, 1, 2).fill(0xffd95a);
      }

      // Traffic lights at the junctions in sight: one lamp for each way, green or red.
      const viewLeft = -camera.x / camera.scale / TILE_SIZE - 1;
      const viewTop = -camera.y / camera.scale / TILE_SIZE - 1;
      const viewRight = viewLeft + app.screen.width / camera.scale / TILE_SIZE + 2;
      const viewBottom = viewTop + app.screen.height / camera.scale / TILE_SIZE + 2;
      for (const id of junctions) {
        const x = id % MAP_SIZE;
        const y = Math.floor(id / MAP_SIZE);
        if (x < viewLeft || x > viewRight || y < viewTop || y > viewBottom) continue;
        const upright = greenUpright(x, y);
        const left = x * TILE_SIZE;
        const top = y * TILE_SIZE;
        people.rect(left + 1, top + 1, 5, 5).rect(left + 26, top + 26, 5, 5).fill(0x1b1d22);
        people.rect(left + 2, top + 2, 3, 3).fill(upright ? 0x4fc46b : 0xe5484d);
        people.rect(left + 27, top + 27, 3, 3).fill(upright ? 0xe5484d : 0x4fc46b);
      }

      // Each line's vehicles, evenly spread, running to the far end and back.
      for (const line of this.city.getLines()) {
        const last = line.path.length - 1;
        if (!line.active || last < 1) continue;
        // The metro runs underground: its trains only show while the routes are on display.
        if (line.kind === 'metro' && !routesShown()) continue;
        const colour = lineColour(line.id);
        /** The middle of the tile `along` tiles down the route, and whether it is heading up or down. */
        const at = (along: number) => {
          const clamped = Math.max(0, Math.min(last, along));
          const index = Math.min(last - 1, Math.floor(clamped));
          const from = line.path[index];
          const to = line.path[index + 1];
          const part = clamped - index;
          return { x: (from.x + (to.x - from.x) * part + 0.5) * TILE_SIZE,
            y: (from.y + (to.y - from.y) * part + 0.5) * TILE_SIZE, upright: to.x === from.x };
        };
        const lap = 2 * last * LINE_PACE[line.kind];
        for (let vehicle = 0; vehicle < line.vehicles; vehicle++) {
          const turn = (animationTime / lap + vehicle / line.vehicles) % 1;
          const outbound = turn < 0.5;
          const along = (outbound ? turn : 1 - turn) * 2 * last;
          // A bus is one box; a train is three cars, the later ones trailing behind the first.
          const cars = line.kind === 'metro' ? 3 : 1;
          for (let car = 0; car < cars; car++) {
            const { x, y, upright } = at(along - (outbound ? 1 : -1) * car * 0.55);
            const long = line.kind === 'metro' ? 16 : 22;
            const wide = 12;
            const width = upright ? wide : long;
            const height = upright ? long : wide;
            people.rect(x - width / 2 - 1, y - height / 2 - 1, width + 2, height + 2).fill(0x1b1d22);
            people.rect(x - width / 2, y - height / 2, width, height).fill(line.kind === 'metro' ? colour : 0xf2c94c);
            // A bus wears its line's colour as a stripe; a train as its whole body, with pale windows.
            if (line.kind === 'bus') {
              people.rect(x - width / 2, y - height / 2, upright ? 3 : width, upright ? height : 3).fill(colour);
            }
            people.rect(x - (upright ? 3 : width / 2 - 3), y - (upright ? height / 2 - 3 : 3),
              upright ? 6 : width - 6, upright ? height - 6 : 6).fill(0xdfeef2);
          }
        }
      }
    };
    const drawEffects = () => {
      effects.clear();
      effects.position.set(camera.x, camera.y);
      effects.scale.set(camera.scale);
      for (const event of this.city.getEvents()) {
        const key = `${event.tick}:${event.kind}`;
        if (scenes.has(key) || this.city.now - event.tick > FRESH_TICKS) continue;
        const from = event.station && this.city.roadBeside(event.station);
        const to = this.city.roadBeside(event.cell);
        const route = from && to ? this.city.roadGraph.shortestPath(from, to)?.path : undefined;
        scenes.set(key, { event, since: animationTime, route });
      }
      for (const [key, scene] of scenes) {
        const age = animationTime - scene.since;
        if (age > sceneLength(scene) || this.city.now < scene.event.tick) scenes.delete(key);
        else drawScene(effects, scene, age);
      }
      drawLife();
    };

    /**
     * The small movements of a living city, in the part of the map in view: smoke from the
     * works, light on the water, lamps on the rides, snow in winter and fireworks on the night
     * of a festival. All of it is for show.
     */
    const drawLife = () => {
      const map = this.city.map;
      const left = Math.max(0, Math.floor(-camera.x / camera.scale / TILE_SIZE));
      const top = Math.max(0, Math.floor(-camera.y / camera.scale / TILE_SIZE));
      const right = Math.min(MAP_SIZE - 1, left + Math.ceil(app.screen.width / camera.scale / TILE_SIZE) + 1);
      const bottom = Math.min(MAP_SIZE - 1, top + Math.ceil(app.screen.height / camera.scale / TILE_SIZE) + 1);
      // Far out there is too much on screen for any of it to read, and too much to draw.
      if (camera.scale < 0.6) return;
      const time = animationTime;
      const hour = this.hour();
      const night = hour >= 19 || hour < 5;
      const rush = rushNow();
      for (let y = top; y <= bottom; y++) {
        for (let x = left; x <= right; x++) {
          const tile = map.get({ x, y });
          const seed = (Math.imul(x, 73856093) ^ Math.imul(y, 19349663)) >>> 0;
          const px = x * TILE_SIZE;
          const py = y * TILE_SIZE;
          if (isRoad(tile)) {
            // Where the traffic view says a road is busy or jammed, the road shows it: the
            // commuters drawn one by one are only a sample, so the rest of the queue is drawn here.
            // Like the traffic view this goes by the shifts the map shows on the road just now.
            const load = this.city.congestionOn({ x, y }, rush);
            if (load <= 0.75) continue;
            const across = isRoad(map.get({ x: x - 1, y })) || isRoad(map.get({ x: x + 1, y }));
            const along = isRoad(map.get({ x, y: y - 1 })) || isRoad(map.get({ x, y: y + 1 }));
            // A junction is left clear.
            if (across === along) continue;
            const jammed = load > 1;
            // A jam crawls; a busy road moves.
            const crawl = time / (jammed ? 2600 : 900);
            for (let lane = 0; lane < 2; lane++) {
              for (let car = 0; car < (jammed ? 2 : 1); car++) {
                const part = (crawl + car / 2 + (seed % 5) / 5 + lane * 0.3) % 1;
                const run = (lane ? 1 - part : part) * TILE_SIZE;
                const side = lane ? -6 : 6;
                if (across) drawCar(px + run, py + TILE_SIZE / 2 + side, false, seed + car + lane * 3, 2 + (seed + car) % 2);
                else drawCar(px + TILE_SIZE / 2 - side, py + run, true, seed + car + lane * 3, 2 + (seed + car) % 2);
              }
            }
          } else if (tile === 'river') {
            // A glint that comes and goes on some of the water.
            if (seed % 2 === 0 && Math.floor(time / 500 + seed % 7) % 3 === 0) {
              effects.rect(px + 4 + seed % 20, py + 6 + (seed >>> 5) % 18, 4, 1).fill({ color: 0xdff3fb, alpha: 0.9 });
            }
          } else if (tile === 'industrial' || tile === 'power') {
            if (tile === 'industrial' && !this.city.getBuilding({ x, y })?.occupants) continue;
            // Three puffs rising from the chimney, each fading as it climbs and drifts.
            for (let puff = 0; puff < 3; puff++) {
              const rise = ((time / 2200 + puff / 3 + seed % 10 / 10) % 1);
              const size = 4 + Math.floor(rise * 6);
              effects.rect(px + 20 + Math.round(rise * 6) - size / 2, py + 6 - Math.round(rise * 22), size, size)
                .fill({ color: tile === 'power' ? 0xeef1f6 : 0xb9bcc2, alpha: 0.9 * (1 - rise) });
            }
          } else if (tile === 'park') {
            if (!this.city.parkAt({ x, y }).fountain) continue;
            // The fountain's jet, higher and lower by turns.
            const jet = 3 + Math.floor(time / 180) % 4;
            effects.rect(px + 15, py + 14 - jet, 2, jet).fill(0xdff3fb);
            effects.rect(px + 13, py + 15 - jet, 1, 2).rect(px + 18, py + 15 - jet, 1, 2).fill({ color: 0xdff3fb, alpha: 0.8 });
          } else if (tile === 'amusement') {
            // The wheel's cars light up one after another, round and round.
            const cars = [[16, 4], [26, 10], [28, 16], [22, 26], [10, 26], [4, 16], [6, 10]];
            const lit = Math.floor(time / 220) % cars.length;
            cars.forEach(([dx, dy], index) => {
              if (index === lit || index === (lit + 3) % cars.length) effects.rect(px + dx, py + dy, 4, 4).fill(0xfff4c2);
            });
          } else if (tile === 'casino' || tile === 'ktv' || tile === 'cinema') {
            // Signs that blink, brighter after dark.
            if (Math.floor(time / 400 + seed) % 2) {
              const wide = tile === 'casino' ? 2 * TILE_SIZE - 16 : TILE_SIZE - 8;
              effects.rect(px + (tile === 'casino' ? 8 : 4), py + (tile === 'casino' ? 40 : 12), wide, 2)
                .fill({ color: 0xfff4c2, alpha: night ? 0.95 : 0.5 });
            }
          } else if (tile === 'temple' && this.city.comboAt({ x, y }) === 'fair' && night) {
            // The lanterns of the temple fair glow at night.
            for (let at = 2; at < TILE_SIZE; at += 6) {
              effects.rect(px + at - 1, py + 1, 5, 6).fill({ color: 0xffb84d, alpha: 0.35 + 0.2 * Math.sin(time / 300 + at) });
            }
          }
        }
      }
      // Snow drifting down over the whole view in winter.
      if (seasonAt(this.city.now) === 'winter') {
        const width = (right - left + 1) * TILE_SIZE;
        const height = (bottom - top + 1) * TILE_SIZE;
        for (let flake = 0; flake < 90; flake++) {
          const fall = (time / (26 + flake % 9) + flake * 97) % height;
          const sway = Math.sin(time / 700 + flake) * 6;
          effects.rect(left * TILE_SIZE + (flake * 131 % width) + sway, top * TILE_SIZE + fall, 2, 2).fill({ color: 0xffffff, alpha: 0.85 });
        }
      }
      // Fireworks over the view on the night of a festival that was held.
      const feast = this.city.getFeasts().at(-1);
      if (feast?.income && this.city.now - feast.tick < 8 && (hour >= 18 || hour < 2)) {
        const colours = [0xff6b6b, 0xffe14d, 0x7fd0ff, 0xb48cff, 0x7ee08a];
        for (let rocket = 0; rocket < 4; rocket++) {
          const life = (time / 1600 + rocket / 4) % 1;
          const round = Math.floor(time / 1600 + rocket / 4);
          const pick = (Math.imul(round + 1, 2654435761) ^ Math.imul(rocket + 1, 40503)) >>> 0;
          const cx = (left + 2 + pick % Math.max(1, right - left - 3)) * TILE_SIZE;
          const cy = (top + 2 + (pick >>> 8) % Math.max(1, Math.floor((bottom - top) / 2))) * TILE_SIZE;
          const colour = colours[pick % colours.length];
          if (life < 0.25) {
            // The rocket climbs.
            effects.rect(cx, cy + (0.25 - life) * 240, 2, 6).fill(0xfff4c2);
            continue;
          }
          const spread = (life - 0.25) / 0.75;
          for (let spark = 0; spark < 16; spark++) {
            const angle = spark * Math.PI / 8;
            const reach = 8 + spread * 44;
            effects.rect(cx + Math.cos(angle) * reach, cy + Math.sin(angle) * reach + spread * spread * 18, 3, 3)
              .fill({ color: spark % 2 ? colour : 0xffffff, alpha: 1 - spread });
          }
        }
      }
    };
    app.ticker.add(ticker => {
      const speed = this.speed();
      if (!speed || !this.city.getCommutes().length) return;
      animationTime += ticker.deltaMS * speed;
      drawPeople(ticker.deltaMS * speed);
      drawEffects();
    });
    app.start();

    let preview: Cell[] = [];
    let hover: Cell | undefined;
    let selected: Cell | undefined;
    // `fromX` and `fromY` are where the pointer went down; `x` and `y` follow it.
    let drag: { id: number; tool: Tool; start: Cell; x: number; y: number; fromX: number; fromY: number } |
      undefined;
    const draw = () => {
      // Placing a plant or tower shows what it would reach, and which buildings are served now.
      const tool = getTool();
      const inspected = selected && (map.hasStation(selected) ? 'metro' : map.get(selected));
      const reach = (kind: string | undefined, centre: Cell | undefined) =>
        !centre ? undefined :
        isFacility(kind) ? { centre, radius: utilities.radius, kind } :
        isService(kind) ? { centre, radius: services.radius[kind], kind } :
        kind === 'bus' ? { centre, radius: transit.bus.radius, kind: 'bus' as const } :
        kind === 'metro' ? { centre, radius: transit.metro.radius, kind: 'metro' as const } : undefined;
      const range = reach(tool, hover) ?? reach(inspected, selected);

      const layer = this.overlay();
      tiles.draw(this.city, camera, app.screen.width, app.screen.height, preview, selected,
        layer === 'none' && (isFacility(tool) || isService(tool) || tool === 'bus' || tool === 'metro') ?
          tool : layer,
        range, this.hour(),
        // Routes show while laying out transport, and in the map view for them.
        routesShown() ? this.city.getLines() : [], this.marks, rushNow());
      drawPeople();
      drawEffects();
      app.render();
    };
    this.refresh = draw;
    this.lookAt = cell => {
      camera.x = app.screen.width / 2 - (cell.x + 0.5) * TILE_SIZE * camera.scale;
      camera.y = app.screen.height / 2 - (cell.y + 0.5) * TILE_SIZE * camera.scale;
      camera.pan(0, 0, app.screen.width, app.screen.height);
      draw();
    };
    this.deselect = () => {
      selected = undefined;
      draw();
    };
    const position = (event: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    };
    const boundedCell = (x: number, y: number) => {
      const cell = camera.cellAt(x, y);
      const clamp = (value: number) => Math.min(MAP_SIZE - 1, Math.max(0, value));
      return { x: clamp(cell.x), y: clamp(cell.y) };
    };

    canvas.addEventListener('pointerdown', event => {
      if (drag || (event.button !== 0 && event.button !== 1)) return;
      const { x, y } = position(event);
      const tool = event.button === 1 ? 'pan' : getTool();
      const start = camera.cellAt(x, y);
      const looking = tool === 'pan' || tool === 'inspect';
      if (!looking && map.get(start) === undefined) return;
      event.preventDefault();
      canvas.setPointerCapture(event.pointerId);
      drag = { id: event.pointerId, tool, start, x, y, fromX: x, fromY: y };
      preview = looking ? [] : isBig(tool) ? footprint(start) : [start];
      draw();
    }, { signal });

    canvas.addEventListener('pointermove', event => {
      const { x, y } = position(event);
      if (!drag) {
        const cell = camera.cellAt(x, y);
        const tool = getTool();
        const next = (isFacility(tool) || isService(tool) || tool === 'bus' || tool === 'metro') &&
          map.get(cell) !== undefined ?
          cell : undefined;
        if (next?.x !== hover?.x || next?.y !== hover?.y) {
          hover = next;
          draw();
        }
        return;
      }
      if (drag.id !== event.pointerId) return;
      // With the look tool a press that moves is a drag of the map; one that stays put is a click.
      if (drag.tool === 'inspect' && Math.hypot(x - drag.fromX, y - drag.fromY) > 4) drag.tool = 'pan';
      if (drag.tool === 'pan') camera.pan(x - drag.x, y - drag.y, app.screen.width, app.screen.height);
      else if (drag.tool !== 'inspect' && !isBig(drag.tool)) preview = selection(drag.tool, drag.start, boundedCell(x, y));
      drag.x = x;
      drag.y = y;
      draw();
    }, { signal });

    const clearDrag = (event: PointerEvent) => {
      if (drag?.id !== event.pointerId) return;
      drag = undefined;
      preview = [];
      draw();
    };
    canvas.addEventListener('pointerup', event => {
      if (!drag || drag.id !== event.pointerId) return;
      const { tool, start } = drag;
      const { x, y } = position(event);
      if (tool === 'inspect') {
        // A click on someone out on the road picks them; anywhere else picks the tile.
        const worldX = (x - camera.x) / camera.scale;
        const worldY = (y - camera.y) / camera.scale;
        let reach = 14;
        let picked: (typeof spots)[number] | undefined;
        for (const spot of spots) {
          const distance = Math.hypot(spot.x - worldX, spot.y - worldY);
          if (distance < reach) [reach, picked] = [distance, spot];
        }
        if (picked && this.onPerson) {
          this.onPerson(picked.homeId, picked.workId);
        } else if (map.get(start) !== undefined) {
          selected = start;
          inspect(start);
        }
      } else if (tool === 'line') {
        this.onLineClick?.(start);
      } else if (tool !== 'pan') {
        const cells = selection(tool, start, boundedCell(x, y));
        const result = this.city.execute(tool === 'viaduct' ? { type: 'BUILD_VIADUCT', path: cells } : isRoad(tool) ? { type: 'BUILD_ROAD', path: cells, road: tool } :
          tool === 'demolish' ? { type: 'DEMOLISH', ...start } :
          isFacility(tool) ? { type: 'BUILD_FACILITY', ...start, facility: tool } :
          isService(tool) ? { type: 'BUILD_SERVICE', ...start, service: tool } :
          tool === 'bus' ? { type: 'BUILD_BUS_STOP', ...start } :
          tool === 'metro' ? { type: 'BUILD_METRO', ...start } :
          tool === 'park' ? { type: 'BUILD_PARK', tiles: cells } :
          tool === 'farm' ? { type: 'BUILD_FARM', tiles: cells } :
          { type: 'SET_ZONE', tiles: cells, zone: tool });
        const stranded = result.changed.length > 0 && (isFacility(tool) || isService(tool) || tool === 'bus') &&
          !this.city.roadBeside(start);
        report(result.error ?? (stranded ? `蓋好了，花了 $${result.cost}。但是旁邊沒有路，要接上道路才會開始運作。` :
          result.changed.length ? `完成，花了 $${result.cost}。` : '這裡已經是這樣了，沒有變動。'));
      }
      clearDrag(event);
    }, { signal });
    canvas.addEventListener('pointerleave', () => {
      if (!hover) return;
      hover = undefined;
      draw();
    }, { signal });
    canvas.addEventListener('pointercancel', clearDrag, { signal });
    canvas.addEventListener('lostpointercapture', clearDrag, { signal });

    canvas.addEventListener('wheel', event => {
      event.preventDefault();
      if (drag) return;
      const { x, y } = position(event);
      const multiplier = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? app.screen.height : 1;
      camera.zoom(x, y, event.deltaY * multiplier, app.screen.width, app.screen.height);
      draw();
    }, { signal, passive: false });

    this.observer = new ResizeObserver(() => {
      app.renderer.resize(host.clientWidth, host.clientHeight);
      camera.pan(0, 0, app.screen.width, app.screen.height);
      draw();
    });
    this.observer.observe(host);
    draw();
  }

  destroy(): void {
    this.refresh = undefined;
    this.observer?.disconnect();
    this.app?.destroy(true, { children: true });
    this.app = undefined;
  }
}
