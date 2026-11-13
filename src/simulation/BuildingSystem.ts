import { MAP_SIZE, type Cell, type GameCommand, type TileMap, type Zone } from './TileMap';
import type { SaveData } from './SaveData';
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

  hasRoadAccess({ x, y }: Cell): boolean {
    return neighbors.some(([dx, dy]) => this.map.get({ x: x + dx, y: y + dy }) === 'road');
  }

  /** What stands on a cell, or undefined outside the map. Capacity is 0 without a building. */
  inspect(cell: Cell) {
    const tile = this.map.get(cell);
    if (!tile) return undefined;
    if (tile === 'grass' || tile === 'road') return { tile };
    const building = this.hasBuilding(cell);
    return { tile, building, roadAccess: this.hasRoadAccess(cell), capacity: building ? growth.capacity[tile] : 0 };
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
      if (!this.hasRoadAccess(cell)) continue;

      this.buildings.set(id, zone);
      return;
    }
  }

  save(): Pick<SaveData, 'tiles' | 'zones' | 'buildings'> {
    return { tiles: this.map.save(), zones: [...this.zones.keys()], buildings: [...this.buildings.keys()] };
  }

  /** Expects data that parseSave has already checked. */
  load({ tiles, zones, buildings }: SaveData): void {
    this.map.load(tiles);
    this.zones.clear();
    this.buildings.clear();
    for (const id of zones) this.zones.set(id, { x: id % MAP_SIZE, y: Math.floor(id / MAP_SIZE) });
    for (const id of buildings) this.buildings.set(id, this.map.get(this.zones.get(id)!) as Zone);
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
