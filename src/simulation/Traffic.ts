import type { Road } from './TileMap';

/**
 * Road traffic parameters. Commuters are loaded onto the roads one home at a time, and each
 * home routes on the travel times left by the homes before it, so busy roads push later
 * commuters onto alternatives. docs/city-sim-mechanics-reference.md section 7 has the background.
 */
export const traffic = {
  /** Minutes to cross one empty street tile. */
  minutesPerTile: 2,
  /** Commuters a street tile carries before it slows down noticeably. */
  capacity: 40,
  /** The same two figures for an avenue. */
  avenue: { minutesPerTile: 1, capacity: 120 },
  /** The BPR volume-delay curve: time = free time × (1 + alpha × (flow ÷ capacity) ^ beta). */
  alpha: 0.15,
  beta: 4,
  /** Jobs further away than this many minutes are out of reach. */
  maxCommute: 60,
  /** A home whose residents average more than this many minutes to work takes no newcomers. */
  longCommute: 40,
};

const spec = (road: Road) => road === 'avenue' ? traffic.avenue : traffic;

/** Flow as a share of capacity; above 1 the tile is congested. */
export const congestion = (flow: number, road: Road = 'road') => flow / spec(road).capacity;

/** Minutes to cross a road tile that carries the given number of commuters. */
export const tileMinutes = (flow: number, road: Road = 'road') =>
  spec(road).minutesPerTile * (1 + traffic.alpha * congestion(flow, road) ** traffic.beta);
