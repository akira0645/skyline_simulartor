import { MAP_SIZE, TILE_SIZE, type Cell } from '../simulation/TileMap';

export class Camera {
  x = 0;
  y = 0;
  scale = 1;
  /** How far, in screen pixels, the map may be dragged past each edge of the view. */
  margin = 0;

  cellAt(x: number, y: number): Cell {
    return {
      x: Math.floor((x - this.x) / (this.scale * TILE_SIZE)),
      y: Math.floor((y - this.y) / (this.scale * TILE_SIZE)),
    };
  }

  pan(dx: number, dy: number, width: number, height: number) {
    const size = MAP_SIZE * TILE_SIZE * this.scale;
    const { margin } = this;
    this.x = Math.max(Math.min(0, width - size) - margin, Math.min(margin, this.x + dx));
    this.y = Math.max(Math.min(0, height - size) - margin, Math.min(margin, this.y + dy));
  }

  zoom(x: number, y: number, delta: number, width: number, height: number) {
    const next = Math.max(0.25, Math.min(6, this.scale * Math.exp(-delta * 0.002)));
    const ratio = next / this.scale;
    this.scale = next;
    this.pan((x - this.x) * (1 - ratio), (y - this.y) * (1 - ratio), width, height);
  }
}
