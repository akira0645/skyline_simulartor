import { animationElapsed } from './animationElapsed';
import type { SimulationSpeed } from '../simulation/SimulationClock';
import { hitVehicle, nextDeliveryStop, type VehicleInfo, type VehicleActivity } from './vehicleInspection';
import { numberBadge } from './routeBadges';
import { freightMapRoutes, freightColourId, selectedFreightKey } from './routeViews';
import { weatherAt, weatherTravel } from '../simulation/Weather';
import { Application, Assets, Graphics, type Texture, type TextureSource } from 'pixi.js';
import type { Theme } from '../simulation/SaveData';
import { LazyThemeAsset } from './LazyThemeAsset';
import { SharedAssetPool } from './SharedAssetPool';
import cityUrl from '../assets/city.png';
import sfUrl from '../assets/city-sf.png';
import californiaUrl from '../assets/city-california.png';
import newyorkUrl from '../assets/city-newyork.png';
import tilesUrl from '../assets/tiles.png';
import carsUrl from '../assets/vehicles/cars.png';
import cityDetailUrl from '../assets/buildings/city-detail.png';
import sfDetailUrl from '../assets/buildings/city-sf-detail.png';
import californiaDetailUrl from '../assets/buildings/city-california-detail.png';
import newyorkDetailUrl from '../assets/buildings/city-newyork-detail.png';
import { CarSprites } from './CarSprites';
import { BicycleSprites } from './BicycleSprites';
import bicycleUrl from '../assets/street/bicycles.png';
import scooterUrl from '../assets/street/scooters.png';
import scooterAtlas from '../assets/street/scooters.json';
import { carHeading } from './carAppearance';
import { StreetArt } from './StreetArt';
import { WalkerMotion } from './WalkerMotion';
import { residentAppearance } from './residentAppearance';
import { acceptOutingForDisplay } from './outingDisplay';
import { WALK_REAL_MS_PER_TILE, VEHICLE_REAL_PACE, REAL_TICK_MS } from '../simulation/TravelTiming';
import { travelTicks } from '../simulation/VisitSystem';
import residentStyles from '../assets/street/residents.json';
import { footprint, isBig, isFacility, isRoad, isService, MAP_SIZE, TILE_SIZE, type Cell } from '../simulation/TileMap';
import { services } from '../simulation/Services';
import { transit } from '../simulation/Transit';
import { vehicleSizes } from './vehicleSizes';
import { CarQueue } from './CarQueue';
import { clearRoadAdvance, type RoadBody } from '../simulation/RoadOccupancy';
import { passengerVehicleSizes, passengerBodySize, roadBodySize } from '../simulation/VehicleGeometry';
import { followingSpeed } from '../simulation/RoadFollowing';
import type { JunctionNetwork } from '../simulation/JunctionFlow';
import { land, parcelAt, parcelCentre, parcelOrigin } from '../simulation/Land';
import { lineColour } from '../app/lineColours';
import { advancePathVehicle, roadVehiclePose, roadPathKey, type RoadVehicle } from './roadVehicle';

/** Milliseconds a line's vehicle takes per tile at 1× speed. */
const LINE_PACE = { bus: 320, metro: 250 };
import { advanceScene, drawScene, sceneLength, sceneVehicle, type Scene } from './emergencyScenes';

/** An emergency older than this many ticks when first seen is not played back. */
const FRESH_TICKS = 16;
const CARS_SHOWN = 500;
/** As many again may be out on errands in their own cars and on their scooters. */
const RIDES_SHOWN = 200;
import { selection, type Overlay, type Tool } from '../app/tools';
import { Camera } from './Camera';
import { MapPinch } from './MapPinch';
import { DETAIL_ZOOM, TileRenderer } from './TileRenderer';
import { advancePedestrian, commuterPosition } from './commuterPosition';
import { CommuterGeometry } from './CommuterGeometry';
import { shiftIndex, shifts, workShift } from '../simulation/WorkShift';
import { calendar, hourAt, weekendAt } from '../simulation/calendar';
import { rainingAt, seasonAt } from '../simulation/Seasons';
import { utilities } from '../simulation/Utilities';
import { mind, SHOP_SHIFT } from '../simulation/Mind';

/**
 * How long a commuter takes per tile, in milliseconds at 1× speed. Trips start by the game
 * clock; walking and errand progress share TravelTiming's two-minute game day.
 */
/** The same for each vehicle, in the order of Wealth's `vehicles`: a bicycle is slow, a car quick. */
const WALK_MS_PER_TILE = WALK_REAL_MS_PER_TILE;
const VEHICLE_PACE = VEHICLE_REAL_PACE;
/** Most driving steps a visible vehicle takes in one frame, however long the frame was. */
const MAX_DRIVE_STEPS = 3;
/** How long a traffic light stays green each way, in milliseconds at 1× speed. */
const LIGHT = 2600;
/** Commuters set out this many game hours before their shift. */
const HEAD_START = 2;

import type { BuildingSystem } from '../simulation/BuildingSystem';

const detailUrls: Record<Theme, string> = { classic: cityDetailUrl, sf: sfDetailUrl,
  california: californiaDetailUrl, newyork: newyorkDetailUrl };
const detailPool = new SharedAssetPool<Theme, Texture>(
  theme => Assets.load<Texture>(detailUrls[theme]), theme => Assets.unload(detailUrls[theme]));
const bicyclePool = new SharedAssetPool<string, Texture>(() => Assets.load<Texture>(bicycleUrl), () => Assets.unload(bicycleUrl));
const scooterPool = new SharedAssetPool<string, Texture>(() => Assets.load<Texture>(scooterUrl), () => Assets.unload(scooterUrl));

type FacilityVisit = ReturnType<BuildingSystem['facilityVisits']>[number];

export class CityRenderer {
  /** Optional diagnostic sink; the normal game does not collect per-frame timings. */
  onFrameTiming?: (sample: { simulationMs: number; actorsMs: number; effectsMs: number }) => void;
  visitorsAt?: (cell: Cell) => (FacilityVisit & { phase: '前往中' | '使用中' | '回程' })[];
  refresh?: () => void;
  /** Called with the cell clicked while the line tool is in use. */
  onLineClick?: (cell: Cell) => void;
  onFreightClick?: (cell: Cell) => void;
  freightVisible = false;
  selectedFreight?: string;
  allFreightRoutes = false;
  selectedVehicle?: string;
  onVehicle?: (key: string) => void;
  getVehicle?: (key: string) => VehicleInfo | undefined;
  /** Clears the inspected tile. */
  deselect?: () => void;
  /** Called when a commuter on the map is clicked, with their home and workplace. */
  onPerson?: (homeId: number, person: { workId: number } | { slot: number }) => void;
  /** Tiles to frame on the map, and a way to bring one of them to the middle of the view. */
  marks: Cell[] = [];
  focus?: (cell: Cell) => boolean;
  lookAt?: (cell: Cell) => void;
  /** The commuter to point out on the map, as `home:workplace`. */
  follow?: string;
  followVisitor?: { home: number; slot: number };
  /** Where the map shows a commuter: settled at home or at work, or on the way to either. */
  tripOf?: (homeId: number, workId: number) => 'home' | 'work' | 'to-work' | 'to-home' | undefined;
  /**
   * How full the map shows a road tile just now, in the measure of the traffic view's colours:
   * up to 0.5 free, up to 1 busy, up to 1.5 jammed, more than that badly jammed.
   */
  crowdOn?: (cell: Cell) => number;

  resetView?: () => void;
  zoomView?: (direction: number) => void;
  setPlaying?: (playing: boolean) => void;

  constructor(private readonly city: BuildingSystem, private readonly speed: () => SimulationSpeed,
    private readonly hour: () => number, private readonly overlay: () => Overlay, private readonly advance?: () => void) {}
  private app?: Application;
  private observer?: ResizeObserver;
  private carSprites?: CarSprites;
  private streetArt?: StreetArt;
  private detailAsset?: LazyThemeAsset<Texture>;
  private tileRenderer?: TileRenderer;
  private bicycles?: BicycleSprites;
  private bicycleLease = false;
  private scooters?: BicycleSprites;
  private scooterLease = false;

  async mount(host: HTMLElement, signal: AbortSignal, getTool: () => Tool,
    report: (message: string) => void, inspect: (cell: Cell) => void): Promise<void> {
    const app = new Application();
    await app.init({ width: host.clientWidth, height: host.clientHeight,
      background: '#1d1f24', antialias: false, autoStart: false });
    const [sheets, streetArt] = await Promise.all([
      Promise.all([tilesUrl, cityUrl, sfUrl, californiaUrl, newyorkUrl, carsUrl].map(url => Assets.load<Texture>(url))),
      StreetArt.load()])
      .catch((error: unknown) => {
        app.destroy(true);
        throw error;
      });
    for (const sheet of sheets) sheet.source.scaleMode = 'nearest';
    if (signal.aborted) {
      streetArt.destroy();
      app.destroy(true);
      return;
    }

    this.app = app;
    this.streetArt = streetArt;
    const carSprites = this.carSprites = new CarSprites(sheets[5].source);
    let bikeRequested = false;
    const requestBicycles = () => {
      if (bikeRequested) return;
      bikeRequested = true;
      void bicyclePool.acquire('bicycle').then(texture => {
        if (signal.aborted || this.app !== app) { void bicyclePool.release('bicycle'); return; }
        texture.source.scaleMode = 'nearest';
        this.bicycles = new BicycleSprites(texture.source);
        this.bicycleLease = true;
        this.refresh?.();
      }).catch(error => { if (!signal.aborted) console.warn('Bicycle detail unavailable; keeping simple bicycles', error); });
    };
    const map = this.city.map;
    let scooterRequested = false;
    const requestScooters = () => {
      if (scooterRequested) return;
      scooterRequested = true;
      void scooterPool.acquire('scooter').then(texture => {
        if (signal.aborted || this.app !== app) { void scooterPool.release('scooter'); return; }
        texture.source.scaleMode = 'nearest';
        this.scooters = new BicycleSprites(texture.source, scooterAtlas);
        this.scooterLease = true;
        this.refresh?.();
      }).catch(error => { if (!signal.aborted) console.warn('Scooter detail unavailable; keeping simple scooters', error); });
    };
    const camera = new Camera();
    // The panels float over the map: leave room to drag any corner out from under them, and
    // start with the map's corner clear of the top bar.
    camera.margin = 260;
    const frameCity = () => {
      camera.scale = 1;
      camera.x = 24;
      camera.y = 96;
      if (this.city.getLand().some(plot => !plot.owned)) {
        const centre = parcelCentre(land.start);
        camera.x = app.screen.width / 2 - centre.x * TILE_SIZE;
        camera.y = app.screen.height / 2 - centre.y * TILE_SIZE;
      }
      camera.pan(0, 0, app.screen.width, app.screen.height);
    };
    frameCity();
    const detailedSheets: Partial<Record<Theme, TextureSource>> = {};
    const tiles = this.tileRenderer = new TileRenderer(sheets[0].source,
      { classic: sheets[1].source, sf: sheets[2].source, california: sheets[3].source, newyork: sheets[4].source },
      detailedSheets, streetArt);
    const detailAsset = this.detailAsset = new LazyThemeAsset(
      theme => detailPool.acquire(theme),
      async (theme, texture) => {
        if (detailedSheets[theme] === texture.source) delete detailedSheets[theme];
        tiles.releaseSheet(texture.source);
        await detailPool.release(theme);
      },
      (theme, texture) => {
        texture.source.scaleMode = 'nearest';
        detailedSheets[theme] = texture.source;
        if (!signal.aborted) this.refresh?.();
      },
      error => { if (!signal.aborted) console.warn('Close-up art unavailable; retaining base city art', error); });
    const canvas = app.canvas;
    app.stage.addChild(tiles.view);
    const landGrid = new Graphics();
    app.stage.addChild(landGrid);
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
    /**
     * Where each commuter is. `garage` says which ends of the trip are a building big enough to
     * have parking under it: there the car is out of sight, and drives in and out of the
     * building itself; at a house or a small shop it waits by the kerb. `held` is how long the
     * car has stood behind another.
     */
    let vehicleFrames: VehicleInfo[] = [];
    this.getVehicle = key => vehicleFrames.find(vehicle => vehicle.key === key);
    const roadVehiclePaths = new Map<string, string>();
    const pathKeys = new WeakMap<readonly Cell[], string>();
    const roadVehicles = new Map<string, RoadVehicle>();
    const pendingRoadVehicles = new Set<string>();
    const trips = new Map<string, { at: 'home' | 'work'; along?: number; wait: number; driving?: boolean;
      garage?: { home: boolean; work: boolean }; lot?: { home?: number; work?: number }; held?: number;
      speed?: number; drivePath?: Cell[]; driveSource?: readonly Cell[]; driveFrom?: 'home' | 'work'; admitting?: boolean; geometry?: CommuterGeometry;
      /** How many times they have set out, and the way by the filling station when this trip goes that way. */
      count?: number; detour?: { path: Cell[]; stop: number; wait: number } }>();
    /** The cars that were on the road in the last frame, for the ones behind to keep clear of. */
    let cars: RoadBody[] = [];
    /** Whether a car in the same lane is just ahead of this spot: one going the same way, within `reach` of a tile. */
    const queue = new CarQueue();
    const carAhead = (x: number, y: number, hx: number, hy: number, self: number, reach = 0.48) =>
      queue.ahead(x, y, hx, hy, self, reach);
    /**
     * One drive to be shown: a commuter's between home and work, or one leg of an outing made
     * on a scooter or in a car. Both are driven the same way, in lane, behind whoever is in
     * front and stopping at lights. `wanted` is the end the driver should be at now.
     */
    interface Run { key: string; homeId: number; workId: number; path: readonly Cell[]; tier: number; index: number;
      wanted: 'home' | 'work'; walks: boolean; commute: boolean; person?: { home: number; slot: number };
      journey?: { started: number; returning: boolean }; initialProgress?: number }
    /**
     * Those out on wheels. Visible drivers report physical progress back to the visit system,
     * so lights, queues and parking delay arrival. The car waits at the kerb during the visit.
     */
    interface Leg { from: number; to: number; path: Cell[]; tier: number; id: number; started: number; returning: boolean; initialProgress: number }
    const rides = new Map<string, { home: number; slot: number; vehicle: number; queue: Leg[]; leg?: Leg; seen: number; live: boolean }>();
    let legs = 0;
    const outingRuns = (most: number): Run[] => {
      const current = this.city.now + Math.min(1, ((this.hour() - hourAt(this.city.now) + 24) % 24) / (24 / calendar.ticksPerDay));
      for (const ride of rides.values()) ride.live = false;
      let motorsShown = [...rides.values()].filter(ride => ride.vehicle !== 0).length;
      this.city.visits.each(trip => {
        if (trip.ride === undefined || trip.doing === 'delivering' || trip.path.length < 4) return;
        const key = `${trip.home}:${trip.slot}`;
        let ride = rides.get(key);
        if (!ride) {
          // Keep room for an actual bicycle outing; earlier motor trips must not consume every slot.
          if (!acceptOutingForDisplay(trip.ride, rides.size, motorsShown, most)) return;
          rides.set(key, ride = { home: trip.home, slot: trip.slot, vehicle: trip.ride, queue: [], seen: -1, live: true });
          if (trip.ride !== 0) motorsShown++;
        }
        ride.live = true;
        if (trip.started === ride.seen) return;
        ride.seen = trip.started;
        const from = trip.path[0];
        const to = trip.path[trip.path.length - 1];
        ride.queue.push({ from: from.y * MAP_SIZE + from.x, to: to.y * MAP_SIZE + to.x, path: trip.path.slice(1, -1), tier: trip.ride, id: legs++,
          started: trip.started, returning: trip.returning,
          initialProgress: Math.max(0, Math.min(1, (current - trip.started - (trip.delay ?? 0)) / travelTicks(trip.path, trip.doing, trip.ride))) });
      });
      const runs: Run[] = [];
      for (const [key, ride] of rides) {
        const state = ride.leg && trips.get(`o:${ride.leg.id}`);
        // A leg is over once the car is parked and there is somewhere else to go, or the outing has ended.
        if (ride.leg && state?.at === 'work' && state.along === undefined && (ride.queue.length || !ride.live)) {
          trips.delete(`o:${ride.leg.id}`);
          ride.leg = undefined;
        }
        ride.leg ??= ride.queue.shift();
        if (!ride.leg) {
          rides.delete(key);
          continue;
        }
        runs.push({ key: `o:${ride.leg.id}`, homeId: ride.leg.from, workId: ride.leg.to, path: ride.leg.path, tier: ride.leg.tier,
          index: 100000 + ride.leg.id, wanted: 'work', walks: false, commute: false, person: { home: ride.home, slot: ride.slot },
          journey: { started: ride.leg.started, returning: ride.leg.returning }, initialProgress: ride.leg.initialProgress });
      }
      return runs;
    };
    /** Where each commuter in sight was last drawn, for clicking on them. */
    let spots: ({ x: number; y: number; homeId: number } & ({ workId: number } | { slot: number }))[] = [];
    this.tripOf = (homeId, workId) => {
      const trip = trips.get(`${homeId}:${workId}`);
      if (!trip) return undefined;
      return trip.along === undefined || trip.wait > 0 ? trip.at : trip.at === 'home' ? 'to-work' : 'to-home';
    };
    const cellOf = (id: number): Cell => ({ x: id % MAP_SIZE, y: Math.floor(id / MAP_SIZE) });
    /** How long and how wide each vehicle is drawn, in the order of Wealth's `vehicles`. */
    // A lane is about a third of a tile wide, and a car must fit in it with room to spare.
    const SIZES = passengerVehicleSizes;
    const streetOpacity = () => Math.max(0, Math.min(1, (camera.scale - 0.45) / 0.55));
    const visible = (x: number, y: number, margin = 32) => {
      const sx = x * camera.scale + camera.x;
      const sy = y * camera.scale + camera.y;
      return sx >= -margin && sy >= -margin && sx <= app.screen.width + margin && sy <= app.screen.height + margin;
    };
    const drawCar = (cx: number, cy: number, vertical: boolean, index: number, tier: number,
      heading = vertical ? Math.PI / 2 : 0, bicycle?: { profile: number; distance: number }) => {
      if (!visible(cx, cy)) return;
      if (streetOpacity() === 0) return;
      if (camera.scale < 0.85) {
        people.rect(Math.round(cx) - 2, Math.round(cy) - 2, vertical ? 3 : 6, vertical ? 6 : 3).fill(0xc0c5c9);
        return;
      }
      if (tier >= 2) {
        carSprites.draw(people, cx, cy, heading, tier, index, this.city.theme);
        return;
      }
      if (tier === 0) {
        if (this.bicycles) { this.bicycles.draw(people, cx, cy, heading, bicycle?.profile, bicycle?.distance); return; }
        requestBicycles();
      }
      if (tier === 1) {
        if (this.scooters) { this.scooters.draw(people, cx, cy, heading, bicycle?.profile); return; }
        requestScooters();
      }
      const [long, wide] = SIZES[tier];
      const width = vertical ? wide : long;
      const height = vertical ? long : wide;
      const left = Math.round(cx - width / 2);
      const top = Math.round(cy - height / 2);
      people.rect(left, top, width, height).fill(0x232831);
      // Temporary fallback while a two-wheeler's shared atlas loads.
      if (tier) people.rect(left + 1, top + 1, width - 2, height - 2).fill([0xd87856, 0x5bb6ce, 0xe6c15a][index % 3]);
      people.rect(Math.round(cx) - 1, Math.round(cy) - 1, 3, 3).fill(0xffd1a0);
    };
    /** Road tiles where three or four roads meet, which get traffic lights; looked up again now and then. */
    let junctions = new Set<number>();
    let junctionRevision = -1;
    const findJunctions = () => {
      if (junctionRevision === map.roadRevision) return;
      junctionRevision = map.roadRevision;
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
    const greenUpright = (x: number, y: number) => (Math.floor(this.city.shipments.elapsedMotionMs / LIGHT) + x + y) % 2 === 0;
    const trafficNetwork: JunctionNetwork = {
      isJunction: cell => junctions.has(cell.y * MAP_SIZE + cell.x),
      green: (cell, hx, hy, time) => ((Math.floor(time / LIGHT) + cell.x + cell.y) % 2 === 0) === (Math.abs(hy) > Math.abs(hx)),
    };
    /** Whether it is raining just now; set once a frame. */
    let wet = false;
    const walkForward = (roads: readonly Cell[], origin: Cell, along: number, advance: number, returning: boolean) =>
      advancePedestrian(roads, origin, along, advance, returning, (entry, vertical) =>
        !junctions.has(entry.y * MAP_SIZE + entry.x) || greenUpright(entry.x, entry.y) === vertical);
    const walkerMotion = new WalkerMotion();
    const drawWalker = (cx: number, cy: number, index: number, heading = Math.PI / 2, actorKey = `person:${index}`,
      profile = residentAppearance(this.city.seed, index, 30)) => {
      const motion = walkerMotion.update(actorKey, cx, cy, animationTime, heading);
      if (!visible(cx, cy)) return;
      if (streetOpacity() === 0) return;
      if (camera.scale < 0.85) {
        people.rect(Math.round(cx) - 1, Math.round(cy) - 2, 2, 4).fill(0xe8c7a0);
        return;
      }
      // A person is small beside a house: three pixels across and nine tall.
      const x = Math.round(cx) - 1;
      const y = Math.round(cy) - 4;
      if (camera.scale >= 1) {
        streetArt.drawPerson(people, cx, cy, motion.heading, index, motion.distance, motion.walking, profile);
        if (wet) {
          const colour = [0xe5484d, 0x3f6fb0, 0xf2c94c, 0x5f9a6a, 0xf4f6f8][index % 5];
          people.rect(cx - 4.5, cy - 8, 9, 3).fill(0x25232b)
            .rect(cx - 4, cy - 8, 8, 2).fill(colour)
            .rect(cx - 2, cy - 8, 0.5, 2).rect(cx + 2, cy - 8, 0.5, 2).fill(0xf4f6f8)
            .rect(cx, cy - 6, 0.5, 3).fill(0xa1a8ac);
        }
        return;
      }
      if (wet) {
        // An umbrella, each in its owner's colour.
        people.rect(x - 3, y - 5, 9, 3).rect(x + 1, y - 2, 1, 3).fill(0x25232b);
        people.rect(x - 2, y - 4, 7, 1).fill([0xe5484d, 0x3f6fb0, 0xf2c94c, 0x5f9a6a, 0xf4f6f8][index % 5]);
      }
      const stride = motion.walking ? Math.floor(motion.distance / 3 + index) % 2 : 0;
      people.rect(x - 1, y - 1, 5, 10).fill(0x25232b);
      const look = residentStyles.looks[profile % residentStyles.variants];
      people.rect(x, y, 3, 3).fill(parseInt(look.skin, 16));
      people.rect(x, y + 3, 3, 3).fill(parseInt(look.shirt, 16));
      people.rect(x, y + 6, 1, 1 + stride).rect(x + 2, y + 6, 1, 2 - stride).fill(0xece6dd);
      if (camera.scale < DETAIL_ZOOM) return;
      // Close up: hair, eyes, arms, and a bag for some.
      people.rect(x, y, 3, 1).rect(x, y, 0.5, 2).fill([0x3a2a1c, 0x1b1d22, 0x8a5a3a, 0xd9c08a][index % 4]);
      people.rect(x + 0.5, y + 1.5, 0.5, 0.5).rect(x + 2, y + 1.5, 0.5, 0.5).fill(0x25232b);
      people.rect(x - 0.5, y + 3, 0.5, 2 + stride * 0.5).rect(x + 3, y + 3, 0.5, 2.5 - stride * 0.5).fill(0xffd1a0);
      if (index % 3 === 0) people.rect(x + 3, y + 4.5, 1, 1.5).fill(0x8a5a3a);
    };
    /**
     * The traffic view is coloured by the cars the map itself shows, so the two cannot disagree:
     * `counted` adds up the cars on each road tile in this frame, a car stuck behind another
     * weighing three, and `crowd` follows it over a couple of seconds so that a tile does not
     * blink as single cars pass. A street tile has room for four, an avenue for eight.
     */
    const counted = new Float32Array(MAP_SIZE ** 2);
    const crowd = new Float32Array(MAP_SIZE ** 2);
    /** The tiles where either figure is above nothing, so the rest need not be gone through. */
    let crowded = new Set<number>();
    const settleCrowd = (elapsed: number) => {
      const share = Math.min(1, elapsed / 2500);
      const still = new Set<number>();
      for (const id of crowded) {
        crowd[id] += (counted[id] - crowd[id]) * share;
        counted[id] = 0;
        if (crowd[id] < 0.02) crowd[id] = 0;
        else still.add(id);
      }
      crowded = still;
    };
    this.crowdOn = cell => {
      const tile = map.get(cell);
      if (!isRoad(tile)) return 0;
      const load = crowd[cell.y * MAP_SIZE + cell.x] / (tile === 'avenue' ? 8 : 4);
      return this.city.crashDelay(cell) ? Math.max(1.2, load) : load;
    };

    /**
     * The way from home to work by the nearest filling station to home, if there is one near
     * enough and the detour is not out of all proportion. `stop` is how far along the pump is.
     */
    const viaStation = (route: { homeId: number; path: readonly Cell[] }): { path: Cell[]; stop: number; wait: number } | undefined => {
      const home = cellOf(route.homeId);
      let best: { road: Cell; far: number } | undefined;
      for (let dy = -10; dy <= 10; dy++) {
        for (let dx = -10 + Math.abs(dy); dx <= 10 - Math.abs(dy); dx++) {
          const cell = { x: home.x + dx, y: home.y + dy };
          if (this.city.map.get(cell) !== 'gas') continue;
          const road = this.city.roadBeside(cell);
          if (road && (!best || Math.abs(dx) + Math.abs(dy) < best.far)) best = { road, far: Math.abs(dx) + Math.abs(dy) };
        }
      }
      if (!best) return undefined;
      const there = this.city.roadGraph.shortestPath(route.path[0], best.road)?.path;
      const on = this.city.roadGraph.shortestPath(best.road, route.path[route.path.length - 1])?.path;
      if (!there || !on || there.length + on.length > route.path.length + 20) return undefined;
      return { path: [...there, ...on.slice(1)], stop: there.length, wait: 1800 };
    };

    /** The car park within two tiles of a building, if there is one. */
    const lotBy = ({ x, y }: Cell): number | undefined => {
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          if (this.city.map.get({ x: x + dx, y: y + dy }) === 'parking') return (y + dy) * MAP_SIZE + x + dx;
        }
      }
    };

    this.visitorsAt = cell => this.city.visitorsAt(cell);

    const drawPeople = (elapsed = 0) => {
      const travelTick = this.city.now + Math.min(1, ((this.hour() - hourAt(this.city.now) + 24) % 24) / (24 / calendar.ticksPerDay));
      queue.reset(cars);
      // Authoritative deliveries are present before commuters move, including the first frame.
      for (const [i, shipment] of this.city.shipments.frames().entries()) {
        if (shipment.activity === 'working') continue;
        queue.add({ ...roadVehiclePose(shipment.route.path, shipment), index: -10000 - i,
          ...roadBodySize('freight'), speed: shipment.speed ?? 0 });
      }
      vehicleFrames = [];
      people.clear();
      people.alpha = streetOpacity();
      wet = rainingAt(this.city.seed, this.city.now);
      const lotCars = new Map<number, number>();
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
      // Every car on the map is someone's, driven out from their door. A very large city shows
      // only its first routes, to keep each frame quick.
      const runs: Run[] = [];
      for (let i = 0; i < Math.min(routes.length, CARS_SHOWN); i++) {
        const real = routes[i];
        const slot = this.city.personOn(real.homeId, real.workId);
        if (slot !== undefined && this.city.visits.has(real.homeId, slot)) continue;
        const zone = this.city.map.get(cellOf(real.workId));
        if (zone !== 'commercial' && zone !== 'industrial') continue;
        const { start, end } = workShift(zone, real.workId);
        const tier = this.city.carOn(real.homeId, real.workId);
        const sinceStart = (this.hour() - start + 24) % 24;
        // At the weekend only the shops are open, so only their people go to work.
        const dayOff = weekendAt(this.city.now) && shiftIndex(zone, real.workId) !== SHOP_SHIFT;
        const walks = weatherTravel(weatherAt(this.city.seed, this.city.now), tier, real.path.length).way === 'walk';
        const headStart = Math.min(23, Math.max(HEAD_START,
          (real.path.length + 1) * (walks ? WALK_MS_PER_TILE : VEHICLE_PACE[tier]) / REAL_TICK_MS * (24 / calendar.ticksPerDay)));
        runs.push({ key: `${real.homeId}:${real.workId}`, homeId: real.homeId, workId: real.workId, path: real.path, tier, index: i, commute: true,
          wanted: !dayOff && (sinceStart < end - start || sinceStart >= 24 - headStart) ? 'work' : 'home', walks });
      }
      // Render a bounded sample of outings; the others use the same calendar travel pace.
      runs.push(...outingRuns(Math.min(RIDES_SHOWN, Math.max(6, Math.round(routes.length / 12)))));
      this.city.visits.retainDrivers(new Set(runs.flatMap(run => run.person && run.journey ? [`${run.person.home}:${run.person.slot}`] : [])));
      this.city.shipments.junctionFlow.retainPrefix('commute:', new Set(runs.map(run => `commute:${run.key}`)));
      for (const real of runs) {
        const { key, index: i, tier, wanted } = real;
        const slot = real.person?.slot ?? this.city.personOn(real.homeId, real.workId);
        const identity = slot === undefined ? undefined : this.city.residentLook(real.person?.home ?? real.homeId, slot);
        const profile = residentAppearance(this.city.seed, identity?.id ?? real.homeId * 64 + (slot ?? 0), identity?.age ?? 30, identity?.gender);
        const actor = `commute:${key}`;
        let trip = trips.get(key);
        if (!trip) trips.set(key, trip = { at: (real.initialProgress ?? 0) >= 1 ? 'work' : 'home', wait: 0,
          along: real.initialProgress && real.initialProgress < 1 ? real.initialProgress * (real.path.length + 1) : undefined,
          admitting: !!real.initialProgress && real.initialProgress < 1 });
        if (trip.along === undefined || trip.wait > 0) this.city.shipments.junctionFlow.leave(actor);
        // On a trip by way of the filling station the car follows that way instead of the straight one.
        const route = trip.detour ? { ...real, path: trip.detour.path } : real;
        const tiles = route.path.length;
        const steps = tiles + 1;
        const reportJourney = () => {
          if (real.person && real.journey) this.city.visits.reportJourney(real.person.home, real.person.slot,
            real.journey.started, real.journey.returning, trip!.at === 'work' ? 1 : (trip!.along ?? 0) / steps, travelTick);
        };
        reportJourney();
        const driving = trip.along !== undefined && trip.driving !== undefined ? trip.driving : !real.walks;
        const home = cellOf(route.homeId);
        const workplace = cellOf(route.workId);
        // Buildings grow, so this is looked at again at each departure.
        if (!trip.garage || trip.along === undefined && trip.at !== wanted) {
          // A car park within two tiles takes the cars of a small building off the kerb.
          trip.lot = { home: lotBy(home), work: lotBy(workplace) };
          trip.garage = { home: this.city.levelAt(home) >= 2 || trip.lot.home !== undefined,
            work: this.city.levelAt(workplace) >= 2 || trip.lot.work !== undefined };
        }
        const followed = real.commute ? key === this.follow :
          this.followVisitor?.home === real.person!.home && this.followVisitor.slot === real.person!.slot;
        if (followed) pin = centre(trip.at === 'home' ? home : workplace);
        /** Notes where this commuter is drawn. */
        const seenAt = (spot: { x: number; y: number }) => {
          spots.push(real.person ? { x: spot.x, y: spot.y, homeId: real.person.home, slot: real.person.slot } :
            { x: spot.x, y: spot.y, homeId: route.homeId, workId: route.workId });
          if (followed) pin = spot;
        };

        // A car waits at the kerb in front of the building its driver is in: on the edge of
        // the road tile, on the building's side, lined up with the road.
        const kerb = (at: 'home' | 'work') => {
          const road = at === 'home' ? route.path[0] : route.path[tiles - 1];
          const next = at === 'home' ? route.path[1] : route.path[tiles - 2];
          const building = at === 'home' ? home : workplace;
          // Under a big building the car is at its door; otherwise on the very edge of the road, clear of the lane.
          const reach = trip!.garage?.[at] ? 0.56 : 0.41;
          const spot = centre({ x: road.x + (building.x - road.x) * reach, y: road.y + (building.y - road.y) * reach });
          // Park in the travel direction of the adjacent lane; retain head/tail distinction.
          const heading = at === 'home' ? carHeading(next.x - road.x, next.y - road.y) :
            carHeading(road.x - next.x, road.y - next.y);
          return { ...spot, vertical: next.x === road.x, heading,
            key: `${road.x},${road.y},${building.x - road.x},${building.y - road.y}` };
        };
        const park = (at: 'home' | 'work') => {
          // A car in a car park is drawn there, with the others; one under a building is not to be seen.
          const lot = trip!.lot?.[at];
          if (lot !== undefined && driving) lotCars.set(lot, (lotCars.get(lot) ?? 0) + 1);
          if (trip!.garage?.[at]) return;
          const spot = kerb(at);
          if (kerbs.has(spot.key)) return;
          kerbs.add(spot.key);
          drawCar(spot.x, spot.y, spot.vertical, i, tier, spot.heading);
        };

        if (trip.along === undefined) {
          if (trip.at === wanted) {
            if (driving) park(trip.at);
            continue;
          }
          // Every fourth morning the tank is low, and the car goes by the filling station.
          trip.count = (trip.count ?? i % 4) + 1;
          trip.detour = real.commute && driving && tier >= 1 && trip.at === 'home' && trip.count % 4 === 0 ? viaStation(real) : undefined;
          // Stagger departures a little so a household does not leave as one.
          trip.driving = driving;
          trip.along = 0;
          trip.wait = (i % 7) * 260;
        }
        if (trip.wait > 0) {
          trip.wait -= elapsed;
          if (driving) park(trip.at);
          continue;
        }
        const returning = trip.at === 'work';
        const from = trip.at;
        const to = from === 'home' ? 'work' : 'home';
        if (!trip.drivePath || trip.driveSource !== route.path || trip.driveFrom !== from) {
          trip.driveSource = route.path; trip.driveFrom = from;
          trip.drivePath = returning ? [workplace, ...[...route.path].reverse(), home] : [home, ...route.path, workplace];
        }
        /** Where on the road the commuter is after `along` tiles of the trip. */
        const mode = driving ? 'drive' : 'walk';
        if (!trip.geometry?.matches(route, mode, returning)) trip.geometry = new CommuterGeometry(route, mode, returning);
        const geometry = trip.geometry;
        const onRoad = (along: number) => geometry.at(returning ? steps - along : along);
        const carPoint = (progress: number) => {
          const spot = onRoad(progress);
          const edge = Math.min(progress - 1, steps - 1 - progress);
          if (edge >= 0.5) return spot;
          const parked = kerb(progress - 1 < 0.5 ? from : to);
          const part = Math.max(0, edge / 0.5);
          return { x: parked.x + (spot.x - parked.x) * part, y: parked.y + (spot.y - parked.y) * part };
        };
        const bodyAt = (progress: number): RoadBody => {
          const spot = carPoint(progress);
          const a = onRoad(Math.max(1, progress - 0.01)), b = onRoad(Math.min(steps - 1, progress + 0.01));
          const angle = carHeading(b.x - a.x, b.y - a.y, kerb(from).heading);
          return { x: spot.x / TILE_SIZE, y: spot.y / TILE_SIZE, hx: Math.cos(angle), hy: Math.sin(angle), index: i,
            ...passengerBodySize(tier), speed: trip.speed ?? 1 / VEHICLE_PACE[tier] };
        };
        const along = trip.along;
        // Reattach saved/invisible outings only into a free road footprint; never spawn inside a car.
        if (driving && trip.admitting && along >= 1 && along <= steps - 1) {
          if (!queue.canOccupy(bodyAt(along))) continue;
          queue.add(bodyAt(along));
        }
        trip.admitting = false;
        let speed = 1 / WALK_MS_PER_TILE;

        if (!driving) {
          this.city.shipments.junctionFlow.leave(actor);
          const spot = onRoad(along);
          const before = onRoad(Math.max(0, along - 0.05));
          const after = onRoad(Math.min(steps, along + 0.05));
          drawWalker(spot.x, spot.y, i, carHeading(after.x - before.x, after.y - before.y), key, profile);
          seenAt(spot);
        } else if (along < 1) {
          this.city.shipments.junctionFlow.leave(actor);
          // Out of the door and over to the car; from a garage they are not seen until the car comes out.
          const door = centre(from === 'home' ? home : workplace);
          const car = kerb(from);
          park(from);
          const spot = { x: door.x + (car.x - door.x) * along, y: door.y + (car.y - door.y) * along };
          if (!trip.garage?.[from]) drawWalker(spot.x, spot.y, i, carHeading(car.x - door.x, car.y - door.y), key, profile);
          seenAt(trip.garage?.[from] ? car : spot);
          if (trip.garage?.[from]) speed *= 3;
        } else if (along > steps - 1) {
          this.city.shipments.junctionFlow.leave(actor);
          // Parked; the last few steps are on foot, unless the car went under the building.
          const door = centre(to === 'home' ? home : workplace);
          const car = kerb(to);
          const part = along - (steps - 1);
          park(to);
          const spot = { x: car.x + (door.x - car.x) * part, y: car.y + (door.y - car.y) * part };
          if (!trip.garage?.[to]) drawWalker(spot.x, spot.y, i, carHeading(door.x - car.x, door.y - car.y), key, profile);
          seenAt(trip.garage?.[to] ? car : spot);
          if (trip.garage?.[to]) speed *= 3;
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
          if (out < 0.5 || inn < 0.5) {
            const car = kerb(out < 0.5 ? from : to);
            const part = Math.min(out, inn) / 0.5;
            spot = { x: car.x + (spot.x - car.x) * part, y: car.y + (spot.y - car.y) * part };
          }
          // Keep clear of the car in front.
          const tileX = spot.x / TILE_SIZE;
          const tileY = spot.y / TILE_SIZE;
          // A red light ahead: wait at the edge of the junction. Whoever is in it already goes on.
          const aheadX = Math.floor(tileX + hx * 0.55);
          const aheadY = Math.floor(tileY + hy * 0.55);
          const red = (aheadX !== Math.floor(tileX) || aheadY !== Math.floor(tileY)) &&
            junctions.has(aheadY * MAP_SIZE + aheadX) && greenUpright(aheadX, aheadY) !== vertical;
          // At the pump: stand a moment while the tank fills.
          let filling = false;
          if (trip.detour && trip.detour.wait > 0 && along >= trip.detour.stop) {
            trip.detour.wait -= elapsed;
            filling = true;
            people.rect(Math.round(spot.x) - 2, Math.round(spot.y) - 12, 5, 6).fill(0x25232b)
              .rect(Math.round(spot.x) - 1, Math.round(spot.y) - 11, 3, 4).fill(0xf2c94c);
          }
          speed = filling ? 0 : 1 / VEHICLE_PACE[tier];
          if (this.city.crashDelay({ x: Math.floor(tileX), y: Math.floor(tileY) })) speed *= 0.35;
          let accepted = along, remaining = elapsed, constrained = false;
          // At most a few steps per frame: a slow frame at 4× must not cost more on the next one,
          // or the frame rate collapses. The whole elapsed time is still driven.
          const sliceMs = Math.max(50, elapsed / MAX_DRIVE_STEPS);
          while (remaining > 0) {
            const slice = Math.min(sliceMs, remaining);
            const decision = this.city.shipments.junctionFlow.inspect(actor, accepted, trip.drivePath, 1,
              bodyAt, queue, trafficNetwork, this.city.shipments.elapsedMotionMs - remaining, steps - 1);
            const distance = decision.stop === undefined ? Infinity : Math.max(0, decision.stop - accepted);
            trip.speed = followingSpeed(bodyAt(accepted), trip.speed ?? speed, speed, slice, queue, distance);
            const desired = Math.min(steps - 1, accepted + slice * trip.speed, decision.stop ?? Infinity);
            const next = clearRoadAdvance(accepted, Math.max(accepted, desired), bodyAt, queue);
            if (next < desired - 1e-6) { trip.speed = 0; constrained = true; }
            if (trip.speed < speed * 0.2) constrained = true;
            accepted = next;
            this.city.shipments.junctionFlow.commit(actor, accepted, decision);
            queue.add(bodyAt(accepted));
            remaining -= slice;
          }
          const blocked = constrained || red && (trip.speed ?? speed) < speed * 0.2;
          trip.held = blocked ? (trip.held ?? 0) + elapsed : 0;
          const body = bodyAt(accepted);
          const drawn = { x: body.x * TILE_SIZE, y: body.y * TILE_SIZE };
          drawCar(drawn.x, drawn.y, Math.abs(body.hy) > Math.abs(body.hx), i, tier, Math.atan2(body.hy, body.hx),
            { profile, distance: accepted * TILE_SIZE });
          seenAt(drawn);
          // Include vehicles merging from the kerb; update this frame's occupancy immediately.
          moving.push(body); queue.add(body);
          trip.along = accepted;
          if (elapsed > 0) {
            const id = Math.floor(tileY) * MAP_SIZE + Math.floor(tileX);
            counted[id] += blocked ? 3 : 1;
            crowded.add(id);
          }
        }

        if (driving && along >= 1 && along <= steps - 1) {
          if (trip.along === steps - 1) trip.along += Math.min(0.01, elapsed / WALK_MS_PER_TILE);
        } else if (driving) {
          const proposed = along + elapsed * speed;
          // Wait in the building/kerb until there is room for the entire body to merge.
          if (along < 1 && proposed >= 1) {
            if (queue.canOccupy(bodyAt(1))) {
              trip.along = 1;
              const body = bodyAt(1);
              moving.push(body); queue.add(body);
            }
          } else trip.along = proposed;
        } else trip.along = walkForward(route.path, returning ? workplace : home, along, elapsed * speed, returning);
        reportJourney();
        if (trip.along >= steps) trips.set(key, { at: to, wait: 0, count: trip.count });
      }
      if (elapsed > 0) {
        cars = moving;

      }
      // The cars standing in each car park: up to six, in its bays.
      for (const [lot, count] of lotCars) {
        if (!visible(lot % MAP_SIZE * TILE_SIZE, Math.floor(lot / MAP_SIZE) * TILE_SIZE, 64)) continue;
        const left = lot % MAP_SIZE * TILE_SIZE;
        const top = Math.floor(lot / MAP_SIZE) * TILE_SIZE;
        for (let bay = 0; bay < Math.min(count, 6); bay++) {
          drawCar(left + 6 + (bay % 3) * 10, top + (bay < 3 ? 8 : 24), true, lot + bay, 2 + bay % 2,
            bay < 3 ? -Math.PI / 2 : Math.PI / 2);
        }
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

      const fraction = ((this.hour() - hourAt(this.city.now) + 24) % 24) / (24 / calendar.ticksPerDay);
      for (const trip of this.city.visits.frames(this.city.now + Math.min(1, fraction))) {
        if (trip.progress >= 1) continue;
        // Those on wheels are driven above, with the commuters.
        if (trip.ride !== undefined && trip.doing !== 'delivering' && rides.has(`${trip.home}:${trip.slot}`)) continue;
        const origin = trip.path[0];
        const dest = trip.path.at(-1)!;
        const point = commuterPosition({ homeId: origin.y * MAP_SIZE + origin.x,
          workId: dest.y * MAP_SIZE + dest.x, path: trip.path.slice(1, -1) },
          0, 'walk', trip.progress, false);
        if (!point) continue;
        const spot = centre(point);
        if (trip.doing === 'delivering') {
          // A rider on a scooter, with the box of meals behind the saddle.
          const next = commuterPosition({ homeId: origin.y * MAP_SIZE + origin.x, workId: dest.y * MAP_SIZE + dest.x,
            path: trip.path.slice(1, -1) }, 0, 'walk', Math.min(1, trip.progress + 0.02), false) ?? point;
          const upright = Math.abs(next.y - point.y) > Math.abs(next.x - point.x);
          const identity = this.city.residentLook(trip.home, trip.slot);
          drawCar(spot.x, spot.y, upright, trip.home + trip.slot, 1,
            carHeading(next.x - point.x, next.y - point.y, Math.PI / 2),
            { profile: residentAppearance(this.city.seed, identity?.id ?? trip.home * 64 + trip.slot,
              identity?.age ?? 30, identity?.gender), distance: 0 });
          if (camera.scale >= 0.85) {
            const back = { x: Math.sign(point.x - next.x) * 4, y: Math.sign(point.y - next.y) * 4 };
            people.rect(Math.round(spot.x + back.x) - 2, Math.round(spot.y + back.y) - 2, 5, 5).fill(0x25232b)
              .rect(Math.round(spot.x + back.x) - 1, Math.round(spot.y + back.y) - 1, 3, 3).fill(0x3fbf7f);
          }
        } else {
          const next = commuterPosition({ homeId: origin.y * MAP_SIZE + origin.x, workId: dest.y * MAP_SIZE + dest.x,
            path: trip.path.slice(1, -1) }, 0, 'walk', Math.min(1, trip.progress + 0.02), false) ?? point;
          const identity = this.city.residentLook(trip.home, trip.slot);
          drawWalker(spot.x, spot.y, trip.home + trip.slot, carHeading(next.x - point.x, next.y - point.y, Math.PI / 2),
            `visit:${trip.home}:${trip.slot}`, residentAppearance(this.city.seed,
              identity?.id ?? trip.home * 64 + trip.slot, identity?.age ?? 30, identity?.gender));
        }
        spots.push({ ...spot, homeId: trip.home, slot: trip.slot });
        if (this.followVisitor?.home === trip.home && this.followVisitor.slot === trip.slot) pin = spot;
      }

      if (pin) {
        // A yellow arrow bobbing over the one being followed.
        const x = Math.round(pin.x);
        const y = Math.round(pin.y) - 13 - Math.floor(animationTime / 300) % 2;
        people.rect(x - 5, y - 8, 11, 6).rect(x - 3, y - 2, 7, 2).rect(x - 1, y, 3, 2).fill(0x25232b);
        people.rect(x - 4, y - 7, 9, 4).rect(x - 2, y - 3, 5, 2).rect(x, y - 1, 1, 2).fill(0xffd95a);
      }

      const liveVehicles = new Set<string>();
      // Freight and buses use the same lanes, queue and lights as residents' cars.
      const vehicleOnRoad = (key: string, path: readonly Cell[], pace: number, initial: number) => {
        liveVehicles.add(key);
        const last = path.length - 1;
        if (last < 1) return undefined;
        let signature = pathKeys.get(path);
        if (signature === undefined) { signature = roadPathKey(path); pathKeys.set(path, signature); }
        let state = roadVehicles.get(key);
        if (!state || roadVehiclePaths.get(key) !== signature) {
          this.city.shipments.junctionFlow.leave(key);
          state = { along: initial * last, returning: false, held: 0, wait: 0 };
          roadVehicles.set(key, state); roadVehiclePaths.set(key, signature);
          pendingRoadVehicles.add(key);
        }
        state.along = Math.min(last, state.along);
        const before = roadVehiclePose(path, state);
        const { x, y, hx, hy } = before;
        const self = -1000 - liveVehicles.size;
        const bodyAt = (state: RoadVehicle): RoadBody => ({ ...roadVehiclePose(path, state), index: self,
          ...roadBodySize('bus'), speed: state.speed ?? 1 / pace });
        if (pendingRoadVehicles.has(key)) {
          if (!queue.canOccupy(bodyAt(state))) return undefined;
          pendingRoadVehicles.delete(key);
        }
        const aheadX = Math.floor(x + hx * 0.55);
        const aheadY = Math.floor(y + hy * 0.55);
        const red = (aheadX !== Math.floor(x) || aheadY !== Math.floor(y)) &&
          junctions.has(aheadY * MAP_SIZE + aheadX) && greenUpright(aheadX, aheadY) !== before.upright;
        const load = this.city.congestionAt(path[before.index], this.hour());
        const completed = advancePathVehicle(state, path, elapsed, pace, load, false, false, LIGHT,
          undefined, { actor: key, time: this.city.shipments.elapsedMotionMs - elapsed, occupancy: queue,
            body: bodyAt, junctions: this.city.shipments.junctionFlow, network: trafficNetwork });
        const pose = roadVehiclePose(path, state);
        const blocked = state.held > 0;
        const held = state.held > 0;
        const activity: VehicleActivity = state.turnFrom !== undefined ? 'turning' : held ? red ? 'red' : 'queued' : load > 1 ? 'slow' : 'moving';
        if (elapsed > 0) {
          const car = bodyAt(state);
          cars.push(car);
          queue.add(car);
          const id = Math.floor(y) * MAP_SIZE + Math.floor(x);
          counted[id] += blocked ? 3 : 1;
          crowded.add(id);
        }
        return { x: pose.x * TILE_SIZE, y: pose.y * TILE_SIZE, upright: pose.upright, angle: pose.angle,
          finished: completed === 'home', returning: state.returning, along: state.along, held: state.held,
          activity, progress: state.returning ? 1 - state.along / last : state.along / last };
      };
      const freightRouteShown = this.freightVisible || this.overlay() === 'freight' || getTool() === 'freight-line';
      const chosenFreight = freightRouteShown ? selectedFreightKey(this.city.getFreightMode(), this.city.getFreightLines(), this.city.getFreight(), this.selectedFreight) : undefined;
      for (const [shipmentIndex, shipment] of this.city.shipments.frames().entries()) {
        const run = shipment.route;
        const pose = roadVehiclePose(run.path, shipment);
        const at = { x: pose.x * TILE_SIZE, y: pose.y * TILE_SIZE, angle: pose.angle,
          along: shipment.along, returning: shipment.returning, activity: shipment.activity,
          held: shipment.held, progress: shipment.returning ? 1 - shipment.along / Math.max(1, run.path.length - 1) : shipment.along / Math.max(1, run.path.length - 1) };
        const size = vehicleSizes.freight;
        const colour = lineColour(freightColourId(run));
        const manual = run.lineId !== undefined;
        const routeNumber = manual ? run.lineId! : this.city.getFreight().findIndex(route => route.from === run.from && route.to === run.to) + 1;
        const stops = [run.from, ...run.stops.map(stop => stop.to)];
        const info: VehicleInfo = { key: shipment.key, kind: 'freight', name: `物流車 ${Number(shipment.key.split(':').at(-1)) + 1}`,
          routeKey: manual ? `manual:${run.lineId}` : `auto:${run.from}:${run.to}`, lineId: run.lineId,
          routeName: manual ? `物流 ${run.lineId} 號` : `自動配送 ${routeNumber}`, colour,
          x: at.x, y: at.y, angle: at.angle, length: size.length, width: size.width,
          visible: visible(at.x, at.y) && people.alpha > 0, cell: { x: Math.floor(at.x / TILE_SIZE), y: Math.floor(at.y / TILE_SIZE) },
          destination: nextDeliveryStop(run.path, stops, at.along, at.returning, cell => this.city.roadBeside(cell), MAP_SIZE, run.stops.map(stop => stop.index)),
          returning: at.returning, activity: at.activity, progress: at.progress, held: at.held,
          warehouseOrigin: this.city.map.at(run.from) === 'warehouse', plannedGoods: run.goods, plannedTrips: run.trucks, cargo: shipment.cargo.reduce((sum, item) => sum + item.amount, 0), capacity: 24 };
        vehicleFrames.push(info);
        if (shipment.activity !== 'working') {
          const car = { x: pose.x, y: pose.y, hx: pose.hx, hy: pose.hy, index: -10000 - shipmentIndex,
            ...roadBodySize('freight'), speed: shipment.speed ?? 0 };
          cars.push(car); queue.add(car);
        }
        if (!info.visible) continue;
        // Draw in the direction of travel, so returning trucks no longer reverse backwards.
        if (camera.scale >= DETAIL_ZOOM) streetArt.drawTruck(people, at.x, at.y, at.angle, colour);
        else {
          people.save().translateTransform(at.x, at.y).rotateTransform(at.angle)
          .rect(-size.length / 2 - 1, -size.width / 2 - 1, size.length + 2, size.width + 2).fill(0x25232b)
          .rect(-size.length / 2, -size.width / 2, size.length, size.width).fill(0xd8d3c7)
          .rect(size.length / 2 - 5, -size.width / 2, 5, size.width).fill(colour)
          .rect(size.length / 2 - 2, -size.width / 2 + 1, 1, size.width - 2).fill(0xdfeef2);
          people.restore();
        }
        if (this.selectedVehicle === info.key) {
          people.save().translateTransform(at.x, at.y).rotateTransform(at.angle)
            .rect(-size.length / 2 - 2, -size.width / 2 - 2, size.length + 4, size.width + 4).stroke({ color: 0xffffff, width: 1 }).restore();
        }
        if (camera.scale >= 0.85 && (this.selectedVehicle === info.key || freightRouteShown && (this.allFreightRoutes || chosenFreight === info.routeKey))) {
          numberBadge(people, at.x - 6, at.y - 24, routeNumber, colour);
        }
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
            y: (from.y + (to.y - from.y) * part + 0.5) * TILE_SIZE, upright: to.x === from.x, angle: Math.atan2(to.y - from.y, to.x - from.x) };
        };
        const travel = last * LINE_PACE[line.kind];
        const layover = line.kind === 'metro' ? 650 : 0;
        const halfLap = travel + layover;
        const lap = 2 * halfLap;
        for (let vehicle = 0; vehicle < line.vehicles; vehicle++) {
          const turn = (animationTime / lap + vehicle / line.vehicles) % 1;
          const outbound = turn < 0.5;
          const progress = Math.min(1, (turn * lap % halfLap) / travel);
          const along = (outbound ? progress : 1 - progress) * last;
          const bus = line.kind === 'bus' ? vehicleOnRoad(`bus:${line.id}:${vehicle}`, line.path,
            LINE_PACE.bus, vehicle / line.vehicles) : undefined;
          if (line.kind === 'bus' && !bus) continue;
          // A bus is one box; a train is three cars, the later ones trailing behind the first.
          const cars = line.kind === 'metro' ? 3 : 1;
          for (let car = 0; car < cars; car++) {
            const spot = bus ?? at(along - (outbound ? 1 : -1) * car * 0.55);
            const angle = bus ? bus.angle : spot.angle + (outbound ? 0 : Math.PI);
            const { length: long, width: wide } = vehicleSizes[line.kind];
            const info: VehicleInfo = { key: `${line.kind}:${line.id}:${vehicle}`, kind: line.kind,
              name: `${line.kind === 'bus' ? '公車' : '捷運'} ${line.id} 號・車 ${vehicle + 1}`,
              routeName: `${line.kind === 'bus' ? '公車' : '捷運'} ${line.id} 號`, lineId: line.id, colour,
              x: spot.x, y: spot.y, angle, length: long, width: wide, visible: visible(spot.x, spot.y) && people.alpha > 0,
              cell: { x: Math.floor(spot.x / TILE_SIZE), y: Math.floor(spot.y / TILE_SIZE) },
              destination: cellOf((bus?.returning ?? !outbound) ? line.stops[0] : line.stops.at(-1)!),
              returning: bus?.returning ?? !outbound, activity: bus?.activity ?? 'moving', progress: bus?.progress ?? progress, held: bus?.held ?? 0 };
            vehicleFrames.push(info);
            if (!info.visible) continue;
            people.save().translateTransform(spot.x, spot.y).rotateTransform(angle);
            const x = 0, y = 0, upright = false;
            const width = upright ? wide : long;
            const height = upright ? long : wide;
            people.rect(x - width / 2 - 1, y - height / 2 - 1, width + 2, height + 2).fill(0x1b1d22);
            // A bus is the city's own: a cable car in San Francisco, blue and white in New York, orange in California.
            const { theme } = this.city;
            const body = line.kind === 'metro' ? colour : theme === 'sf' ? 0x8a1f2b : theme === 'newyork' ? 0x2f5fa8 :
              theme === 'california' ? 0xf0862c : 0xf2c94c;
            people.rect(x - width / 2, y - height / 2, width, height).fill(body);
            if (line.kind === 'bus' && theme === 'sf') {
              // Open ends with a cream roof and a gold trim.
              people.rect(x - width / 2 + (upright ? 0 : 4), y - height / 2 + (upright ? 4 : 0),
                upright ? width : width - 8, upright ? height - 8 : height).fill(0xf1e3c2);
              people.rect(x - width / 2, y - height / 2, upright ? width : 1, upright ? 1 : height).fill(0xe0b23e);
            }
            // A bus wears its line's colour as a stripe; a train as its whole body, with pale windows.
            if (line.kind === 'bus') {
              people.rect(x - width / 2, y - height / 2, upright ? 2 : width, upright ? height : 2).fill(colour);
            }
            people.rect(x - (upright ? 1.5 : width / 2 - 3), y - (upright ? height / 2 - 3 : 1.5),
              upright ? 3 : width - 6, upright ? height - 6 : 3).fill(0xdfeef2);
            if (this.selectedVehicle === info.key) people.rect(-long / 2 - 2, -wide / 2 - 2, long + 4, wide + 4).stroke({ color: 0xffffff, width: 1 });
            people.restore();
          }
        }
      }
      for (const key of roadVehicles.keys()) if (!liveVehicles.has(key)) {
        this.city.shipments.junctionFlow.leave(key);
        roadVehicles.delete(key); roadVehiclePaths.delete(key); pendingRoadVehicles.delete(key);
      }
      if (elapsed > 0) settleCrowd(elapsed);
    };
    const drawEffects = () => {
      effects.clear();
      effects.position.set(camera.x, camera.y);
      effects.scale.set(camera.scale);
      for (const event of this.city.getEvents()) {
        if (event.kind === 'nightmarket-open' || event.kind === 'market-restocked') continue;
        const key = `${event.tick}:${event.kind}`;
        if (scenes.has(key) || this.city.now - event.tick > FRESH_TICKS) continue;
        const from = event.station && this.city.roadBeside(event.station);
        const to = isRoad(map.get(event.cell)) ? event.cell : this.city.roadBeside(event.cell);
        const route = from && to ? this.city.roadGraph.shortestPath(from, to)?.path : undefined;
        scenes.set(key, { event, since: animationTime, route });
      }
      for (const [key, scene] of scenes) {
        const age = animationTime - scene.since;
        const at = advanceScene(scene, age, spot => carAhead(spot.x, spot.y, spot.hx, spot.hy, -1, 0.62));
        if (at) {
          const car = { ...at, index: -1 };
          cars.push(car);
          queue.add(car);
        }
        if (age > sceneLength(scene) || this.city.now < scene.event.tick) scenes.delete(key);
        else {
          drawScene(effects, scene, age);
          const vehicle = sceneVehicle(scene, age);
          if (vehicle) {
            const size = vehicleSizes[vehicle.trouble === 'crime' ? 'crime' : vehicle.trouble === 'sick' ? 'sick' : 'fire'];
            const x = vehicle.x * TILE_SIZE, y = vehicle.y * TILE_SIZE;
            vehicleFrames.push({ key: `rescue:${key}`, kind: 'rescue', name: vehicle.trouble === 'crime' ? '警車' : vehicle.trouble === 'sick' ? '救護車' : '消防車',
              colour: vehicle.trouble === 'crime' ? 0x3f5f98 : vehicle.trouble === 'sick' ? 0xf4f6f8 : 0xd9423a,
              x, y, angle: vehicle.angle, length: size.length, width: size.width, visible: visible(x, y),
              cell: { x: Math.floor(vehicle.x), y: Math.floor(vehicle.y) }, destination: vehicle.returning ? scene.event.station ?? scene.route![0] : scene.event.cell,
              returning: vehicle.returning, activity: vehicle.activity, progress: vehicle.progress, held: scene.held ?? 0 });
          }
        }
      }
      drawLife();
      // Deliveries advance in the simulation before the next animation frame; let them see
      // the same physical cars and buses, so a truck cannot drive into a stopped car's rear.
      this.city.shipments.setStreetTraffic(cars.filter(car => car.index > -10000));
    };

    /**
     * The small movements of a living city, in the part of the map in view: smoke from the
     * works, light on the water, lamps on the rides, snow in winter and fireworks on the night
     * of a festival. All of it is for show.
     */
    /** The level each building in sight had when last looked at, and when each one under scaffolding went up. */
    const known = new Map<number, number>();
    const building = new Map<number, number>();
    let knownAt = 0;
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
      for (let y = top; y <= bottom; y++) {
        for (let x = left; x <= right; x++) {
          const tile = map.get({ x, y });
          const seed = (Math.imul(x, 73856093) ^ Math.imul(y, 19349663)) >>> 0;
          const px = x * TILE_SIZE;
          const py = y * TILE_SIZE;
          if (tile === 'river') {
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
          } else if (tile === 'square' && this.city.hasCombo({ x, y }, 'nightmarket') && hour >= 17 && hour < 23) {
            for (const [dx, colour] of [[5, 0xc45948], [19, 0xbe8a44]]) {
              effects.rect(px + dx, py + 12, 8, 9).fill(0x735843)
                .rect(px + dx - 1, py + 11, 10, 4).fill(colour);
              for (let stripe = 0; stripe < 10; stripe += 3) {
                effects.rect(px + dx - 1 + stripe, py + 11, 1, 4).fill(0xf2d4a1);
              }
              effects.rect(px + dx + 2, py + 17, 4, 2).fill(0xeab672);
              const visitor = (Math.floor(time / 280) + dx) % 9;
              effects.rect(px + dx + visitor - 1, py + 24, 2, 3).fill(0x597794)
                .rect(px + dx + visitor - 1, py + 23, 2, 1).fill(0xe5b38a);
            }
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
          } else if (isRoad(tile) && this.city.theme === 'newyork' && seed % 11 === 0) {
            // Steam rising from a manhole in the street.
            effects.rect(px + 13, py + 13, 6, 6).fill(0x25232b).rect(px + 14, py + 14, 4, 4).fill(0x55575b);
            for (let puff = 0; puff < 3; puff++) {
              const rise = (time / 1800 + puff / 3 + seed % 7 / 7) % 1;
              const size = 3 + Math.floor(rise * 6);
              effects.rect(px + 16 - size / 2 + Math.sin(rise * 5 + seed) * 2, py + 12 - rise * 20, size, size)
                .fill({ color: 0xf4f6f8, alpha: 0.6 * (1 - rise) });
            }
          } else if (tile === 'temple' && this.city.hasCombo({ x, y }, 'fair') && night) {
            // The lanterns of the temple fair glow at night.
            for (let at = 2; at < TILE_SIZE; at += 6) {
              effects.rect(px + at - 1, py + 1, 5, 6).fill({ color: 0xffb84d, alpha: 0.35 + 0.2 * Math.sin(time / 300 + at) });
            }
          }
        }
      }
      // Scaffolding on what has just gone up or grown a level. A tile seen for the first time
      // is only noted, so nothing is "built" by scrolling to it; and when another city is
      // loaded, everything is seen afresh.
      // A jump in time either way means another city: one frame never moves the clock this far.
      if (Math.abs(this.city.now - knownAt) > 16) {
        known.clear();
        building.clear();
      }
      knownAt = this.city.now;
      for (let y = top; y <= bottom; y++) {
        for (let x = left; x <= right; x++) {
          const id = y * MAP_SIZE + x;
          const level = this.city.levelAt({ x, y });
          const before = known.get(id);
          if (before !== level) {
            if (before !== undefined && level > before) building.set(id, time);
            known.set(id, level);
          }
          const since = building.get(id);
          if (since === undefined) continue;
          const age = time - since;
          if (age > 9000 || !level) {
            building.delete(id);
            continue;
          }
          const px = x * TILE_SIZE;
          const py = y * TILE_SIZE;
          // Poles and planks over the front, a net that comes down as the work is finished, and a builder.
          const done = age / 9000;
          effects.rect(px + 2, py + 2 + Math.round(done * 24), 28, 26 - Math.round(done * 24)).fill({ color: 0x5f9a6a, alpha: 0.55 });
          for (const pole of [2, 11, 20, 29]) effects.rect(px + pole, py + 2, 1, 28).fill(0xd6dbe6);
          for (const plank of [8, 16, 24]) effects.rect(px + 2, py + plank, 28, 1).fill(0xb98a4a);
          const walk = 4 + Math.floor(age / 300) % 22;
          effects.rect(px + walk, py + 12, 2, 4).fill(0xf2c94c).rect(px + walk, py + 11, 2, 1).fill(0xffd1a0);
        }
      }
      // The light of each city: fog off the bay on a San Francisco morning, a golden hour in California.
      if (this.city.theme === 'sf' && hour >= 5 && hour < 9) {
        const thick = 0.26 * (1 - Math.abs(hour - 7) / 2);
        effects.rect(left * TILE_SIZE, top * TILE_SIZE, (right - left + 1) * TILE_SIZE, (bottom - top + 1) * TILE_SIZE)
          .fill({ color: 0xe8eef2, alpha: thick });
      } else if (this.city.theme === 'california' && hour >= 16.5 && hour < 19.5) {
        effects.rect(left * TILE_SIZE, top * TILE_SIZE, (right - left + 1) * TILE_SIZE, (bottom - top + 1) * TILE_SIZE)
          .fill({ color: 0xff9a4d, alpha: 0.13 * (1 - Math.abs(hour - 18) / 1.5) });
      }
      // Rain slanting down over the whole view, and the light a little dimmer for it.
      if (wet) {
        const width = (right - left + 1) * TILE_SIZE;
        const height = (bottom - top + 1) * TILE_SIZE;
        effects.rect(left * TILE_SIZE, top * TILE_SIZE, width, height).fill({ color: 0x1d2a3a, alpha: 0.12 });
        for (let drop = 0; drop < 140; drop++) {
          const fall = (time / (5 + drop % 4) + drop * 53) % height;
          effects.rect(left * TILE_SIZE + (drop * 97 + fall * 0.3) % width, top * TILE_SIZE + fall, 1, 6).fill({ color: 0xbfd8ee, alpha: 0.6 });
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
      const measure = this.onFrameTiming;
      const begin = measure ? performance.now() : 0;
      this.advance?.();
      const simulated = measure ? performance.now() : 0;
      const speed = this.speed();
      // Facility outings and life events also animate in towns without commuters.
      if (!speed) return;
      const elapsed = animationElapsed(ticker.elapsedMS, speed);
      animationTime += elapsed;
      drawPeople(elapsed);
      const actorsDone = measure ? performance.now() : 0;
      drawEffects();
      if (measure) measure({ simulationMs: simulated - begin, actorsMs: actorsDone - simulated, effectsMs: performance.now() - actorsDone });
      // The traffic colours follow the cars, so they are painted again a few times a second.
      repaint -= ticker.elapsedMS;
      if (repaint <= 0 && this.overlay() === 'traffic') {
        repaint = 250;
        draw(false);
      }
    });
    app.start();

    let preview: Cell[] = [];
    let hover: Cell | undefined;
    /** The tile under the pointer while a building tool is in hand and no button is down. */
    let aim: Cell | undefined;
    let selected: Cell | undefined;
    // `fromX` and `fromY` are where the pointer went down; `x` and `y` follow it.
    let drag: { id: number; tool: Tool; start: Cell; x: number; y: number; fromX: number; fromY: number } |
      undefined;
    let lastFocus: typeof this.focus;
    let lastRevision = -1;
    let hasFocusMatches = false;
    let repaint = 0;
    const draw = (actors = true) => {
      if (camera.scale >= DETAIL_ZOOM) detailAsset.request(this.city.theme);
      else detailAsset.retain(this.city.theme);
      const focus = this.focus;
      if (focus !== lastFocus || lastRevision !== map.layoutRevision) {
        lastFocus = focus;
        lastRevision = map.layoutRevision;
        hasFocusMatches = false;
        if (focus) {
          for (let id = 0; id < MAP_SIZE ** 2; id++) {
            if (focus({ x: id % MAP_SIZE, y: Math.floor(id / MAP_SIZE) })) {
              hasFocusMatches = true;
              break;
            }
          }
        }
      }
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

      const layer = tool === 'park' ? 'pollution' : this.overlay();
      tiles.draw(this.city, camera, app.screen.width, app.screen.height, preview, selected,
        layer === 'none' && (isFacility(tool) || isService(tool) || tool === 'bus' || tool === 'metro') ?
          tool : layer,
        range, this.hour(),
        // Routes show while laying out transport, and in the map view for them.
        [...(routesShown() ? this.city.getLines() : []),
          ...(this.freightVisible || tool === 'freight-line' || layer === 'freight' ?
            freightMapRoutes(this.city.getFreightMode(), this.city.getFreightLines(), this.city.getFreight(), this.selectedFreight, this.allFreightRoutes) : [])], this.marks, this.crowdOn,
        aim && !drag && tool !== 'inspect' && tool !== 'pan' && tool !== 'line' && tool !== 'freight-line' && tool !== 'land' ?
          { cells: isBig(tool) ? footprint(aim) : [aim], ok: (isBig(tool) ? footprint(aim) : [aim]).every(cell => fits(tool, cell)) } : undefined, hasFocusMatches && tool !== 'park' ? focus : undefined);
      landGrid.clear();
      landGrid.position.set(camera.x, camera.y);
      landGrid.scale.set(camera.scale);
      const plots = this.city.getLand();
      if (tool === 'land' || plots.some(plot => !plot.owned)) for (const plot of plots) {
        const origin = parcelOrigin(plot.id);
        const x = origin.x * TILE_SIZE;
        const y = origin.y * TILE_SIZE;
        const size = land.size * TILE_SIZE;
        if (!plot.owned) landGrid.rect(x, y, size, size).fill({ color: 0x141b22, alpha: 0.5 });
        landGrid.rect(x + 1, y + 1, size - 2, size - 2).stroke({ color: plot.owned ? 0xffd95a : plot.available ? 0x8bc8e8 : 0x555b63,
          width: 2 / camera.scale, alpha: 0.85 });
      }
      if (actors) {
        drawPeople();
        drawEffects();
        app.render();
      }
    };
    /** Whether a tool could be used on a tile, as far as what stands there goes; money is not looked at. */
    const fits = (tool: Tool, cell: Cell): boolean => {
      const tile = map.get(cell);
      if (tile === undefined || !this.city.owns(cell)) return false;
      if (tool === 'viaduct') return true;
      if (tool === 'demolish') return (tile !== 'grass' && tile !== 'river') || map.hasSpan(cell);
      if (tool === 'metro') return (tile === 'road' || tile === 'avenue') && !map.hasStation(cell);
      if (isRoad(tool)) return true;
      if (tile === 'river' || isRoad(tile)) return false;
      return !isBig(tool) || !(tile === 'annex' || isBig(tile));
    };
    this.refresh = draw;
    this.setPlaying = playing => {
      if (playing) app.start();
      else { app.stop(); app.render(); }
    };
    this.resetView = () => { roadVehicles.clear(); roadVehiclePaths.clear(); frameCity(); draw(); };
    this.zoomView = direction => {
      if (drag) return;
      camera.zoom(app.screen.width / 2, app.screen.height / 2, -direction * 160, app.screen.width, app.screen.height);
      draw();
    };
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

    const pinch = new MapPinch();
    canvas.addEventListener('pointerdown', event => {
      if (event.pointerType === 'touch') {
        pinch.start(event.pointerId, position(event));
        canvas.setPointerCapture(event.pointerId);
        if (pinch.active) {
          event.preventDefault();
          drag = undefined; preview = []; hover = undefined; aim = undefined;
          draw();
          return;
        }
      }
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
      if (event.pointerType === 'touch') {
        const move = pinch.move(event.pointerId, { x, y });
        if (pinch.active) {
          event.preventDefault();
          if (move) camera.pinch(move.from, move.to, move.ratio, app.screen.width, app.screen.height);
          draw();
          return;
        }
      }
      if (!drag) {
        const cell = camera.cellAt(x, y);
        const tool = getTool();
        const next = (isFacility(tool) || isService(tool) || tool === 'bus' || tool === 'metro') &&
          map.get(cell) !== undefined ?
          cell : undefined;
        const aimed = tool !== 'inspect' && tool !== 'pan' && tool !== 'line' && tool !== 'freight-line' && tool !== 'land' && map.get(cell) !== undefined ? cell : undefined;
        if (next?.x !== hover?.x || next?.y !== hover?.y || aimed?.x !== aim?.x || aimed?.y !== aim?.y) {
          hover = next;
          aim = aimed;
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
      if (event.pointerType === 'touch') pinch.end(event.pointerId);
      if (drag?.id !== event.pointerId) return;
      drag = undefined;
      preview = [];
      draw();
    };
    canvas.addEventListener('pointerup', event => {
      if (event.pointerType === 'touch' && pinch.end(event.pointerId)) return;
      if (!drag || drag.id !== event.pointerId) return;
      const { tool, start } = drag;
      const { x, y } = position(event);
      if (tool === 'inspect') {
        // A click on someone out on the road picks them; anywhere else picks the tile.
        const worldX = (x - camera.x) / camera.scale;
        const worldY = (y - camera.y) / camera.scale;
        let reach = 14;
        let picked: (typeof spots)[number] | undefined;
        for (const spot of people.alpha > 0 ? spots : []) {
          const distance = Math.hypot(spot.x - worldX, spot.y - worldY);
          if (distance < reach) [reach, picked] = [distance, spot];
        }
        const vehicle = hitVehicle(vehicleFrames, worldX, worldY, camera.scale);
        if (vehicle && this.onVehicle) {
          selected = undefined;
          this.onVehicle(vehicle.key);
        } else if (picked && this.onPerson) {
          this.onPerson(picked.homeId, picked);
        } else if (map.get(start) !== undefined) {
          selected = start;
          inspect(start);
        }
      } else if (tool === 'land') {
        const id = parcelAt(start);
        const result = this.city.buyLand(id ?? -1);
        report(result.error ?? `買下第 ${(id ?? -1) + 1} 區，花了 $${result.cost}。`);
      } else if (tool === 'freight-line') {
        this.onFreightClick?.(start);
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
      if (!hover && !aim) return;
      hover = undefined;
      aim = undefined;
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
    this.city.visits.releaseDrivers();
    this.city.shipments.junctionFlow.leavePrefix('commute:');
    this.city.shipments.junctionFlow.leavePrefix('bus:');
    this.city.shipments.setStreetTraffic([]);
    this.refresh = undefined;
    this.resetView = undefined;
    this.zoomView = undefined;
    this.setPlaying = undefined;
    this.getVehicle = undefined;
    this.onVehicle = undefined;
    this.detailAsset?.destroy();
    this.detailAsset = undefined;
    this.tileRenderer?.destroy();
    this.tileRenderer = undefined;
    this.observer?.disconnect();
    this.app?.destroy(true, { children: true });
    this.carSprites?.destroy();
    this.carSprites = undefined;
    this.bicycles?.destroy();
    this.scooters?.destroy();
    this.scooters = undefined;
    this.bicycles = undefined;
    if (this.bicycleLease) { this.bicycleLease = false; void bicyclePool.release('bicycle'); }
    if (this.scooterLease) { this.scooterLease = false; void scooterPool.release('scooter'); }
    this.streetArt?.destroy();
    this.streetArt = undefined;
    this.app = undefined;
  }
}
