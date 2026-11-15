import { expect, it } from 'vitest';
import { demoCity } from '../app/demoCity';
import { calendar } from './calendar';
import { birthdayOf } from './Needs';
import { SimulationEngine } from './SimulationEngine';
import { stayTicks, type FacilityVisit } from './VisitSystem';

it('gives everyone a birthday that stays theirs, spread over the year', () => {
  const days = new Set<number>();
  for (let person = 0; person < 2000; person++) {
    const day = birthdayOf(5, person);
    expect(day).toBeGreaterThanOrEqual(0);
    expect(day).toBeLessThan(calendar.daysPerMonth * calendar.monthsPerYear);
    days.add(day);
  }
  expect(days.size).toBeGreaterThan(300);
  expect(birthdayOf(5, 31)).toBe(birthdayOf(5, 31));
});

it('draws people to the bakery, the florist, the cake shop and the night market, each for its own reason', () => {
  const engine = new SimulationEngine({ version: 1, seed: 42, tick: 0 });
  demoCity(engine, 'small');
  const city = engine.city;
  const plans: FacilityVisit[] = [];
  const start = city.visits.start.bind(city.visits);
  city.visits.start = (visits, tick) => { plans.push(...visits); start(visits, tick); };
  engine.advance(14 * calendar.ticksPerDay);
  const went = (doing: string) => plans.filter(plan => plan.doing === doing);
  for (const [doing, tile] of [['bakery', 'bakery'], ['flowers', 'florist'], ['cake', 'cakeshop']] as const) {
    expect(went(doing).length).toBeGreaterThan(20);
    expect(went(doing).every(plan => city.map.at(plan.destination) === tile)).toBe(true);
  }
  // Bread is bought for itself or because a meal out is wanted; a cake as a treat or for a birthday at home.
  expect(new Set(went('bakery').map(plan => plan.reason))).toEqual(new Set(['bread', 'hungry']));
  expect(went('cake').some(plan => plan.reason === 'birthday')).toBe(true);
  expect(went('cake').some(plan => plan.reason === 'treat')).toBe(true);
  // The night market is open long enough for a visit to fit, and those who cook get to market.
  expect(went('nightmarket').length).toBeGreaterThan(0);
  expect(plans.filter(plan => plan.reason === 'groceries').length).toBeGreaterThan(20);
  expect(stayTicks('cake')).toBeLessThan(stayTicks('nightmarket'));
});
