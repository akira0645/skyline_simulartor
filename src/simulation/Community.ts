/**
 * The neighbourhood of a home. Its circle is what daily life needs within a short walk; its
 * bond is how well the people of the home and their neighbours know each other.
 */

/** What a home may have within `circle.reach` tiles (across plus down), in the order shown. */
export const PLACES = ['shops', 'market', 'park', 'school', 'clinic', 'stop', 'temple', 'fun'] as const;
export type Place = (typeof PLACES)[number];

export const circle = {
  reach: 5,
  /** With this many kinds of place in the circle, life is handy; with `bare` or fewer it is not. */
  handy: 5,
  bare: 1,
  /** People only miss what a town of this size could have. */
  population: 100,
};

/**
 * How close-knit a home is, 0 to 100. It starts at `base` and rises with the months its people
 * have lived there (`perMonth` each, on average, up to `months`), with every kind of place in
 * the circle, with a temple or a park to meet at, and with every helpful resident; it falls
 * where there is crime. From `close` up the home's land is worth `value` more and its people
 * say so; below `distant` people who have been there a while feel like strangers.
 */
export const bond = {
  base: 15, perMonth: 2, months: 30, perPlace: 3, temple: 12, park: 6, helper: 6, helpers: 18, unsafe: -15,
  close: 60, distant: 25, value: 3,
  /** Days someone has lived in a home before they mind not knowing the neighbours. */
  settled: 60,
};
