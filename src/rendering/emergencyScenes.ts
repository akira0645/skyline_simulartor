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
}

/** Milliseconds a vehicle takes per road tile: twice as fast as a commuter's car. */
const DASH = 220;
/** How long a vehicle works at the scene after it arrives. */
const ON_SCENE = 2600;
/** How long an emergency nobody answers stays on the map. */
const UNANSWERED = 7000;

const travelTime = (scene: Scene) => (scene.route ? (scene.route.length - 1) * DASH : 0);

export function sceneLength(scene: Scene): number {
  return scene.route ? travelTime(scene) * (scene.event.kind === 'crash-hospital' ? 2 : 1) + ON_SCENE : UNANSWERED;
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
      const travel = travelTime(scene);
      const progress = age <= travel ? age / DASH :
        ambulance ? Math.max(0, (travel + ON_SCENE + travel - age) / DASH) : route.length - 1;
      drawVehicle(g, route, Math.min(route.length - 1, progress), age, ambulance ? 'sick' : 'crime');
    }
    return;
  }
  const trouble = event.kind.startsWith('robbery') ? 'crime' : event.kind.split('-')[0];
  const left = event.cell.x * TILE_SIZE;
  const top = event.cell.y * TILE_SIZE;
  const arrival = travelTime(scene);
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

  if (route) drawVehicle(g, route, Math.min(age, arrival) / DASH, age, trouble);
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
  const index = Math.min(route.length - 1, Math.floor(progress));
  const from = route[index];
  const to = route[Math.min(route.length - 1, index + 1)];
  const part = progress - index;
  const x = Math.round((from.x + (to.x - from.x) * part) * TILE_SIZE) + TILE_SIZE / 2;
  const y = Math.round((from.y + (to.y - from.y) * part) * TILE_SIZE) + TILE_SIZE / 2;
  // Parked at the scene it keeps the direction it came from.
  const before = route[Math.max(0, index - 1)];
  const heading = to === from ? { x: from.x - before.x, y: from.y - before.y } :
    { x: to.x - from.x, y: to.y - from.y };
  const vertical = heading.y !== 0;
  const long = 20;
  const wide = 12;
  const width = vertical ? wide : long;
  const height = vertical ? long : wide;
  const left = x - width / 2;
  const top = y - height / 2;
  g.rect(left - 1, top - 1, width + 2, height + 2).fill(OUTLINE);
  g.rect(left, top, width, height).fill(BODY[trouble]);
  if (trouble === 'sick') {
    g.rect(x - 1, y - 4, 2, 8).rect(x - 4, y - 1, 8, 2).fill(0xe04a3c);
  } else if (trouble === 'crime') {
    g.rect(left + (vertical ? 0 : 6), top + (vertical ? 6 : 0), vertical ? wide : 8, vertical ? 8 : wide)
      .fill(0xf4f6f8);
  } else {
    g.rect(left + (vertical ? 3 : 4), top + (vertical ? 4 : 3), vertical ? 6 : 12, vertical ? 12 : 6)
      .fill(0xf1e3c2);
  }
  // The light bar: two lamps that take turns.
  const flash = Math.floor(age / 140) % 2;
  g.rect(x - 4, y - 2, 4, 4).fill(flash ? 0xff3b30 : 0x7a1f1a);
  g.rect(x, y - 2, 4, 4).fill(flash ? 0x1d3c8a : 0x4d8dff);
}
