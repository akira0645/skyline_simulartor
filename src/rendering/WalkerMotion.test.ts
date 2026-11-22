import { expect, it } from 'vitest';
import { WalkerMotion } from './WalkerMotion';

it('stands while stationary, turns with movement, and retains facing while waiting', () => {
  const motion = new WalkerMotion();
  expect(motion.update('a', 0, 0, 0).walking).toBe(false);
  expect(motion.update('a', 2, 0, 100)).toMatchObject({ heading: 0, distance: 2, walking: true });
  expect(motion.update('a', 2, 0, 200)).toMatchObject({ heading: 0, distance: 2, walking: false });
  expect(motion.update('a', 1, 0, 300)).toMatchObject({ heading: Math.PI, distance: 3, walking: true });
  expect(motion.update('a', 1, 2, 400).heading).toBe(Math.PI / 2);
  expect(motion.update('a', 1, 1, 500).heading).toBe(-Math.PI / 2);
});

it('is independent of FPS and repaint frequency, and does not animate teleportation', () => {
  const slow = new WalkerMotion(), fast = new WalkerMotion();
  slow.update('a', 0, 0, 0); fast.update('a', 0, 0, 0);
  for (let x = 1; x <= 6; x++) fast.update('a', x, 0, x * 20);
  expect(slow.update('a', 6, 0, 120).distance).toBe(fast.update('a', 6, 0, 120).distance);
  expect(fast.update('a', 6, 0, 120).walking).toBe(true);
  expect(fast.update('a', 200, 0, 140)).toMatchObject({ distance: 0, walking: false });
  expect(fast.update('a', 201, 0, 5000)).toMatchObject({ distance: 0, walking: false });
});

it('does not flicker between front and side for nearly diagonal motion', () => {
  const motion = new WalkerMotion();
  motion.update('a', 0, 0, 0, 0);
  expect(motion.update('a', 1, 1.01, 100).heading).toBe(0);
  expect(motion.update('a', 2.01, 2, 200).heading).toBe(0);
  expect(motion.update('a', 2.01, 4, 300).heading).toBe(Math.PI / 2);
});
