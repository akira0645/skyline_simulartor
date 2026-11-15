import { expect, it, vi } from 'vitest';
import { AutosaveSession } from './AutosaveSession';

it('allows retry after a failed read and does not replace a ready city on repeated retry', async () => {
  let reads = 0;
  const restore = vi.fn();
  const write = vi.fn();
  const session = new AutosaveSession({ read: async () => { if (++reads === 1) throw new Error(); return 'saved'; },
    restore, snapshot: () => 'current', write, now: () => 1 }, () => {});
  await session.initialize();
  await session.save();
  expect(write).not.toHaveBeenCalled();
  expect(await session.retry()).toBe(true);
  expect(restore).toHaveBeenCalledExactlyOnceWith('saved');
  await session.retry();
  expect(reads).toBe(2);
  await session.save();
  expect(write).toHaveBeenCalledExactlyOnceWith('current');
});

it('resumes autosave only after a successfully restored alternate save is acknowledged', async () => {
  const write = vi.fn();
  const session = new AutosaveSession({ read: async () => { throw new Error(); }, restore: () => {},
    snapshot: () => 'restored backup', write, now: () => 1 }, () => {});
  await session.initialize();
  await session.save();
  expect(write).not.toHaveBeenCalled();
  session.resumeAfterRecovery();
  await session.save();
  expect(write).toHaveBeenCalledExactlyOnceWith('restored backup');
});

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
