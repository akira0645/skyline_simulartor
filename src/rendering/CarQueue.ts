export interface RoadCar { x: number; y: number; hx: number; hy: number; index: number }
/** The previous frame's lane occupancy, indexed by tile rather than scanned for every car. */
export class CarQueue {
  private readonly buckets = new Map<string, RoadCar[]>();
  reset(cars: readonly RoadCar[]): void {
    this.buckets.clear();
    for (const car of cars) this.add(car);
  }
  add(car: RoadCar): void {
    const key = `${Math.floor(car.x)},${Math.floor(car.y)}`;
    const bucket = this.buckets.get(key);
    if (bucket) bucket.push(car); else this.buckets.set(key, [car]);
  }
  ahead(x: number, y: number, hx: number, hy: number, self: number, reach = 0.48): boolean {
    const radius = Math.ceil(reach);
    for (let by = Math.floor(y) - radius; by <= Math.floor(y) + radius; by++) {
      for (let bx = Math.floor(x) - radius; bx <= Math.floor(x) + radius; bx++) {
        for (const other of this.buckets.get(`${bx},${by}`) ?? []) {
          if (other.index === self || other.hx !== hx || other.hy !== hy) continue;
          const dx = other.x - x;
          const dy = other.y - y;
          if (Math.abs(dx * hy - dy * hx) > 0.14) continue;
          const forward = dx * hx + dy * hy;
          if (forward > 0.03 && forward < reach || Math.abs(forward) <= 0.03 && other.index < self) return true;
        }
      }
    }
    return false;
  }
}
