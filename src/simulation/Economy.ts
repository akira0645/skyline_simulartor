import type { Facility, Road, Service, Tile } from './TileMap';

/**
 * City money. Building costs are charged per tile changed. Tax and upkeep are quoted per month
 * and paid a day at a time, a thirtieth each day, so the balance moves all the time.
 */
export const economy = {
  startingFunds: 12000,
  /** Price per tile. Zoning and demolishing are cheap so that roads and facilities are the decisions. */
  cost: { road: 20, avenue: 60, bridge: 150, zone: 10, power: 1500, water: 1000, park: 30, demolish: 10,
    fire: 800, police: 800, school: 1200, clinic: 1000, bus: 200, metro: 2000,
    market: 900, highschool: 2500, hospital: 6000, university: 12000, museum: 8000, stadium: 20000,
    temple: 1500, mall: 15000, casino: 25000, cinema: 3000, parking: 400, farm: 15 },
  /** Monthly upkeep per tile. */
  upkeep: { road: 1, avenue: 3, bridge: 4, power: 150, water: 100, park: 1, fire: 60, police: 60,
    school: 80, clinic: 70, bus: 15, metro: 100,
    market: 50, highschool: 140, hospital: 320, university: 500, museum: 350, stadium: 800, annex: 0,
    temple: 60, mall: 600, casino: 700, cinema: 120, parking: 10, farm: 0,
  } satisfies Record<Road | Facility | Service | 'park' | 'bus' | 'metro' | 'annex' | 'farm', number>,
  /** Monthly tax per resident and per filled job at the default tax rate. */
  tax: { resident: 8, job: 5 },
  /**
   * The tax rate in percent. Income scales with it. Every point above the default takes
   * `above` off the demand for all three zones, and every point below adds `below`.
   */
  taxRate: { default: 8, min: 0, max: 20, above: 6, below: 3 },
  /** A loan pays out `amount` at once and costs `payment` a month for `months` months. */
  loan: { amount: 5000, months: 12, payment: 500, max: 3 },
  /** Below this balance the city is bankrupt. */
  bankrupt: -5000,
};

/**
 * Good times and bad. Once the city has reached `population` residents (rank `rank`; it keeps
 * going if the city shrinks again, so it cannot flicker on and off), business rises and falls in a
 * slow wave `months` long, set by the city's seed. Near the top of the wave it is a boom: every
 * zone is more in demand and tax brings in more. Near the bottom it is a slump: demand drops and
 * shops and factories keep only a share of their jobs, so some people are laid off and may
 * leave, until business picks up again. A small town is spared all this.
 */
export const cycle = {
  population: 400,
  rank: 3,
  months: 16,
  /** How far up or down the wave (which runs from -1 to 1) a boom or a slump begins. */
  turn: 0.5,
  boom: { demand: 15, tax: 1.1 },
  slump: { demand: -15, jobs: 0.85 },
};
export type Mood = 'boom' | 'normal' | 'slump';

/** What it costs to turn one tile into `tile`. */
export function tileCost(tile: Tile): number {
  if (tile === 'grass' || tile === 'river') return economy.cost.demolish;
  // A big building is paid for by its corner tile.
  if (tile === 'annex') return 0;
  if (tile === 'residential' || tile === 'commercial' || tile === 'industrial') return economy.cost.zone;
  return economy.cost[tile];
}

/**
 * City ranks by population, lowest first. Reaching one pays its grant once; the number of ranks
 * reached is saved, so shrinking and growing back does not pay twice.
 */
export const milestones: readonly { population: number; grant: number }[] = [
  { population: 50, grant: 2000 },
  { population: 150, grant: 4000 },
  { population: 400, grant: 8000 },
  { population: 1000, grant: 15000 },
  { population: 2500, grant: 30000 },
  { population: 6000, grant: 60000 },
];
