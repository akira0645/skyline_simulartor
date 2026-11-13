import { MAP_SIZE, type Cell, type GameCommand, type TileMap, type Zone } from './TileMap';
import { growth, ZoneDemandSystem } from './ZoneDemandSystem';

const neighbors = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const indexOf = ({ x, y }: Cell) => y * MAP_SIZE + x;

export class BuildingSystem {
  private readonly zones = new Map<number, Cell>();
  private readonly buildings = new Map<number, Zone>();
  private readonly demand = new ZoneDemandSystem();

  constructor(readonly map: TileMap) {}

  hasBuilding(cell: Cell): boolean {
    return this.buildings.has(indexOf(cell));
  }

  execute(command: GameCommand) {
    const result = this.map.execute(command);
    for (const cell of result.changed) {
      const id = indexOf(cell);
      const tile = this.map.get(cell);
      this.buildings.delete(id);
      if (tile && tile !== 'grass' && tile !== 'road') this.zones.set(id, cell);
      else this.zones.delete(id);
    }
    return result;
  }

  grow(tick: number): void {
    if (tick % growth.interval !== 0) return;

    const { population, jobs } = this.getStats();
    for (const [id, cell] of this.zones) {
      if (this.buildings.has(id)) continue;
      const zone = this.map.get(cell);
      if (!zone || zone === 'grass' || zone === 'road') continue;
      if (!this.demand.canBuild(zone, population, jobs)) continue;
      if (!neighbors.some(([dx, dy]) =>
        this.map.get({ x: cell.x + dx, y: cell.y + dy }) === 'road')) continue;

      this.buildings.set(id, zone);
      return;
    }
  }

  getStats() {
    let population = 0;
    let jobs = 0;
    for (const zone of this.buildings.values()) {
      if (zone === 'residential') population += growth.capacity[zone];
      else jobs += growth.capacity[zone];
    }
    return { population, jobs, employed: Math.min(population, jobs), buildings: this.buildings.size };
  }
}
