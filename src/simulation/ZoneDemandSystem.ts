import type { Zone } from './TileMap';

export const growth = {
  interval: 2,
  capacity: { residential: 4, commercial: 3, industrial: 5 },
  starterJobs: 8,
};

export class ZoneDemandSystem {
  canBuild(zone: Zone, population: number, jobs: number): boolean {
    return zone === 'residential'
      ? population < growth.capacity.residential + jobs
      : jobs < growth.starterJobs + population;
  }
}
