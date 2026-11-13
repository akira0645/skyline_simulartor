import type { WorldState } from './WorldState';

export class SimulationEngine {
  constructor(private readonly state: WorldState) {}

  getSnapshot(): WorldState {
    return { ...this.state };
  }
}
