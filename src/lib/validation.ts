import Ajv, { type ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
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

// §6/§8.6/§9: the same per-collection schemas validate (a) tool output before it
// touches RxDB and (b) imported documents before bulk-upsert. Ajv ignores RxDB-only
// keywords (`version`, `primaryKey`, `indexes`) via strict:false.

const ajv = new Ajv({ allErrors: true, strict: false, coerceTypes: false });
addFormats(ajv);

// `muscles` is a reference collection with no housekeeping fields but still part
// of the import file. Map every importable collection to its JSON Schema.
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

const validators = new Map<string, ValidateFunction>();

function validatorFor(collection: string): ValidateFunction | null {
  if (validators.has(collection)) return validators.get(collection)!;
  const schema = SCHEMAS[collection];
  if (!schema) return null;
  const fn = ajv.compile(schema);
  validators.set(collection, fn);
  return fn;
}

export interface RowError {
  index: number;
  id?: string;
  errors: string[];
}

export interface ValidationResult<T> {
  valid: T[];
  errors: RowError[];
}

function formatErrors(fn: ValidateFunction): string[] {
  return (fn.errors ?? []).map((e) => `${e.instancePath || '/'} ${e.message ?? 'invalid'}`);
}

/** Validate an array of docs against a collection schema; partition into valid + errors. */
export function validateRows<T extends { id?: string }>(
  collection: CollectionName,
  rows: unknown[],
): ValidationResult<T> {
  const fn = validatorFor(collection);
  const result: ValidationResult<T> = { valid: [], errors: [] };
  if (!fn) {
    result.errors.push({ index: -1, errors: [`Unknown collection: ${collection}`] });
    return result;
  }
  rows.forEach((row, index) => {
    if (fn(row)) {
      result.valid.push(row as T);
    } else {
      const id = (row as { id?: string })?.id;
      result.errors.push({ index, id, errors: formatErrors(fn) });
    }
  });
  return result;
}

/** Validate a single document; returns null if valid, else an error list. */
export function validateDoc(collection: CollectionName, doc: unknown): string[] | null {
  const fn = validatorFor(collection);
  if (!fn) return [`Unknown collection: ${collection}`];
  return fn(doc) ? null : formatErrors(fn);
}
