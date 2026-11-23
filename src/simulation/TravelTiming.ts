/** Keep saved simulation milliseconds unchanged: 1,000 units remain one three-hour tick. */
export const SIM_TICK_MS = 1000;
/** At 1x a game day (eight ticks) now lasts two real minutes. */
export const REAL_TICK_MS = 15000;
export const MOTION_SCALE = REAL_TICK_MS / SIM_TICK_MS;
export const WALK_TICKS_PER_TILE = 0.08;
export const WALK_REAL_MS_PER_TILE = REAL_TICK_MS * WALK_TICKS_PER_TILE;
/** Bicycle, scooter and cars. Same mode ratios as errands, with a separate bicycle pace. */
export const VEHICLE_REAL_PACE = [WALK_REAL_MS_PER_TILE / 1.8, WALK_REAL_MS_PER_TILE / 3,
  WALK_REAL_MS_PER_TILE / 4, WALK_REAL_MS_PER_TILE / 4, WALK_REAL_MS_PER_TILE / 4] as const;
