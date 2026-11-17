import { expect, it } from 'vitest';
import { freightMapRoutes, freightKey } from './routeViews';
import type { FreightLine } from '../simulation/FreightLines';
it('keeps manual route identities and all selected stops, dimming other routes', () => {
  const line: FreightLine = { id: 2, stops: [10, 20, 30], vehicles: 1, active: true,
    path: [{ x: 1, y: 1 }, { x: 2, y: 1 }], minutes: 4, capacity: 720, assigned: 24, trips: 1 };
  const views = freightMapRoutes('manual', [line, { ...line, id: 3 }], [], 'manual:2', true);
  expect(views.find(view => view.id === 2)).toMatchObject({ id: 2, kind: 'freight', stops: [10, 20, 30], dim: false });
  expect(views.find(view => view.id === 3)?.dim).toBe(true);
  expect(freightKey({ from: 10, to: 30, lineId: 2 })).toBe('manual:2');
});
it('gives automatic routes stable colours when other routes disappear', () => {
  const a = { from: 1, to: 2, path: [{ x: 1, y: 1 }], goods: 24, trucks: 1, minutes: 2 };
  const b = { ...a, from: 3 };
  expect(freightMapRoutes('auto', [], [a, b], freightKey(b))[0].id).toBe(freightMapRoutes('auto', [], [b])[0].id);
  expect(freightMapRoutes('auto', [], [a], 'deleted')[0].dim).toBe(false);
});

it('shows just the chosen route by default, with an explicit opt-in overview', () => {
  const a = { from: 1, to: 2, path: [{ x: 1, y: 1 }], goods: 24, trucks: 1, minutes: 2 };
  const b = { ...a, from: 3 };
  expect(freightMapRoutes('auto', [], [a, b])).toHaveLength(1);
  expect(freightMapRoutes('auto', [], [a, b], freightKey(b))[0].stops).toEqual([3, 2]);
  const all = freightMapRoutes('auto', [], [a, b], freightKey(b), true);
  expect(all).toHaveLength(2);
  expect(all.at(-1)?.dim).toBe(false);
  expect(all[0].dim).toBe(true);
});
