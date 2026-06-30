import type { AppDatabase } from '../db/database';
import { getDeviceId } from '../lib/device';
import { validateRows, type RowError } from '../lib/validation';
import type { CollectionName } from '../db/types';

// §9: load → schema-validate each array against the per-collection schema → bulkUpsert
// into the matching RxDB collection → report per-row errors. Importing the same id
// again updates that doc (idempotent). `updatedAt`/`deviceId` are added on ingest;
// `muscles` is a reference set with no housekeeping fields.

// Order matters loosely: catalogs/refs before the rows that reference them.
const IMPORT_ORDER: CollectionName[] = [
  'profile',
  'muscles',
  'exercises',
  'planExercises',
  'workouts',
  'loggedExercises',
  'meals',
  'menuItems',
  'nutritionDays',
  'activities',
  'bodyMetrics',
  'chatSessions',
];

const NO_HOUSEKEEPING = new Set<CollectionName>(['muscles']);

export interface ImportMeta {
  schemaVersion?: number;
  generatedAt?: string;
  source?: string;
}

export interface CollectionReport {
  collection: CollectionName;
  inserted: number;
  errors: RowError[];
}

export interface ImportReport {
  meta?: ImportMeta;
  collections: CollectionReport[];
  totalInserted: number;
  totalErrors: number;
}

function stampForIngest(collection: CollectionName, rows: Record<string, unknown>[]): Record<string, unknown>[] {
  if (NO_HOUSEKEEPING.has(collection)) return rows;
  const now = new Date().toISOString();
  const deviceId = getDeviceId();
  return rows.map((r) => ({
    updatedAt: now,
    deviceId,
    ...r, // keep any explicit values from the file
    // ensure both exist even if file omitted them
    ...(r.updatedAt ? {} : { updatedAt: now }),
    ...(r.deviceId ? {} : { deviceId }),
  }));
}

export async function importData(db: AppDatabase, raw: unknown): Promise<ImportReport> {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Import file is not a JSON object.');
  }
  const obj = raw as Record<string, unknown>;
  const report: ImportReport = {
    meta: obj.meta as ImportMeta | undefined,
    collections: [],
    totalInserted: 0,
    totalErrors: 0,
  };

  for (const collection of IMPORT_ORDER) {
    const arr = obj[collection];
    if (!Array.isArray(arr)) continue;

    const stamped = stampForIngest(collection, arr as Record<string, unknown>[]);
    const { valid, errors } = validateRows(collection, stamped);

    let inserted = 0;
    if (valid.length) {
      const coll = db[collection] as unknown as {
        bulkUpsert: (docs: unknown[]) => Promise<{ success: unknown[]; error: unknown[] }>;
      };
      const res = await coll.bulkUpsert(valid);
      inserted = res.success.length;
      // Surface any storage-level rejections alongside validation errors.
      for (const e of res.error as { documentId?: string }[]) {
        errors.push({ index: -1, id: e.documentId, errors: ['bulkUpsert rejected'] });
      }
    }

    report.collections.push({ collection, inserted, errors });
    report.totalInserted += inserted;
    report.totalErrors += errors.length;
  }

  return report;
}

export async function importFromText(db: AppDatabase, text: string): Promise<ImportReport> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    throw new Error(`Invalid JSON: ${(e as Error).message}`);
  }
  return importData(db, parsed);
}
