export const calendar = { ticksPerDay: 1, daysPerMonth: 30, monthsPerYear: 12 };

export interface GameDate { year: number; month: number; day: number }

/** The game date at a tick; the city is founded on day 1 of month 1, year 1. */
export function dateAt(tick: number): GameDate {
  const days = Math.floor(tick / calendar.ticksPerDay);
  const months = Math.floor(days / calendar.daysPerMonth);
  return {
    year: Math.floor(months / calendar.monthsPerYear) + 1,
    month: months % calendar.monthsPerYear + 1,
    day: days % calendar.daysPerMonth + 1,
  };
}
