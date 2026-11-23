import { clearRoadAdvance, RoadOccupancy, type RoadBody } from '../simulation/RoadOccupancy';
import { followingSpeed } from '../simulation/RoadFollowing';

/** The art preview uses the game's body geometry rather than independent clock/modulo motion. */
export class PreviewTraffic {
  readonly vehicles: RoadBody[] = [
    { index: 0, x: 44 / 32, y: 63 / 32, hx: 1, hy: 0, length: 12 / 32, width: 8 / 32 },
    { index: 1, x: 224 / 32, y: 79 / 32, hx: -1, hy: 0, length: 14 / 32, width: 8 / 32 },
    { index: 2, x: 190 / 32, y: 79 / 32, hx: -1, hy: 0, length: 18 / 32, width: 9 / 32 },
  ];
  private readonly occupancy = new RoadOccupancy();
  advance(elapsed: number): void {
    if (!Number.isFinite(elapsed) || elapsed <= 0) return;
    // Advance all vehicles together in bounded steps, including after a long inspection pause.
    let remaining = elapsed;
    while (remaining > 0) {
      const dt = Math.min(50, remaining);
      this.occupancy.reset(this.vehicles);
      for (const vehicle of this.vehicles) {
        const free = (vehicle.index === 2 ? 1 / 75 : 1 / 60) / 32;
        vehicle.speed = followingSpeed(vehicle, vehicle.speed ?? free, free, dt, this.occupancy);
        const desired = vehicle.x + vehicle.hx * dt * vehicle.speed;
        const accepted = clearRoadAdvance(vehicle.x, desired, x => ({ ...vehicle, x }), this.occupancy);
        if (Math.abs(accepted - desired) > 1e-6) vehicle.speed = 0;
        vehicle.x = accepted;
        if (vehicle.x < -24 / 32 || vehicle.x > 280 / 32) {
          const wrapped = { ...vehicle, x: vehicle.hx > 0 ? -24 / 32 : 280 / 32 };
          if (this.occupancy.canOccupy(wrapped)) vehicle.x = wrapped.x;
        }
        this.occupancy.add(vehicle);
      }
      remaining -= dt;
    }
  }
}
