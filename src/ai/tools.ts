import { tool, type Tool } from 'ai';
import { z } from 'zod';
import type { AppDatabase } from '../db/database';
import { writeDoc, tombstone } from '../db/write';
import type { LoggedSet, MealSlot, MenuItem, Weekday } from '../db/types';
import {
  activityId,
  bodyMetricId,
  loggedExerciseId,
  mealId,
  menuItemId,
  planExerciseId,
  PROFILE_ID,
  workoutId,
} from '../lib/ids';
import { rankMenuItems } from '../lib/ranking';
import { recomputeNutritionDay } from '../db/nutrition';
import { todayISO, weekdayOf } from '../lib/dates';

// §8.2: the agent's typed tool surface. Every write tool stamps housekeeping fields
// (via writeDoc), Ajv-validates, and upserts on a deterministic id, so re-runs are
// idempotent. Read tools never guess — the model must call them every turn.

export interface ToolContext {
  db: AppDatabase;
  activeDate: string; // YYYY-MM-DD the chat is bound to (§8.4)
  isBackfill: boolean;
}

const SLOTS = ['breakfast', 'brunch', 'lunch', 'dinner', 'snack', 'preworkout'] as const;
const LOAD_TYPES = [
  'machine',
  'cable',
  'barbell',
  'dumbbell_per_hand',
  'bodyweight',
  'weighted_plate',
] as const;
const WEEKDAYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;

export function createTools(ctx: ToolContext): Record<string, Tool> {
  const { db, activeDate, isBackfill } = ctx;

  return {
    getToday: tool({
      description:
        'Return the actual current date (YYYY-MM-DD), weekday and ISO datetime from the device clock. You have no internal clock — always call this; never guess the date.',
      parameters: z.object({}),
      execute: async () => {
        const now = new Date();
        const date = todayISO();
        return {
          date,
          weekday: weekdayOf(date),
          iso: now.toISOString(),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        };
      },
    }),

    getActiveDate: tool({
      description:
        'Return the date THIS chat is bound to for logging — today for a normal chat, or a calendar-selected past date for a backfill chat. Use this date for ALL writes.',
      parameters: z.object({}),
      execute: async () => ({
        date: activeDate,
        weekday: weekdayOf(activeDate),
        isBackfill,
      }),
    }),

    getPlan: tool({
      description:
        'Return the CURRENT program for a weekday (exercises, rep targets, current weights, status). Always call this — never assume the plan.',
      parameters: z.object({
        weekday: z.enum(WEEKDAYS).describe('Weekday slug, e.g. derived from the active date.'),
      }),
      execute: async ({ weekday }) => {
        const plan = await db.planExercises
          .find({ selector: { weekday } })
          .exec();
        const out = [];
        for (const p of plan) {
          const ex = await db.exercises.findOne(p.exerciseId).exec();
          out.push({
            id: p.id,
            dayLabel: p.dayLabel,
            exerciseId: p.exerciseId,
            exerciseName: ex?.name ?? p.exerciseId,
            targetSets: p.targetSets,
            repLow: p.repLow,
            repHigh: p.repHigh,
            currentWeightKg: p.currentWeightKg,
            loadType: p.loadType ?? ex?.loadType,
            nextProgression: p.nextProgression,
            status: p.status,
            note: p.note,
          });
        }
        return { weekday, exercises: out };
      },
    }),

    getProfile: tool({
      description: 'Return current goal, targets, constraints, and the asymmetry protocol.',
      parameters: z.object({}),
      execute: async () => {
        const p = await db.profile.findOne(PROFILE_ID).exec();
        return p ? p.toJSON() : { id: PROFILE_ID, note: 'No profile set yet.' };
      },
    }),

    getHistory: tool({
      description:
        'Return prior logged sets for an exercise (for progression questions/charts), newest first.',
      parameters: z.object({
        exerciseId: z.string().describe('FK to exercises.id, e.g. ex-chest-press'),
        limit: z.number().int().min(1).max(50).optional(),
      }),
      execute: async ({ exerciseId, limit }) => {
        const logged = await db.loggedExercises
          .find({ selector: { exerciseId } })
          .exec();
        const rows = [];
        for (const le of logged) {
          const w = await db.workouts.findOne(le.workoutId).exec();
          rows.push({ date: w?.date ?? '', weightKg: le.weightKg, sets: le.sets ?? [], note: le.note });
        }
        rows.sort((a, b) => (a.date < b.date ? 1 : -1));
        return { exerciseId, history: limit ? rows.slice(0, limit) : rows };
      },
    }),

    getNutrition: tool({
      description: 'Daily meals + totals vs profile targets for a date range (inclusive).',
      parameters: z.object({
        from: z.string().describe('YYYY-MM-DD'),
        to: z.string().describe('YYYY-MM-DD'),
      }),
      execute: async ({ from, to }) => {
        const meals = await db.meals
          .find({ selector: { date: { $gte: from, $lte: to } } })
          .exec();
        const days = await db.nutritionDays
          .find({ selector: { date: { $gte: from, $lte: to } } })
          .exec();
        const profile = await db.profile.findOne(PROFILE_ID).exec();
        return {
          targets: profile?.targets ?? null,
          meals: meals.map((m) => m.toJSON()),
          days: days.map((d) => d.toJSON()),
        };
      },
    }),

    suggestMeals: tool({
      description:
        'Return several menu picks ranked by frequency + recency, optionally filtered by slot, to offer before asking the user to type.',
      parameters: z.object({
        slot: z.enum(SLOTS).optional(),
        limit: z.number().int().min(1).max(12).optional(),
      }),
      execute: async ({ slot, limit }) => {
        const items = await db.menuItems.find({ selector: {} }).exec();
        const ranked = rankMenuItems(
          items.map((i) => i.toJSON() as MenuItem),
          activeDate,
          { slot, limit: limit ?? 5 },
        );
        return {
          slot: slot ?? null,
          suggestions: ranked.map((i) => ({
            menuItemId: i.id,
            name: i.name,
            defaultSlot: i.defaultSlot,
            proteinG: i.proteinG,
            kcal: i.kcal,
            estimated: i.estimated,
          })),
        };
      },
    }),

    logWorkout: tool({
      description: 'Create or upsert a workout session for the active date.',
      parameters: z.object({
        focus: z.string().optional().describe('e.g. "Back & Biceps"'),
        focusSlug: z.string().optional().describe('Append for a genuine 2nd session that day, e.g. "am".'),
        weekday: z.string().optional(),
        weekNumber: z.number().int().optional(),
        programPhase: z.string().optional(),
        completed: z.boolean().optional(),
        notes: z.string().optional(),
      }),
      execute: async (args) => {
        const id = workoutId(activeDate, args.focusSlug);
        const doc = await writeDoc(db, 'workouts', {
          id,
          date: activeDate,
          weekday: args.weekday ?? weekdayOf(activeDate),
          focus: args.focus,
          weekNumber: args.weekNumber,
          programPhase: args.programPhase,
          completed: args.completed ?? true,
          notes: args.notes,
        });
        return { ok: true, id: doc.id };
      },
    }),

    logExercise: tool({
      description:
        'Log one exercise within a workout session, including all sets. weightKg is the load per loadType: dumbbell_per_hand = one hand, barbell = total plates, bodyweight = 0. Use null for unknown reps/weight.',
      parameters: z.object({
        workoutId: z.string().describe('e.g. w-2026-06-30'),
        exerciseId: z.string().describe('FK to exercises.id, e.g. ex-chest-press'),
        order: z.number().int().optional(),
        loadType: z.enum(LOAD_TYPES),
        weightKg: z.number().nullable(),
        prescribedReps: z.string().optional(),
        isProgression: z.boolean().optional(),
        progressionNote: z.string().optional(),
        sets: z.array(
          z.object({
            set: z.number().int(),
            reps: z.number().int().nullable(),
            weightKg: z.number().nullable(),
            isHold: z.boolean().optional(),
            note: z.string().optional(),
          }),
        ),
        note: z.string().optional(),
      }),
      execute: async (args) => {
        const id = loggedExerciseId(activeDate, args.exerciseId);
        const doc = await writeDoc(db, 'loggedExercises', {
          id,
          workoutId: args.workoutId,
          exerciseId: args.exerciseId,
          order: args.order,
          loadType: args.loadType,
          weightKg: args.weightKg,
          prescribedReps: args.prescribedReps,
          isProgression: args.isProgression,
          progressionNote: args.progressionNote,
          sets: args.sets as LoggedSet[],
          note: args.note,
        });
        return { ok: true, id: doc.id };
      },
    }),

    addMeal: tool({
      description:
        'Add or upsert a meal for the active date; may take a menuItemId to prefill name/macros. Recomputes the day total.',
      parameters: z.object({
        slot: z.enum(SLOTS),
        description: z.string().optional(),
        proteinG: z.number().nullable().optional(),
        kcal: z.number().nullable().optional(),
        menuItemId: z.string().optional(),
        dup: z.number().int().optional().describe('2 for a second item in the same slot'),
        note: z.string().optional(),
      }),
      execute: async (args) => {
        let { description, proteinG, kcal } = args;
        if (args.menuItemId) {
          const item = await db.menuItems.findOne(args.menuItemId).exec();
          if (item) {
            description = description ?? item.name;
            proteinG = proteinG ?? item.proteinG ?? null;
            kcal = kcal ?? item.kcal ?? null;
          }
        }
        const id = mealId(activeDate, args.slot, args.dup ?? 0);
        const doc = await writeDoc(db, 'meals', {
          id,
          date: activeDate,
          slot: args.slot as MealSlot,
          description,
          proteinG: proteinG ?? null,
          kcal: kcal ?? null,
          note: args.note,
        });
        await recomputeNutritionDay(db, activeDate);
        return { ok: true, id: doc.id };
      },
    }),

    upsertMenuItem: tool({
      description:
        'Add or update a menu item (new foods join the menu; bump timesLogged/lastEaten when logged).',
      parameters: z.object({
        name: z.string(),
        defaultSlot: z.enum(SLOTS).nullable().optional(),
        proteinG: z.number().nullable().optional(),
        kcal: z.number().nullable().optional(),
        estimated: z.boolean().optional(),
        tags: z.array(z.string()).optional(),
        bump: z.boolean().optional().describe('Increment timesLogged and set lastEaten to active date.'),
      }),
      execute: async (args) => {
        const id = menuItemId(args.name);
        const existing = await db.menuItems.findOne(id).exec();
        const timesLogged = (existing?.timesLogged ?? 0) + (args.bump ? 1 : 0);
        const doc = await writeDoc(db, 'menuItems', {
          id,
          name: args.name,
          defaultSlot: args.defaultSlot ?? existing?.defaultSlot ?? null,
          proteinG: args.proteinG ?? existing?.proteinG ?? null,
          kcal: args.kcal ?? existing?.kcal ?? null,
          timesLogged,
          lastEaten: args.bump ? activeDate : existing?.lastEaten ?? null,
          estimated: args.estimated ?? existing?.estimated ?? false,
          source: existing?.source ?? 'manual',
          tags: args.tags ?? existing?.tags,
        });
        return { ok: true, id: doc.id };
      },
    }),

    logActivity: tool({
      description: 'Record a padel/surf/cardio activity for the active date.',
      parameters: z.object({
        type: z.string().describe('e.g. "padel", "surf"'),
        durationMin: z.number().nullable().optional(),
        kcalBurned: z.number().nullable().optional(),
        note: z.string().optional(),
        multiple: z.boolean().optional().describe('true if a second activity that day → type-suffixed id'),
      }),
      execute: async (args) => {
        const id = activityId(activeDate, args.multiple ? args.type : undefined);
        const doc = await writeDoc(db, 'activities', {
          id,
          date: activeDate,
          type: args.type,
          durationMin: args.durationMin ?? null,
          kcalBurned: args.kcalBurned ?? null,
          note: args.note,
        });
        return { ok: true, id: doc.id };
      },
    }),

    addBodyMetric: tool({
      description: 'Record weight / body-fat / waist for the active date.',
      parameters: z.object({
        weightKg: z.number().nullable().optional(),
        bodyFatPct: z.number().nullable().optional(),
        waistCm: z.number().nullable().optional(),
        note: z.string().optional(),
      }),
      execute: async (args) => {
        const doc = await writeDoc(db, 'bodyMetrics', {
          id: bodyMetricId(activeDate),
          date: activeDate,
          weightKg: args.weightKg ?? null,
          bodyFatPct: args.bodyFatPct ?? null,
          waistCm: args.waistCm ?? null,
          note: args.note,
        });
        return { ok: true, id: doc.id };
      },
    }),

    upsertPlanExercise: tool({
      description:
        'Create or edit a plan entry: weekday, exercise, target sets/rep range, current weight, loadType, nextProgression, status. This is how the user changes the plan.',
      parameters: z.object({
        weekday: z.enum(WEEKDAYS),
        exerciseId: z.string(),
        dayLabel: z.string().optional(),
        targetSets: z.number().int().optional(),
        repLow: z.number().int().nullable().optional(),
        repHigh: z.number().int().nullable().optional(),
        currentWeightKg: z.number().nullable().optional(),
        loadType: z.string().optional(),
        nextProgression: z.string().optional(),
        status: z
          .enum(['active', 'hold', 'progressing', 'ready-to-progress', 'baseline', 'transition', 'flagged'])
          .optional(),
        note: z.string().optional(),
      }),
      execute: async (args) => {
        const id = planExerciseId(args.weekday as Weekday, args.exerciseId);
        const doc = await writeDoc(db, 'planExercises', { id, ...args });
        return { ok: true, id: doc.id };
      },
    }),

    removePlanExercise: tool({
      description: 'Remove a plan entry (tombstone — never hard-deletes).',
      parameters: z.object({ id: z.string() }),
      execute: async ({ id }) => {
        await tombstone(db, 'planExercises', id);
        return { ok: true, id };
      },
    }),

    updatePlanProgression: tool({
      description:
        "Advance a plan entry's current weight/status after its target was cleanly met. Use the entry's nextProgression increment.",
      parameters: z.object({
        id: z.string(),
        currentWeightKg: z.number().nullable().optional(),
        status: z
          .enum(['active', 'hold', 'progressing', 'ready-to-progress', 'baseline', 'transition', 'flagged'])
          .optional(),
        nextProgression: z.string().optional(),
        note: z.string().optional(),
      }),
      execute: async (args) => {
        const existing = await db.planExercises.findOne(args.id).exec();
        if (!existing) return { ok: false, error: `No plan entry ${args.id}` };
        const merged = { ...existing.toJSON(), ...args };
        const doc = await writeDoc(db, 'planExercises', merged);
        return { ok: true, id: doc.id };
      },
    }),

    updateProfile: tool({
      description: 'Edit goal, targets, constraints, or the asymmetry protocol.',
      parameters: z.object({
        goal: z.string().optional(),
        targets: z
          .object({
            proteinG: z.number().optional(),
            kcalLow: z.number().optional(),
            kcalHigh: z.number().optional(),
            carbsG: z.number().optional(),
            fatG: z.number().optional(),
            hydrationLLow: z.number().optional(),
            hydrationLHigh: z.number().optional(),
            fiberG: z.number().optional(),
          })
          .optional(),
        constraints: z.array(z.string()).optional(),
        asymmetryProtocol: z.string().optional(),
        notes: z.string().optional(),
      }),
      execute: async (args) => {
        const existing = await db.profile.findOne(PROFILE_ID).exec();
        const merged = { ...(existing?.toJSON() ?? { id: PROFILE_ID }), ...args };
        const doc = await writeDoc(db, 'profile', merged);
        return { ok: true, id: doc.id };
      },
    }),

    flagDeviation: tool({
      description:
        'Note a deviation (e.g. load rose before the plan entry\'s target was met) on the logged entry.',
      parameters: z.object({
        loggedExerciseId: z.string(),
        reason: z.string(),
      }),
      execute: async ({ loggedExerciseId: leId, reason }) => {
        const existing = await db.loggedExercises.findOne(leId).exec();
        if (!existing) return { ok: false, error: `No logged exercise ${leId}` };
        const prevNote = existing.note ? `${existing.note} | ` : '';
        const merged = { ...existing.toJSON(), note: `${prevNote}⚠ deviation: ${reason}` };
        const doc = await writeDoc(db, 'loggedExercises', merged);
        return { ok: true, id: doc.id };
      },
    }),
  };
}
