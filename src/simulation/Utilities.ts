import type { Facility } from './TileMap';

/** A facility serves the nearest buildings within its radius, up to its capacity. */
export const utilities = {
  /** Reach in tiles, measured as horizontal plus vertical distance. */
  radius: 12,
  /** Buildings one facility can serve. */
  capacity: { power: 60, water: 60 } satisfies Record<Facility, number>,
  /** Share of its capacity a building keeps while it lacks power or water. */
  unservedShare: 0.5,
};
