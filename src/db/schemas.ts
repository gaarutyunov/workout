import type { RxJsonSchema } from 'rxdb';
import type {
  Activity,
  BodyMetric,
  ChatSession,
  Exercise,
  LoggedExercise,
  Meal,
  MenuItem,
  Muscle,
  NutritionDay,
  PlanExercise,
  Profile,
  Workout,
} from './types';

// RxDB requires indexed string fields to declare maxLength, and indexed number
// fields to declare minimum/maximum/multipleOf. Dates are YYYY-MM-DD (10 chars);
// ISO date-times fit in 30. These mirror the JSON Schemas in §6 of SPEC.md.

const updatedAt = { type: 'string', format: 'date-time', maxLength: 30 } as const;
const deviceId = { type: 'string', maxLength: 60 } as const;
const dateField = { type: 'string', format: 'date', maxLength: 10 } as const;

export const profileSchema: RxJsonSchema<Profile> = {
  title: 'profile',
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 40 },
    displayName: { type: 'string' },
    sex: { type: 'string', enum: ['male', 'female', 'other'] },
    age: { type: 'integer' },
    heightCm: { type: 'number' },
    startWeightKg: { type: 'number' },
    goal: { type: 'string' },
    programStart: { type: 'string', format: 'date' },
    splitType: { type: 'string' },
    weekendActivities: { type: 'array', items: { type: 'string' } },
    targets: {
      type: 'object',
      properties: {
        proteinG: { type: 'number' },
        kcalLow: { type: 'number' },
        kcalHigh: { type: 'number' },
        carbsG: { type: 'number' },
        fatG: { type: 'number' },
        hydrationLLow: { type: 'number' },
        hydrationLHigh: { type: 'number' },
        fiberG: { type: 'number' },
      },
    },
    constraints: { type: 'array', items: { type: 'string' } },
    asymmetryProtocol: { type: 'string' },
    notes: { type: 'string' },
    updatedAt,
    deviceId,
  },
  required: ['id'],
};

export const musclesSchema: RxJsonSchema<Muscle> = {
  title: 'muscles',
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 40 },
    label: { type: 'string' },
    highlighterSlug: { type: 'string' },
    note: { type: 'string' },
  },
  required: ['id', 'highlighterSlug'],
};

export const exercisesSchema: RxJsonSchema<Exercise> = {
  title: 'exercises',
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 60 },
    name: { type: 'string' },
    primaryMuscle: { type: 'string', maxLength: 40 },
    secondaryMuscles: { type: 'array', items: { type: 'string' } },
    loadType: {
      type: 'string',
      enum: ['machine', 'cable', 'barbell', 'dumbbell_per_hand', 'bodyweight', 'weighted_plate'],
    },
    unilateral: { type: 'boolean' },
    category: { type: 'string', maxLength: 12, enum: ['compound', 'isolation', 'core'] },
    note: { type: 'string' },
    updatedAt,
    deviceId,
  },
  required: ['id', 'name', 'primaryMuscle', 'loadType'],
  indexes: ['primaryMuscle', 'category'],
};

export const planExercisesSchema: RxJsonSchema<PlanExercise> = {
  title: 'planExercises',
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 60 },
    dayLabel: { type: 'string' },
    weekday: {
      type: 'string',
      maxLength: 10,
      enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
    },
    exerciseId: { type: 'string', maxLength: 60 },
    targetSets: { type: 'integer' },
    repLow: { type: ['integer', 'null'] },
    repHigh: { type: ['integer', 'null'] },
    currentWeightKg: { type: ['number', 'null'] },
    loadType: { type: 'string' },
    nextProgression: { type: 'string' },
    status: {
      type: 'string',
      enum: ['active', 'hold', 'progressing', 'ready-to-progress', 'baseline', 'transition', 'flagged'],
    },
    note: { type: 'string' },
    updatedAt,
    deviceId,
  },
  required: ['id', 'exerciseId', 'weekday'],
  indexes: ['weekday', 'exerciseId'],
};

export const workoutsSchema: RxJsonSchema<Workout> = {
  title: 'workouts',
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 40 },
    date: dateField,
    weekday: { type: 'string' },
    focus: { type: 'string' },
    weekNumber: { type: 'integer', minimum: 0, maximum: 9999, multipleOf: 1 },
    programPhase: { type: 'string' },
    completed: { type: 'boolean' },
    notes: { type: 'string' },
    updatedAt,
    deviceId,
  },
  required: ['id', 'date'],
  indexes: ['date', 'weekNumber'],
};

export const loggedExercisesSchema: RxJsonSchema<LoggedExercise> = {
  title: 'loggedExercises',
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 80 },
    workoutId: { type: 'string', maxLength: 40 },
    exerciseId: { type: 'string', maxLength: 60 },
    order: { type: 'integer' },
    loadType: { type: 'string' },
    weightKg: { type: ['number', 'null'] },
    prescribedReps: { type: 'string' },
    isProgression: { type: 'boolean' },
    progressionNote: { type: 'string' },
    note: { type: 'string' },
    sets: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          set: { type: 'integer' },
          reps: { type: ['integer', 'null'] },
          weightKg: { type: ['number', 'null'] },
          isHold: { type: 'boolean' },
          note: { type: 'string' },
        },
        required: ['set'],
      },
    },
    updatedAt,
    deviceId,
  },
  required: ['id', 'workoutId', 'exerciseId'],
  indexes: ['workoutId', 'exerciseId'],
};

export const mealsSchema: RxJsonSchema<Meal> = {
  title: 'meals',
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 40 },
    date: dateField,
    slot: {
      type: 'string',
      enum: ['breakfast', 'brunch', 'lunch', 'dinner', 'snack', 'preworkout'],
    },
    description: { type: 'string' },
    proteinG: { type: ['number', 'null'] },
    kcal: { type: ['number', 'null'] },
    note: { type: 'string' },
    updatedAt,
    deviceId,
  },
  required: ['id', 'date'],
  indexes: ['date'],
};

export const nutritionDaysSchema: RxJsonSchema<NutritionDay> = {
  title: 'nutritionDays',
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 40 },
    date: dateField,
    dayType: { type: 'string', enum: ['gym', 'rest', 'padel', 'surf'] },
    tracked: { type: 'boolean' },
    proteinG: { type: ['number', 'null'] },
    kcal: { type: ['number', 'null'] },
    vsProteinTarget: { type: 'string' },
    note: { type: 'string' },
    updatedAt,
    deviceId,
  },
  required: ['id', 'date'],
  indexes: ['date'],
};

export const activitiesSchema: RxJsonSchema<Activity> = {
  title: 'activities',
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 40 },
    date: dateField,
    type: { type: 'string' },
    durationMin: { type: ['number', 'null'] },
    kcalBurned: { type: ['number', 'null'] },
    note: { type: 'string' },
    updatedAt,
    deviceId,
  },
  required: ['id', 'date', 'type'],
  indexes: ['date'],
};

export const bodyMetricsSchema: RxJsonSchema<BodyMetric> = {
  title: 'bodyMetrics',
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 40 },
    date: dateField,
    weightKg: { type: ['number', 'null'] },
    bodyFatPct: { type: ['number', 'null'] },
    waistCm: { type: ['number', 'null'] },
    note: { type: 'string' },
    updatedAt,
    deviceId,
  },
  required: ['id', 'date'],
  indexes: ['date'],
};

export const chatSessionsSchema: RxJsonSchema<ChatSession> = {
  title: 'chatSessions',
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 60 },
    date: dateField,
    title: { type: 'string' },
    mode: { type: 'string', enum: ['today', 'backfill'] },
    createdAt: { type: 'string', format: 'date-time', maxLength: 30 },
    messages: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          role: { type: 'string', enum: ['user', 'assistant', 'tool'] },
          content: { type: 'string' },
          name: { type: 'string' },
          ts: { type: 'string', format: 'date-time' },
        },
        required: ['role', 'ts'],
      },
    },
    updatedAt,
    deviceId,
  },
  required: ['id', 'date', 'createdAt'],
  indexes: ['date', 'createdAt'],
};

export const menuItemsSchema: RxJsonSchema<MenuItem> = {
  title: 'menuItems',
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 60 },
    name: { type: 'string' },
    defaultSlot: {
      type: ['string', 'null'],
      maxLength: 12,
      enum: ['breakfast', 'brunch', 'lunch', 'dinner', 'snack', 'preworkout', null],
    },
    proteinG: { type: ['number', 'null'] },
    kcal: { type: ['number', 'null'] },
    timesLogged: { type: 'integer', minimum: 0, maximum: 1000000, multipleOf: 1 },
    lastEaten: { type: ['string', 'null'], format: 'date', maxLength: 10 },
    estimated: { type: 'boolean' },
    source: { type: 'string', enum: ['history', 'manual'] },
    tags: { type: 'array', items: { type: 'string' } },
    updatedAt,
    deviceId,
  },
  required: ['id', 'name'],
  indexes: ['defaultSlot', 'timesLogged', 'lastEaten'],
};
