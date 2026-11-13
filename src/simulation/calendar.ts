/** A tick is three game hours. The city is founded at 06:00, so the first commute is in view. */
export const calendar = { ticksPerDay: 8, startHour: 6, daysPerMonth: 30, monthsPerYear: 12 };

export interface GameDate { year: number; month: number; day: number }

const hoursAt = (tick: number, tickProgress: number) =>
  calendar.startHour + (tick + tickProgress) * 24 / calendar.ticksPerDay;

/** The game date at a tick; the city is founded on day 1 of month 1, year 1. */
export function dateAt(tick: number): GameDate {
  const days = Math.floor(hoursAt(tick, 0) / 24);
  const months = Math.floor(days / calendar.daysPerMonth);
  return {
    year: Math.floor(months / calendar.monthsPerYear) + 1,
    month: months % calendar.monthsPerYear + 1,
    day: days % calendar.daysPerMonth + 1,
  };
}

/** The hour of the day, 0 to 24, at a tick plus the fraction of the next tick already elapsed. */
export function hourAt(tick: number, tickProgress = 0): number {
  return hoursAt(tick, tickProgress) % 24;
}
