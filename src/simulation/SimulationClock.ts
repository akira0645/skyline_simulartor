import type { SimulationEngine } from './SimulationEngine';

export type SimulationSpeed = 0 | 1 | 2 | 4;
export const TICK_MS = 1000;

export class SimulationClock {
  speed: SimulationSpeed = 1;
  private accumulated = 0;

  constructor(private readonly engine: SimulationEngine) {}

  get dayProgress(): number {
    return this.accumulated / TICK_MS;
  }

  /** Drops the partial tick, e.g. after a save is loaded. */
  reset(): void {
    this.accumulated = 0;
  }

  advance(elapsedMs: number): number {
    this.accumulated += elapsedMs * this.speed;
    const ticks = Math.floor(this.accumulated / TICK_MS);
    this.accumulated -= ticks * TICK_MS;
    return this.engine.advance(ticks);
  }
}
