import { getDeviceId } from '../lib/device';
import { validateDoc } from '../lib/validation';
import type { AppDatabase } from './database';
import type { CollectionName } from './types';

// Central write path used by both the AI tools (§8.2) and the UI. Every write
// stamps `updatedAt` (now) + `deviceId`, Ajv-validates against the §6 schema, then
// upserts. Deterministic ids (§6.13) make this idempotent: same id → corrects, not
// duplicates.

export interface StampOptions {
  /** Override the timestamp (ISO string). Defaults to now. */
  now?: string;
}

export function stamp<T extends Record<string, unknown>>(doc: T, opts: StampOptions = {}): T {
  return {
    ...doc,
    updatedAt: opts.now ?? new Date().toISOString(),
    deviceId: getDeviceId(),
  };
}

export class ValidationError extends Error {
  constructor(
    public collection: string,
    public issues: string[],
  ) {
    super(`Validation failed for ${collection}: ${issues.join('; ')}`);
    this.name = 'ValidationError';
  }
}

/**
 * Stamp housekeeping fields, validate, and upsert a single document.
 * Throws ValidationError (returned to the model on the tool path) if invalid.
 *
 * Input is intentionally a loose record: callers spread partial docs and RxDB
 * document JSON (which is deep-readonly), and the real guarantee is the Ajv
 * validation below, not the static shape.
 */
export async function writeDoc<T extends { id: string } = { id: string }>(
  db: AppDatabase,
  collection: Exclude<CollectionName, 'muscles'>,
  doc: { id: string } & Record<string, unknown>,
  opts: StampOptions = {},
): Promise<T> {
  const stamped = stamp(doc, opts) as unknown as T;
  const issues = validateDoc(collection, stamped);
  if (issues) throw new ValidationError(collection, issues);
  // RxCollection.upsert is typed per collection; the dynamic dispatch needs a cast.
  await (db[collection] as { upsert: (d: T) => Promise<unknown> }).upsert(stamped);
  return stamped;
}

/** Soft-delete (tombstone) — never hard-delete from the agent (§8.6). */
export async function tombstone(
  db: AppDatabase,
  collection: Exclude<CollectionName, 'muscles'>,
  id: string,
): Promise<void> {
  const coll = db[collection] as unknown as {
    findOne: (id: string) => { exec: () => Promise<{ patch: (p: object) => Promise<unknown> } | null> };
  };
  const found = await coll.findOne(id).exec();
  if (!found) return;
  await found.patch({ _deleted: true, updatedAt: new Date().toISOString(), deviceId: getDeviceId() });
}
