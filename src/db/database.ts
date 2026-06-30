import {
  addRxPlugin,
  createRxDatabase,
  type RxCollection,
  type RxDatabase,
} from 'rxdb';
import { getRxStorageDexie } from 'rxdb/plugins/storage-dexie';
import { RxDBDevModePlugin } from 'rxdb/plugins/dev-mode';
import { lwwConflictHandler } from './conflictHandler';
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
} from './schemas';
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

if (import.meta.env.DEV) {
  addRxPlugin(RxDBDevModePlugin);
}

export type Collections = {
  profile: RxCollection<Profile>;
  muscles: RxCollection<Muscle>;
  exercises: RxCollection<Exercise>;
  planExercises: RxCollection<PlanExercise>;
  workouts: RxCollection<Workout>;
  loggedExercises: RxCollection<LoggedExercise>;
  meals: RxCollection<Meal>;
  nutritionDays: RxCollection<NutritionDay>;
  activities: RxCollection<Activity>;
  bodyMetrics: RxCollection<BodyMetric>;
  chatSessions: RxCollection<ChatSession>;
  menuItems: RxCollection<MenuItem>;
};

export type AppDatabase = RxDatabase<Collections>;

let dbPromise: Promise<AppDatabase> | null = null;

// All syncing collections get the LWW conflict handler (§5). `muscles` is a static
// reference set — no housekeeping, no conflict resolution needed.
const lww = { conflictHandler: lwwConflictHandler };

export function getDatabase(): Promise<AppDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = (async () => {
    const db = await createRxDatabase<Collections>({
      name: 'fitness',
      storage: getRxStorageDexie(),
      multiInstance: true,
      eventReduce: true,
      ignoreDuplicate: import.meta.env.DEV,
    });

    await db.addCollections({
      profile: { schema: profileSchema, ...lww },
      muscles: { schema: musclesSchema },
      exercises: { schema: exercisesSchema, ...lww },
      planExercises: { schema: planExercisesSchema, ...lww },
      workouts: { schema: workoutsSchema, ...lww },
      loggedExercises: { schema: loggedExercisesSchema, ...lww },
      meals: { schema: mealsSchema, ...lww },
      nutritionDays: { schema: nutritionDaysSchema, ...lww },
      activities: { schema: activitiesSchema, ...lww },
      bodyMetrics: { schema: bodyMetricsSchema, ...lww },
      chatSessions: { schema: chatSessionsSchema, ...lww },
      menuItems: { schema: menuItemsSchema, ...lww },
    });

    return db;
  })();
  return dbPromise;
}
