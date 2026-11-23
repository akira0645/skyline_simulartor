export type ResidentGender = 'male' | 'female';

/** Stable legacy assignment: independent of name, address, display order and reload. */
export function legacyGender(id: number): ResidentGender {
  const hash = Math.imul(id + 1, 0x45d9f3b);
  return ((hash ^ (hash >>> 16)) >>> 0) % 2 ? 'female' : 'male';
}
export const genderNames: Record<ResidentGender, string> = { male: '男', female: '女' };
