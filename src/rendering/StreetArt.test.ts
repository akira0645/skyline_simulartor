import { expect, it } from 'vitest';
import { Graphics, TextureSource } from 'pixi.js';
import { StreetArt } from './StreetArt';
import { CarSprites } from './CarSprites';
import atlas from '../assets/street/atlas.json';
import carAtlas from '../assets/vehicles/cars.json';

const source = (width: number, height: number) => new TextureSource({ width, height });
function street() {
  const building = source(atlas.buildings.length * atlas.buildingFrame, atlas.buildingFrame);
  return new StreetArt({ classic: building, sf: building, california: building, newyork: building },
    source(...atlas.treeFrame as [number, number]),
    source(4 * atlas.personFrame[0], atlas.personPoses * atlas.personColours.length * atlas.personFrame[1]),
    source(16 * atlas.truckFrame, atlas.truckColours.length * atlas.truckFrame));
}

it('does not let a preceding translucent ground shadow fade buildings, trees, pedestrians or vehicles', () => {
  const art = street();
  const cars = new CarSprites(source(carAtlas.directions * carAtlas.frameSize,
    carAtlas.sizes.length * carAtlas.colours.length * carAtlas.frameSize));
  const g = new Graphics();
  for (const draw of [() => art.drawBuilding(g, 'house', 0, 0, 'classic'), () => art.drawTree(g, 0, 0),
    () => art.drawPerson(g, 10, 10, 0, 0, 0), () => art.drawTruck(g, 10, 10, 0, 0xe5484d),
    () => cars.draw(g, 10, 10, 0, 2, 0, 'classic')]) {
    g.clear().rect(0, 0, 4, 4).fill({ color: 0x222222, alpha: 0.2 });
    draw();
    const instruction = g.context.instructions.at(-1)!;
    expect(instruction.action).toBe('texture');
    if (instruction.action === 'texture') expect(instruction.data.alpha).toBe(1);
  }
  g.destroy(); art.destroy(); cars.destroy();
});

it('uses six distinct walk frames, loops at the same ground anchor and keeps idle separate', () => {
  const art = street(), g = new Graphics();
  const rows: number[] = [];
  for (let step = 0; step <= 6; step++) {
    art.drawPerson(g, 10, 20, 0, 0, step * 2);
    const instruction = g.context.instructions.at(-1)!;
    if (instruction.action !== 'texture') throw Error('Missing actor texture');
    rows.push(instruction.data.image.frame.y / atlas.personFrame[1]);
    expect(instruction.data.dx).toBe(6);
    expect(instruction.data.dy).toBe(14);
  }
  expect(rows).toEqual([1, 2, 3, 4, 5, 6, 1]);
  art.drawPerson(g, 10, 20, 0, 0, 0, false);
  const idle = g.context.instructions.at(-1)!;
  if (idle.action === 'texture') expect(idle.data.image.frame.y).toBe(0);
  g.destroy(); art.destroy();
});
