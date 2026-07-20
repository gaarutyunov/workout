import { useMemo, useState } from 'react';
import { useDatabase } from '../context/DatabaseContext';
import { useRxQuery } from '../hooks/useRxQuery';
import { writeDoc, tombstone } from '../db/write';
import type { Exercise, PlanExercise, PlanStatus, Weekday } from '../db/types';

const WEEKDAYS: Weekday[] = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];

export function PlanPage() {
  const db = useDatabase();
  const plan = useRxQuery<PlanExercise>(db.planExercises, { selector: {} });
  const exercises = useRxQuery<Exercise>(db.exercises, { selector: {} });
  const [editing, setEditing] = useState<string | null>(null);

  const exName = (id: string) => exercises.find((e) => e.id === id)?.name ?? id;
  const byDay = useMemo(() => {
    const m = new Map<Weekday, PlanExercise[]>();
    for (const p of plan) {
      const list = m.get(p.weekday) ?? [];
      list.push(p);
      m.set(p.weekday, list);
    }
    return m;
  }, [plan]);

  const updateWeight = async (p: PlanExercise, delta: number) => {
    const current = p.currentWeightKg ?? 0;
    await writeDoc(db, 'planExercises', { ...p, currentWeightKg: Math.max(0, current + delta) });
  };

  return (
    <div>
      {WEEKDAYS.map((wd) => {
        const items = byDay.get(wd);
        if (!items || items.length === 0) return null;
        return (
          <div className="card" key={wd}>
            <h2 style={{ textTransform: 'capitalize' }}>
              {wd} {items[0].dayLabel ? `· ${items[0].dayLabel}` : ''}
            </h2>
            {items.map((p) => (
              <div key={p.id} style={{ borderBottom: '1px solid var(--border)', padding: '8px 0' }}>
                <div className="row spread">
                  <strong>{exName(p.exerciseId)}</strong>
                  <div className="row">
                    {p.status === 'ready-to-progress' && <span className="badge ready">ready</span>}
                    {p.status === 'flagged' && <span className="badge flagged">flag</span>}
                    <button className="ghost" onClick={() => setEditing(editing === p.id ? null : p.id)}>
                      {editing === p.id ? 'Close' : 'Edit'}
                    </button>
                  </div>
                </div>
                <div className="row spread muted" style={{ fontSize: 13 }}>
                  <span>
                    {p.targetSets ?? '—'} × {p.repLow ?? '?'}–{p.repHigh ?? '?'}
                  </span>
                  <div className="row">
                    <button onClick={() => updateWeight(p, -2.5)}>−</button>
                    <span style={{ minWidth: 56, textAlign: 'center' }}>
                      {p.currentWeightKg != null ? `${p.currentWeightKg} kg` : '—'}
                    </span>
                    <button onClick={() => updateWeight(p, 2.5)}>+</button>
                  </div>
                </div>
                {p.nextProgression && (
                  <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>
                    Next: {p.nextProgression}
                  </p>
                )}
                {editing === p.id && <PlanEditor db={db} plan={p} onDone={() => setEditing(null)} />}
              </div>
            ))}
          </div>
        );
      })}
      <p className="muted" style={{ textAlign: 'center' }}>
        Ask the coach to add or change exercises — plan edits go through the agent's tools too.
      </p>
    </div>
  );
}

function PlanEditor({
  db,
  plan,
  onDone,
}: {
  db: ReturnType<typeof useDatabase>;
  plan: PlanExercise;
  onDone: () => void;
}) {
  const [sets, setSets] = useState(String(plan.targetSets ?? ''));
  const [repLow, setRepLow] = useState(String(plan.repLow ?? ''));
  const [repHigh, setRepHigh] = useState(String(plan.repHigh ?? ''));
  const [progression, setProgression] = useState(plan.nextProgression ?? '');
  const [status, setStatus] = useState(plan.status ?? 'active');

  const save = async () => {
    await writeDoc(db, 'planExercises', {
      ...plan,
      targetSets: sets ? Number(sets) : undefined,
      repLow: repLow ? Number(repLow) : null,
      repHigh: repHigh ? Number(repHigh) : null,
      nextProgression: progression || undefined,
      status: status as PlanExercise['status'],
    });
    onDone();
  };

  const remove = async () => {
    await tombstone(db, 'planExercises', plan.id);
    onDone();
  };

  return (
    <div style={{ marginTop: 10 }}>
      <div className="row">
        <div style={{ flex: 1 }}>
          <label>Sets</label>
          <input value={sets} onChange={(e) => setSets(e.target.value)} inputMode="numeric" />
        </div>
        <div style={{ flex: 1 }}>
          <label>Rep low</label>
          <input value={repLow} onChange={(e) => setRepLow(e.target.value)} inputMode="numeric" />
        </div>
        <div style={{ flex: 1 }}>
          <label>Rep high</label>
          <input value={repHigh} onChange={(e) => setRepHigh(e.target.value)} inputMode="numeric" />
        </div>
      </div>
      <label>Next progression</label>
      <input value={progression} onChange={(e) => setProgression(e.target.value)} />
      <label>Status</label>
      <select value={status} onChange={(e) => setStatus(e.target.value as PlanStatus)}>
        {['active', 'hold', 'progressing', 'ready-to-progress', 'baseline', 'transition', 'flagged'].map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <div className="row" style={{ marginTop: 10 }}>
        <button className="primary" onClick={save}>
          Save
        </button>
        <button className="ghost" onClick={remove} style={{ color: 'var(--danger)' }}>
          Remove
        </button>
      </div>
    </div>
  );
}
