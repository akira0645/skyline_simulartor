import { calendar } from './calendar';
import { rainingAt } from './Seasons';
import type { Way } from './Mind';

export type Weather = 'clear' | 'rain' | 'heavy-rain';
export const weatherNames: Record<Weather, string> = { clear: '晴朗', rain: '下雨', 'heavy-rain': '大雨' };
const hash = (seed: number, salt: number) => {
  let value = Math.imul(seed ^ Math.imul(salt + 1, 0x9e3779b1), 0x85ebca6b);
  value = Math.imul(value ^ value >>> 16, 0xc2b2ae35);
  return (value ^ value >>> 13) >>> 0;
};
/** A deterministic daily forecast; seed and tick already travel with the save. */
export function weatherAt(seed: number, tick: number): Weather {
  if (!rainingAt(seed, tick)) return 'clear';
  return hash(seed, Math.floor(tick / calendar.ticksPerDay)) % 3 === 0 ? 'heavy-rain' : 'rain';
}
export function wantsOutdoor(seed: number, home: number, slot: number, tick: number): boolean {
  const weather = weatherAt(seed, tick);
  const roll = hash(seed ^ home ^ Math.imul(slot + 1, 2017), Math.floor(tick / calendar.ticksPerDay)) / 2 ** 32;
  return weather === 'clear' || roll < (weather === 'rain' ? 0.35 : 0.08);
}

/** No invented vehicle or transit connection. A short rainy bicycle journey can be walked. */
export function weatherTravel(weather: Weather, car: number, distance: number, ride?: Way): { way: Way; reason?: string } {
  if (ride) return { way: ride, reason: weather === 'clear' ? undefined : '下雨，搭大眾運輸減少淋雨' };
  if (distance < 5) return { way: 'walk', reason: weather === 'clear' ? undefined : '路程短，撐傘步行' };
  if (car >= 2) return { way: 'drive', reason: weather === 'clear' ? undefined : '下雨，開自己的車' };
  if (car === 1) return { way: 'scooter', reason: weather === 'clear' ? undefined : '沒有合適替代路線，穿雨衣騎機車' };
  if (weather !== 'clear' && distance <= 10) return { way: 'walk', reason: '不想淋雨騎車，改成撐傘走路' };
  return { way: 'bike', reason: weather === 'clear' ? undefined : '路程較遠、沒有替代交通，仍得騎車' };
}
