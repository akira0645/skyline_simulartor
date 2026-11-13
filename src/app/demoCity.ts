import type { SimulationEngine } from '../simulation/SimulationEngine';
import { MAP_SIZE } from '../simulation/TileMap';

export const powerPlant = { x: 2, y: 2 };
export const waterTower = { x: 3, y: 2 };
export const works = { x: 6, y: 3 };

export function demoCity(engine: SimulationEngine) {
  const city = engine.city;
  const home = { x: 1, y: 2 };
  const office = { x: 3, y: 4 };
  const shop = { x: 8, y: 2 };
  const factory = { x: 10, y: 4 };
  const id = ({ x, y }: typeof home) => y * MAP_SIZE + x;
  city.execute({ type: 'BUILD_ROAD', path: Array.from({ length: 11 }, (_, x) => ({ x, y: 3 })) });
  city.execute({ type: 'SET_ZONE', tiles: [home], zone: 'residential' });
  city.execute({ type: 'SET_ZONE', tiles: [office, shop], zone: 'commercial' });
  city.execute({ type: 'SET_ZONE', tiles: [factory], zone: 'industrial' });
  engine.load({ ...engine.save(), buildings: [
    { id: id(home), capacity: 10, occupants: 10 },
    { id: id(office), capacity: 3, occupants: 0 },
    { id: id(shop), capacity: 3, occupants: 0 },
    { id: id(factory), capacity: 5, occupants: 0 },
  ] });
}
