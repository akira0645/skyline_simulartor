import { expect, it } from 'vitest';
import { shiftPhase, workShift } from './WorkShift';

it('starts office commute before the shift and sends workers home after it', () => {
  const { start, end } = workShift('commercial', 5);
  expect(shiftPhase(8.5, start, end, 1)).toMatchObject({ atWork: false, progress: 0.5 });
  expect(shiftPhase(9, start, end, 1)).toEqual({ atWork: true });
  expect(shiftPhase(17.5, start, end, 1)).toMatchObject({ returning: true, progress: 0.5 });
  expect(shiftPhase(18, start, end, 1)).toEqual({ atWork: false });
});

it('ends a late factory shift at midnight', () => {
  const { start, end } = workShift('industrial', 5);
  expect(shiftPhase(23, start, end, 1).atWork).toBe(true);
  expect(shiftPhase(0, start, end, 1)).toMatchObject({ atWork: false, returning: true });
});
