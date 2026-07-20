import type { RxJsonSchema } from 'rxdb';
import {
  activitiesSchema,
  bodyMetricsSchema,
  chatSessionsSchema,
  exercisesSchema,
  loggedExercisesSchema,
  mealsSchema,
  menuItemsSchema,
  musclesSchema,
  nutritionDaysSchema,
  planExercisesSchema,
  profileSchema,
  workoutsSchema,
} from '../db/schemas';
import type { CollectionName } from '../db/types';
import { validateAgainstSchema } from './jsonSchema';

// §6/§8.6/§9: the same per-collection schemas validate (a) tool output before it
// touches RxDB and (b) imported documents before bulk-upsert. Validation runs through
// the eval-free validator in ./jsonSchema (Ajv needs `new Function`, which the app's
// strict CSP forbids — see that file's header).

const SCHEMAS: Record<string, RxJsonSchema<any>> = {
  profile: profileSchema,
  muscles: musclesSchema,
  exercises: exercisesSchema,
  planExercises: planExercisesSchema,
  workouts: workoutsSchema,
  loggedExercises: loggedExercisesSchema,
  meals: mealsSchema,
  nutritionDays: nutritionDaysSchema,
  activities: activitiesSchema,
  bodyMetrics: bodyMetricsSchema,
  chatSessions: chatSessionsSchema,
  menuItems: menuItemsSchema,
};

export interface RowError {
  index: number;
  id?: string;
  errors: string[];
}

export interface ValidationResult<T> {
  valid: T[];
  errors: RowError[];
}

/** Validate an array of docs against a collection schema; partition into valid + errors. */
export function validateRows<T extends { id?: string }>(
  collection: CollectionName,
  rows: unknown[],
): ValidationResult<T> {
  const schema = SCHEMAS[collection];
  const result: ValidationResult<T> = { valid: [], errors: [] };
  if (!schema) {
    result.errors.push({ index: -1, errors: [`Unknown collection: ${collection}`] });
    return result;
  }
  rows.forEach((row, index) => {
    const issues = validateAgainstSchema(schema, row);
    if (issues.length === 0) {
      result.valid.push(row as T);
    } else {
      const id = (row as { id?: string })?.id;
      result.errors.push({ index, id, errors: issues });
    }
  });
  return result;
}

/** Validate a single document; returns null if valid, else an error list. */
export function validateDoc(collection: CollectionName, doc: unknown): string[] | null {
  const schema = SCHEMAS[collection];
  if (!schema) return [`Unknown collection: ${collection}`];
  const issues = validateAgainstSchema(schema, doc);
  return issues.length === 0 ? null : issues;
}
