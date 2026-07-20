// §6.13: deterministic, idempotent ids keyed by the active date so that re-logging
// (including backfill) upserts the same document instead of duplicating.
//
// Format rules: lowercase kebab-case; <date> = active date YYYY-MM-DD;
// <ex> = exercise id with the `ex-` prefix stripped; <slot> = meal slot;
// <wd> = short weekday.

import type { Weekday } from '../db/types';

export const WEEKDAY_SHORT: Record<Weekday, string> = {
  monday: 'mon',
  tuesday: 'tue',
  wednesday: 'wed',
  thursday: 'thu',
  friday: 'fri',
  saturday: 'sat',
  sunday: 'sun',
};

/** Strip the `ex-` prefix from an exercise id (ex-chest-press → chest-press). */
export function exSlug(exerciseId: string): string {
  return exerciseId.replace(/^ex-/, '');
}

/** Lowercase kebab-case slug from arbitrary text. */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

export const workoutId = (date: string, focusSlug?: string): string =>
  focusSlug ? `w-${date}-${focusSlug}` : `w-${date}`;

export const loggedExerciseId = (date: string, exerciseId: string, dup = 0): string =>
  `le-${date}-${exSlug(exerciseId)}${dup > 1 ? `-${dup}` : ''}`;

export const mealId = (date: string, slot: string, dup = 0): string =>
  `m-${date}-${slot}${dup > 1 ? `-${dup}` : ''}`;

export const nutritionDayId = (date: string): string => `nd-${date}`;

export const activityId = (date: string, type?: string): string =>
  type ? `act-${date}-${slugify(type)}` : `act-${date}`;

export const bodyMetricId = (date: string): string => `bm-${date}`;

export const planExerciseId = (weekday: Weekday, exerciseId: string): string =>
  `plan-${WEEKDAY_SHORT[weekday]}-${exSlug(exerciseId)}`;

export const menuItemId = (name: string): string => `menu-${slugify(name)}`;

export const exerciseId = (name: string): string => `ex-${slugify(name)}`;

export const PROFILE_ID = 'profile-self';

/** A short, monotonic-ish id for chat sessions (timestamp + random suffix). */
export function chatSessionId(date: string, now: number, rand: number): string {
  const ts = now.toString(36);
  const suffix = Math.floor(rand * 1e6)
    .toString(36)
    .padStart(4, '0');
  return `chat-${date}-${ts}${suffix}`;
}
