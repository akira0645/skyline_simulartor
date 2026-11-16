import type { Cell } from './TileMap';

/**
 * Public transport. The player places stops, strings them into a line in order, and gives the
 * line vehicles that shuttle from one end to the other and back. A commuter rides when home and
 * workplace are each near a stop of the same line; how many ride depends on how the trip
 * compares with driving, and on how many the line can carry in the rush.
 */
export const transit = {
  /** Buses use the roads between their stops; stops must stand beside one. */
  bus: { radius: 4, capacity: 30, vehicleCost: 300, vehicleUpkeep: 40, fare: 1 },
  /** Metro trains run underground in straight lines between stations, off the roads. */
  metro: { radius: 6, capacity: 120, minutesPerTile: 0.4, vehicleCost: 1500, vehicleUpkeep: 150, fare: 2 },
  /** Minutes a vehicle waits at each stop. */
  dwell: 1,
  /** Everyone on a shift wants to travel within this many minutes; it sets what a line can carry. */
  peakMinutes: 60,
  /**
   * The share of a commute's workers who ride: `faster` when waiting plus riding takes no longer
   * than driving, `close` when it takes up to `closeFactor` times as long, nobody beyond that.
   */
  share: { faster: 0.7, close: 0.4 },
  closeFactor: 1.5,
  maxVehicles: 8,
  maxLines: 6,
};

export type TransitKind = 'bus' | 'metro';

/** A line as it is saved: its stops, as tile indices in the order vehicles call at them. */
export interface SavedLine {
  id: number;
  kind: TransitKind;
  stops: number[];
  vehicles: number;
}

/** A line with everything worked out from the map. */
export interface Line extends SavedLine {
  /** False while the line has fewer than two stops, or its vehicles cannot get between them. */
  active: boolean;
  /** Every tile a vehicle passes from the first stop to the last. */
  path: Cell[];
  /** Minutes from the first stop to each stop, waits at the stops on the way included. */
  times: number[];
  /** Minutes between one departure and the next from any stop. */
  headway: number;
  /** Extra one-way minutes from road congestion in the demand estimate. */
  delay: number;
  /** Riders the line can take per shift. */
  capacity: number;
  /** Riders on the busiest shift, and on all shifts together. */
  busiest: number;
  riders: number;
}
