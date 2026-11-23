import residents from '../assets/street/residents.json';

/** Stable resident identity, never a route index, home address or display order. */
export function residentAppearance(seed: number, id: number, age: number): number {
  let hash = Math.imul((id + 1) ^ seed, 0x45d9f3b);
  hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b);
  const variant = ((hash ^ (hash >>> 16)) >>> 0) % residents.variants;
  const group = age < 18 ? 0 : age >= 65 ? 2 : 1;
  return group * residents.variants + variant;
}

export function residentSprite(profile: number, direction: number, phase: number) {
  const [width, height] = residents.frame;
  const safe = ((profile % (residents.variants * residents.ages.length)) + residents.variants * residents.ages.length) %
    (residents.variants * residents.ages.length);
  return { x: (safe * residents.directions + direction) * width, y: phase * height, width, height };
}
