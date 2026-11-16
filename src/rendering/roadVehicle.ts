export interface RoadVehicle {
  along: number;
  returning: boolean;
  held: number;
  wait: number;
}

/** Advance only with simulation-scaled elapsed time; break a deadlock after two light cycles. */
export function advanceRoadVehicle(state: RoadVehicle, last: number, elapsed: number, pace: number,
  load: number, blocked: boolean, red: boolean, lightCycle: number): void {
  if (elapsed <= 0) return;
  state.held = blocked || red ? state.held + elapsed : 0;
  if (state.wait > 0) {
    state.wait = Math.max(0, state.wait - elapsed);
    return;
  }
  if (state.held > 0 && state.held <= (red ? 2 * lightCycle + 600 : 3500)) return;
  const slowdown = 1 + 0.15 * load ** 4;
  state.along += (state.returning ? -1 : 1) * Math.min(0.25, elapsed / (pace * slowdown));
  if (state.along >= last || state.along <= 0) {
    state.along = Math.max(0, Math.min(last, state.along));
    state.returning = !state.returning;
    state.wait = 650;
  }
}
