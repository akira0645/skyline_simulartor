import { expect, it } from 'vitest';
import { Camera } from './Camera';

it('maps screen coordinates after panning and zooms around the cursor', () => {
  const camera = new Camera();
  camera.pan(-64, -32, 800, 600);
  const cell = camera.cellAt(160, 120);
  expect(cell).toEqual({ x: 7, y: 4 });
  camera.zoom(160, 120, -120, 800, 600);
  expect(camera.cellAt(160, 120)).toEqual(cell);
});

it('allows inspecting handmade art at 6x and clamps the zoom range', () => {
  const camera = new Camera();
  camera.zoom(160, 120, -10000, 800, 600);
  expect(camera.scale).toBe(6);
  camera.zoom(160, 120, 10000, 800, 600);
  expect(camera.scale).toBe(0.25);
});
