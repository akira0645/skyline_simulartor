import { calendar } from './calendar';
import { residentAt, TRAITS, type HomeKind, type Resident, type Trait } from './Residents';

export const YEAR_TICKS = calendar.ticksPerDay * calendar.daysPerMonth * calendar.monthsPerYear;
export interface ResidentIdentity {
  id: number;
  name: string;
  born: number;
  trait?: Trait;
  liking?: Resident['liking'];
}
export function createIdentity(id: number, seed: number, home: number, slot: number, came: number, kind?: HomeKind): ResidentIdentity {
  const who = residentAt(seed, home, slot, kind);
  return { id, name: who.name, born: came - who.age * YEAR_TICKS, trait: who.trait, liking: who.liking };
}
export function identityAt(identity: ResidentIdentity, tick: number): Resident {
  return { name: identity.name, age: Math.floor((tick - identity.born) / YEAR_TICKS),
    trait: identity.trait, liking: identity.liking };
}
export function parseIdentity(value: unknown): ResidentIdentity | undefined {
  if (value === undefined) return undefined;
  const item = value as ResidentIdentity;
  if (!item || !Number.isSafeInteger(item.id) || item.id < 0 || typeof item.name !== 'string' ||
      !item.name.length || item.name.length > 80 || !Number.isSafeInteger(item.born) ||
      (item.trait !== undefined && !TRAITS.includes(item.trait)) ||
      (item.liking !== undefined && item.liking !== 'commercial' && item.liking !== 'industrial')) {
    throw new Error('存檔資料損壞。');
  }
  return { id: item.id, name: item.name, born: item.born, trait: item.trait, liking: item.liking };
}
