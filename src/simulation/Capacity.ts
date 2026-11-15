import type { Tile } from './TileMap';

/**
 * How many people a place holds at once, counting those inside and those on their way. A
 * place that is full is passed over: people choose another of its kind or something else to
 * do, and the sick wait at home for a place at the clinic. Schools, parks and anything not
 * listed take everyone who comes.
 */
export const seats: Partial<Record<Tile, number>> = {
  clinic: 8, familyclinic: 6, hospital: 24, eldercare: 10,
  bank: 6, library: 10, community: 12, memorial: 12, temple: 12,
  market: 14, mall: 48, square: 36, bakery: 6, florist: 4, cakeshop: 6,
  culture: 16, cinema: 24, pool: 16, ktv: 10, museum: 30, casino: 30, amusement: 60, stadium: 90,
};
