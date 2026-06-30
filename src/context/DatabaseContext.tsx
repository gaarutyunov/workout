import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { AppDatabase } from '../db/database';
import { getDatabase } from '../db/database';
import { SyncManager } from '../sync/syncManager';
import { completeAuthFromRedirect as completeDropbox } from '../sync/dropbox/auth';
import { completeAuthFromRedirect as completeOpenRouter } from '../ai/openrouter';

interface DatabaseContextValue {
  db: AppDatabase;
  sync: SyncManager;
}

const Ctx = createContext<DatabaseContextValue | null>(null);

export function DatabaseProvider({ children }: { children: ReactNode }) {
  const [value, setValue] = useState<DatabaseContextValue | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Finish any OAuth redirect first (consumes ?code from the URL).
        await completeDropbox().catch((e) => console.warn('Dropbox auth:', e));
        await completeOpenRouter().catch((e) => console.warn('OpenRouter auth:', e));

        const db = await getDatabase();
        // No bundled seed data — the database starts empty and the user loads
        // their own data via the Import page (§9) or it arrives over Dropbox sync.
        const sync = new SyncManager(db);
        sync.start(); // no-op unless Dropbox is connected
        if (!cancelled) setValue({ db, sync });
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div className="boot-error">
        <h1>Couldn't start the app</h1>
        <pre>{error}</pre>
      </div>
    );
  }
  if (!value) {
    return <div className="boot">Loading your data…</div>;
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDatabase(): AppDatabase {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useDatabase must be used within DatabaseProvider');
  return ctx.db;
}

export function useSync(): SyncManager {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useSync must be used within DatabaseProvider');
  return ctx.sync;
}
