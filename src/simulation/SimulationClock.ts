import type { SimulationEngine } from './SimulationEngine';

export type SimulationSpeed = 0 | 0.25 | 0.5 | 1 | 2 | 4;
export const TICK_MS = 1000;
export const MAX_TICKS_PER_POLL = 4;
export const SUSPEND_GAP_MS = 15000;

export class SimulationClock {
  speed: SimulationSpeed = 1;
  private accumulated = 0;
  private freightProgress = 0;
  suspended = false;
  interrupted = false;

  constructor(private readonly engine: SimulationEngine) {}

  /** The fraction of the next tick that has already elapsed. */
  get tickProgress(): number {
    return Math.min(1, this.accumulated / TICK_MS);
  }

  /** Drops the partial tick, e.g. after a save is loaded. */
  reset(): void {
    this.accumulated = 0;
    this.freightProgress = 0;
  }

  advance(elapsedMs: number): number {
    if (!Number.isFinite(elapsedMs) || elapsedMs < 0 || this.suspended || this.speed === 0) {
      return this.engine.getSnapshot().tick;
    }
    if (elapsedMs > SUSPEND_GAP_MS) {
      this.interrupted = true;
      this.speed = 0;
      this.reset();
      return this.engine.getSnapshot().tick;
    }
    this.accumulated += elapsedMs * this.speed;
    const ticks = Math.min(MAX_TICKS_PER_POLL, Math.floor(this.accumulated / TICK_MS));
    for (let tick = 0; tick < ticks; tick++) {
      this.engine.city.advanceFreight(TICK_MS - this.freightProgress);
      this.engine.advance(1, false);
      this.accumulated -= TICK_MS;
      this.freightProgress = 0;
    }
    const progress = Math.min(TICK_MS, this.accumulated);
    this.engine.city.advanceFreight(Math.max(0, progress - this.freightProgress));
    this.freightProgress = progress;
    return this.engine.getSnapshot().tick;
  }
}
