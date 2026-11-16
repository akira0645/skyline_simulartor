import { expect, it } from 'vitest';
import { CarQueue } from './CarQueue';
it('finds same-lane traffic across tile boundaries, ignoring self and opposing lanes', () => {
  const queue = new CarQueue();
  queue.reset([{ x: 2.1, y: 3.19, hx: 1, hy: 0, index: 1 },
    { x: 1.8, y: 2.81, hx: -1, hy: 0, index: 2 }]);
  expect(queue.ahead(1.9, 3.19, 1, 0, 3)).toBe(true);
  expect(queue.ahead(1.9, 3.19, 1, 0, 1)).toBe(false);
  expect(queue.ahead(1.9, 3.6, 1, 0, 3)).toBe(false);
  expect(queue.ahead(1.9, 3.19, -1, 0, 3)).toBe(false);
  expect(queue.ahead(1.4, 3.19, 1, 0, 3)).toBe(false);
  expect(queue.ahead(1.4, 3.19, 1, 0, 3, 0.8)).toBe(true);
  queue.reset([]);
  expect(queue.ahead(1.9, 3.19, 1, 0, 3)).toBe(false);
});
it('resolves overlapping cars by priority and includes newly inserted buses', () => {
  const queue = new CarQueue();
  queue.add({ x: 2, y: 3, hx: 0, hy: -1, index: -1000 });
  expect(queue.ahead(2, 3, 0, -1, 2)).toBe(true);
  expect(queue.ahead(2, 3, 0, -1, -1001)).toBe(false);
});
