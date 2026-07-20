import { useMemo, useState } from 'react';
import Model, { type IExerciseData, type IMuscleStats, type Muscle } from 'react-body-highlighter';
import { useDatabase } from '../context/DatabaseContext';
import { useRxQuery } from '../hooks/useRxQuery';
import { addDays, todayISO } from '../lib/dates';
import type { Exercise, LoggedExercise, Muscle as MuscleDoc, Workout } from '../db/types';

// §7.1: front/back SVG bodies. Intensity = training volume per muscle (sets) over a
// date range, derived from loggedExercises joined to exercises. Clicking a muscle
// filters the catalog by primaryMuscle/secondaryMuscles mapped via highlighterSlug.

const RANGES = [
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
];

const HIGHLIGHT_COLORS = ['#1e3a5f', '#2563eb', '#38bdf8', '#7dd3fc'];

export function BodyMapPage() {
  const db = useDatabase();
  const [view, setView] = useState<'anterior' | 'posterior'>('anterior');
  const [days, setDays] = useState(30);
  const [selected, setSelected] = useState<Muscle | null>(null);

  const today = todayISO();
  const from = addDays(today, -days);

  const muscles = useRxQuery<MuscleDoc>(db.muscles, { selector: {} });
  const exercises = useRxQuery<Exercise>(db.exercises, { selector: {} });
  const workouts = useRxQuery<Workout>(
    db.workouts,
    { selector: { date: { $gte: from, $lte: today } } },
    [from, today],
  );
  const logged = useRxQuery<LoggedExercise>(db.loggedExercises, { selector: {} });

  // muscle id → highlighter slug
  const slugOf = useMemo(() => {
    const m = new Map<string, Muscle>();
    for (const mu of muscles) m.set(mu.id, mu.highlighterSlug as Muscle);
    return m;
  }, [muscles]);

  const exById = useMemo(() => {
    const m = new Map<string, Exercise>();
    for (const e of exercises) m.set(e.id, e);
    return m;
  }, [exercises]);

  const workoutInRange = useMemo(() => new Set(workouts.map((w) => w.id)), [workouts]);

  // Build react-body-highlighter data: one item per logged exercise in range,
  // with frequency = number of sets (training volume).
  const data: IExerciseData[] = useMemo(() => {
    const out: IExerciseData[] = [];
    for (const le of logged) {
      if (!workoutInRange.has(le.workoutId)) continue;
      const ex = exById.get(le.exerciseId);
      if (!ex) continue;
      const muscleSlugs = new Set<Muscle>();
      const primary = slugOf.get(ex.primaryMuscle);
      if (primary) muscleSlugs.add(primary);
      for (const sm of ex.secondaryMuscles ?? []) {
        const s = slugOf.get(sm);
        if (s) muscleSlugs.add(s);
      }
      const volume = le.sets?.length ?? 1;
      out.push({ name: ex.name, muscles: Array.from(muscleSlugs), frequency: volume });
    }
    return out;
  }, [logged, workoutInRange, exById, slugOf]);

  // Exercises matching the clicked muscle slug (via highlighterSlug mapping).
  const matchingExercises = useMemo(() => {
    if (!selected) return [];
    return exercises.filter((e) => {
      const ids = [e.primaryMuscle, ...(e.secondaryMuscles ?? [])];
      return ids.some((id) => slugOf.get(id) === selected);
    });
  }, [selected, exercises, slugOf]);

  const onClick = (stats: IMuscleStats) => setSelected(stats.muscle);

  return (
    <div>
      <div className="card">
        <div className="row spread">
          <div className="row">
            {(['anterior', 'posterior'] as const).map((v) => (
              <button key={v} className={view === v ? 'primary' : ''} onClick={() => setView(v)}>
                {v === 'anterior' ? 'Front' : 'Back'}
              </button>
            ))}
          </div>
          <div className="row">
            {RANGES.map((r) => (
              <button key={r.days} className={days === r.days ? 'primary' : ''} onClick={() => setDays(r.days)}>
                {r.label}
              </button>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '16px 0' }}>
          <Model
            type={view}
            data={data}
            onClick={onClick}
            highlightedColors={HIGHLIGHT_COLORS}
            bodyColor="#334155"
            style={{ width: '60%', maxWidth: 300 }}
          />
        </div>
        <p className="muted" style={{ textAlign: 'center', fontSize: 12 }}>
          Brighter = more sets logged in the last {days} days. Tap a muscle to see exercises.
        </p>
      </div>

      {selected && (
        <div className="card">
          <div className="row spread">
            <h2 style={{ textTransform: 'capitalize' }}>{selected.replace('-', ' ')}</h2>
            <button className="ghost" onClick={() => setSelected(null)}>
              Clear
            </button>
          </div>
          {matchingExercises.length === 0 ? (
            <p className="muted">No catalog exercises mapped to this muscle.</p>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {matchingExercises.map((e) => (
                <li key={e.id}>
                  {e.name} <span className="muted">· {e.loadType.replace('_', ' ')}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
