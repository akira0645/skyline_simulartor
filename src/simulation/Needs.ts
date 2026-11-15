/**
 * What a resident feels the lack of right now: food, rest and company. Like their thoughts
 * (see Mind.ts), none of it is saved. Each is read off the facts of their day: when they last
 * ate, how long they have been up and at work and on the road, and how many days it is since
 * they last met anyone. The same city at the same hour always gives the same answer.
 */
import { calendar } from './calendar';

/** Each need runs from 0 (none) to 100; these are the levels from which it changes what people do. */
export const needs = {
  /** Shown as hungry from here; someone eating out goes looking for food once this hungry. */
  hungry: 40,
  /** Too tired for anything but what has to be done. */
  tired: 85,
  /** Wants company enough to choose a place with people in it first. */
  lonely: 60,
  /** Hunger gained per waking hour without a meal, and the share of that gained while asleep. */
  hungerPerHour: 10,
  asleep: 0.25,
  /** Tiredness per hour awake, per hour worked, per minute of the trip to work, per child at home, and for being old. */
  awake: 3,
  worked: 4,
  commute: 0.3,
  child: 4,
  old: 15,
  /** Company wanted more with each day since the last meeting. */
  lonelyPerDay: 12,
} as const;

/**
 * How people eat. Each resident keeps one habit for good: most cook, some take it as it comes,
 * some eat out a lot and some have food brought. `share` is how many are of each kind, and
 * `lunch` and `dinner` how often that kind leaves the meal to be eaten out, or ordered in,
 * rather than at home or at work.
 */
export const eating = {
  cook: { share: 0.3, lunch: 0.05, dinner: 0.1 },
  mixed: { share: 0.35, lunch: 0.25, dinner: 0.4 },
  out: { share: 0.2, lunch: 0.5, dinner: 0.7 },
  delivery: { share: 0.15, lunch: 0.3, dinner: 0.6 },
} as const;
export type Eating = keyof typeof eating;

/** The meals of a day: when each is eaten at home, and the hours in which it may be eaten out instead. */
export const meals = {
  breakfast: { at: 7 },
  lunch: { at: 12, from: 11, until: 15 },
  dinner: { at: 19, from: 17, until: 21 },
} as const;

export interface Needs {
  hunger: number;
  fatigue: number;
  social: number;
  /** Hungry, with a meal they mean to eat out and have not had yet. */
  wantsFood: boolean;
  tired: boolean;
  lonely: boolean;
}

/** What a place offers: the kinds of tile where there is something to eat, and where there is company. */
export const FOOD_PLACES: readonly string[] = ['market', 'mall', 'square', 'bakery'];
export const SOCIAL_PLACES: readonly string[] = ['community', 'temple', 'ktv', 'square'];
/** Outings that are duties, which even someone worn out still makes. */
export const DUTIES: readonly string[] = ['school', 'highschool', 'daycare', 'eldercare'];

const hash = (seed: number, salt: number) => {
  let value = Math.imul(seed ^ Math.imul(salt + 1, 0x9e3779b1), 0x85ebca6b);
  value = Math.imul(value ^ value >>> 16, 0xc2b2ae35);
  return ((value ^ value >>> 13) >>> 0) / 2 ** 32;
};

/** A number from 0 to 1 that is always the same for the same person and purpose. */
export const chance = (seed: number, person: number, purpose: number) => hash(seed ^ Math.imul(person + 1, 7919), purpose);

/** The way this person eats, for as long as they live here. */
export function eatingOf(seed: number, person: number): Eating {
  let roll = chance(seed, person, 15485863);
  for (const habit of Object.keys(eating) as Eating[]) {
    if (roll < eating[habit].share) return habit;
    roll -= eating[habit].share;
  }
  return 'mixed';
}

/**
 * The day of the year, counted from 0, that is this person's birthday. It is theirs for good,
 * and is only the day the household buys a cake: ages go up by the years lived, not on it.
 */
export const birthdayOf = (seed: number, person: number) =>
  Math.floor(chance(seed, person, 32452843) * calendar.daysPerMonth * calendar.monthsPerYear);

/**
 * Which of today's meals this person means to eat out, or to order in if that is their way.
 * It differs from person to person and from day to day.
 */
export function mealPlan(seed: number, person: number, day: number): { lunchOut: boolean; dinnerOut: boolean } {
  const habit = eating[eatingOf(seed, person)];
  return { lunchOut: chance(seed, person, day * 2) < habit.lunch, dinnerOut: chance(seed, person, day * 2 + 1) < habit.dinner };
}

/** Hours without food between two hours of the same day, counting the hours of sleep for less. */
function fasting(from: number, to: number): number {
  let total = 0;
  for (let hour = from; hour < to; hour = Math.floor(hour) + 1) {
    const slept = hour >= 22 || hour < 6;
    total += (Math.min(to, Math.floor(hour) + 1) - hour) * (slept ? needs.asleep : 1);
  }
  return total;
}

/**
 * How hungry someone is at an hour of the day. `ateOut` are the hours today at which they
 * reached a place with food. A meal meant to be eaten out and missed is made up for with
 * whatever is at home when its hours end, so nobody starves for want of a market.
 */
export function hungerAt(hour: number, plan: { lunchOut: boolean; dinnerOut: boolean }, ateOut: readonly number[]):
  { hunger: number; wantsFood: boolean } {
  // Yesterday's dinner, as hours before this midnight.
  let last = meals.dinner.at - 24;
  if (hour >= meals.breakfast.at) last = meals.breakfast.at;
  let wantsFood = false;
  for (const [meal, out] of [[meals.lunch, plan.lunchOut], [meals.dinner, plan.dinnerOut]] as const) {
    if (!out) {
      if (hour >= meal.at) last = meal.at;
      continue;
    }
    const eaten = ateOut.filter(at => at >= meal.from && at < meal.until && at <= hour);
    if (eaten.length) last = Math.max(last, ...eaten);
    else if (hour >= meal.until) last = meal.until;
    else if (hour >= meal.from) wantsFood = true;
  }
  for (const at of ateOut) if (at <= hour) last = Math.max(last, at);
  const hunger = Math.min(100, Math.round(fasting(last, hour) * needs.hungerPerHour));
  return { hunger, wantsFood: wantsFood && hunger >= needs.hungry };
}

/**
 * How tired someone is at an hour of the day: up since the morning (or since late morning on
 * the evening shift), plus the hours worked so far, the trip to work, children and age.
 * `extra` is whatever else has worn them out today, such as riding with deliveries.
 */
export function fatigueAt(hour: number, work: { start: number; end: number; minutes: number } | undefined,
  kids: number, old: boolean, extra = 0): number {
  const wake = work && work.start >= 16 ? 9 : 6;
  // After midnight the evening shift is still up; everyone else is asleep before their waking hour.
  const awake = hour >= wake ? hour - wake : work && work.start >= 16 && hour < 2 ? hour + 24 - wake : 0;
  if (!awake) return 0;
  const worked = work ? Math.max(0, Math.min(hour, work.end) - work.start) : 0;
  const trip = work && hour >= work.start ? work.minutes * needs.commute : 0;
  return Math.min(100, Math.round(awake * needs.awake + worked * needs.worked + trip + kids * needs.child + (old ? needs.old : 0) + extra));
}

/** How much someone wants company: more with each day since they last met anyone, or since they moved in. */
export function socialAt(day: number, lastMet: number | undefined, cameDay: number): number {
  return Math.max(0, Math.min(100, (day - Math.max(lastMet ?? cameDay, cameDay)) * needs.lonelyPerDay));
}

/** The ways of eating in words, and what each means for the town. */
export const eatingWords: Record<Eating, [string, string]> = {
  cook: ['自己煮', '幾乎都在家吃，市場開著就會去買菜'],
  mixed: ['看心情', '有時在家吃，有時出門吃'],
  out: ['常外食', '午餐、晚餐常想在外面吃：附近要有市場、烘焙坊、大型商場或夜市'],
  delivery: ['常叫外送', '想外食的那一餐會叫外送：家附近要有商店，也要有外送員有空。還在騎腳踏車的人捨不得叫'],
};

/** The three needs in words, for the resident's card. */
export const needWords = {
  hunger: (value: number) => value >= 75 ? '很餓' : value >= needs.hungry ? '有點餓' : '吃飽了',
  fatigue: (value: number) => value >= needs.tired ? '很累' : value >= 60 ? '有點累' : '有精神',
  social: (value: number) => value >= needs.lonely ? '想找人聊聊' : value >= 20 ? '幾天沒見人' : '剛見過人',
};
