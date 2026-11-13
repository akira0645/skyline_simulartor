import { MAP_SIZE, type Cell, type GameCommand, type TileMap, type Zone } from './TileMap';
import type { SaveData, SavedBuilding } from './SaveData';
import { growth, ZoneDemandSystem } from './ZoneDemandSystem';

import { RoadGraph } from './RoadGraph';

const neighbors = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const indexOf = ({ x, y }: Cell) => y * MAP_SIZE + x;

export class BuildingSystem {
  private readonly zones = new Map<number, Cell>();
  private readonly buildings = new Map<number, SavedBuilding>();
  private readonly demand = new ZoneDemandSystem();

  private readonly commutes: { homeId: number; workId: number; workers: number; path: Cell[] }[] = [];
  readonly roadGraph: RoadGraph;

  constructor(readonly map: TileMap) {
    this.roadGraph = new RoadGraph(map);
  }

  getCommutes() {
    return this.commutes as readonly {
      homeId: number; workId: number; workers: number; path: readonly Cell[];
    }[];
  }

  hasBuilding(cell: Cell): boolean {
    return this.getBuilding(cell) !== undefined;
  }

  private roadAccess({ x, y }: Cell): Cell | undefined {
    for (const [dx, dy] of neighbors) {
      const road = { x: x + dx, y: y + dy };
      if (this.map.get(road) === 'road') return road;
    }
  }

  hasRoadAccess(cell: Cell): boolean {
    return this.roadAccess(cell) !== undefined;
  }

  getBuilding(cell: Cell) {
    const zone = this.map.get(cell);
    if (!zone || zone === 'grass' || zone === 'road') return undefined;
    const record = this.buildings.get(indexOf(cell));
    if (!record) return undefined;
    const level = 1 + Math.min(2, Math.floor(3 * record.occupants / record.capacity));
    return { ...record, ...cell, zone, road: this.roadAccess(cell), level };
  }

  inspect(cell: Cell) {
    const tile = this.map.get(cell);
    if (!tile) return undefined;
    if (tile === 'grass' || tile === 'road') return { tile };
    const record = this.getBuilding(cell);
    return { tile, building: !!record, roadAccess: this.hasRoadAccess(cell),
      capacity: record?.capacity ?? 0, occupants: record?.occupants ?? 0, level: record?.level };
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
    if (result.changed.length) this.assignJobs();
    return result;
  }

  grow(tick: number, seed: number): void {
    let changed = false;
    for (const [id, building] of this.buildings) {
      const cell = this.zones.get(id)!;
      if (this.map.get(cell) === 'residential' && building.occupants < building.capacity &&
          this.hasRoadAccess(cell)) {
        building.occupants++;
        changed = true;
      }
    }

    if (tick % growth.interval === 0) {
      const { population, jobs } = this.getStats();
      const candidates: SavedBuilding[] = [];
      for (const [id, cell] of this.zones) {
        if (this.buildings.has(id)) continue;
        const zone = this.map.get(cell) as Zone;
        if (this.demand.canBuild(zone, population, jobs) && this.hasRoadAccess(cell)) {
          candidates.push({ id, capacity: growth.capacity[zone], occupants: 0 });
        }
      }

      if (candidates.length) {
        // Seed and tick are saved, so a loaded city picks the same next lot.
        const hash = Math.imul(seed ^ tick ^ 0x9e3779b9, 0x85ebca6b);
        const building = candidates[((hash ^ (hash >>> 16)) >>> 0) % candidates.length];
        this.buildings.set(building.id, building);
        changed = true;
      }
    }
    if (changed) this.assignJobs();
  }

  private assignJobs(): void {
    this.commutes.length = 0;
    const homes: { building: SavedBuilding; road: Cell }[] = [];
    const workplaces: { building: SavedBuilding; road: Cell }[] = [];

    for (const [id, building] of this.buildings) {
      const cell = this.zones.get(id)!;
      const road = this.roadAccess(cell);
      if (this.map.get(cell) === 'residential') {
        if (road && building.occupants > 0) homes.push({ building, road });
      } else {
        building.occupants = 0;
        if (road) workplaces.push({ building, road });
      }
    }
    if (!workplaces.length) return;

    for (const home of homes) {
      let remaining = home.building.occupants;
      const distances = this.roadGraph.distancesFrom(home.road);
      const reachable = workplaces
        .map(work => ({ ...work, distance: distances.get(indexOf(work.road)) ?? Infinity }))
        .filter(work => Number.isFinite(work.distance) && work.building.occupants < work.building.capacity)
        .sort((a, b) => a.distance - b.distance || a.building.id - b.building.id);
      for (const work of reachable) {
        const workers = Math.min(remaining, work.building.capacity - work.building.occupants);
        const route = this.roadGraph.shortestPath(home.road, work.road)!;
        this.commutes.push({ homeId: home.building.id, workId: work.building.id, workers, path: route.path });
        work.building.occupants += workers;
        remaining -= workers;
        if (!remaining) break;
      }
    }
  }

  save(): Pick<SaveData, 'tiles' | 'zones' | 'buildings'> {
    return { tiles: this.map.save(), zones: [...this.zones.keys()],
      buildings: [...this.buildings.values()].map(building => ({ ...building })) };
  }

  load({ tiles, zones, buildings }: SaveData): void {
    this.map.load(tiles);
    this.zones.clear();
    this.buildings.clear();
    for (const id of zones) this.zones.set(id, { x: id % MAP_SIZE, y: Math.floor(id / MAP_SIZE) });
    for (const building of buildings) this.buildings.set(building.id, { ...building });
    this.assignJobs();
  }

  getStats() {
    let population = 0;
    let jobs = 0;
    let employed = 0;
    for (const [id, building] of this.buildings) {
      if (this.map.get(this.zones.get(id)!) === 'residential') population += building.occupants;
      else {
        jobs += building.capacity;
        employed += building.occupants;
      }
    }
    return { population, jobs, employed, buildings: this.buildings.size };
  }
}
