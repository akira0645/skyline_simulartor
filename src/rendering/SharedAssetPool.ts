/** Assets has a global cache. A departing view must not unload a texture acquired by its replacement. */
export class SharedAssetPool<K, T> {
  private readonly entries = new Map<K, { users: number; released: Promise<void> }>();
  constructor(private readonly load: (key: K) => Promise<T>, private readonly unload: (key: K) => Promise<void>) {}

  async acquire(key: K): Promise<T> {
    let entry = this.entries.get(key);
    if (!entry) { entry = { users: 0, released: Promise.resolve() }; this.entries.set(key, entry); }
    entry.users++;
    await entry.released;
    try { return await this.load(key); }
    catch (error) { entry.users--; throw error; }
  }
  release(key: K): Promise<void> {
    const entry = this.entries.get(key);
    if (!entry || entry.users <= 0) return Promise.resolve();
    entry.users--;
    if (entry.users) return Promise.resolve();
    const releasing = entry.released.then(async () => {
      if (!entry.users) await this.unload(key);
    });
    entry.released = releasing.catch(() => {});
    return releasing;
  }
}
