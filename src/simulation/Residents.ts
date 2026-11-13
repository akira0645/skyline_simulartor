/**
 * The people of the city. Nobody is stored: the resident in a given place of a given home is
 * worked out from the city's seed, so the same city always has the same people. A home with
 * five residents has the people in places 0 to 4; whoever moved in last is the first to leave.
 */
export type Trait = 'rich' | 'driver' | 'rider' | 'helper' | 'gardener';

export const TRAITS: readonly Trait[] = ['rich', 'driver', 'rider', 'helper', 'gardener'];

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
}

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

/** The trait of the resident in a place of a home, if they have one. */
export function traitOf(seed: number, home: number, place: number): Trait | undefined {
  let left = mix(seed, home, place, 0) / 2 ** 32;
  for (const trait of TRAITS) {
    if (left < traits[trait].share) return trait;
    left -= traits[trait].share;
  }
  return undefined;
}

export function residentAt(seed: number, home: number, place: number): Resident {
  const surname = SURNAMES[mix(seed, home, place, 1) % SURNAMES.length];
  const given = GIVEN_NAMES[mix(seed, home, place, 2) % GIVEN_NAMES.length];
  return { name: surname + given, trait: traitOf(seed, home, place) };
}

/** How many residents in places `from` up to but not including `to` of a home have the trait. */
export function countTrait(seed: number, home: number, from: number, to: number, trait: Trait): number {
  let count = 0;
  for (let place = from; place < to; place++) if (traitOf(seed, home, place) === trait) count++;
  return count;
}
