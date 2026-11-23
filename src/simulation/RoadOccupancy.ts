/** Road geometry uses tile units. Dimensions include the visible vehicle's outline. */
export interface RoadBody {
  x: number; y: number; hx: number; hy: number; index: number;
  length?: number; width?: number;
  /** Tiles per simulation millisecond; omitted bodies are treated as stationary. */
  speed?: number;
}
export const CAR_LENGTH = 15 / 32;
export const CAR_WIDTH = 9 / 32;
const GAP = 1 / 32;
// Map tile coordinates fit signed 16-bit integers, including off-map query margins.
const bucketKey = (x: number, y: number) => (x & 0xffff) | ((y & 0xffff) << 16);

/** Separating-axis test for two oriented vehicle rectangles, including a small safety gap. */
export function bodiesOverlap(a: RoadBody, b: RoadBody): boolean {
  const an = Math.hypot(a.hx, a.hy) || 1, bn = Math.hypot(b.hx, b.hy) || 1;
  const ax = a.hx / an, ay = a.hy / an, bx = b.hx / bn, by = b.hy / bn;
  const dot = Math.abs(ax * bx + ay * by), cross = Math.abs(ax * by - ay * bx);
  const al = (a.length ?? CAR_LENGTH) / 2, aw = (a.width ?? CAR_WIDTH) / 2;
  const bl = (b.length ?? CAR_LENGTH) / 2, bw = (b.width ?? CAR_WIDTH) / 2;
  const dx = b.x - a.x, dy = b.y - a.y;
  return Math.abs(dx * ax + dy * ay) < al + bl * dot + bw * cross + GAP &&
    Math.abs(-dx * ay + dy * ax) < aw + bl * cross + bw * dot + GAP &&
    Math.abs(dx * bx + dy * by) < bl + al * dot + aw * cross + GAP &&
    Math.abs(-dx * by + dy * bx) < bw + al * cross + aw * dot + GAP;
}

/** Occupancy is updated immediately after each accepted move, including between tile buckets. */
export class RoadOccupancy {
  private readonly bodies = new Map<number, RoadBody>();
  private readonly buckets = new Map<number, Set<number>>();
  reset(cars: readonly RoadBody[]): void {
    this.bodies.clear(); this.buckets.clear();
    for (const car of cars) this.add(car);
  }
  add(car: RoadBody): void {
    const before = this.bodies.get(car.index);
    if (before) this.buckets.get(bucketKey(Math.floor(before.x), Math.floor(before.y)))?.delete(car.index);
    this.bodies.set(car.index, { ...car });
    const key = bucketKey(Math.floor(car.x), Math.floor(car.y));
    let bucket = this.buckets.get(key);
    if (!bucket) this.buckets.set(key, bucket = new Set());
    bucket.add(car.index);
  }
  remove(index: number): void {
    const before = this.bodies.get(index);
    if (!before) return;
    this.buckets.get(bucketKey(Math.floor(before.x), Math.floor(before.y)))?.delete(index);
    this.bodies.delete(index);
  }
  private *near(x: number, y: number, reach: number): Generator<RoadBody> {
    // Freight fleets have at most eight bodies. Scanning that small set is cheaper
    // than probing 9–25 grid buckets; callers still apply the exact geometry tests.
    if (this.bodies.size <= 8) { yield* this.bodies.values(); return; }
    const radius = Math.max(1, Math.ceil(reach));
    const floorX = Math.floor(x), floorY = Math.floor(y);
    for (let by = floorY - radius; by <= floorY + radius; by++) {
      for (let bx = floorX - radius; bx <= floorX + radius; bx++) {
        for (const id of this.buckets.get(bucketKey(bx, by)) ?? []) yield this.bodies.get(id)!;
      }
    }
  }
  ahead(x: number, y: number, hx: number, hy: number, self: number, reach = 0.48): boolean {
    for (const other of this.near(x, y, reach)) {
      if (other.index === self || other.hx * hx + other.hy * hy < 0.5) continue;
      const dx = other.x - x, dy = other.y - y;
      if (Math.abs(dx * hy - dy * hx) > 0.14) continue;
      const forward = dx * hx + dy * hy;
      const clearance = Math.max(reach, ((this.bodies.get(self)?.length ?? CAR_LENGTH) + (other.length ?? CAR_LENGTH)) / 2 + GAP);
      if (forward > 0.03 && forward < clearance || Math.abs(forward) <= 0.03 && other.index < self) return true;
    }
    return false;
  }
  /** Bumper clearance, not centre distance. Opposing lanes and rear traffic are excluded. */
  leader(body: RoadBody, reach = 2): { gap: number; speed: number } | undefined {
    if (!this.bodies.size || this.bodies.size === 1 && this.bodies.has(body.index)) return;
    let leader: { gap: number; speed: number } | undefined;
    for (const other of this.near(body.x, body.y, reach)) {
      if (other.index === body.index) continue;
      const dot = other.hx * body.hx + other.hy * body.hy;
      if (dot < 0.7) continue;
      const dx = other.x - body.x, dy = other.y - body.y;
      const forward = dx * body.hx + dy * body.hy;
      if (forward < -1e-6 || forward < 1e-6 && other.index > body.index) continue;
      const side = Math.abs(dx * body.hy - dy * body.hx);
      if (side > ((body.width ?? CAR_WIDTH) + (other.width ?? CAR_WIDTH)) / 2) continue;
      const cross = Math.abs(other.hx * body.hy - other.hy * body.hx);
      const gap = forward - (body.length ?? CAR_LENGTH) / 2 -
        ((other.length ?? CAR_LENGTH) * Math.abs(dot) + (other.width ?? CAR_WIDTH) * cross) / 2 - GAP;
      if (gap <= reach && (!leader || gap < leader.gap)) leader = { gap, speed: Math.max(0, other.speed ?? 0) * dot };
    }
    return leader;
  }
  canOccupy(candidate: RoadBody, origin?: RoadBody): boolean {
    if (!this.bodies.size || this.bodies.size === 1 && this.bodies.has(candidate.index)) return true;
    for (const other of this.near(candidate.x, candidate.y, candidate.length ?? CAR_LENGTH)) {
      if (other.index === candidate.index || !bodiesOverlap(candidate, other)) continue;
      // Previously overlapping saves may separate, but must never move deeper into a body.
      if (origin && bodiesOverlap(origin, other)) {
        const oldDistance = Math.hypot(origin.x - other.x, origin.y - other.y);
        const newDistance = Math.hypot(candidate.x - other.x, candidate.y - other.y);
        if (newDistance > oldDistance + 1e-7) continue;
      }
      return false;
    }
    return true;
  }
  canTravel(from: RoadBody, to: RoadBody): boolean {
    if (!this.bodies.size || this.bodies.size === 1 && this.bodies.has(to.index)) return true;
    const midX = (from.x + to.x) / 2, midY = (from.y + to.y) / 2;
    const halfX = Math.abs(to.x - from.x) / 2, halfY = Math.abs(to.y - from.y) / 2;
    const radius = Math.hypot(to.length ?? CAR_LENGTH, to.width ?? CAR_WIDTH) / 2;
    // A straight, non-rotating sweep is itself a rectangle. Reject parallel/opposing
    // lanes exactly before allocating and sampling intermediate oriented bodies.
    const straight = Math.abs(from.hx - to.hx) + Math.abs(from.hy - to.hy) < 1e-10 &&
      Math.abs((to.x - from.x) * to.hy - (to.y - from.y) * to.hx) < 1e-10;
    const swept = straight ? { ...to, x: midX, y: midY,
      length: (to.length ?? CAR_LENGTH) + Math.hypot(to.x - from.x, to.y - from.y) } : undefined;
    const candidates: RoadBody[] = [];
    // Query once per sweep, then reject distant bodies before doing any sampled SAT work.
    for (const other of this.near(midX, midY, Math.max(halfX, halfY) + radius + 0.5)) {
      if (other.index === to.index) continue;
      if (swept && !bodiesOverlap(swept, other)) continue;
      const reach = radius + Math.hypot(other.length ?? CAR_LENGTH, other.width ?? CAR_WIDTH) / 2 + GAP;
      if (Math.abs(other.x - midX) <= halfX + reach && Math.abs(other.y - midY) <= halfY + reach) candidates.push(other);
    }
    if (!candidates.length) return true;
    const start = Math.atan2(from.hy, from.hx), end = Math.atan2(to.hy, to.hx);
    const turn = Math.atan2(Math.sin(end - start), Math.cos(end - start));
    const count = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / 0.025), Math.ceil(Math.abs(turn) / 0.05));
    let before = from;
    for (let step = 1; step <= count; step++) {
      const t = step / count, angle = start + turn * t;
      const next = { ...to, x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t,
        hx: Math.cos(angle), hy: Math.sin(angle) };
      for (const other of candidates) {
        if (!bodiesOverlap(next, other)) continue;
        if (bodiesOverlap(before, other) &&
          Math.hypot(next.x - other.x, next.y - other.y) > Math.hypot(before.x - other.x, before.y - other.y) + 1e-7) continue;
        return false;
      }
      before = next;
    }
    return true;
  }
}

/** Sample the entire travelled path, including corners, so long frames cannot skip a vehicle. */
export function clearRoadAdvance(from: number, to: number, at: (progress: number) => RoadBody,
  occupancy: RoadOccupancy): number {
  if (to === from) return from;
  const count = Math.max(1, Math.ceil(Math.abs(to - from) / 0.025));
  let safe = from;
  for (let step = 1; step <= count; step++) {
    const next = from + (to - from) * step / count;
    if (!occupancy.canTravel(at(safe), at(next))) {
      let low = safe, high = next;
      for (let i = 0; i < 10; i++) {
        const middle = (low + high) / 2;
        if (occupancy.canTravel(at(low), at(middle))) low = middle; else high = middle;
      }
      return low;
    }
    safe = next;
  }
  return to;
}
