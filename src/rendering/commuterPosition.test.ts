import { expect, it } from 'vitest';
import { commuterPosition } from './commuterPosition';

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
