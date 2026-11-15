import { expect, it } from 'vitest';
import { planFacilityVisits, type CivicVisitContext } from './CivicVisits';
import { eating, eatingOf, fatigueAt, hungerAt, mealPlan, needs, socialAt, type Needs } from './Needs';
import { RoadGraph } from './RoadGraph';
import { TileMap } from './TileMap';

const atHome = { lunchOut: false, dinnerOut: false };

it('makes people hungry between meals and full after them', () => {
  expect(hungerAt(7, atHome, []).hunger).toBe(0);
  expect(hungerAt(11, atHome, []).hunger).toBe(40);
  expect(hungerAt(12, atHome, []).hunger).toBe(0);
  expect(hungerAt(18, atHome, []).hunger).toBe(60);
  // A night's sleep counts for little, so nobody wakes up starving.
  expect(hungerAt(6, atHome, []).hunger).toBeLessThan(needs.hungry);
  // Someone who eats at home never goes looking for food.
  for (let hour = 0; hour < 24; hour++) expect(hungerAt(hour, atHome, []).wantsFood).toBe(false);
});

it('sends someone who means to eat out looking for food until they have eaten or given up', () => {
  const out = { lunchOut: false, dinnerOut: true };
  expect(hungerAt(16, out, []).wantsFood).toBe(false);
  expect(hungerAt(17, out, []).wantsFood).toBe(true);
  expect(hungerAt(20, out, []).wantsFood).toBe(true);
  expect(hungerAt(20, out, []).hunger).toBe(80);
  // Reaching a place with food at half past six settles it.
  expect(hungerAt(20, out, [18.5])).toEqual({ hunger: 15, wantsFood: false });
  // With nowhere to go they make do at home when the dinner hours end.
  expect(hungerAt(21, out, [])).toEqual({ hunger: 0, wantsFood: false });
});

it('plans meals out for some people on some days, the same way every time', () => {
  const days = Array.from({ length: 400 }, (_, day) => mealPlan(7, 12, day));
  const share = days.filter(plan => plan.dinnerOut).length / days.length;
  const usual = eating[eatingOf(7, 12)].dinner;
  expect(share).toBeGreaterThan(usual - 0.1);
  expect(share).toBeLessThan(usual + 0.1);
  expect(mealPlan(7, 12, 33)).toEqual(mealPlan(7, 12, 33));
  expect(days.some((plan, day) => plan.dinnerOut !== mealPlan(7, 13, day).dinnerOut)).toBe(true);
});

it('tires people with long days, long trips, children and age', () => {
  const office = { start: 9, end: 17, minutes: 10 };
  expect(fatigueAt(3, office, 0, false)).toBe(0);
  expect(fatigueAt(19, office, 0, false)).toBeLessThan(needs.tired);
  // The same job at the end of a long road, with two children at home, leaves nothing for the evening.
  expect(fatigueAt(19, { ...office, minutes: 45 }, 2, false)).toBeGreaterThanOrEqual(needs.tired);
  // A day off is restful, and so is retirement until late.
  expect(fatigueAt(19, undefined, 0, false)).toBeLessThan(60);
  expect(fatigueAt(19, undefined, 0, true)).toBeLessThan(needs.tired);
  // The evening shift gets up later and is still up after midnight.
  expect(fatigueAt(1, { start: 16, end: 24, minutes: 10 }, 0, false)).toBeGreaterThan(fatigueAt(15, { start: 16, end: 24, minutes: 10 }, 0, false));
});

it('makes people want company the longer they go without meeting anyone', () => {
  expect(socialAt(10, undefined, 10)).toBe(0);
  expect(socialAt(10, 10, 0)).toBe(0);
  expect(socialAt(12, 10, 0)).toBeLessThan(needs.lonely);
  expect(socialAt(15, 10, 0)).toBeGreaterThanOrEqual(needs.lonely);
  expect(socialAt(400, undefined, 0)).toBe(100);
});

/** A home between a market and a culture centre, at one in the afternoon when both are open. */
function street(slot: number, state?: Partial<Needs>) {
  const map = new TileMap();
  map.execute({ type: 'SET_ZONE', tiles: [{ x: 1, y: 1 }], zone: 'residential' });
  map.execute({ type: 'BUILD_ROAD', path: [{ x: 1, y: 2 }, { x: 2, y: 2 }] });
  map.execute({ type: 'BUILD_SERVICE', x: 2, y: 1, service: 'market' });
  map.execute({ type: 'BUILD_SERVICE', x: 1, y: 3, service: 'culture' });
  const context: CivicVisitContext = { map, roadGraph: new RoadGraph(map), clock: 7 / 3, seed: 1,
    health: () => undefined, available: () => true,
    buildings: new Map([[129, { id: 129, capacity: 4, occupants: 1, level: 1, nextSlot: slot + 1,
      people: [{ slot, job: -1, came: 0, hired: 0 }] }]]),
    daycareSeats: new Map(), hasCombo: () => false, kidsAt: () => [], ageOf: () => 30,
    roadAccess: () => ({ x: 1, y: 2 }),
    needs: state && { tired: () => !!state.tired, wantsFood: () => !!state.wantsFood, lonely: () => !!state.lonely } };
  return planFacilityVisits(context, 13, () => true);
}

it('puts what a resident lacks ahead of whose turn it is', () => {
  // Outings take turns, so of three neighbours one would see the exhibition at this hour and the others shop.
  const reader = [0, 1, 2].find(slot => street(slot)[0]?.doing === 'exhibition')!;
  expect(reader).toBeDefined();
  expect(street(reader, {}).map(visit => visit.doing)).toEqual(['exhibition']);
  expect(street(reader, {})[0].reason).not.toBe('hungry');
  // Hungry and meaning to eat out, they go to the market instead, and says why.
  expect(street(reader, { hunger: 60, wantsFood: true }).map(visit => [visit.doing, visit.reason])).toEqual([['shopping', 'hungry']]);
  // Worn out, they stay in.
  expect(street(reader, { fatigue: 90, tired: true })).toEqual([]);
});
