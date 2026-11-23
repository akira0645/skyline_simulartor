import residents from '../assets/street/residents.json';
import { legacyGender, type ResidentGender } from '../simulation/ResidentGender';
const looksByGender = {
  male: residents.looks.flatMap((look, index) => look.gender === 'male' ? [index] : []),
  female: residents.looks.flatMap((look, index) => look.gender === 'female' ? [index] : []),
};

/** Stable resident identity, never a route index, home address or display order. */
export function residentAppearance(seed: number, id: number, age: number, gender: ResidentGender = legacyGender(id)): number {
  let hash = Math.imul((id + 1) ^ seed, 0x45d9f3b);
  hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b);
  const variants = looksByGender[gender];
  const variant = variants[((hash ^ (hash >>> 16)) >>> 0) % variants.length];
  const group = age < 18 ? 0 : age >= 65 ? 2 : 1;
  return group * residents.variants + variant;
}

export function residentSprite(profile: number, direction: number, phase: number) {
  const [width, height] = residents.frame;
  const safe = ((profile % (residents.variants * residents.ages.length)) + residents.variants * residents.ages.length) %
    (residents.variants * residents.ages.length);
  return { x: (safe * residents.directions + direction) * width, y: phase * height, width, height };
}
