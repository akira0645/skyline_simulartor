import { expect, it } from 'vitest';
import { Graphics, TextureSource } from 'pixi.js';
import { BicycleSprites, bicycleFrame } from './BicycleSprites';
import atlas from '../assets/street/bicycles.json';

it('uses front and back headings and changes pedals by distance rather than wall time', () => {
  expect(bicycleFrame(0, 8, 0)).toEqual({ column: 0, row: 16 });
  expect(bicycleFrame(Math.PI, 8, 5)).toEqual({ column: 8, row: 17 });
  expect(bicycleFrame(0, 8, 10)).toEqual({ column: 0, row: 16 });
  expect(bicycleFrame(0).row).toBe(atlas.parkedProfile * atlas.phases);
  expect(bicycleFrame(0, atlas.parkedProfile, 5).row).toBe(atlas.parkedProfile * atlas.phases);
});

it('draws every rider age, pedal pose and heading within the compact shared atlas', () => {
  const source = new TextureSource({ width: atlas.directions * atlas.frame, height: (atlas.profiles + 1) * atlas.phases * atlas.frame });
  const bicycles = new BicycleSprites(source), g = new Graphics();
  for (let rider = 0; rider <= atlas.parkedProfile; rider++) for (let heading = 0; heading < 16; heading++) {
    bicycles.draw(g, 20, 20, heading * Math.PI / 8, rider, 0);
    bicycles.draw(g, 20, 20, heading * Math.PI / 8, rider, 5);
  }
  expect(g.context.instructions.length).toBe(800);
  g.destroy(); bicycles.destroy();
});
