import { describe, expect, it } from 'vitest';
import { loggedExerciseId, mealId, planExerciseId, workoutId, exSlug, slugify } from './ids';
import { lww } from '../db/conflictHandler';
import { rankMenuItems } from './ranking';
import type { MenuItem } from '../db/types';

describe('deterministic ids (§6.13)', () => {
  it('keys by active date and strips ex- prefix', () => {
    expect(workoutId('2026-06-30')).toBe('w-2026-06-30');
    expect(workoutId('2026-06-30', 'am')).toBe('w-2026-06-30-am');
    expect(loggedExerciseId('2026-06-30', 'ex-chest-press')).toBe('le-2026-06-30-chest-press');
    expect(mealId('2026-06-30', 'lunch')).toBe('m-2026-06-30-lunch');
    expect(mealId('2026-06-30', 'lunch', 2)).toBe('m-2026-06-30-lunch-2');
    expect(planExerciseId('monday', 'ex-chest-press')).toBe('plan-mon-chest-press');
    expect(exSlug('ex-chest-press')).toBe('chest-press');
    expect(slugify('Greek Yogurt & Berries')).toBe('greek-yogurt-berries');
  });
});

describe('last-write-wins conflict resolution (§5)', () => {
  it('picks the higher updatedAt', () => {
    const a = { updatedAt: '2026-06-30T10:00:00Z', deviceId: 'a' };
    const b = { updatedAt: '2026-06-30T11:00:00Z', deviceId: 'b' };
    expect(lww(a, b)).toBe(b);
    expect(lww(b, a)).toBe(b);
  });
  it('breaks ties by deviceId', () => {
    const a = { updatedAt: 't', deviceId: 'z' };
    const b = { updatedAt: 't', deviceId: 'a' };
    expect(lww(a, b)).toBe(a);
  });
});

describe('menu ranking (§6.12)', () => {
  const mk = (id: string, timesLogged: number, lastEaten: string | null, slot: MenuItem['defaultSlot']): MenuItem => ({
    id,
    name: id,
    timesLogged,
    lastEaten,
    defaultSlot: slot,
    updatedAt: '',
    deviceId: '',
  });
  it('ranks frequent + recent first and filters by slot', () => {
    const items = [
      mk('rare-old', 1, '2026-01-01', 'lunch'),
      mk('frequent-recent', 30, '2026-06-29', 'lunch'),
      mk('dinner-item', 50, '2026-06-29', 'dinner'),
    ];
    const ranked = rankMenuItems(items, '2026-06-30', { slot: 'lunch' });
    expect(ranked[0].id).toBe('frequent-recent');
    expect(ranked.find((i) => i.id === 'dinner-item')).toBeUndefined();
  });
});
