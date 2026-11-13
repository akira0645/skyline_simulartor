/**
 * Pollution parameters. A source adds its strength on its own tile, fading in a straight line
 * to nothing `radius` tiles away (horizontal plus vertical distance). Sources add up and the
 * total is kept between 0 and 100.
 */
export const pollution = {
  /** Every factory building, whether or not anyone works there. */
  industry: { strength: 50, radius: 5 },
  power: { strength: 60, radius: 6 },
  /** Road tiles busier than `from` of their capacity; strength is per unit of congestion, up to 2. */
  road: { strength: 20, radius: 2, from: 0.5 },
  /** Parks take this much away. */
  park: { strength: 40, radius: 4 },
  /** Homes on tiles above this take no newcomers, and no new home is built there by choice. */
  limit: 50,
};
