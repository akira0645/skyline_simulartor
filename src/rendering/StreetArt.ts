import { Assets, Graphics, Rectangle, Texture, type TextureSource } from 'pixi.js';
import type { Theme } from '../simulation/SaveData';
import atlas from '../assets/street/atlas.json';
import classicUrl from '../assets/street/buildings-classic.png';
import sfUrl from '../assets/street/buildings-sf.png';
import californiaUrl from '../assets/street/buildings-california.png';
import newyorkUrl from '../assets/street/buildings-newyork.png';
import treeUrl from '../assets/street/tree.png';
import peopleUrl from '../assets/street/people.png';
import truckUrl from '../assets/street/truck.png';
import { carDirection } from './carAppearance';
import { personDirection, truckColourRow, type StreetBuilding } from './streetAppearance';

/** Shared by the actual city renderer and the review street; no separate drawing implementation. */
export class StreetArt {
  private readonly frames = new Map<TextureSource, Map<number, Texture>>();

  constructor(private readonly buildings: Record<Theme, TextureSource>,
    private readonly tree: TextureSource, private readonly people: TextureSource, private readonly truck: TextureSource) {
    for (const source of Object.values(buildings)) {
      if (source.width !== atlas.buildings.length * atlas.buildingFrame || source.height !== atlas.buildingFrame) {
        throw new Error('Street building atlas does not match its metadata');
      }
    }
    if (people.width !== atlas.personFrame[0] * 4 || people.height !== atlas.personFrame[1] * atlas.personPoses * atlas.personColours.length ||
      truck.width !== atlas.truckFrame * 16 || truck.height !== atlas.truckFrame * atlas.truckColours.length ||
      tree.width !== atlas.treeFrame[0] || tree.height !== atlas.treeFrame[1]) {
      throw new Error('Street actor atlas does not match its metadata');
    }
  }

  static async load(): Promise<StreetArt> {
    const sheets = await Promise.all([classicUrl, sfUrl, californiaUrl, newyorkUrl, treeUrl, peopleUrl, truckUrl]
      .map(url => Assets.load<Texture>(url)));
    for (const sheet of sheets) sheet.source.scaleMode = 'nearest';
    return new StreetArt({ classic: sheets[0].source, sf: sheets[1].source,
      california: sheets[2].source, newyork: sheets[3].source }, sheets[4].source, sheets[5].source, sheets[6].source);
  }

  private frame(source: TextureSource, x: number, y: number, width: number, height: number): Texture {
    let frames = this.frames.get(source);
    if (!frames) this.frames.set(source, frames = new Map());
    const key = y * 4096 + x;
    let texture = frames.get(key);
    if (!texture) {
      texture = new Texture({ source, frame: new Rectangle(x, y, width, height) });
      frames.set(key, texture);
    }
    return texture;
  }

  drawBuilding(g: Graphics, kind: StreetBuilding, x: number, y: number, theme: Theme) {
    const size = atlas.buildingFrame;
    const column = atlas.buildings.indexOf(kind);
    g.setFillStyle({ color: 0xffffff, alpha: 1 })
      .texture(this.frame(this.buildings[theme], column * size, 0, size, size), 0xffffff, x, y, 32, 32);
  }

  drawTree(g: Graphics, x: number, y: number) {
    g.setFillStyle({ color: 0xffffff, alpha: 1 })
      .texture(this.frame(this.tree, 0, 0, ...atlas.treeFrame as [number, number]), 0xffffff, x, y, 32, 64);
  }

  drawPerson(g: Graphics, x: number, y: number, heading: number, index: number, distance: number, walking = true) {
    const [width, height] = atlas.personFrame;
    const phase = walking ? 1 + Math.floor(distance / 2 + index) % (atlas.personPoses - 1) : 0;
    const row = (index % atlas.personColours.length) * atlas.personPoses + phase;
    const frame = this.frame(this.people, personDirection(heading) * width, row * height, width, height);
    g.setFillStyle({ color: 0xffffff, alpha: 1 })
      .texture(frame, 0xffffff, x - atlas.personPivot[0] / 4, y - atlas.personPivot[1] / 4, width / 4, height / 4);
  }

  drawTruck(g: Graphics, x: number, y: number, heading: number, colour: number) {
    const size = atlas.truckFrame;
    const frame = this.frame(this.truck, carDirection(heading) * size, truckColourRow(colour) * size, size, size);
    g.setFillStyle({ color: 0xffffff, alpha: 1 })
      .texture(frame, 0xffffff, x - atlas.truckPivot[0] / 4, y - atlas.truckPivot[1] / 4, size / 4, size / 4);
  }

  destroy() {
    for (const frames of this.frames.values()) for (const frame of frames.values()) frame.destroy(false);
    this.frames.clear();
  }
}
