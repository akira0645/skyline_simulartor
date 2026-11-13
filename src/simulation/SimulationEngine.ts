import type { WorldState } from './WorldState';

import { BuildingSystem } from './BuildingSystem';
import { TileMap } from './TileMap';

export class SimulationEngine {
  readonly city = new BuildingSystem(new TileMap());
  private readonly state: WorldState;

  constructor(initialState: WorldState) {
    this.state = { ...initialState };
  }

  advance(ticks: number): number {
    for (let step = 0; step < ticks; step++) {
      this.state.tick++;
      this.city.grow(this.state.tick);
    }
    return this.state.tick;
  }

  getSnapshot(): WorldState {
    return { ...this.state };
  }
}
