/**
 * What residents earn and what they ride. Someone with a job is paid by the day, more at a
 * bigger workplace, and puts aside what is left after living costs. When their savings reach
 * the price of the next vehicle up they buy it. The city collects a licence fee on every motor
 * vehicle each month, so a town where people earn well pays for itself better.
 */
export const pay = {
  /** Pay per day by the level of the workplace, 1 to 4. */
  perDay: { commercial: [28, 38, 52, 68], industrial: [30, 38, 48, 60] },
  /** Rich residents earn this many times as much. */
  richTimes: 2,
  /** What a day costs someone with a job; someone without one lives off savings at half of it. */
  living: 22,
};

/**
 * Pay follows business. A shop's customers are the residents within `reach` tiles, shared out
 * among the shops in their reach by staff. With `good` times as many as its staff can serve
 * (see Goods.ts) it pays `times.good` of the usual wage, with `busy` times as many `times.busy`.
 * Below `quiet`, or while the neighbourhood is frightened, it is quiet: that is shown, but the
 * wage is so close to what a day costs that cutting it would leave the staff with nothing. A factory pays
 * `times.good` while the city makes fewer goods than it needs, since everything it makes sells.
 */
export const trade = { reach: 6, good: 1, busy: 2, quiet: 0.4, times: { busy: 1.5, good: 1.25, quiet: 1 } };
export type Trade = 'busy' | 'good' | 'quiet';

/**
 * Vehicles, cheapest first: the index is what a resident owns (`SavedPerson.car`). Everyone
 * starts on a bicycle. `licence` is what the city collects per month.
 */
export const vehicles = [
  { price: 0, licence: 0 },
  { price: 300, licence: 1 },
  { price: 3000, licence: 3 },
  { price: 10000, licence: 6 },
  { price: 30000, licence: 14 },
] as const;
/** From this vehicle on the owner is proud of it. */
export const FINE_CAR = 3;

/** A day's pay at a workplace. */
export function dayPay(zone: 'commercial' | 'industrial', level: number, rich: boolean): number {
  const scale = pay.perDay[zone];
  return scale[Math.max(0, Math.min(scale.length, level) - 1)] * (rich ? pay.richTimes : 1);
}
