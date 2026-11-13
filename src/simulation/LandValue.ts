import type { Zone } from './TileMap';

/**
 * Land value of a zoned tile, 0 to 100: how good a spot it is. A full building on valuable land
 * grows a level and holds more, so clean air, parks, utilities and short commutes pay back.
 */
export const landValue = {
  base: 30,
  /** Added when the tile has both power and water. */
  utilities: 25,
  /** Each park adds its strength on its own tile, fading to nothing at its radius; up to `max`. */
  park: { strength: 10, radius: 4, max: 25 },
  /** Added within this many tiles of water. */
  waterfront: { value: 8, radius: 3 },
  /** Taken off per point of pollution. Factories do not mind their own smoke. */
  pollution: 0.6,
  /** Taken off homes per minute of average commute, up to `max`. */
  commute: { perMinute: 0.5, max: 20 },
  /** The value a building needs to reach level 2 and level 3. */
  upgrade: [45, 65],
  /** Chance per growth step that a full building on good enough land upgrades. */
  chance: 0.04,
  /** What a building holds at levels 1, 2 and 3. */
  capacity: {
    residential: [4, 6, 10], commercial: [3, 5, 8], industrial: [5, 8, 12],
  } satisfies Record<Zone, number[]>,
};

export const MAX_LEVEL = 3;
