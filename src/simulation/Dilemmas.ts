/**
 * Things that come up and ask for a decision. A city of `population` or more is put one every
 * `every` days (if the day's roll says so) and has `days` days to answer; left unanswered it
 * passes and nothing happens, so every answer is a chance taken rather than a loss avoided.
 * Each answer may pay or cost money at once (`funds`), make all three zones more or less wanted for a while (`demand` points for `days` days, like the tax rate
 * does), and may carry a `risk`: a chance of losing money there and then. An answer with a
 * `brand` opens that business in one of the city's shops, where it can be seen and pays the
 * city `brands[brand]` a month for as long as the shop stands; such a decision only comes up
 * in a city that has a shop to put it in.
 */
export interface Answer {
  funds?: number;
  demand?: { amount: number; days: number };
  risk?: { chance: number; funds: number };
  brand?: Brand;
}
/** Businesses that a decision can bring to town, and what each pays the city a month. */
export const brands = { lottery: 150, kiosk: 60, branch: 200, studio: 80 };
export type Brand = keyof typeof brands;
export const dilemmas = {
  every: 45,
  chance: 0.6,
  days: 15,
  population: 30,
  list: [
    { id: 'investor', answers: [{ funds: 5000, demand: { amount: -10, days: 90 }, brand: 'branch' }, { demand: { amount: 10, days: 60 } }] },
    { id: 'film', answers: [{ funds: 2000, demand: { amount: 10, days: 60 }, brand: 'studio' }, { funds: 4000 }] },
    { id: 'volunteers', answers: [{ funds: -1000, demand: { amount: 15, days: 60 } }, { funds: -300, demand: { amount: 5, days: 60 } }] },
    { id: 'donor', answers: [{ funds: 3000 }, { demand: { amount: 12, days: 90 } }] },
    { id: 'fair', answers: [{ funds: -1500, demand: { amount: 15, days: 60 } }, { funds: 500 }] },
    { id: 'lottery', answers: [{ funds: 3500, demand: { amount: -8, days: 60 }, brand: 'lottery' }, { funds: 1500, brand: 'kiosk' }] },
  ] as readonly { id: string; answers: readonly [Answer, Answer] }[],
};
export type DilemmaId = 'investor' | 'film' | 'volunteers' | 'donor' | 'fair' | 'lottery';
export interface Dilemma { id: DilemmaId; until: number }
export interface Boost { amount: number; until: number }
