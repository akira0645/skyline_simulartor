/**
 * What the right things side by side turn into. Each is found again from the map whenever the
 * city is worked out: break the pattern and it is gone, restore it and it is back. Only which
 * ones the city has ever had is saved, for the handbook. (A big park and a housing complex
 * work the same way; see LandValue.ts.)
 *
 * `value` makes every zoned tile within `reach` of the group worth `amount` more. `income` is
 * what each group brings in a month: `perResident` for everyone in the city, up to `most`.
 */
export const combos = {
  /** Parks that touch, this many or more. A home within reach is a forest cabin. */
  forest: { tiles: 12, value: { reach: 2, amount: 5 } },
  /** A big park (fewer tiles than a forest) with a tile in reach of water. */
  riverpark: { tiles: 6, value: { reach: 4, amount: 4 } },
  /** Farmland that touches, this many tiles or more, one of them in reach of water. It grows `times` as much, and a home within `reach` is a farmhouse. */
  farmstead: { tiles: 6, times: 1.5, reach: 2 },
  /** Shops at the top level filling a square `side` tiles wide. */
  arcade: { side: 3, income: { perResident: 0.5, most: 1500 } },
  /** A temple with a market and a park both within `reach`. */
  fair: { reach: 3, income: { perResident: 0.4, most: 800 } },
  /** A market with `shops` shop buildings within `reach`. */
  foodstreet: { reach: 2, shops: 4, income: { perResident: 0.3, most: 600 } },
  /** A metro station with `shops` shop buildings within `reach`. */
  plaza: { reach: 2, shops: 6, income: { perResident: 0.5, most: 1200 } },
  /** A casino with a cinema and a mall both within `reach`. */
  funcity: { reach: 8, income: { perResident: 1, most: 3000 } },
  /** A high school with a primary school and a park both within `reach`. */
  campus: { reach: 3, value: { reach: 6, amount: 4 } },
  /** A hospital with a clinic within `reach`. */
  medical: { reach: 5, value: { reach: 6, amount: 4 } },
  /** Factories that touch, this many or more. Its workers make `goods` times as much and it smokes `smog` times as hard. */
  estate: { buildings: 8, goods: 1.25, smog: 1.3 },
  /** An industrial estate with a factory in reach of water: all that an estate is, and it ships goods out. */
  port: { income: { perResident: 0.6, most: 2000 } },
};
export const COMBOS = ['forest', 'riverpark', 'farmstead', 'arcade', 'fair', 'foodstreet', 'plaza', 'funcity',
  'campus', 'medical', 'estate', 'port'] as const;
export type Combo = (typeof COMBOS)[number];
export const comboValue = (combo: Combo) => (combos[combo] as { value?: { reach: number; amount: number } }).value;
export const comboIncome = (combo: Combo) => (combos[combo] as { income?: { perResident: number; most: number } }).income;

/**
 * Jobs the people of the city ask for. One is taken up when its trouble has grown to `from`
 * buildings, and is done, and paid, when it is down to `to` or fewer. At most `tasks.most` run at
 * once, and one that is done does not come back for `tasks.rest` days.
 */
export const tasks = { most: 3, rest: 60 };
export const taskList = [
  { id: 'power', issue: 'no-power', from: 5, to: 0, reward: 1200 },
  { id: 'water', issue: 'no-water', from: 5, to: 0, reward: 1000 },
  { id: 'police', issue: 'crime', from: 5, to: 0, reward: 1000 },
  { id: 'jobs', issue: 'no-jobs', from: 10, to: 3, reward: 1500 },
  { id: 'commute', issue: 'long-commute', from: 10, to: 3, reward: 2500 },
  { id: 'air', issue: 'pollution', from: 5, to: 1, reward: 1500 },
  { id: 'school', issue: 'no-school', from: 5, to: 0, reward: 1200 },
  { id: 'clinic', issue: 'no-clinic', from: 5, to: 0, reward: 1200 },
  { id: 'highschool', issue: 'no-highschool', from: 5, to: 0, reward: 2000 },
  { id: 'hospital', issue: 'no-hospital', from: 5, to: 0, reward: 4000 },
  { id: 'staff', issue: 'vacancies', from: 10, to: 3, reward: 1500 },
] as const;
export type TaskId = (typeof taskList)[number]['id'];
