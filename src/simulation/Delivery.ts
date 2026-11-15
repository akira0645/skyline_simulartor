import { chance } from './Needs';

/**
 * Meals brought to the door. Someone who usually orders in (see `eatingOf` in Needs.ts) has
 * the meals they would have eaten out brought from a shop near home, if a rider is free. Those
 * still saving for a first scooter do not spend on it. The
 * riders are residents doing it on the side: people still on a bicycle or a scooter, out of
 * work or done with their shift for the day, who are not worn out. Each order pays the rider
 * its fee out of the customer's pocket, and each hour of riding tires them.
 */
export const delivery = {
  /** What the customer pays the rider for one order. */
  fee: 3,
  /** Orders one rider carries on one run, all from the same shop. */
  perRun: 3,
  /** How far from home the shop may be, and how far from the shop the rider may live, in tiles. */
  shopReach: 6,
  riderReach: 10,
  /** The longest run, in tiles of road, from the rider's door to the shop to the customer. */
  longest: 30,
  /** The share of those on a bicycle or a scooter who ride for money. */
  share: 0.3,
  /** Tiredness added by each run made today. */
  tiring: 10,
  /** A rider is this many times as quick as someone on foot. */
  speed: 3,
} as const;

/** Whether this resident rides for money when free: a matter of who they are and what they own. */
export const ridesFor = (seed: number, person: number, vehicle: number) =>
  vehicle <= 1 && chance(seed, person, 104729) < delivery.share;
