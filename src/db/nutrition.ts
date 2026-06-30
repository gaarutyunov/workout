import type { AppDatabase } from './database';
import { writeDoc } from './write';
import { nutritionDayId } from '../lib/ids';

// Recompute a day's nutritionDays totals from its meals. Shared by the agent's
// addMeal tool (§8.2) and the manual meal-logging UI (§7.2) so totals stay in sync.

export async function recomputeNutritionDay(db: AppDatabase, date: string): Promise<void> {
  const meals = await db.meals.find({ selector: { date } }).exec();
  let proteinG = 0;
  let kcal = 0;
  for (const m of meals) {
    proteinG += m.proteinG ?? 0;
    kcal += m.kcal ?? 0;
  }
  const existing = await db.nutritionDays.findOne(nutritionDayId(date)).exec();
  const profile = await db.profile.findOne('profile-self').exec();
  const proteinTarget = profile?.targets?.proteinG;
  const vsProteinTarget =
    proteinTarget != null ? `${Math.round(proteinG - proteinTarget)}g` : existing?.vsProteinTarget;

  await writeDoc(db, 'nutritionDays', {
    id: nutritionDayId(date),
    date,
    dayType: existing?.dayType,
    tracked: true,
    proteinG: Math.round(proteinG),
    kcal: Math.round(kcal),
    vsProteinTarget,
    note: existing?.note,
  });
}
