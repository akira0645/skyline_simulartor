import type { Zone } from './TileMap';

/**
 * The four shifts, in the order `shiftIndex` numbers them. People on different shifts use the
 * roads at different hours, so their traffic does not add up.
 */
export const shifts = [
  { title: '工廠早班', start: 6, end: 14 },
  { title: '工廠晚班', start: 16, end: 24 },
  { title: '店鋪', start: 11, end: 20 },
  { title: '辦公室', start: 9, end: 17 },
] as const;

/** Commuters are on the road for this many hours before their shift and after it. */
export const RUSH_HOURS = 2;

/** Which shift a workplace runs, from its zone and tile. */
export const shiftIndex = (zone: Zone, id: number) => (zone === 'industrial' ? 0 : 2) + id % 2;

export function workShift(zone: Zone, id: number) {
  return shifts[shiftIndex(zone, id)];
}

/** The shifts whose workers are travelling at this hour of the day. */
export function rushShifts(hour: number): number[] {
  return shifts.flatMap(({ start, end }, index) => {
    const sinceStart = (hour - start + 24) % 24;
    const duration = end - start;
    return sinceStart >= 24 - RUSH_HOURS || (sinceStart >= duration && sinceStart < duration + RUSH_HOURS) ?
      [index] : [];
  });
}

export function shiftPhase(hour: number, start: number, end: number, travelHours: number) {
  const sinceStart = (hour - start + 24) % 24;
  const duration = end - start;
  if (sinceStart < duration) return { atWork: true };
  if (sinceStart < duration + travelHours) {
    return { atWork: false, returning: true, progress: 1 - (sinceStart - duration) / travelHours };
  }
  if (sinceStart >= 24 - travelHours) return { atWork: false, progress: 1 - (24 - sinceStart) / travelHours };
  return { atWork: false };
}
