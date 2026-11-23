export interface ScreenPoint { x: number; y: number }
export interface PinchMove { from: ScreenPoint; to: ScreenPoint; ratio: number }

/** Once a second finger joins, suppress tool actions until every finger has lifted. */
export class MapPinch {
  private readonly points = new Map<number, ScreenPoint>();
  private consumed = false;
  get active(): boolean { return this.consumed; }
  start(id: number, point: ScreenPoint): void {
    this.points.set(id, point);
    if (this.points.size >= 2) this.consumed = true;
  }
  private pair(): { centre: ScreenPoint; distance: number } | undefined {
    const [a, b] = this.points.values();
    if (!a || !b) return;
    return { centre: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, distance: Math.hypot(b.x - a.x, b.y - a.y) };
  }
  move(id: number, point: ScreenPoint): PinchMove | undefined {
    if (!this.points.has(id)) return;
    const before = this.pair();
    this.points.set(id, point);
    const after = this.pair();
    if (!before || !after || before.distance < 1 || after.distance < 1) return;
    return { from: before.centre, to: after.centre, ratio: after.distance / before.distance };
  }
  end(id: number): boolean {
    const handled = this.consumed;
    this.points.delete(id);
    if (!this.points.size) this.consumed = false;
    return handled;
  }
}
