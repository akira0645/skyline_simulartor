import type { WorldState } from './WorldState';

import { BuildingSystem } from './BuildingSystem';
import { parseSave, SCHEMA_VERSION, type SaveData } from './SaveData';
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

  save(): SaveData {
    const { seed, tick } = this.state;
    return { schemaVersion: SCHEMA_VERSION, seed, tick, ...this.city.save() };
  }

  /** Replaces the whole city. Throws, leaving the city untouched, if the data is invalid. */
  load(data: unknown): void {
    const save = parseSave(data);
    this.city.load(save);
    this.state.seed = save.seed;
    this.state.tick = save.tick;
  }

  getSnapshot(): WorldState {
    return { ...this.state };
  }
}
