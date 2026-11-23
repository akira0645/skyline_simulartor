import { expect, it, vi } from 'vitest';
import { LazyThemeAsset } from './LazyThemeAsset';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

it('does not load close-up atlases until requested and deduplicates repeated redraws', async () => {
  const load = vi.fn(async (theme: string) => theme), ready = vi.fn(), release = vi.fn();
  const assets = new LazyThemeAsset(load, release, ready, vi.fn());
  expect(load).not.toHaveBeenCalled();
  for (let i = 0; i < 50; i++) assets.request('sf');
  await vi.waitFor(() => expect(ready).toHaveBeenCalledWith('sf', 'sf'));
  assets.request('sf');
  expect(load).toHaveBeenCalledTimes(1);
  assets.clear();
  await vi.waitFor(() => expect(release).toHaveBeenCalledWith('sf', 'sf'));
});

it('releases an obsolete in-flight theme before loading the latest theme', async () => {
  const old = deferred<string>(), released = deferred<void>(), events: string[] = [];
  const load = vi.fn(async (theme: string) => { events.push(`load:${theme}`); return theme === 'classic' ? old.promise : theme; });
  const ready = vi.fn();
  const assets = new LazyThemeAsset(load, async theme => { events.push(`release:${theme}`); await released.promise; }, ready, vi.fn());
  assets.request('classic');
  await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(1));
  assets.request('sf'); assets.request('newyork');
  old.resolve('classic');
  await vi.waitFor(() => expect(events).toContain('release:classic'));
  expect(load).toHaveBeenCalledTimes(1);
  expect(ready).not.toHaveBeenCalled();
  released.resolve();
  await vi.waitFor(() => expect(ready).toHaveBeenCalledWith('newyork', 'newyork'));
  expect(events).toEqual(['load:classic', 'release:classic', 'load:newyork']);
  assets.destroy();
});

it('releases the current atlas when switching or zooming back out', async () => {
  const release = vi.fn(), ready = vi.fn();
  const assets = new LazyThemeAsset(async theme => theme, release, ready, vi.fn());
  assets.request('california');
  await vi.waitFor(() => expect(ready).toHaveBeenCalledTimes(1));
  assets.request('sf');
  await vi.waitFor(() => expect(ready).toHaveBeenCalledTimes(2));
  expect(release).toHaveBeenCalledWith('california', 'california');
  assets.clear();
  await vi.waitFor(() => expect(release).toHaveBeenCalledWith('sf', 'sf'));
});

it('keeps one warm theme across zoom thresholds but does not preload a newly selected theme', async () => {
  const load = vi.fn(async (theme: string) => theme), ready = vi.fn(), release = vi.fn();
  const assets = new LazyThemeAsset(load, release, ready, vi.fn());
  assets.retain('classic');
  expect(load).not.toHaveBeenCalled();
  assets.request('classic');
  await vi.waitFor(() => expect(ready).toHaveBeenCalledTimes(1));
  for (let i = 0; i < 20; i++) { assets.retain('classic'); assets.request('classic'); }
  expect(load).toHaveBeenCalledTimes(1);
  expect(release).not.toHaveBeenCalled();
  assets.retain('newyork');
  await vi.waitFor(() => expect(release).toHaveBeenCalledWith('classic', 'classic'));
  expect(load).toHaveBeenCalledTimes(1);
  assets.destroy();
});

it('never installs a late atlas after the view is destroyed', async () => {
  const pending = deferred<string>(), release = vi.fn(), ready = vi.fn();
  const load = vi.fn(() => pending.promise);
  const assets = new LazyThemeAsset(load, release, ready, vi.fn());
  assets.request('classic');
  await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(1));
  assets.destroy(); pending.resolve('texture');
  await vi.waitFor(() => expect(release).toHaveBeenCalledWith('classic', 'texture'));
  assets.request('sf');
  expect(load).toHaveBeenCalledTimes(1);
  expect(ready).not.toHaveBeenCalled();
});

it('retains the base view after failure instead of retrying on every redraw', async () => {
  const load = vi.fn(async () => { throw Error('decode failed'); }), error = vi.fn();
  const assets = new LazyThemeAsset(load, vi.fn(), vi.fn(), error);
  assets.request('classic');
  await vi.waitFor(() => expect(error).toHaveBeenCalledTimes(1));
  for (let i = 0; i < 20; i++) assets.request('classic');
  expect(load).toHaveBeenCalledTimes(1);
});
