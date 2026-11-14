import { expect, it } from 'vitest';
import { advancePedestrian, commuterPosition } from './commuterPosition';

it('travels between buildings sharing one road and stays indoors at both ends', () => {
  const commute = { homeId: 1, workId: 257, path: [{ x: 1, y: 1 }] };
  expect(commuterPosition(commute, 0)).toEqual({ x: 1, y: 0 });
  expect(commuterPosition(commute, 500)).toEqual({ x: 1, y: 1 });
  expect(commuterPosition(commute, 750)).toEqual({ x: 1, y: 1.5 });
  expect(commuterPosition(commute, 1000)).toBeUndefined();
  expect(commuterPosition(commute, 2600)).toEqual({ x: 1, y: 2 });
  expect(commuterPosition(commute, 3100)).toEqual({ x: 1, y: 1 });
  expect(commuterPosition(commute, 3600)).toBeUndefined();
});

it('waits at a red light even when the junction is the first road tile', () => {
  const origin = { x: 3, y: 2 };
  const junction = { x: 3, y: 3 };
  const roads = [junction, { x: 4, y: 3 }];
  const red = (cell: { x: number; y: number }, vertical: boolean) => cell !== junction || !vertical;
  const waiting = advancePedestrian(roads, origin, 0, 2, false, red);
  expect(waiting).toBeCloseTo(0.4);
  expect(advancePedestrian(roads, origin, waiting, 0.05, false, red)).toBe(waiting);
  const crossing = advancePedestrian(roads, origin, waiting, 0.05, false, () => true);
  expect(crossing).toBeGreaterThan(waiting);
  expect(advancePedestrian(roads, origin, crossing, 0.05, false, red)).toBeGreaterThan(crossing);
  expect(advancePedestrian(roads, { x: 5, y: 3 }, 0, 2, true, cell => cell !== junction)).toBeCloseTo(1.4);
});
