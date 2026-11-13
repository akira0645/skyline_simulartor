import type { Zone } from './TileMap';

export function workShift(zone: Zone, id: number) {
  if (zone === 'industrial') {
    return id % 2 ? { title: '工廠晚班', start: 16, end: 24 } : { title: '工廠早班', start: 6, end: 14 };
  }
  return id % 2 ? { title: '辦公室', start: 9, end: 17 } : { title: '店鋪', start: 11, end: 20 };
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

export function gameHour(dayProgress: number) {
  return (7 + dayProgress * 24) % 24;
}
