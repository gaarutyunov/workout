// TypeScript document shapes mirroring the RxDB JSON schemas in §6 of SPEC.md.
// Housekeeping fields (`updatedAt`, `deviceId`) drive conflict resolution and are
// stamped on every write; RxDB adds `_deleted` internally.

export type Sex = 'male' | 'female' | 'other';
export type LoadType =
  | 'machine'
  | 'cable'
  | 'barbell'
  | 'dumbbell_per_hand'
  | 'bodyweight'
  | 'weighted_plate';
export type ExerciseCategory = 'compound' | 'isolation' | 'core';
export type Weekday =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday';
export type PlanStatus =
  | 'active'
  | 'hold'
  | 'progressing'
  | 'ready-to-progress'
  | 'baseline'
  | 'transition'
  | 'flagged';
export type MealSlot =
  | 'breakfast'
  | 'brunch'
  | 'lunch'
  | 'dinner'
  | 'snack'
  | 'preworkout';
export type DayType = 'gym' | 'rest' | 'padel' | 'surf';
export type ChatMode = 'today' | 'backfill';

export interface Housekeeping {
  updatedAt: string;
  deviceId: string;
}

export interface ProfileTargets {
  proteinG?: number;
  kcalLow?: number;
  kcalHigh?: number;
  carbsG?: number;
  fatG?: number;
  hydrationLLow?: number;
  hydrationLHigh?: number;
  fiberG?: number;
}

export interface Profile extends Housekeeping {
  id: string;
  displayName?: string;
  sex?: Sex;
  age?: number;
  heightCm?: number;
  startWeightKg?: number;
  goal?: string;
  programStart?: string;
  splitType?: string;
  weekendActivities?: string[];
  targets?: ProfileTargets;
  constraints?: string[];
  asymmetryProtocol?: string;
  notes?: string;
}

export interface Muscle {
  id: string;
  label?: string;
  highlighterSlug: string;
  note?: string;
}

export interface Exercise extends Housekeeping {
  id: string;
  name: string;
  primaryMuscle: string;
  secondaryMuscles?: string[];
  loadType: LoadType;
  unilateral?: boolean;
  category?: ExerciseCategory;
  note?: string;
}

export interface PlanExercise extends Housekeeping {
  id: string;
  dayLabel?: string;
  weekday: Weekday;
  exerciseId: string;
  targetSets?: number;
  repLow?: number | null;
  repHigh?: number | null;
  currentWeightKg?: number | null;
  loadType?: string;
  nextProgression?: string;
  status?: PlanStatus;
  note?: string;
}

export interface Workout extends Housekeeping {
  id: string;
  date: string;
  weekday?: string;
  focus?: string;
  weekNumber?: number;
  programPhase?: string;
  completed?: boolean;
  notes?: string;
}

export interface LoggedSet {
  set: number;
  reps?: number | null;
  weightKg?: number | null;
  isHold?: boolean;
  note?: string;
}

export interface LoggedExercise extends Housekeeping {
  id: string;
  workoutId: string;
  exerciseId: string;
  order?: number;
  loadType?: string;
  weightKg?: number | null;
  prescribedReps?: string;
  isProgression?: boolean;
  progressionNote?: string;
  note?: string;
  sets?: LoggedSet[];
}

export interface Meal extends Housekeeping {
  id: string;
  date: string;
  slot?: MealSlot;
  description?: string;
  proteinG?: number | null;
  kcal?: number | null;
  note?: string;
}

export interface NutritionDay extends Housekeeping {
  id: string;
  date: string;
  dayType?: DayType;
  tracked?: boolean;
  proteinG?: number | null;
  kcal?: number | null;
  vsProteinTarget?: string;
  note?: string;
}

export interface Activity extends Housekeeping {
  id: string;
  date: string;
  type: string;
  durationMin?: number | null;
  kcalBurned?: number | null;
  note?: string;
}

export interface BodyMetric extends Housekeeping {
  id: string;
  date: string;
  weightKg?: number | null;
  bodyFatPct?: number | null;
  waistCm?: number | null;
  note?: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'tool';
  content?: string;
  name?: string;
  ts: string;
}

export interface ChatSession extends Housekeeping {
  id: string;
  date: string;
  title?: string;
  mode?: ChatMode;
  createdAt: string;
  messages?: ChatMessage[];
}

export interface MenuItem extends Housekeeping {
  id: string;
  name: string;
  defaultSlot?: MealSlot | null;
  proteinG?: number | null;
  kcal?: number | null;
  timesLogged?: number;
  lastEaten?: string | null;
  estimated?: boolean;
  source?: 'history' | 'manual';
  tags?: string[];
}

export type CollectionName =
  | 'profile'
  | 'muscles'
  | 'exercises'
  | 'planExercises'
  | 'workouts'
  | 'loggedExercises'
  | 'meals'
  | 'nutritionDays'
  | 'activities'
  | 'bodyMetrics'
  | 'chatSessions'
  | 'menuItems';
