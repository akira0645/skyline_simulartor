export interface AutosaveStatus {
  phase: 'loading' | 'ready' | 'failed';
  lastSaved?: number;
  error?: string;
}

/** Coordinates initialization and writes independently of React or IndexedDB. */
export class AutosaveSession<T> {
  status: AutosaveStatus = { phase: 'loading' };
  private tail: Promise<void> = Promise.resolve();
  private initializing?: Promise<boolean>;
  constructor(private readonly io: {
    read: () => Promise<unknown>;
    restore: (value: unknown) => void;
    snapshot: () => T;
    write: (value: T) => Promise<void>;
    now: () => number;
  }, private readonly changed: (status: AutosaveStatus) => void) {}

  initialize(): Promise<boolean> {
    return this.initializing ??= this.open();
  }
  retry(): Promise<boolean> {
    if (this.status.phase !== 'failed') return this.initialize();
    this.publish({ phase: 'loading' });
    return this.initializing = this.open();
  }
  /** Called only after another save has been successfully parsed and restored. */
  resumeAfterRecovery(): void {
    if (this.status.phase === 'failed') this.publish({ phase: 'ready' });
  }
  private publish(status: AutosaveStatus): void {
    this.status = status;
    this.changed(status);
  }
  private async open(): Promise<boolean> {
    try {
      const value = await this.io.read();
      if (value !== undefined) this.io.restore(value);
      this.publish({ phase: 'ready' });
      return value !== undefined;
    } catch {
      this.publish({ phase: 'failed', error: '自動存檔讀取失敗，已保留原檔並停止自動覆寫。可從存檔清單讀取備份，或先手動另存。' });
      return false;
    }
  }

  /** Reading fails closed. Write failures remain retryable, and never advance lastSaved. */
  save(): Promise<void> {
    if (this.status.phase !== 'ready') return Promise.resolve();
    const operation = this.tail.then(async () => {
      try {
        await this.io.write(this.io.snapshot());
        this.publish({ phase: 'ready', lastSaved: this.io.now() });
      } catch {
        this.publish({ ...this.status, error: '自動存檔失敗，請確認瀏覽器儲存空間，或使用手動另存。稍後會重試。' });
      }
    });
    this.tail = operation;
    return operation;
  }
}
