import { Link } from 'react-router-dom';
import { useDatabase } from '../context/DatabaseContext';
import { useRxQuery, useRxDocument } from '../hooks/useRxQuery';
import { PROFILE_ID } from '../lib/ids';
import { todayISO, weekdayOf, weekdayLabel, shortLabel } from '../lib/dates';
import type { NutritionDay, PlanExercise, Profile, Exercise } from '../db/types';

export function Dashboard() {
  const db = useDatabase();
  const today = todayISO();
  const weekday = weekdayOf(today);

  const profile = useRxDocument<Profile>(db.profile, PROFILE_ID);
  const plan = useRxQuery<PlanExercise>(
    db.planExercises,
    { selector: { weekday } },
    [weekday],
  );
  const exercises = useRxQuery<Exercise>(db.exercises, { selector: {} });
  const nutritionDays = useRxQuery<NutritionDay>(
    db.nutritionDays,
    { selector: { date: today } },
    [today],
  );

  const exName = (id: string) => exercises.find((e) => e.id === id)?.name ?? id;
  const todayNutrition = nutritionDays[0];
  const targets = profile?.targets;

  return (
    <div>
      <div className="card">
        <div className="row spread">
          <div>
            <h2 style={{ marginBottom: 2 }}>{shortLabel(today)}</h2>
            <span className="muted">{profile?.displayName ? `Hi, ${profile.displayName}` : 'Welcome'}</span>
          </div>
          <Link to="/chat" className="btn primary">
            Open coach
          </Link>
        </div>
        {profile?.goal && <p className="muted" style={{ marginBottom: 0 }}>{profile.goal}</p>}
      </div>

      <div className="card">
        <div className="row spread">
          <h2>Today · {weekdayLabel(weekday)}</h2>
          <Link to="/plan">Edit plan</Link>
        </div>
        {plan.length === 0 ? (
          <p className="muted">No session planned for today — a rest or sport day.</p>
        ) : (
          <table>
            <tbody>
              {plan.map((p) => (
                <tr key={p.id}>
                  <td>{exName(p.exerciseId)}</td>
                  <td className="muted">
                    {p.targetSets ?? '—'}×{p.repLow ?? '?'}–{p.repHigh ?? '?'}
                  </td>
                  <td>{p.currentWeightKg != null ? `${p.currentWeightKg}kg` : '—'}</td>
                  <td>
                    {p.status === 'ready-to-progress' && <span className="badge ready">ready</span>}
                    {p.status === 'flagged' && <span className="badge flagged">flag</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <div className="row spread">
          <h2>Nutrition today</h2>
          <Link to="/nutrition">Details</Link>
        </div>
        {targets ? (
          <>
            <MacroBar
              label="Protein"
              value={todayNutrition?.proteinG ?? 0}
              target={targets.proteinG}
              unit="g"
            />
            <MacroBar
              label="Calories"
              value={todayNutrition?.kcal ?? 0}
              target={targets.kcalHigh}
              low={targets.kcalLow}
              unit="kcal"
            />
          </>
        ) : (
          <p className="muted">Set targets in your profile to track compliance.</p>
        )}
      </div>

      <div className="card">
        <div className="row wrap">
          <Link to="/history" className="btn">
            History & charts
          </Link>
          <Link to="/chats" className="btn">
            Past chats
          </Link>
          <Link to="/body" className="btn">
            Body map
          </Link>
          <Link to="/import" className="btn">
            Import
          </Link>
        </div>
      </div>
    </div>
  );
}

function MacroBar({
  label,
  value,
  target,
  low,
  unit,
}: {
  label: string;
  value: number;
  target?: number;
  low?: number;
  unit: string;
}) {
  const pct = target ? Math.min(100, Math.round((value / target) * 100)) : 0;
  const over = target ? value > target : false;
  return (
    <div style={{ marginBottom: 10 }}>
      <div className="row spread" style={{ fontSize: 13 }}>
        <span>{label}</span>
        <span className="muted">
          {Math.round(value)}
          {target ? ` / ${low ? `${low}–${target}` : target}` : ''} {unit}
        </span>
      </div>
      <div className={`progress-bar ${over ? 'over' : ''}`}>
        <span style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
