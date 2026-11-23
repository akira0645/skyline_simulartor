import { expect, it, vi } from 'vitest';
import { SharedAssetPool } from './SharedAssetPool';

it('does not unload a texture still used by a replacement city view', async () => {
  const unload = vi.fn(async () => {}), texture = {};
  const pool = new SharedAssetPool(async () => texture, unload);
  expect(await pool.acquire('sf')).toBe(texture);
  expect(await pool.acquire('sf')).toBe(texture);
  await pool.release('sf');
  expect(unload).not.toHaveBeenCalled();
  await pool.release('sf');
  expect(unload).toHaveBeenCalledTimes(1);
});

it('waits for an in-flight unload before a new view loads the same URL', async () => {
  let finish!: () => void;
  const unloading = new Promise<void>(resolve => { finish = resolve; });
  const load = vi.fn(async () => ({})), unload = vi.fn(() => unloading);
  const pool = new SharedAssetPool(load, unload);
  await pool.acquire('sf');
  const release = pool.release('sf');
  await vi.waitFor(() => expect(unload).toHaveBeenCalledTimes(1));
  const next = pool.acquire('sf');
  expect(load).toHaveBeenCalledTimes(1);
  finish(); await release; await next;
  expect(load).toHaveBeenCalledTimes(2);
});

it('does not keep a phantom owner after loading fails', async () => {
  const load = vi.fn().mockRejectedValueOnce(Error('offline')).mockResolvedValueOnce({});
  const unload = vi.fn(async () => {}), pool = new SharedAssetPool(load, unload);
  await expect(pool.acquire('sf')).rejects.toThrow('offline');
  await pool.acquire('sf'); await pool.release('sf');
  expect(unload).toHaveBeenCalledTimes(1);
});
