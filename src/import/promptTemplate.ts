import {
  activitiesSchema,
  bodyMetricsSchema,
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

// §9: the app shows a copyable prompt template + the JSON Schema. A user pastes
// free-form notes into any AI agent, gets back JSON, and uploads it here.

// Strip RxDB-only keywords so the schema reads cleanly for an external model.
function cleanSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const { version, primaryKey, indexes, ...rest } = schema as Record<string, unknown> & {
    version?: unknown;
    primaryKey?: unknown;
    indexes?: unknown;
  };
  void version;
  void primaryKey;
  void indexes;
  return rest;
}

/** The JSON Schema for the whole import file (one array per collection). */
export function importJsonSchema(): Record<string, unknown> {
  const arrayOf = (s: Record<string, unknown>) => ({ type: 'array', items: cleanSchema(s) });
  return {
    $schema: 'http://json-schema.org/draft-07/schema#',
    title: 'fitness_import',
    type: 'object',
    properties: {
      meta: {
        type: 'object',
        properties: {
          schemaVersion: { type: 'integer' },
          generatedAt: { type: 'string' },
          source: { type: 'string' },
        },
      },
      profile: arrayOf(profileSchema as unknown as Record<string, unknown>),
      muscles: arrayOf(musclesSchema as unknown as Record<string, unknown>),
      exercises: arrayOf(exercisesSchema as unknown as Record<string, unknown>),
      planExercises: arrayOf(planExercisesSchema as unknown as Record<string, unknown>),
      workouts: arrayOf(workoutsSchema as unknown as Record<string, unknown>),
      loggedExercises: arrayOf(loggedExercisesSchema as unknown as Record<string, unknown>),
      meals: arrayOf(mealsSchema as unknown as Record<string, unknown>),
      menuItems: arrayOf(menuItemsSchema as unknown as Record<string, unknown>),
      nutritionDays: arrayOf(nutritionDaysSchema as unknown as Record<string, unknown>),
      activities: arrayOf(activitiesSchema as unknown as Record<string, unknown>),
      bodyMetrics: arrayOf(bodyMetricsSchema as unknown as Record<string, unknown>),
    },
  };
}

export function importSchemaText(): string {
  return JSON.stringify(importJsonSchema(), null, 2);
}

export function promptTemplate(): string {
  return [
    'You are a data formatter. Convert my training and nutrition notes into ONE JSON object matching this schema exactly:',
    '',
    importSchemaText(),
    '',
    'Rules: output only valid JSON, no prose, no markdown fences. Use ISO dates (YYYY-MM-DD). One `workouts` entry per session; one `loggedExercises` entry per exercise in that session, with a `sets` array. `weightKg` is the load per `loadType` (`dumbbell_per_hand` = one hand; `barbell` = total plates; `bodyweight` = 0). If a value is unknown, use `null` (for reps/weight) or omit the optional field. Generate stable `id`s like `w-<date>`, `le-<date>-<exercise-slug>`, `m-<date>-<n>`.',
    '',
    'My notes: [...]',
  ].join('\n');
}
