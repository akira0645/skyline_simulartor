import { Graphics, Rectangle, Texture, type TextureSource } from 'pixi.js';
import atlas from '../assets/vehicles/cars.json';
import type { Theme } from '../simulation/SaveData';
import { carFrame } from './carAppearance';

/** Fixed-pivot baked stacks: one existing Pixi Graphics texture draw per car. */
export class CarSprites {
  private readonly frames = new Map<number, Texture>();

  constructor(private readonly source: TextureSource) {
    const rows = atlas.sizes.length * atlas.colours.length;
    if (source.width !== atlas.frameSize * atlas.directions || source.height !== atlas.frameSize * rows) {
      throw new Error('Car atlas dimensions do not match its metadata');
    }
  }

  draw(g: Graphics, x: number, y: number, heading: number, tier: number, index: number, theme: Theme) {
    const { column, row } = carFrame(tier, index, theme, heading);
    const key = row * atlas.directions + column;
    let frame = this.frames.get(key);
    if (!frame) {
      frame = new Texture({ source: this.source, frame: new Rectangle(
        column * atlas.frameSize, row * atlas.frameSize, atlas.frameSize, atlas.frameSize) });
      this.frames.set(key, frame);
    }
    const size = atlas.frameSize / atlas.density;
    // Do not round world coordinates: the camera owns the final pixel projection.
    g.setFillStyle({ color: 0xffffff, alpha: 1 }).texture(frame, 0xffffff, x - atlas.pivot[0] / atlas.density,
      y - atlas.pivot[1] / atlas.density, size, size);
  }

  destroy() {
    for (const frame of this.frames.values()) frame.destroy(false);
    this.frames.clear();
  }
}
