import { Graphics } from 'pixi.js';
import { MAP_SIZE, TILE_SIZE, type Cell, type TileMap } from '../simulation/TileMap';
import { Camera } from './Camera';

const colors = { grass: 0x446c43, road: 0x4c5054, residential: 0x8eb959,
  commercial: 0x4f98c7, industrial: 0xc99a47 };

export class TileRenderer {
  readonly graphic = new Graphics();

  draw(map: TileMap, camera: Camera, width: number, height: number, preview: Cell[]) {
    const start = camera.cellAt(0, 0);
    const end = camera.cellAt(width, height);
    const g = this.graphic.clear();
    g.position.set(camera.x, camera.y);
    g.scale.set(camera.scale);
    const gap = 1 / camera.scale;

    for (let y = Math.max(0, start.y); y <= Math.min(MAP_SIZE - 1, end.y); y++) {
      for (let x = Math.max(0, start.x); x <= Math.min(MAP_SIZE - 1, end.x); x++) {
        const tile = map.get({ x, y })!;
        g.rect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE - gap, TILE_SIZE - gap)
          .fill(colors[tile]);
      }
    }

    for (const { x, y } of preview) {
      if (map.get({ x, y }) === undefined) continue;
      g.rect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE - gap, TILE_SIZE - gap)
        .fill({ color: 0xffffff, alpha: 0.35 });
    }
  }
}
