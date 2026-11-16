import { expect, it } from 'vitest';
import { freightMapRoutes, freightKey } from './routeViews';
import type { FreightLine } from '../simulation/FreightLines';
it('keeps manual route identities and all selected stops, dimming other routes', () => {
  const line: FreightLine = { id: 2, stops: [10, 20, 30], vehicles: 1, active: true,
    path: [{ x: 1, y: 1 }, { x: 2, y: 1 }], minutes: 4, capacity: 720, assigned: 24, trips: 1 };
  const views = freightMapRoutes('manual', [line, { ...line, id: 3 }], [], 'manual:2');
  expect(views[0]).toMatchObject({ id: 2, kind: 'freight', stops: [10, 20, 30], dim: false });
  expect(views[1].dim).toBe(true);
  expect(freightKey({ from: 10, to: 30, lineId: 2 })).toBe('manual:2');
});
it('gives automatic routes stable colours when other routes disappear', () => {
  const a = { from: 1, to: 2, path: [{ x: 1, y: 1 }], goods: 24, trucks: 1, minutes: 2 };
  const b = { ...a, from: 3 };
  expect(freightMapRoutes('auto', [], [a, b])[1].id).toBe(freightMapRoutes('auto', [], [b])[0].id);
  expect(freightMapRoutes('auto', [], [a], 'deleted')[0].dim).toBe(false);
});
