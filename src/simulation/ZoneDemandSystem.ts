import type { Zone } from './TileMap';

export const growth = {
  /** Ticks between the steps in which residents move and buildings go up: twice a day. */
  interval: 4,
  capacity: { residential: 4, commercial: 3, industrial: 5 },
  /** Jobs and homes the city wants before it has anyone, so the first buildings can appear. */
  starterJobs: 8,
  starterHomes: 4,
  /**
   * Jobs wanted per resident and residents wanted per job. Both are above 1, so a balanced
   * city keeps wanting a little more of each and grows until it runs out of reachable lots.
   */
  jobsPerResident: 1.1,
  residentsPerJob: 1.05,
  /** How the jobs the city wants are split between shops and factories. */
  jobShare: { commercial: 0.4, industrial: 0.6 },
  /**
   * Chance of building per step, as demand goes from just above 0 to 100. It rises with the
   * square of demand: an empty city builds at once, a nearly balanced one takes its time.
   */
  chance: { min: 0.08, max: 1 },
  /** Chance per step that someone moves into a home that has room for them. An empty home fills its first place at once. */
  moveIn: 0.35,
};

export type Demand = Record<Zone, number>;

export interface Supply {
  population: number;
  /** Room left in homes that still take newcomers. Homes stuck without work do not count. */
  openings: number;
  commercialJobs: number;
  industrialJobs: number;
}

/**
 * Demand per zone from -100 to 100: the share of the wanted amount that is still missing.
 * Homes follow jobs and jobs follow people. It is recomputed from the city each time rather
 * than accumulated, so it needs no saved state.
 */
export function zoneDemand({ population, openings, commercialJobs, industrialJobs }: Supply): Demand {
  const missing = (wanted: number, actual: number) =>
    100 * Math.max(-1, Math.min(1, (wanted - actual) / Math.max(wanted, 1)));
  const labour = population * growth.jobsPerResident + growth.starterJobs;
  const jobs = commercialJobs + industrialJobs;
  return {
    residential: missing(jobs * growth.residentsPerJob + growth.starterHomes, population + openings),
    commercial: missing(labour * growth.jobShare.commercial, commercialJobs),
    industrial: missing(labour * growth.jobShare.industrial, industrialJobs),
  };
}

/** The chance that a zone with this demand gets a building in one growth step. */
export function buildChance(demand: number): number {
  if (demand <= 0) return 0;
  return growth.chance.min + (growth.chance.max - growth.chance.min) * (demand / 100) ** 2;
}
