import type { WorldState } from './WorldState';

export class SimulationEngine {
  private readonly state: WorldState;

  constructor(initialState: WorldState) {
    this.state = { ...initialState };
  }

  advance(ticks: number): number {
    this.state.tick += ticks;
    return this.state.tick;
  }

  getSnapshot(): WorldState {
    return { ...this.state };
  }
}
