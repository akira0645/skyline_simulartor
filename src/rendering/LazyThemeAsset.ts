import type { Theme } from '../simulation/SaveData';

/** Load one close-up theme at a time. Serialize loads/releases even during rapid city changes. */
export class LazyThemeAsset<T> {
  private wanted?: Theme;
  private current?: { theme: Theme; value: T };
  private failed?: Theme;
  private pending = false;
  private disposed = false;
  private cleanup = Promise.resolve();

  constructor(private readonly load: (theme: Theme) => Promise<T>,
    private readonly release: (theme: Theme, value: T) => Promise<void> | void,
    private readonly ready: (theme: Theme, value: T) => void,
    private readonly error: (error: unknown) => void) {}

  request(theme: Theme): void {
    if (this.disposed) return;
    if (this.wanted !== theme) this.failed = undefined;
    this.wanted = theme;
    if (this.current && this.current.theme !== theme) this.releaseCurrent();
    this.pump();
  }

  clear(): void {
    this.wanted = undefined;
    this.failed = undefined;
    this.releaseCurrent();
  }

  /** Keep the same city's atlas across zoom thresholds to avoid repeated decode/GPU uploads. */
  retain(theme: Theme): void {
    if (this.wanted !== theme) this.clear();
  }

  private disposeValue(theme: Theme, value: T): void {
    this.cleanup = this.cleanup.then(() => this.release(theme, value)).catch(this.error);
  }
  private releaseCurrent(): void {
    if (!this.current) return;
    const { theme, value } = this.current;
    this.current = undefined;
    this.disposeValue(theme, value);
  }
  private pump(): void {
    const theme = this.wanted;
    if (this.disposed || this.pending || !theme || this.current?.theme === theme || this.failed === theme) return;
    this.pending = true;
    void (async () => {
      try {
        await this.cleanup;
        if (this.disposed || this.wanted !== theme) return;
        const value = await this.load(theme);
        if (this.disposed || this.wanted !== theme) this.disposeValue(theme, value);
        else { this.current = { theme, value }; this.ready(theme, value); }
      } catch (error) {
        if (this.wanted === theme) this.failed = theme;
        this.error(error);
      } finally {
        this.pending = false;
        this.pump();
      }
    })();
  }
  destroy(): void {
    this.disposed = true;
    this.clear();
  }
}
