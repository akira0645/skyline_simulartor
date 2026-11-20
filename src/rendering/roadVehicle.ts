import type { Cell } from '../simulation/TileMap';

export const TURN_MS = 650;
export const ROAD_LANE = 0.19;
export interface RoadVehicle {
  along: number;
  returning: boolean;
  held: number;
  wait: number;
  /** Direction before a terminal or intermediate U-turn. */
  turnFrom?: boolean;
  turnNode?: number;
}

/** Advance only with simulation-scaled time. Report a completed round trip after its home turn. */
export function advanceRoadVehicle(state: RoadVehicle, last: number, elapsed: number, pace: number,
  load: number, blocked: boolean, red: boolean, lightCycle: number): 'home' | undefined {
  if (elapsed <= 0) return;
  if (state.wait > 0) {
    state.held = 0;
    state.wait = Math.max(0, state.wait - elapsed);
    if (!state.wait) {
      const home = state.turnFrom === true && !state.returning && state.along === 0;
      delete state.turnFrom; delete state.turnNode;
      if (home) return 'home';
    }
    return;
  }
  state.held = blocked || red ? state.held + elapsed : 0;
  if (state.held > 0 && state.held <= (red ? 2 * lightCycle + 600 : 3500)) return;
  const slowdown = 1 + 0.15 * load ** 4;
  state.along += (state.returning ? -1 : 1) * Math.min(0.25, elapsed / (pace * slowdown));
  if (state.along >= last || state.along <= 0) {
    state.along = Math.max(0, Math.min(last, state.along));
    state.turnFrom = state.returning;
    state.returning = !state.returning;
    state.wait = TURN_MS;
  }
}

/** Also turn in the road when an ordered stop itinerary doubles back at an intermediate node. */
function advancePathStep(state: RoadVehicle, path: readonly Cell[], elapsed: number, pace: number,
  load: number, blocked: boolean, red: boolean, lightCycle: number): 'home' | undefined {
  const before = state.along;
  const returning = state.returning;
  const completed = advanceRoadVehicle(state, path.length - 1, elapsed, pace, load, blocked, red, lightCycle);
  if (state.turnFrom !== undefined || state.returning !== returning || state.along === before) return completed;
  const node = returning ? Math.ceil(before) - 1 : Math.floor(before) + 1;
  const crossed = returning ? state.along <= node : state.along >= node;
  if (crossed && node > 0 && node < path.length - 1 &&
      path[node - 1].x === path[node + 1].x && path[node - 1].y === path[node + 1].y) {
    state.along = node;
    state.turnFrom = returning;
    state.turnNode = node;
    state.wait = TURN_MS;
  }
  return completed;
}

/** World tile coordinates, including a smooth half-circle between opposing lanes at a U-turn. */
export function roadVehiclePose(path: readonly Cell[], state: RoadVehicle) {
  const last = path.length - 1;
  const along = Math.max(0, Math.min(last, state.along));
  if (state.turnFrom !== undefined && state.wait > 0) {
    const node = state.turnNode ?? (along === 0 ? 0 : last);
    const previous = Math.max(0, Math.min(last, node + (state.turnFrom ? 1 : -1)));
    const centre = path[node];
    const hx = Math.sign(centre.x - path[previous].x);
    const hy = Math.sign(centre.y - path[previous].y);
    const theta = (1 - Math.min(TURN_MS, state.wait) / TURN_MS) * Math.PI;
    const cos = Math.cos(theta), sin = Math.sin(theta);
    const dx = hx * cos + hy * sin;
    const dy = hy * cos - hx * sin;
    return { x: centre.x + 0.5 + ROAD_LANE * (-hy * cos + hx * sin),
      y: centre.y + 0.5 + ROAD_LANE * (hx * cos + hy * sin),
      hx: dx, hy: dy, angle: Math.atan2(dy, dx), index: Math.min(last - 1, node), upright: Math.abs(dy) > Math.abs(dx) };
  }
  const index = Math.max(0, Math.min(last - 1, state.returning ? Math.ceil(along) - 1 : Math.floor(along)));
  const from = path[index], to = path[index + 1];
  const part = along - index;
  const direction = state.returning ? -1 : 1;
  const hx = Math.sign(to.x - from.x) * direction;
  const hy = Math.sign(to.y - from.y) * direction;
  return { x: from.x + (to.x - from.x) * part + 0.5 - hy * ROAD_LANE,
    y: from.y + (to.y - from.y) * part + 0.5 + hx * ROAD_LANE,
    hx, hy, angle: Math.atan2(hy, hx), index, upright: hy !== 0 };
}

/** Compare geometry, not map layout revisions: unrelated building edits must not restart a trip. */
export const roadPathKey = (path: readonly Cell[]) => path.map(cell => `${cell.x},${cell.y}`).join(';');

/** Consume the entire frame in small movement steps, including low-FPS and fast-speed frames. */
export function advancePathVehicle(state: RoadVehicle, path: readonly Cell[], elapsed: number, pace: number,
  load: number, blocked: boolean, red: boolean, lightCycle: number): 'home' | undefined {
  if (!Number.isFinite(elapsed) || elapsed <= 0 || path.length < 2) return;
  const step = Math.max(1, Math.min(50, pace / 4));
  let remaining = elapsed;
  while (remaining > 0) {
    // Split exactly at a turn's end; a home completion must reach the caller before reassignment.
    const slice = Math.min(remaining, state.wait > 0 ? state.wait : step);
    const completed = advancePathStep(state, path, slice, pace, load, blocked, red, lightCycle);
    remaining -= slice;
    if (completed) return completed;
  }
}
