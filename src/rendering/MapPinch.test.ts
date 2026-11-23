import { expect, it } from 'vitest';
import { MapPinch } from './MapPinch';
import { Camera } from './Camera';

it('zooms about the moving midpoint of two fingers rather than the top-left corner', () => {
  const pinch = new MapPinch(), camera = new Camera();
  camera.x = -500; camera.y = -400;
  pinch.start(1, { x: 200, y: 200 });
  expect(pinch.active).toBe(false);
  pinch.start(2, { x: 400, y: 200 });
  expect(pinch.active).toBe(true);
  const move = pinch.move(2, { x: 600, y: 200 })!;
  camera.pinch(move.from, move.to, move.ratio, 1024, 768);
  expect(camera.scale).toBe(2);
  expect((move.to.x - camera.x) / camera.scale).toBe(800);
  expect((move.to.y - camera.y) / camera.scale).toBe(600);
});

it('keeps the remaining finger from completing a build after a pinch or cancellation', () => {
  const pinch = new MapPinch();
  pinch.start(1, { x: 100, y: 100 }); pinch.start(2, { x: 200, y: 100 });
  expect(pinch.end(2)).toBe(true);
  expect(pinch.active).toBe(true);
  expect(pinch.move(1, { x: 150, y: 150 })).toBeUndefined();
  // A subsequent lost-capture notification must not re-enable the remaining finger.
  pinch.end(2);
  expect(pinch.active).toBe(true);
  expect(pinch.end(1)).toBe(true);
  expect(pinch.active).toBe(false);
  pinch.start(3, { x: 100, y: 100 });
  expect(pinch.end(3)).toBe(false);
});

it('rebases when a third finger replaces one of the first pair without a zoom jump', () => {
  const pinch = new MapPinch();
  pinch.start(1, { x: 100, y: 100 }); pinch.start(2, { x: 200, y: 100 });
  pinch.start(3, { x: 300, y: 100 }); pinch.end(1);
  expect(pinch.move(3, { x: 300, y: 100 })?.ratio).toBe(1);
});

it('supports two-finger panning at the zoom limit and rejects degenerate gestures', () => {
  const camera = new Camera(); camera.scale = 6; camera.x = -500; camera.y = -500;
  camera.pinch({ x: 200, y: 200 }, { x: 240, y: 230 }, 2, 1024, 768);
  expect(camera.scale).toBe(6); expect(camera.x).toBe(-460); expect(camera.y).toBe(-470);
  const before = { ...camera };
  camera.pinch({ x: 0, y: 0 }, { x: 0, y: 0 }, NaN, 1024, 768);
  expect({ ...camera }).toEqual(before);
  const pinch = new MapPinch();
  pinch.start(1, { x: 100, y: 100 }); pinch.start(2, { x: 100, y: 100 });
  expect(pinch.move(2, { x: 100, y: 100 })).toBeUndefined();
});
