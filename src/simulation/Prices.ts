import { calendar } from './calendar';
import type { Mood } from './Economy';

/**
 * Prices that move. Two of them swing by themselves, each in a slow wave of its own length
 * that starts level on the city's first day: what fuel costs, and what goods fetch and cost
 * outside. The third is the price of everything, which creeps up or down with business once
 * the city is big enough to have good times and bad (see `cycle` in Economy.ts).
 */
export const prices = {
  /**
   * Fuel. Everyone with a job and a motor vehicle pays `perTile` a day for each road tile of
   * the way to work and back, times the fuel price. With a filling station in reach of home
   * the city keeps a `tax` share of that; without one they fill up out of town, pay `away`
   * times as much, and the city gets nothing.
   */
  fuel: { perTile: 0.15, away: 1.5, tax: 0.3, months: 7, swing: 0.35, dear: 1.2 },
  /** Goods: what a missing good costs to bring in and what a spare one sells for both follow this wave. */
  goods: { months: 11, swing: 0.3 },
  /**
   * The price level. Each month it grows by a twelfth of the yearly rate for how business is.
   * Building, upkeep, tax, pay and living costs all go by it, so a city is no richer or poorer
   * for it; but money in the bank buys less as prices rise, and a loan is repaid in cheaper
   * money. A small town's prices stay as they are.
   */
  level: { boom: 0.08, normal: 0.03, slump: -0.02 } satisfies Record<Mood, number>,
  /** Someone held up in traffic on the way to work is late, and is docked this share of the day's pay. */
  late: { dock: 0.1 },
};

const wave = (tick: number, months: number, swing: number) =>
  1 + swing * Math.sin(2 * Math.PI * Math.floor(tick / calendar.ticksPerDay) / (months * calendar.daysPerMonth));
/** The price of fuel on a day, as a multiple of the usual; 1 on the city's first day. */
export const fuelPrice = (tick: number) => wave(tick, prices.fuel.months, prices.fuel.swing);
/** What goods are worth outside the city on a day, as a multiple of the usual. */
export const goodsPrice = (tick: number) => wave(tick, prices.goods.months, prices.goods.swing);
