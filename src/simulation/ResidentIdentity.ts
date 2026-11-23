import { calendar } from './calendar';
import { genderForGeneratedName, residentAt, TRAITS, type HomeKind, type Resident, type Trait } from './Residents';
import { legacyGender, type ResidentGender } from './ResidentGender';

export const YEAR_TICKS = calendar.ticksPerDay * calendar.daysPerMonth * calendar.monthsPerYear;
export interface ResidentIdentity {
  id: number;
  name: string;
  born: number;
  gender?: ResidentGender;
  trait?: Trait;
  liking?: Resident['liking'];
}
export function identityGender(identity: ResidentIdentity): ResidentGender {
  return identity.gender ?? genderForGeneratedName(identity.name) ?? legacyGender(identity.id);
}
export function createIdentity(id: number, seed: number, home: number, slot: number, came: number, kind?: HomeKind): ResidentIdentity {
  const who = residentAt(seed, home, slot, kind);
  return { id, name: who.name, born: came - who.age * YEAR_TICKS, gender: who.gender, trait: who.trait, liking: who.liking };
}
export function identityAt(identity: ResidentIdentity, tick: number): Resident {
  return { name: identity.name, gender: identityGender(identity), age: Math.floor((tick - identity.born) / YEAR_TICKS),
    trait: identity.trait, liking: identity.liking };
}
export function parseIdentity(value: unknown): ResidentIdentity | undefined {
  if (value === undefined) return undefined;
  const item = value as ResidentIdentity;
  if (!item || !Number.isSafeInteger(item.id) || item.id < 0 || typeof item.name !== 'string' ||
      !item.name.length || item.name.length > 80 || !Number.isSafeInteger(item.born) ||
      (item.gender !== undefined && item.gender !== 'male' && item.gender !== 'female') ||
      (item.trait !== undefined && !TRAITS.includes(item.trait)) ||
      (item.liking !== undefined && item.liking !== 'commercial' && item.liking !== 'industrial')) {
    throw new Error('存檔資料損壞。');
  }
  return { id: item.id, name: item.name, born: item.born, gender: identityGender(item), trait: item.trait, liking: item.liking };
}
