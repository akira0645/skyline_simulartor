import { expect, it, vi } from 'vitest';
import { AutosaveSession } from './AutosaveSession';

it.each(['read', 'restore'])('preserves the original save after a %s failure', async failure => {
  const write = vi.fn();
  const session = new AutosaveSession({
    read: async () => { if (failure === 'read') throw new Error(); return 'damaged'; },
    restore: () => { throw new Error(); }, snapshot: () => 'empty city', write, now: () => 1,
  }, () => {});
  await session.save();
  await session.initialize();
  await session.save();
  expect(write).not.toHaveBeenCalled();
  expect(session.status.phase).toBe('failed');
});

it('serializes writes, retries failures, and only updates the successful timestamp', async () => {
  let release!: () => void;
  let value = 1;
  let writing = 0;
  const seen: number[] = [];
  const session = new AutosaveSession({ read: async () => undefined, restore: () => {},
    snapshot: () => value, now: () => value,
    write: async snapshot => {
      expect(writing++).toBe(0);
      seen.push(snapshot);
      if (snapshot === 1) await new Promise<void>(resolve => { release = resolve; });
      writing--;
      if (snapshot === 3) throw new Error('quota');
    },
  }, () => {});
  await session.initialize();
  const first = session.save();
  await Promise.resolve();
  value = 2;
  const second = session.save();
  release();
  await Promise.all([first, second]);
  expect(seen).toEqual([1, 2]);
  value = 3;
  await session.save();
  expect(session.status.lastSaved).toBe(2);
  expect(session.status.error).toBeTruthy();
  value = 4;
  await session.save();
  expect(session.status).toEqual({ phase: 'ready', lastSaved: 4 });
});
