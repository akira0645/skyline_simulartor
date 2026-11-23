import { type RoadBody, type RoadOccupancy } from './RoadOccupancy';

/** IDM in the game's tile/ms units. Real-road metre/second parameter values are not copied. */
export function followingSpeed(body: RoadBody, speed: number, desired: number, elapsed: number,
  occupancy: RoadOccupancy, stopDistance = Infinity): number {
  if (elapsed <= 0) return speed;
  if (desired <= 0) return 0;
  const leader = occupancy.leader(body);
  let gap = leader?.gap ?? Infinity, aheadSpeed = leader?.speed ?? 0;
  if (stopDistance < gap) { gap = stopDistance; aheadSpeed = 0; }
  const v = Math.max(0, speed);
  const acceleration = 0.000008, braking = 0.00002, headway = 80, standstill = 1 / 64;
  const wanted = standstill + Math.max(0, v * headway + v * (v - aheadSpeed) / (2 * Math.sqrt(acceleration * braking)));
  const interaction = Number.isFinite(gap) ? (wanted / Math.max(0.0001, gap)) ** 2 : 0;
  const change = Math.max(-braking, acceleration * (1 - (v / desired) ** 4 - interaction));
  const next = Math.max(0, Math.min(desired, v + change * elapsed));
  return next < 1e-6 ? 0 : next;
}
