import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateRows } from '../lib/validation';
import type { CollectionName } from '../db/types';

const here = dirname(fileURLToPath(import.meta.url));
const seedPath = resolve(here, '../../public/fitness_import.json');
const seed = JSON.parse(readFileSync(seedPath, 'utf-8')) as Record<string, unknown[]>;

const COLLECTIONS: CollectionName[] = [
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
];

describe('seed fitness_import.json', () => {
  it('every collection validates against its §6 schema', () => {
    for (const name of COLLECTIONS) {
      const rows = (seed[name] ?? []) as unknown[];
      const { valid, errors } = validateRows(name, rows);
      expect(errors, `${name}: ${JSON.stringify(errors)}`).toHaveLength(0);
      expect(valid.length).toBe(rows.length);
    }
  });

  it('uses deterministic id prefixes', () => {
    expect((seed.workouts as { id: string }[]).every((w) => w.id.startsWith('w-'))).toBe(true);
    expect((seed.loggedExercises as { id: string }[]).every((l) => l.id.startsWith('le-'))).toBe(true);
    expect((seed.planExercises as { id: string }[]).every((p) => p.id.startsWith('plan-'))).toBe(true);
  });
});
