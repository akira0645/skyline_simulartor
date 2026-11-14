/**
 * What a resident is doing at this hour and what is on their mind. Nothing here is made up or
 * saved: it is all read off the facts of their life in the city (their job and the way to it,
 * what their home lacks, what is near it, how business is), so the player can learn what the
 * city needs by asking the people in it.
 */
import { bond, circle } from './Community';
import type { Mood } from './Economy';
import type { Trait } from './Residents';
import { traffic } from './Traffic';
import { FINE_CAR } from './Wealth';
import { shifts } from './WorkShift';

export type Doing = 'sleeping' | 'getting-ready' | 'to-work' | 'working' | 'break' | 'to-home' |
  'job-hunting' | 'park' | 'shopping' | 'gardening' | 'helping' | 'dining' | 'home' | 'temple' | 'online' |
  'outing' | 'family' | 'day-off';

/**
 * How someone gets to work. A trip of fewer than `mind.driveFrom` road tiles is walked; a
 * longer one is made on whatever they own (see Wealth.ts), unless they ride a line.
 */
export type Way = 'walk' | 'bike' | 'scooter' | 'drive' | 'bus' | 'metro';

/** Everything a resident may think, and how far each thought lifts or lowers their mood. */
export const thoughts = {
  'need-job': -25, 'no-power': -15, 'no-water': -15, 'air-bad': -15, unsafe: -12, 'far-commute': -12,
  'no-clinic': -8, 'no-hospital': -8, 'no-shops': -8, 'want-other-job': -8, 'slump-worry': -8,
  'tax-high': -8, jam: -6, 'no-school': -6, 'nothing-near': -6, 'no-highschool': -5, 'want-ride': -5,
  strangers: -4, 'want-car': -3, online: -2,
  'kids-nowhere': -4, 'casino-near': -3, scared: -10, 'good-pay': 6, 'forest-near': 6,
  'temple-near': 4, 'proud-car': 4, 'fun-near': 4, 'kids-happy': 4, handy: 5, 'close-knit': 6,
  'new-here': 2, 'love-car': 3, 'garden-proud': 4, neighbours: 4, 'tax-low': 5, 'ride-glad': 5,
  'old-timer': 5, 'nice-home': 5, 'near-commute': 6, 'boom-glad': 6, 'water-near': 6, 'park-near': 8,
  'love-job': 10, 'all-good': 5,
} as const;
export type Thought = keyof typeof thoughts;

/** The shift that works through the weekend: an index into `shifts`. */
export const SHOP_SHIFT = 2;

export const mind = {
  /** The mood of someone with nothing on their mind; moods run from 0 to 100. */
  base: 60,
  /** From this mood up someone is happy; below `low` they are unhappy. */
  glad: 70,
  low: 45,
  /** A trip to work of at most this many minutes is a pleasure. */
  nearCommute: 10,
  /** Days after which someone is new no longer, and days after which they call the place home. */
  fresh: 30,
  settled: 360,
  /** A trip is a jam when it takes this many times what the empty road would. */
  jam: 1.3,
  /** Trips of this many road tiles or more are driven rather than walked. */
  driveFrom: 5,
  /** Land value from which a rich resident is proud of the address. */
  fine: 70,
  /** How many tax points above or below the usual rate people notice. */
  tax: 2,
  /**
   * In a town of `population` or more, someone whose mood is below `mood` has this chance
   * every `days` days of giving up and moving away.
   */
  leave: { mood: 20, chance: 0.25, days: 30, population: 100 },
};

/** The facts of one resident's life that their mind is read from. */
export interface Facts {
  slot: number;
  trait?: Trait;
  /** Days since they moved in. */
  days: number;
  /** The shift of their job, an index into `shifts`; undefined while they look for one. */
  shift?: number;
  /** Whether the job is of the kind they like, if they care. */
  content?: boolean;
  /** Minutes to work, how they get there, and whether the road is jammed. */
  minutes?: number;
  way?: Way;
  jam: boolean;
  /** What holds their home back: the `Issue`s of the building. */
  troubles: readonly string[];
  /** A park by the home, water by the home, shops to walk to, a stop in reach. */
  park: boolean;
  water: boolean;
  shops: boolean;
  transit: boolean;
  /** A temple within a walk, how many kinds of place are, and how close-knit the home is (see Community.ts). */
  temple: boolean;
  places: number;
  bond: number;
  /** The town is big enough for people to miss what is not near. */
  town: boolean;
  /** The vehicle they own, an index into Wealth's `vehicles`. */
  car: number;
  /** Business is good where they work, and they are paid more for it. */
  raise: boolean;
  /** The home stands by a forest. */
  forest: boolean;
  /** Somewhere to go for fun within a walk, a casino in whose reach the home lies, a school within a walk. */
  fun: boolean;
  casino: boolean;
  school: boolean;
  /** How many children live in the home. */
  kids: number;
  /** The city has fewer shops than its people need. */
  shortOfShops: boolean;
  /** Land value of the home. */
  value: number;
  business: Mood;
  /** Tax points above the usual rate; negative below it. */
  tax: number;
}

/** What is on their mind, the heaviest worries first and then the best of the good things. */
export function thoughtsOf(facts: Facts): Thought[] {
  const list: Thought[] = [];
  const has = (trouble: string) => facts.troubles.includes(trouble);
  const working = facts.shift !== undefined;
  if (!working) list.push('need-job');
  if (has('no-power')) list.push('no-power');
  if (has('no-water')) list.push('no-water');
  if (has('pollution')) list.push('air-bad');
  if (has('crime')) list.push('unsafe');
  if (has('scared')) list.push('scared');
  for (const need of ['no-school', 'no-clinic', 'no-highschool', 'no-hospital'] as const) {
    if (has(need)) list.push(need);
  }
  if (facts.shortOfShops) list.push('no-shops');
  if (working) {
    if (facts.minutes !== undefined && facts.minutes > traffic.longCommute) list.push('far-commute');
    else if (facts.minutes !== undefined && facts.minutes <= mind.nearCommute) list.push('near-commute');
    if (facts.jam && (facts.way === 'drive' || facts.way === 'scooter')) list.push('jam');
    if (facts.way === 'bike') list.push('want-car');
    if (facts.content === false) list.push('want-other-job');
    if (facts.content === true) list.push('love-job');
    if (facts.raise) list.push('good-pay');
    if (facts.business === 'slump') list.push('slump-worry');
    if (facts.business === 'boom') list.push('boom-glad');
    if (facts.way === 'bus' || facts.way === 'metro') list.push('ride-glad');
    else if (facts.trait === 'rider' && !facts.transit) list.push('want-ride');
    if (facts.trait === 'driver' && facts.way === 'drive' && !facts.jam) list.push('love-car');
  }
  if (facts.tax >= mind.tax) list.push('tax-high');
  if (facts.tax <= -mind.tax) list.push('tax-low');
  if (facts.town && facts.places <= circle.bare) list.push('nothing-near');
  else if (facts.places >= circle.handy) list.push('handy');
  if (facts.town && !facts.shops) list.push('online');
  if (facts.temple) list.push('temple-near');
  if (facts.fun) list.push('fun-near');
  if (facts.casino && facts.trait !== 'rich') list.push('casino-near');
  if (facts.kids && facts.school && facts.park) list.push('kids-happy');
  else if (facts.kids && facts.town && !facts.park) list.push('kids-nowhere');
  if (facts.bond >= bond.close) list.push('close-knit');
  else if (facts.bond < bond.distant && facts.days >= bond.settled) list.push('strangers');
  if (facts.car >= FINE_CAR) list.push('proud-car');
  if (facts.forest) list.push('forest-near');
  else if (facts.park) list.push('park-near');
  if (facts.water) list.push('water-near');
  if (facts.trait === 'gardener') list.push('garden-proud');
  if (facts.trait === 'helper') list.push('neighbours');
  if (facts.trait === 'rich' && facts.value >= mind.fine) list.push('nice-home');
  if (facts.days < mind.fresh) list.push('new-here');
  if (facts.days >= mind.settled) list.push('old-timer');
  if (!list.length) list.push('all-good');
  const order = (thought: Thought) => thoughts[thought] < 0 ? thoughts[thought] : 100 - thoughts[thought];
  return list.sort((a, b) => order(a) - order(b));
}

/** Their mood, 0 to 100, from what is on their mind. */
export function moodOf(list: readonly Thought[]): number {
  let mood = mind.base;
  for (const thought of list) mood += thoughts[thought];
  return Math.max(0, Math.min(100, mood));
}

/** What they do with a free evening: it follows who they are and what is near, and varies by the day. */
function evening(facts: Facts, day: number): Doing {
  const choices: Doing[] = ['home'];
  if (facts.park) choices.push('park');
  if (facts.shops) choices.push('shopping');
  else if (facts.town) choices.push('online');
  if (facts.temple) choices.push('temple');
  if (facts.kids) choices.push('family');
  if (facts.trait === 'gardener') choices.push('gardening', 'gardening');
  if (facts.trait === 'helper') choices.push('helping', 'helping');
  if (facts.trait === 'rich' && facts.shops) choices.push('dining', 'dining');
  return choices[(day + facts.slot) % choices.length];
}

/**
 * What they are doing at an hour of the day (0 to 24). Someone with a job lives around the
 * shift: off to work two hours before it, a break in the middle, then home, a free evening and
 * eight hours of sleep. Someone without one spends the day looking.
 */
export function doingAt(facts: Facts, hour: number, day: number, weekend = false): Doing {
  // Offices and factories are shut at the weekend; shops (shift 2) are busier than ever.
  if (weekend && facts.shift !== undefined && facts.shift !== SHOP_SHIFT) {
    if (hour < 8 || hour >= 23) return 'sleeping';
    if (hour < 10) return 'day-off';
    if (hour >= 18) return evening(facts, day);
    const choices: Doing[] = ['day-off'];
    if (facts.fun) choices.push('outing', 'outing');
    if (facts.park) choices.push('park');
    if (facts.shops) choices.push('shopping');
    if (facts.temple) choices.push('temple');
    if (facts.kids) choices.push('family');
    return choices[(day + facts.slot) % choices.length];
  }
  if (facts.shift === undefined) {
    return hour < 7 || hour >= 22 ? 'sleeping' : hour < 8 ? 'getting-ready' :
      hour >= 12 && hour < 13 ? 'break' : hour < 17 ? 'job-hunting' : evening(facts, day);
  }
  const { start, end } = shifts[facts.shift];
  const length = end - start;
  const since = (hour - start + 24) % 24;
  if (since < length) return Math.abs(since - length / 2) < 0.5 ? 'break' : 'working';
  return since < length + 1.5 ? 'to-home' : since < 13.5 ? evening(facts, day) :
    since < 21.5 ? 'sleeping' : since < 22 ? 'getting-ready' : 'to-work';
}
