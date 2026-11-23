import type { SimulationEngine } from './SimulationEngine';
import { SIM_TICK_MS, MOTION_SCALE } from './TravelTiming';

export type SimulationSpeed = 0 | 0.25 | 0.5 | 1 | 2 | 4;
export const TICK_MS = SIM_TICK_MS;
export const MAX_TICKS_PER_POLL = 4;
export const SUSPEND_GAP_MS = 15000;

export class SimulationClock {
  speed: SimulationSpeed = 1;
  private accumulated = 0;
  private freightProgress = 0;
  suspended = false;
  interrupted = false;

  constructor(private readonly engine: SimulationEngine) { this.reset(); }

  /** The fraction of the next tick that has already elapsed. */
  get tickProgress(): number {
    return Math.min(1, this.accumulated / TICK_MS);
  }

  /** Restore the saved fractional clock rather than replaying partial freight time after loading. */
  reset(): void {
    // Older demo saves start freight at zero even when the city starts years later.
    const already = this.engine.city.shipments.elapsedMs % TICK_MS;
    this.accumulated = Math.max(0, Math.min(TICK_MS - 1e-8, already));
    this.freightProgress = this.accumulated;
  }

  advance(elapsedMs: number): number {
    if (!Number.isFinite(elapsedMs) || elapsedMs < 0 || this.suspended || this.speed === 0) {
      return this.engine.getSnapshot().tick;
    }
    if (elapsedMs > SUSPEND_GAP_MS) {
      this.interrupted = true;
      this.speed = 0;
      return this.engine.getSnapshot().tick;
    }
    this.accumulated += elapsedMs * this.speed / MOTION_SCALE;
    const ticks = Math.min(MAX_TICKS_PER_POLL, Math.floor((this.accumulated + 1e-8) / TICK_MS));
    for (let tick = 0; tick < ticks; tick++) {
      this.engine.city.advanceFreight(TICK_MS - this.freightProgress);
      this.engine.advance(1, false);
      this.accumulated = Math.max(0, this.accumulated - TICK_MS);
      if (this.accumulated < 1e-8) this.accumulated = 0;
      this.freightProgress = 0;
    }
    const progress = Math.min(TICK_MS, this.accumulated);
    this.engine.city.advanceFreight(Math.max(0, progress - this.freightProgress));
    this.freightProgress = progress;
    this.engine.city.advanceVisitTime(this.engine.getSnapshot().tick + this.tickProgress);
    return this.engine.getSnapshot().tick;
  }
}
