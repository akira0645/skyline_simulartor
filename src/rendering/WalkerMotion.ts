export interface WalkerPose {
  x: number;
  y: number;
  time: number;
  distance: number;
  heading: number;
  walking: boolean;
}

/** Art-only state: footsteps advance with world displacement, never the wall clock. */
export class WalkerMotion {
  private readonly actors = new Map<string, WalkerPose>();
  private lastPrune = 0;

  update(key: string, x: number, y: number, time: number, initialHeading = Math.PI / 2): WalkerPose {
    const before = this.actors.get(key);
    const dx = before ? x - before.x : 0;
    const dy = before ? y - before.y : 0;
    const moved = Math.hypot(dx, dy);
    if (before && time === before.time && moved < 1e-6) return before;
    const continuous = before && time >= before.time && time - before.time <= 2500 && moved <= 32;
    const walking = !!continuous && moved > 0.001;
    let heading = continuous ? before.heading : initialHeading;
    if (walking) {
      // Keep the previous facing near a diagonal; tiny corner samples must not flip it each frame.
      if (Math.abs(dx) > Math.abs(dy) * 1.15) heading = dx > 0 ? 0 : Math.PI;
      else if (Math.abs(dy) > Math.abs(dx) * 1.15) heading = dy > 0 ? Math.PI / 2 : -Math.PI / 2;
    }
    const pose = { x, y, time, distance: continuous ? before.distance + moved : 0, heading, walking };
    this.actors.set(key, pose);
    if (time - this.lastPrune > 10000 || time < this.lastPrune) {
      for (const [id, actor] of this.actors) if (time - actor.time > 10000 || time < actor.time) this.actors.delete(id);
      this.lastPrune = time;
    }
    return pose;
  }
}
