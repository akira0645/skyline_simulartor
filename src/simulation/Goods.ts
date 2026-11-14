/**
 * Everyday goods. Factory workers make them, residents use them up, and shop workers are how
 * residents get them. What the city is short of it buys from outside; what it has left over it
 * sells. The figures are per month.
 */
export const goods = {
  /** Goods one factory worker makes. */
  perWorker: 3,
  /**
   * Goods one tile of farmland grows: `watered` within reach of water (the same reach that
   * makes a home a waterfront one), `dry` elsewhere, and nothing where the air is too dirty to live in.
   */
  farm: { watered: 3, dry: 1 },
  /** Goods one resident needs. */
  perResident: 1,
  /** Residents one shop or office worker can serve. */
  perClerk: 5,
  /** What a missing good costs to bring in, and what a spare one sells for. */
  importCost: 3,
  exportPrice: 1,
  /** Land value taken off every home when no resident at all can get to a shop; less in proportion. */
  shopPenalty: 8,
};
