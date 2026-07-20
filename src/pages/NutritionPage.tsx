import { useMemo, useState } from 'react';
import { useDatabase } from '../context/DatabaseContext';
import { useRxQuery, useRxDocument } from '../hooks/useRxQuery';
import { writeDoc } from '../db/write';
import { recomputeNutritionDay } from '../db/nutrition';
import { mealId, menuItemId, PROFILE_ID } from '../lib/ids';
import { rankMenuItems } from '../lib/ranking';
import { todayISO } from '../lib/dates';
import type { Meal, MealSlot, MenuItem, NutritionDay, Profile } from '../db/types';

const SLOTS: MealSlot[] = ['breakfast', 'brunch', 'lunch', 'dinner', 'snack', 'preworkout'];

export function NutritionPage() {
  const db = useDatabase();
  const today = todayISO();
  const [slot, setSlot] = useState<MealSlot>('lunch');

  const profile = useRxDocument<Profile>(db.profile, PROFILE_ID);
  const menu = useRxQuery<MenuItem>(db.menuItems, { selector: {} });
  const meals = useRxQuery<Meal>(db.meals, { selector: { date: today } }, [today]);
  const days = useRxQuery<NutritionDay>(db.nutritionDays, { selector: { date: today } }, [today]);

  const ranked = useMemo(
    () => rankMenuItems(menu, today, { slot, limit: 8 }),
    [menu, today, slot],
  );
  const day = days[0];
  const targets = profile?.targets;

  // §7.2 / §8.4 meal branch: one-tap log from the menu + bump frequency/recency.
  const quickLog = async (item: MenuItem) => {
    const existingInSlot = meals.filter((m) => m.slot === slot).length;
    await writeDoc(db, 'meals', {
      id: mealId(today, slot, existingInSlot + 1),
      date: today,
      slot,
      description: item.name,
      proteinG: item.proteinG ?? null,
      kcal: item.kcal ?? null,
    });
    await writeDoc(db, 'menuItems', {
      ...item,
      timesLogged: (item.timesLogged ?? 0) + 1,
      lastEaten: today,
    });
    await recomputeNutritionDay(db, today);
  };

  return (
    <div>
      <div className="card">
        <h2>Today's totals</h2>
        {targets ? (
          <table>
            <tbody>
              <tr>
                <td>Protein</td>
                <td>{day?.proteinG ?? 0} g</td>
                <td className="muted">target {targets.proteinG} g</td>
                <td>{day?.vsProteinTarget ?? ''}</td>
              </tr>
              <tr>
                <td>Calories</td>
                <td>{day?.kcal ?? 0} kcal</td>
                <td className="muted">
                  {targets.kcalLow}–{targets.kcalHigh} kcal
                </td>
                <td />
              </tr>
            </tbody>
          </table>
        ) : (
          <p className="muted">No targets set.</p>
        )}
      </div>

      <div className="card">
        <h2>Quick-log from your menu</h2>
        <div className="row wrap" style={{ marginBottom: 10 }}>
          {SLOTS.map((s) => (
            <button key={s} className={s === slot ? 'primary' : ''} onClick={() => setSlot(s)}>
              {s}
            </button>
          ))}
        </div>
        <div className="row wrap">
          {ranked.length === 0 ? (
            <p className="muted">Your menu is empty — log meals and they'll be remembered here.</p>
          ) : (
            ranked.map((item) => (
              <button key={item.id} className="chip accent" onClick={() => quickLog(item)}>
                {item.name}
                {item.proteinG != null && <span className="muted"> · {item.proteinG}p</span>}
              </button>
            ))
          )}
        </div>
        <ManualMeal db={db} today={today} slot={slot} mealsInSlot={meals.filter((m) => m.slot === slot).length} />
      </div>

      <div className="card">
        <h2>Logged today</h2>
        {meals.length === 0 ? (
          <p className="muted">Nothing logged yet.</p>
        ) : (
          <table>
            <tbody>
              {meals.map((m) => (
                <tr key={m.id}>
                  <td className="muted">{m.slot}</td>
                  <td>{m.description}</td>
                  <td>{m.proteinG != null ? `${m.proteinG}p` : ''}</td>
                  <td>{m.kcal != null ? `${m.kcal}kcal` : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function ManualMeal({
  db,
  today,
  slot,
  mealsInSlot,
}: {
  db: ReturnType<typeof useDatabase>;
  today: string;
  slot: MealSlot;
  mealsInSlot: number;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [protein, setProtein] = useState('');
  const [kcal, setKcal] = useState('');

  const submit = async () => {
    if (!name.trim()) return;
    const proteinG = protein ? Number(protein) : null;
    const kcalN = kcal ? Number(kcal) : null;
    await writeDoc(db, 'meals', {
      id: mealId(today, slot, mealsInSlot + 1),
      date: today,
      slot,
      description: name.trim(),
      proteinG,
      kcal: kcalN,
    });
    // New food joins the menu (§7.2).
    await writeDoc(db, 'menuItems', {
      id: menuItemId(name.trim()),
      name: name.trim(),
      defaultSlot: slot,
      proteinG,
      kcal: kcalN,
      timesLogged: 1,
      lastEaten: today,
      estimated: proteinG == null,
      source: 'manual',
    });
    await recomputeNutritionDay(db, today);
    setName('');
    setProtein('');
    setKcal('');
    setOpen(false);
  };

  if (!open) {
    return (
      <button className="ghost" style={{ marginTop: 10 }} onClick={() => setOpen(true)}>
        + Something else
      </button>
    );
  }
  return (
    <div style={{ marginTop: 12 }}>
      <label>Food</label>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Tuna salad" />
      <div className="row">
        <div style={{ flex: 1 }}>
          <label>Protein (g)</label>
          <input value={protein} onChange={(e) => setProtein(e.target.value)} inputMode="numeric" />
        </div>
        <div style={{ flex: 1 }}>
          <label>Calories</label>
          <input value={kcal} onChange={(e) => setKcal(e.target.value)} inputMode="numeric" />
        </div>
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <button className="primary" onClick={submit}>
          Add to {slot}
        </button>
        <button className="ghost" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}
