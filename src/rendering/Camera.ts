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
    this.pinch({ x, y }, { x, y }, Math.exp(-delta * 0.002), width, height);
  }

  /** Keep the world under the two-finger midpoint anchored while it moves and scales. */
  pinch(from: { x: number; y: number }, to: { x: number; y: number }, factor: number, width: number, height: number) {
    if (!Number.isFinite(factor) || factor <= 0) return;
    const next = Math.max(0.25, Math.min(6, this.scale * factor));
    const dx = to.x - this.x - (from.x - this.x) * next / this.scale;
    const dy = to.y - this.y - (from.y - this.y) * next / this.scale;
    this.scale = next;
    this.pan(dx, dy, width, height);
  }
}
