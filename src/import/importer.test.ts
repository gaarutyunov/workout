import { describe, expect, it } from 'vitest';
import { validateRows } from '../lib/validation';
import { importJsonSchema } from './promptTemplate';
import type { CollectionName } from '../db/types';

// Minimal valid fixture — one document per collection — exercising the §6 schemas
// the importer validates against. No personal data ships in the repo; users load
// their own via the Import page.
const FIXTURE: Record<string, unknown[]> = {
  profile: [{ id: 'profile-self', goal: 'recomp', targets: { proteinG: 150 } }],
  muscles: [{ id: 'chest', highlighterSlug: 'chest', label: 'Chest' }],
  exercises: [
    { id: 'ex-chest-press', name: 'Chest Press', primaryMuscle: 'chest', loadType: 'machine' },
  ],
  planExercises: [
    { id: 'plan-mon-chest-press', weekday: 'monday', exerciseId: 'ex-chest-press', targetSets: 3 },
  ],
  workouts: [{ id: 'w-2026-06-30', date: '2026-06-30', focus: 'Chest' }],
  loggedExercises: [
    {
      id: 'le-2026-06-30-chest-press',
      workoutId: 'w-2026-06-30',
      exerciseId: 'ex-chest-press',
      sets: [{ set: 1, reps: 10, weightKg: 40 }],
    },
  ],
  meals: [{ id: 'm-2026-06-30-lunch', date: '2026-06-30', slot: 'lunch', proteinG: 40 }],
  menuItems: [{ id: 'menu-chicken', name: 'Chicken', timesLogged: 3, defaultSlot: 'lunch' }],
  nutritionDays: [{ id: 'nd-2026-06-30', date: '2026-06-30', proteinG: 120 }],
  activities: [{ id: 'act-2026-06-30', date: '2026-06-30', type: 'padel', durationMin: 60 }],
  bodyMetrics: [{ id: 'bm-2026-06-30', date: '2026-06-30', weightKg: 80 }],
};

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

describe('import validation (§9)', () => {
  it('a minimal document for every collection validates against its §6 schema', () => {
    for (const name of COLLECTIONS) {
      const rows = FIXTURE[name] ?? [];
      const { valid, errors } = validateRows(name, rows);
      expect(errors, `${name}: ${JSON.stringify(errors)}`).toHaveLength(0);
      expect(valid.length).toBe(rows.length);
    }
  });

  it('rejects documents missing required fields', () => {
    const { errors } = validateRows('workouts', [{ id: 'w-x' }]); // missing required `date`
    expect(errors.length).toBe(1);
  });

  it('exposes one array per collection in the import schema', () => {
    const schema = importJsonSchema() as { properties: Record<string, unknown> };
    for (const name of COLLECTIONS) {
      expect(schema.properties[name]).toBeDefined();
    }
  });
});
