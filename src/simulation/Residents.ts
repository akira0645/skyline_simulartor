/**
 * The people of the city. A home keeps a short record of each resident (see `SavedPerson`):
 * the place they took when they moved in, where they work and since when. Who they are, which
 * is their name, age, trait and the work they like, is worked out from the city's seed, the
 * home and that place, so it never needs saving. Places are handed out in order and never
 * reused, so nobody comes back under the same name.
 */
import type { Zone } from './TileMap';

export type Trait = 'rich' | 'driver' | 'rider' | 'helper' | 'gardener';

export const TRAITS: readonly Trait[] = ['rich', 'driver', 'rider', 'helper', 'gardener'];

/**
 * Kinds of home, decided by where the home is built, and who each kind draws. A kind multiplies
 * how common some traits are among the people who move in, and sets how many of them would
 * rather work in shops and offices or in factories.
 */
export type HomeKind = 'villa' | 'garden' | 'worker' | 'downtown' | 'riverside' | 'station' | 'campus' | 'suburb';
export const HOME_KINDS: readonly HomeKind[] = ['villa', 'garden', 'worker', 'downtown', 'riverside', 'station',
  'campus', 'suburb'];
export const homeKinds: Record<HomeKind, { traits: Partial<Record<Trait, number>>;
  liking?: { commercial: number; industrial: number } }> = {
  /** Fine houses on expensive land: money and cars. */
  villa: { traits: { rich: 3, driver: 2.5, rider: 0.2 } },
  /** By a park or the water: people who look after the place. */
  garden: { traits: { gardener: 3.5, helper: 2.5 } },
  /** By the factories: people who want factory work and take the bus. */
  worker: { traits: { rich: 0.1, rider: 2.5 }, liking: { commercial: 0.05, industrial: 0.65 } },
  /** Among shops or by a station: people who want shop and office work and ride. */
  downtown: { traits: { rider: 2.5, driver: 0.4 }, liking: { commercial: 0.65, industrial: 0.05 } },
  /** On the water: people with some money who look after the view. */
  riverside: { traits: { rich: 1.8, gardener: 1.8 } },
  /** By a stop, away from the shops: nearly everyone rides. */
  station: { traits: { rider: 4, driver: 0.2 } },
  /** By a high school or a university: helpful people who want desk work. */
  campus: { traits: { helper: 2.5, rider: 1.8 }, liking: { commercial: 0.5, industrial: 0.05 } },
  /** Out on their own, far from shops and services: everyone drives. */
  suburb: { traits: { driver: 3.5, rider: 0.1, gardener: 1.5 } },
};
/**
 * Where a home has to stand to be of each kind; checked in this order when it is built: by the
 * factories (worker), on the water (riverside), by a park (garden), in reach of a high school
 * or a university (campus), on expensive land (villa), next door to a shop (downtown), in reach
 * of a stop (station), far from everything (suburb). A lot that fits none is an ordinary home.
 */
export const homeSites = {
  /** Pollution on the lot, or a factory lot within this many tiles. */
  worker: { smog: 12, factoryWithin: 3 },
  /** What parks add to the lot's land value; a big park nearby also counts. */
  garden: { green: 10 },
  /** Land value on the lot. */
  villa: { value: 70 },
  /** No service or stop in reach, and no shop lot within this many tiles. */
  suburb: { shopsBeyond: 6 },
};

/** How common each trait is, and what it does. Most people have none. */
export const traits = {
  /** Pays this many times the usual resident's tax. */
  rich: { share: 0.1, taxTimes: 2 },
  /** Never takes the bus or the metro. */
  driver: { share: 0.1 },
  /** Rides whenever a line goes from home to work, however slow it is. */
  rider: { share: 0.1 },
  /** Each one cuts the daily chance of fires, thefts and illness by `calm`, up to `most` in all. */
  helper: { share: 0.08, calm: 0.01, most: 0.5 },
  /** Each one adds `value` to the land value of the home, up to `most` per home. */
  gardener: { share: 0.08, value: 2, most: 6 },
};

export interface Resident {
  name: string;
  trait?: Trait;
  /** Their age on the day they moved in. */
  age: number;
  /** The kind of workplace they would rather work at, if they care. */
  liking?: Exclude<Zone, 'residential'>;
}

/** People move in aged `youngest` up to `oldest`; this share would rather work in each kind of place. */
export const people = { youngest: 20, oldest: 59, liking: { commercial: 0.25, industrial: 0.2 } };

const SURNAMES = [...'陳林黃張李王吳劉蔡楊許鄭謝郭洪曾邱廖賴周徐蘇葉莊呂江何蕭羅高'];
const GIVEN_NAMES = [
  '志明', '淑芬', '家豪', '怡君', '俊傑', '雅婷', '建宏', '美玲', '冠宇', '佩珊',
  '承恩', '詩涵', '宗翰', '欣怡', '柏翰', '筱涵', '文雄', '秀英', '信宏', '惠雯',
  '子軒', '品妤', '宇翔', '思妤', '國華', '麗華', '彥廷', '郁婷', '明哲', '佳穎',
  '阿土', '春嬌', '大同', '小玉', '金水', '月娥', '添財', '素貞', '榮發', '寶珠',
];

/** A 32-bit mix of the seed, the home and the place in it. */
function mix(seed: number, home: number, place: number, salt: number): number {
  let hash = Math.imul(seed ^ Math.imul(home + 1, 0x9e3779b1) ^ Math.imul(place + 1, 0x85ebca6b) ^
    Math.imul(salt + 1, 0xc2b2ae35), 0x27d4eb2f);
  hash = Math.imul(hash ^ (hash >>> 15), 0x165667b1);
  return (hash ^ (hash >>> 13)) >>> 0;
}

/** The trait of the resident in a place of a home, if they have one. The home's kind shifts the odds. */
export function traitOf(seed: number, home: number, place: number, kind?: HomeKind): Trait | undefined {
  let left = mix(seed, home, place, 0) / 2 ** 32;
  for (const trait of TRAITS) {
    const share = traits[trait].share * (kind ? homeKinds[kind].traits[trait] ?? 1 : 1);
    if (left < share) return trait;
    left -= share;
  }
  return undefined;
}

export function residentAt(seed: number, home: number, place: number, kind?: HomeKind): Resident {
  const surname = SURNAMES[mix(seed, home, place, 1) % SURNAMES.length];
  const given = GIVEN_NAMES[mix(seed, home, place, 2) % GIVEN_NAMES.length];
  const { youngest, oldest } = people;
  const liking = (kind && homeKinds[kind].liking) || people.liking;
  const taste = mix(seed, home, place, 4) / 2 ** 32;
  return { name: surname + given, trait: traitOf(seed, home, place, kind),
    age: youngest + mix(seed, home, place, 3) % (oldest - youngest + 1),
    liking: taste < liking.commercial ? 'commercial' :
      taste < liking.commercial + liking.industrial ? 'industrial' : undefined };
}

/** How many residents in places `from` up to but not including `to` of a home have the trait. */
export function countTrait(seed: number, home: number, from: number, to: number, trait: Trait): number {
  let count = 0;
  for (let place = from; place < to; place++) if (traitOf(seed, home, place) === trait) count++;
  return count;
}

/**
 * Children. A home with two or more adults may have one or two, decided by the seed and the
 * home; homes with a garden, in the suburbs or by a school have them more often. They are not
 * residents: they take no room, pay no tax and hold no job. They grow a year older each year
 * and are gone from the list once they are past `oldest`.
 */
export const family = { none: 0.4, one: 0.35, keen: ['suburb', 'garden', 'campus'] as readonly HomeKind[],
  keenShift: 0.3, youngest: 1, span: 12, oldest: 17 };
const CHILD_NAMES = ['小明', '小華', '安安', '樂樂', '小美', '阿寶', '妞妞', '小傑', '恩恩', '彤彤', '小宇', '糖糖'];

export function childrenAt(seed: number, home: number, kind: HomeKind | undefined, adults: number,
  surname: string, years: number): { name: string; age: number }[] {
  if (adults < 2) return [];
  let luck = mix(seed, home, 0, 7) / 2 ** 32;
  if (kind && family.keen.includes(kind)) luck = luck * (1 - family.keenShift) + family.keenShift;
  const count = luck < family.none ? 0 : luck < family.none + family.one ? 1 : 2;
  const children: { name: string; age: number }[] = [];
  for (let child = 0; child < count; child++) {
    const age = family.youngest + mix(seed, home, child, 8) % family.span + years;
    if (age <= family.oldest) {
      children.push({ name: surname + CHILD_NAMES[mix(seed, home, child, 9) % CHILD_NAMES.length], age });
    }
  }
  return children;
}
