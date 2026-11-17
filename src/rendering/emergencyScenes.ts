import { vehicleSizes } from './vehicleSizes';
import type { Graphics } from 'pixi.js';
import type { CityEvent } from '../simulation/BuildingSystem';
import { TILE_SIZE, type Cell } from '../simulation/TileMap';

/**
 * The short animation an emergency plays on the map: flames and smoke, a marker over the
 * building, and the vehicle that answers. It only shows what the simulation already decided.
 */
export interface Scene {
  event: CityEvent;
  /** Animation time when the scene began, in milliseconds at 1× speed. */
  since: number;
  /** Road tiles from the station to the building, when a vehicle is sent. */
  route?: readonly Cell[];
  /** How far along the route the vehicle is, in tiles; traffic holds it up, so it is kept, not worked out. */
  travelled?: number;
  /** The age of the scene at which the vehicle got there. */
  arrived?: number;
  /** The age of the scene when it was last moved on. */
  moved?: number;
  /** How long the vehicle has stood behind a car. */
  held?: number;
}

/** A vehicle on the road: where it is, in tiles, and which way it is heading. */
export interface OnRoad { x: number; y: number; hx: number; hy: number }

/** Where a vehicle `progress` tiles along a route is: in the right-hand lane, as the cars are. */
export function vehicleAt(route: readonly Cell[], progress: number): OnRoad {
  const last = route.length - 1;
  const lane = (index: number) => {
    const point = route[index];
    const before = route[Math.max(0, index - 1)];
    const after = route[Math.min(last, index + 1)];
    return { x: point.x - Math.sign(after.y - before.y) * 0.19 + 0.5, y: point.y + Math.sign(after.x - before.x) * 0.19 + 0.5 };
  };
  const index = Math.max(0, Math.min(last, Math.floor(progress)));
  const next = Math.min(last, index + 1);
  const from = lane(index);
  const to = lane(next);
  const part = Math.max(0, Math.min(1, progress - index));
  // Standing at the end of the way it keeps the direction it came from.
  const a = route[next === index ? Math.max(0, index - 1) : index];
  const b = route[next];
  const upright = Math.abs(b.y - a.y) > Math.abs(b.x - a.x);
  return { x: from.x + (to.x - from.x) * part, y: from.y + (to.y - from.y) * part,
    hx: upright ? 0 : Math.sign(b.x - a.x), hy: upright ? Math.sign(b.y - a.y) : 0 };
}

/** How long a vehicle with its siren on stands behind a car before the car lets it by. */
const GIVE_WAY = 1500;

/**
 * Moves a scene's vehicle on to `age` and says where on the road it now is, while it is on its
 * way. `blocked` says whether a car is just ahead of a spot in the same lane: the vehicle
 * stands behind it like anyone else, until after a moment the car lets it squeeze by. Red
 * lights it does not stop for.
 */
export function advanceScene(scene: Scene, age: number, blocked: (at: OnRoad) => boolean): OnRoad | undefined {
  const step = age - (scene.moved ?? 0);
  scene.moved = age;
  if (!scene.route || scene.arrived !== undefined) return undefined;
  const last = scene.route.length - 1;
  const at = vehicleAt(scene.route, scene.travelled ?? 0);
  scene.held = blocked(at) ? (scene.held ?? 0) + step : 0;
  if (scene.held > 0 && scene.held < GIVE_WAY) return at;
  scene.travelled = (scene.travelled ?? 0) + step / DASH;
  if (scene.travelled >= last) {
    scene.travelled = last;
    scene.arrived = age;
  }
  return vehicleAt(scene.route, scene.travelled);
}

/** Milliseconds a vehicle takes per road tile: twice as fast as a commuter's car. */
const DASH = 220;
/** How long a vehicle works at the scene after it arrives. */
const ON_SCENE = 2600;
/** How long an emergency nobody answers stays on the map. */
const UNANSWERED = 7000;

/** The way back, which the ambulance from a crash makes with its patient. */
const wayBack = (scene: Scene) => (scene.event.kind === 'crash-hospital' ? (scene.route!.length - 1) * DASH : 0);

/** How long a scene lasts; one whose vehicle is still on its way is not over. */
export function sceneLength(scene: Scene): number {
  if (!scene.route) return UNANSWERED;
  return scene.arrived === undefined ? Infinity : scene.arrived + ON_SCENE + wayBack(scene);
}

const BODY: Record<string, number> = { fire: 0xd9423a, crime: 0x3f5f98, sick: 0xf4f6f8 };
const OUTLINE = 0x1b1d22;

/** Draws one frame of a scene, `age` milliseconds after it began. */
export function drawScene(g: Graphics, scene: Scene, age: number): void {
  const { event, route } = scene;
  if (event.kind.startsWith('crash')) {
    const left = event.cell.x * TILE_SIZE;
    const top = event.cell.y * TILE_SIZE;
    const ambulance = event.kind === 'crash-hospital';
    if (!ambulance) drawMarker(g, left, top, age, event.kind !== 'crash-no-hospital');
    if (route) {
      const leaving = scene.arrived === undefined ? 0 : age - scene.arrived - ON_SCENE;
      const progress = ambulance && leaving > 0 ? Math.max(0, route.length - 1 - leaving / DASH) : scene.travelled ?? 0;
      drawVehicle(g, route, progress, age, ambulance ? 'sick' : 'crime');
    }
    return;
  }
  const trouble = event.kind.startsWith('robbery') ? 'crime' : event.kind.split('-')[0];
  const left = event.cell.x * TILE_SIZE;
  const top = event.cell.y * TILE_SIZE;
  const arrival = scene.arrived ?? Infinity;
  const arrived = route !== undefined && age >= arrival;

  if (trouble === 'fire') {
    // The fire dies down once the engine has been spraying for a moment.
    const strength = !route ? Math.max(0, 1 - Math.max(0, age - 4500) / 2500) :
      arrived ? Math.max(0, 1 - (age - arrival) / 1500) : 1;
    drawSmoke(g, left, top, age, 0.35 + 0.65 * strength);
    if (strength > 0) drawFlames(g, left, top, age, strength);
    if (arrived && strength > 0) drawSpray(g, left, top, age);
  } else {
    drawMarker(g, left, top, age, trouble === 'crime');
  }

  if (route) drawVehicle(g, route, scene.travelled ?? 0, age, trouble);
}

/** Three flames that flicker between heights, scaled down as the fire dies. */
function drawFlames(g: Graphics, left: number, top: number, age: number, strength: number): void {
  const flicker = Math.floor(age / 110) % 3;
  const base = top + 28;
  const flame = (x: number, width: number, height: number, colour: number) => {
    const tall = Math.round(height * strength);
    if (tall > 0) g.rect(left + x, base - tall, width, tall).fill(colour);
  };
  flame(5, 22, 15 + 3 * flicker, 0xd9423a);
  flame(8, 6, 21 + (flicker === 1 ? 5 : 0), 0xd9423a);
  flame(19, 6, 19 + (flicker === 2 ? 6 : 0), 0xd9423a);
  flame(9, 14, 12 + 2 * ((flicker + 1) % 3), 0xf08a3c);
  flame(13, 6, 7 + 2 * ((flicker + 2) % 3), 0xf6e27a);
}

/** Square puffs that rise, grow and fade one after another. */
function drawSmoke(g: Graphics, left: number, top: number, age: number, amount: number): void {
  for (let puff = 0; puff < 4; puff++) {
    const phase = (age / 1400 + puff / 4) % 1;
    const size = 6 + Math.round(phase * 8);
    const drift = Math.round(Math.sin(phase * 5 + puff) * 3) + puff * 3;
    g.rect(left + 8 + drift, top + 6 - Math.round(phase * 30), size, size)
      .fill({ color: 0x4a4c52, alpha: 0.55 * (1 - phase) * amount });
  }
}

/** Water from the engine: droplets that jump about over the building. */
function drawSpray(g: Graphics, left: number, top: number, age: number): void {
  const step = Math.floor(age / 90);
  for (let drop = 0; drop < 6; drop++) {
    const x = (step * 7 + drop * 11) % 24;
    const y = (step * 5 + drop * 9) % 18;
    g.rect(left + 4 + x, top + 6 + y, 3, 3).fill(drop % 2 ? 0x9bdcff : 0x4aa8e0);
  }
}

/** A bubble bobbing over the building: an exclamation mark for a theft, a cross for an illness. */
function drawMarker(g: Graphics, left: number, top: number, age: number, crime: boolean): void {
  const y = top - 8 + Math.round(Math.sin(age / 180) * 2);
  g.rect(left + 8, y, 16, 16).fill(OUTLINE);
  g.rect(left + 9, y + 1, 14, 14).fill(crime ? 0xf4ca65 : 0xf4f6f8);
  if (crime) {
    g.rect(left + 15, y + 3, 2, 7).rect(left + 15, y + 11, 2, 2).fill(OUTLINE);
  } else {
    g.rect(left + 15, y + 3, 2, 10).rect(left + 11, y + 7, 10, 2).fill(0xe04a3c);
  }
}

/** An emergency vehicle `progress` tiles along its route, with a light that flashes. */
function drawVehicle(g: Graphics, route: readonly Cell[], progress: number, age: number,
  trouble: string): void {
  const at = vehicleAt(route, progress);
  const x = Math.round(at.x * TILE_SIZE);
  const y = Math.round(at.y * TILE_SIZE);
  const vertical = at.hy !== 0;
  const { length: long, width: wide } = vehicleSizes[trouble === 'crime' ? 'crime' : trouble === 'sick' ? 'sick' : 'fire'];
  const width = vertical ? wide : long;
  const height = vertical ? long : wide;
  const left = x - width / 2;
  const top = y - height / 2;
  g.rect(left - 1, top - 1, width + 2, height + 2).fill(OUTLINE);
  g.rect(left, top, width, height).fill(BODY[trouble]);
  if (trouble === 'sick') {
    g.rect(x - 1, y - 3, 2, 6).rect(x - 3, y - 1, 6, 2).fill(0xe04a3c);
  } else if (trouble === 'crime') {
    g.rect(left + (vertical ? 0 : (long - 5) / 2), top + (vertical ? (long - 5) / 2 : 0), vertical ? wide : 5, vertical ? 5 : wide)
      .fill(0xf4f6f8);
  } else {
    g.rect(left + (vertical ? 2 : 3), top + (vertical ? 3 : 2), vertical ? wide - 4 : long - 6, vertical ? long - 6 : wide - 4)
      .fill(0xf1e3c2);
  }
  // The light bar: two lamps that take turns.
  const flash = Math.floor(age / 140) % 2;
  g.rect(x - 2, y - 1, 2, 2).fill(flash ? 0xff3b30 : 0x7a1f1a);
  g.rect(x, y - 1, 2, 2).fill(flash ? 0x1d3c8a : 0x4d8dff);
}

/** The same response vehicle position used by drawing, for direct inspection of its current task. */
export function sceneVehicle(scene: Scene, age: number) {
  if (!scene.route?.length || age > sceneLength(scene)) return undefined;
  const returning = scene.event.kind === 'crash-hospital' && scene.arrived !== undefined && age > scene.arrived + ON_SCENE;
  const progress = returning ? Math.max(0, scene.route.length - 1 - (age - scene.arrived! - ON_SCENE) / DASH) : scene.travelled ?? 0;
  const pose = vehicleAt(scene.route, progress);
  const trouble = scene.event.kind === 'crash-hospital' ? 'sick' : scene.event.kind.startsWith('crash') || scene.event.kind.startsWith('robbery') ? 'crime' : scene.event.kind.split('-')[0];
  return { ...pose, angle: Math.atan2(pose.hy, pose.hx) + (returning ? Math.PI : 0), trouble,
    returning, activity: returning ? 'moving' as const : scene.arrived !== undefined ? 'working' as const :
      (scene.held ?? 0) > 0 && (scene.held ?? 0) < GIVE_WAY ? 'queued' as const : 'moving' as const,
    progress: scene.route.length > 1 ? (returning ? scene.route.length - 1 - progress : progress) / (scene.route.length - 1) : 1 };
}
