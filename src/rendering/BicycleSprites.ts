import { Graphics, Rectangle, Texture, type TextureSource } from 'pixi.js';
import atlas from '../assets/street/bicycles.json';
import { carDirection } from './carAppearance';

export function bicycleFrame(heading: number, profile = atlas.parkedProfile, distance = 0) {
  const rider = Math.max(0, Math.min(atlas.parkedProfile, Math.floor(profile)));
  const phase = rider === atlas.parkedProfile ? 0 : Math.floor(Math.max(0, distance) / 5) % atlas.phases;
  return { column: carDirection(heading), row: rider * atlas.phases + phase };
}

/** Baked stacks share the car heading convention; pedals advance only with travelled distance. */
export class BicycleSprites {
  private readonly frames = new Map<number, Texture>();
  constructor(private readonly source: TextureSource) {
    if (source.width !== atlas.directions * atlas.frame || source.height !== (atlas.profiles + 1) * atlas.phases * atlas.frame)
      throw new Error('Bicycle atlas dimensions do not match its metadata');
  }
  draw(g: Graphics, x: number, y: number, heading: number, profile?: number, distance = 0) {
    const { column, row } = bicycleFrame(heading, profile, distance);
    const key = row * atlas.directions + column;
    let frame = this.frames.get(key);
    if (!frame) {
      frame = new Texture({ source: this.source, frame: new Rectangle(column * atlas.frame, row * atlas.frame, atlas.frame, atlas.frame) });
      this.frames.set(key, frame);
    }
    g.setFillStyle({ color: 0xffffff, alpha: 1 }).texture(frame, 0xffffff,
      x - atlas.pivot[0] / atlas.density, y - atlas.pivot[1] / atlas.density, atlas.frame / atlas.density, atlas.frame / atlas.density);
  }
  destroy() { for (const frame of this.frames.values()) frame.destroy(false); this.frames.clear(); }
}
