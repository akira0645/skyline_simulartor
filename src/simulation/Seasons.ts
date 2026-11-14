import { calendar, dateAt, weekendAt } from './calendar';

/**
 * The year has four seasons of three months, and the city is founded on the first day of
 * spring. Each has its own effect: farmland grows by `farm`, power plants cost `heating`
 * times their upkeep, summer may bring a flood and winter the flu (see `disasters`).
 */
export const SEASONS = ['spring', 'summer', 'autumn', 'winter'] as const;
export type Season = (typeof SEASONS)[number];
export const seasonAt = (tick: number): Season => SEASONS[Math.floor((dateAt(tick).month - 1) / 3)];
export const seasons = {
  farm: { spring: 1, summer: 1.2, autumn: 1.5, winter: 0.3 } satisfies Record<Season, number>,
  heating: { spring: 1, summer: 1.15, autumn: 1, winter: 1.3 } satisfies Record<Season, number>,
  /**
   * Visitors come at the weekend. What the sights are said to bring in a month is the average;
   * a weekend day pays `weekend` times a day's share of it and a weekday `weekday` times.
   */
  weekend: 1.5,
  weekday: 0.8,
};
/** What the sights pay today, as a multiple of an average day. */
export const visitorsToday = (tick: number) => weekendAt(tick) ? seasons.weekend : seasons.weekday;

/**
 * Days of the year when the whole city turns out, if it has somewhere to go. Each pays once,
 * on its day: `perResident` for everyone in the city, or `perGood` for every good the farms
 * grow in a month. What counts as somewhere to go is in `BuildingSystem.venueOf`.
 */
export const festivals = [
  { id: 'newyear', month: 1, day: 1, perResident: 1, perGood: 0 },
  { id: 'temple', month: 4, day: 10, perResident: 2, perGood: 0 },
  { id: 'games', month: 7, day: 15, perResident: 1.5, perGood: 0 },
  { id: 'harvest', month: 9, day: 20, perResident: 0, perGood: 3 },
  { id: 'market', month: 12, day: 24, perResident: 2, perGood: 0 },
] as const;
export type FestivalId = (typeof festivals)[number]['id'];
/** The next festival from a tick on, and how many days away it is (0 on the day). */
export function nextFestival(tick: number): { id: FestivalId; days: number } {
  const { month, day } = dateAt(tick);
  const today = (month - 1) * calendar.daysPerMonth + day;
  const year = calendar.daysPerMonth * calendar.monthsPerYear;
  let best = { id: festivals[0].id as FestivalId, days: year };
  for (const festival of festivals) {
    const days = ((festival.month - 1) * calendar.daysPerMonth + festival.day - today + year) % year;
    if (days < best.days) best = { id: festival.id, days };
  }
  return best;
}

/**
 * Things the city may decide, each on or off. `perResident` and `fixed` are what one costs a month.
 * - recycle: factories smoke `smog` times as hard.
 * - freeride: buses and trains are free, so no fares, and these shares of commuters ride (see Transit.ts).
 * - patrol: thefts are `crime` times as likely.
 * - festive: festivals pay `times` as much.
 */
export const policies = {
  recycle: { perResident: 0.5, fixed: 0, smog: 0.8 },
  freeride: { perResident: 0, fixed: 0, share: { faster: 0.9, close: 0.6 } },
  patrol: { perResident: 0.4, fixed: 0, crime: 0.5 },
  festive: { perResident: 0, fixed: 200, times: 1.5 },
};
export const POLICIES = ['recycle', 'freeride', 'patrol', 'festive'] as const;
export type Policy = (typeof POLICIES)[number];

/**
 * What a season may bring, rolled once a day in a city of `population` or more.
 * - flood: up to `most` buildings near water are flooded. Where the fire brigade reaches they are
 *   pumped out; elsewhere the neighbourhood is frightened as after a fire (see `scare`).
 * - flu: in up to `most` homes out of reach of a clinic or hospital, one resident falls ill and leaves.
 */
export const disasters = {
  flood: { season: 'summer', chance: 0.03, most: 3, population: 100 },
  flu: { season: 'winter', chance: 0.03, most: 5, population: 300 },
} as const;

/**
 * A challenge is a task against the clock. A city of `population` or more is offered one every
 * `every` days when it has none; it has `days` days to raise a figure by `by` (at least `least`
 * more), and is paid if it does. One that runs out is simply gone.
 */
export const challenges = {
  every: 90,
  days: 120,
  population: 50,
  list: [
    { id: 'grow', by: 1.15, least: 20, reward: 4000 },
    { id: 'riders', by: 1.3, least: 30, reward: 3000 },
    { id: 'top', by: 1.1, least: 5, reward: 3000 },
  ],
} as const;
export type ChallengeId = (typeof challenges.list)[number]['id'];
export interface Challenge { id: ChallengeId; target: number; until: number }

/**
 * Rain, by the day: the share of days it rains in each season. Winter has snow instead. It is
 * weather to look at; nothing in the city goes by it.
 */
export const rain = { spring: 0.25, summer: 0.3, autumn: 0.15, winter: 0 } satisfies Record<Season, number>;
/** Whether it rains on the day of a tick in a city with this seed. */
export function rainingAt(seed: number, tick: number): boolean {
  const day = Math.floor(tick / calendar.ticksPerDay);
  let hash = Math.imul(seed ^ Math.imul(day + 1, 0x9e3779b1), 0x85ebca6b);
  hash = Math.imul(hash ^ (hash >>> 15), 0xc2b2ae35);
  return ((hash ^ (hash >>> 13)) >>> 0) / 2 ** 32 < rain[seasonAt(tick)];
}
