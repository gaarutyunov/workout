import { useMemo, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useDatabase } from '../context/DatabaseContext';
import { useRxQuery } from '../hooks/useRxQuery';
import type { Exercise, LoggedExercise, Workout } from '../db/types';

export function HistoryPage() {
  const db = useDatabase();
  const exercises = useRxQuery<Exercise>(db.exercises, { selector: {} });
  const workouts = useRxQuery<Workout>(db.workouts, { selector: {} });
  const logged = useRxQuery<LoggedExercise>(db.loggedExercises, { selector: {} });

  const [exerciseId, setExerciseId] = useState<string>('');

  const dateOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const w of workouts) m.set(w.id, w.date);
    return m;
  }, [workouts]);

  // §7.4: progression = loggedExercises for an exercise ordered by parent date.
  const series = useMemo(() => {
    if (!exerciseId) return [];
    return logged
      .filter((le) => le.exerciseId === exerciseId)
      .map((le) => {
        const topWeight = Math.max(le.weightKg ?? 0, ...(le.sets ?? []).map((s) => s.weightKg ?? 0));
        const topReps = Math.max(0, ...(le.sets ?? []).map((s) => s.reps ?? 0));
        return { date: dateOf.get(le.workoutId) ?? '', weightKg: topWeight, reps: topReps };
      })
      .filter((d) => d.date)
      .sort((a, b) => (a.date < b.date ? -1 : 1));
  }, [exerciseId, logged, dateOf]);

  // Exercises that actually have history, plus full catalog.
  const sortedWorkouts = useMemo(
    () => [...workouts].sort((a, b) => (a.date < b.date ? 1 : -1)),
    [workouts],
  );
  const loggedByWorkout = useMemo(() => {
    const m = new Map<string, LoggedExercise[]>();
    for (const le of logged) {
      const list = m.get(le.workoutId) ?? [];
      list.push(le);
      m.set(le.workoutId, list);
    }
    return m;
  }, [logged]);
  const exName = (id: string) => exercises.find((e) => e.id === id)?.name ?? id;

  return (
    <div>
      <div className="card">
        <h2>Progression</h2>
        <select value={exerciseId} onChange={(e) => setExerciseId(e.target.value)}>
          <option value="">Pick an exercise…</option>
          {exercises.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
        {exerciseId && series.length > 0 ? (
          <div style={{ height: 220, marginTop: 14 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series} margin={{ top: 5, right: 10, bottom: 5, left: -20 }}>
                <CartesianGrid stroke="#334155" strokeDasharray="3 3" />
                <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} />
                <YAxis stroke="#94a3b8" fontSize={11} />
                <Tooltip
                  contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
                />
                <Line type="monotone" dataKey="weightKg" stroke="#38bdf8" strokeWidth={2} dot />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : exerciseId ? (
          <p className="muted">No logged sets yet for this exercise.</p>
        ) : null}
      </div>

      <div className="card">
        <h2>Workout history</h2>
        {sortedWorkouts.length === 0 ? (
          <p className="muted">No sessions logged.</p>
        ) : (
          sortedWorkouts.map((w) => (
            <div key={w.id} style={{ borderBottom: '1px solid var(--border)', padding: '8px 0' }}>
              <div className="row spread">
                <strong>{w.focus ?? 'Workout'}</strong>
                <span className="muted">{w.date}</span>
              </div>
              <ul style={{ margin: '4px 0 0', paddingLeft: 18, fontSize: 13 }}>
                {(loggedByWorkout.get(w.id) ?? []).map((le) => (
                  <li key={le.id}>
                    {exName(le.exerciseId)}:{' '}
                    {(le.sets ?? []).map((s) => `${s.reps ?? '·'}${s.weightKg ? `@${s.weightKg}` : ''}`).join(', ')}
                    {le.note && <span className="muted"> — {le.note}</span>}
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
