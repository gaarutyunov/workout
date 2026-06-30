import type { AppDatabase } from '../db/database';
import { DropboxSync } from './dropbox/replication';
import { hasRefreshToken, isConfigured } from './dropbox/auth';

// Orchestrates replication cadence (§5): pull on focus + every N seconds while the
// tab is visible; replication itself debounces/batches pushes. Only runs when the
// user has connected Dropbox.

const POLL_INTERVAL_MS = 30_000;

export class SyncManager {
  private sync: DropboxSync | null = null;
  private timer: number | null = null;
  private listenersBound = false;

  constructor(private db: AppDatabase) {}

  /** Start syncing if Dropbox is configured + connected. Idempotent. */
  start(): boolean {
    if (!isConfigured() || !hasRefreshToken()) return false;
    if (!this.sync) this.sync = new DropboxSync(this.db);
    this.sync.start();
    this.bindCadence();
    return true;
  }

  async stop(): Promise<void> {
    this.unbindCadence();
    await this.sync?.stop();
    this.sync = null;
  }

  get isRunning(): boolean {
    return !!this.sync?.active;
  }

  private bindCadence(): void {
    if (this.listenersBound) return;
    this.listenersBound = true;
    window.addEventListener('focus', this.onFocus);
    document.addEventListener('visibilitychange', this.onVisibility);
    this.timer = window.setInterval(this.tick, POLL_INTERVAL_MS);
  }

  private unbindCadence(): void {
    if (!this.listenersBound) return;
    this.listenersBound = false;
    window.removeEventListener('focus', this.onFocus);
    document.removeEventListener('visibilitychange', this.onVisibility);
    if (this.timer != null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
  }

  private onFocus = (): void => this.sync?.resync();
  private onVisibility = (): void => {
    if (document.visibilityState === 'visible') this.sync?.resync();
  };
  private tick = (): void => {
    if (document.visibilityState === 'visible') this.sync?.resync();
  };
}
