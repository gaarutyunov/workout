import { replicateRxCollection, type RxReplicationState } from 'rxdb/plugins/replication';
import type { RxCollection, WithDeleted } from 'rxdb';
import { lww } from '../../db/conflictHandler';
import type { AppDatabase, Collections } from '../../db/database';
import {
  filesDelete,
  filesDownloadJson,
  filesUpload,
  listFolder,
  listFolderContinue,
  type DropboxEntry,
} from './client';

// §5: a custom RxDB replication (pull/push) per collection over Dropbox. One JSON
// file per document under /collections/<collection>/<id>.json. The Dropbox
// list_folder cursor is carried as the RxDB checkpoint, so pulls are incremental and
// RxDB persists the cursor for us.

// `muscles` is a static reference set, not synced. Everything else round-trips.
const SYNCED: (keyof Collections)[] = [
  'profile',
  'exercises',
  'planExercises',
  'workouts',
  'loggedExercises',
  'meals',
  'nutritionDays',
  'activities',
  'bodyMetrics',
  'chatSessions',
  'menuItems',
];

interface DropboxCheckpoint {
  cursor?: string;
}

function folderFor(collection: string): string {
  return `/collections/${collection}`;
}

function pathFor(collection: string, id: string): string {
  return `${folderFor(collection)}/${id}.json`;
}

function isConflictedCopy(entry: DropboxEntry): boolean {
  return entry.name.toLowerCase().includes('conflicted copy');
}

/** Original filename id from a "name (conflicted copy …).json" entry. */
function canonicalIdFromConflicted(name: string): string {
  const base = name.replace(/\.json$/i, '');
  const idx = base.toLowerCase().indexOf(' (conflicted copy');
  return (idx >= 0 ? base.slice(0, idx) : base).trim();
}

function ensureDeletedFlag<T>(doc: T): WithDeleted<T> {
  const d = doc as WithDeleted<T>;
  return { ...d, _deleted: !!d._deleted };
}

async function safeList(collection: string): Promise<{ entries: DropboxEntry[]; cursor: string }> {
  try {
    const first = await listFolder(folderFor(collection));
    const entries = [...first.entries];
    let cursor = first.cursor;
    let hasMore = first.has_more;
    while (hasMore) {
      const next = await listFolderContinue(cursor);
      entries.push(...next.entries);
      cursor = next.cursor;
      hasMore = next.has_more;
    }
    return { entries, cursor };
  } catch (err) {
    // Folder doesn't exist yet (nothing pushed) → empty, no cursor.
    if (String(err).includes('not_found') || String(err).includes('409')) {
      return { entries: [], cursor: '' };
    }
    throw err;
  }
}

async function continueList(cursor: string): Promise<{ entries: DropboxEntry[]; cursor: string }> {
  const entries: DropboxEntry[] = [];
  let cur = cursor;
  let hasMore = true;
  while (hasMore) {
    const page = await listFolderContinue(cur);
    entries.push(...page.entries);
    cur = page.cursor;
    hasMore = page.has_more;
  }
  return { entries, cursor: cur };
}

/**
 * Reconcile a Dropbox "(conflicted copy)" file: LWW-merge it with the canonical
 * file, write the winner back to the canonical path, delete the conflicted copy,
 * and return the winning document so it flows into RxDB.
 */
async function reconcileConflicted(
  collection: string,
  entry: DropboxEntry,
): Promise<WithDeleted<any> | null> {
  const id = canonicalIdFromConflicted(entry.name);
  const conflicted = await filesDownloadJson<WithDeleted<any>>(entry.path_lower);
  const canonical = await filesDownloadJson<WithDeleted<any>>(pathFor(collection, id));
  const winner = canonical ? lww(ensureDeletedFlag(canonical), ensureDeletedFlag(conflicted ?? canonical)) : conflicted;
  if (winner) {
    await filesUpload(pathFor(collection, id), winner);
  }
  await filesDelete(entry.path_lower);
  return winner ? ensureDeletedFlag(winner) : null;
}

async function entriesToDocuments(
  collection: string,
  entries: DropboxEntry[],
): Promise<WithDeleted<any>[]> {
  const docs: WithDeleted<any>[] = [];
  for (const entry of entries) {
    if (entry['.tag'] === 'folder') continue;
    if (!entry.name.toLowerCase().endsWith('.json')) continue;

    if (isConflictedCopy(entry)) {
      const winner = await reconcileConflicted(collection, entry);
      if (winner) docs.push(winner);
      continue;
    }
    if (entry['.tag'] === 'deleted') {
      // Canonical file hard-removed remotely. Derive a tombstone from its id.
      const id = entry.name.replace(/\.json$/i, '');
      docs.push({ id, _deleted: true } as WithDeleted<any>);
      continue;
    }
    const doc = await filesDownloadJson<WithDeleted<any>>(entry.path_lower);
    if (doc) docs.push(ensureDeletedFlag(doc));
  }
  return docs;
}

function buildReplication(collection: RxCollection): RxReplicationState<any, DropboxCheckpoint> {
  const name = collection.name;
  return replicateRxCollection<any, DropboxCheckpoint>({
    collection,
    replicationIdentifier: `dropbox-${name}`,
    live: true,
    retryTime: 15000,
    autoStart: true,
    push: {
      batchSize: 30,
      async handler(rows) {
        // LWW + conflicted-copy guard means we can overwrite blindly; same-doc
        // collisions are resolved on the next pull. Upload one file per doc.
        for (const row of rows) {
          const doc = row.newDocumentState as WithDeleted<any> & { id: string };
          await filesUpload(pathFor(name, doc.id), doc);
        }
        return []; // no server-detected conflicts on the push side
      },
    },
    pull: {
      batchSize: 60,
      async handler(lastCheckpoint) {
        const cp = lastCheckpoint as DropboxCheckpoint | undefined;
        const listed = cp?.cursor
          ? await continueList(cp.cursor)
          : await safeList(name);
        const documents = await entriesToDocuments(name, listed.entries);
        return {
          documents,
          checkpoint: { cursor: listed.cursor } as DropboxCheckpoint,
        };
      },
    },
  });
}

export class DropboxSync {
  private states: RxReplicationState<any, DropboxCheckpoint>[] = [];
  private started = false;

  constructor(private db: AppDatabase) {}

  start(): void {
    if (this.started) return;
    this.started = true;
    for (const name of SYNCED) {
      const coll = this.db[name] as unknown as RxCollection;
      this.states.push(buildReplication(coll));
    }
  }

  /** Force an immediate pull+push cycle (call on focus / interval). */
  resync(): void {
    for (const s of this.states) s.reSync();
  }

  async stop(): Promise<void> {
    await Promise.all(this.states.map((s) => s.cancel()));
    this.states = [];
    this.started = false;
  }

  get active(): boolean {
    return this.started;
  }
}
