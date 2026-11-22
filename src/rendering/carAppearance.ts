import atlas from '../assets/vehicles/cars.json';
import type { Theme } from '../simulation/SaveData';

/** Heading in screen coordinates: east = 0, south = pi/2. Retain heading while stopped. */
export function carHeading(dx: number, dy: number, fallback = 0): number {
  return Number.isFinite(dx) && Number.isFinite(dy) && Math.hypot(dx, dy) > 1e-6
    ? Math.atan2(dy, dx) : fallback;
}

/** Atlas columns run clockwise from east, with the 360-degree seam centred on east. */
export function carDirection(heading: number): number {
  if (!Number.isFinite(heading)) return 0;
  const count = atlas.directions;
  return ((Math.round(heading * count / (2 * Math.PI)) % count) + count) % count;
}

export function carFrame(tier: number, index: number, theme: Theme, heading: number) {
  if (tier < 2 || tier > 4 || !Number.isInteger(tier)) throw new Error(`Not an automobile tier: ${tier}`);
  const cab = theme === 'newyork' && tier < 4 && index % 5 < 3;
  const colour = cab ? 8 : tier === 4 ? 5 + index % 3 : index % 5;
  return { column: carDirection(heading), row: (tier - 2) * atlas.colours.length + colour };
}
