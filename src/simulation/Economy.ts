import type { Facility, Road, Tile } from './TileMap';

/** City money. Building costs are charged per tile changed; tax and upkeep settle once a month. */
export const economy = {
  startingFunds: 20000,
  /** Price per tile. Zoning and demolishing are cheap so that roads and facilities are the decisions. */
  cost: { road: 10, avenue: 40, zone: 5, power: 1500, water: 1000, park: 20, demolish: 5 },
  /** Monthly upkeep per tile. */
  upkeep: { road: 1, avenue: 3, power: 150, water: 100, park: 1 } satisfies Record<Road | Facility | 'park', number>,
  /** Monthly tax per resident and per filled job. */
  tax: { resident: 6, job: 4 },
};

/** What it costs to turn one tile into `tile`. */
export function tileCost(tile: Tile): number {
  if (tile === 'grass') return economy.cost.demolish;
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
