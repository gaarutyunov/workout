import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDatabase } from '../context/DatabaseContext';
import { useRxQuery } from '../hooks/useRxQuery';
import { todayISO, toISODate } from '../lib/dates';
import type { Activity, ChatSession, Workout } from '../db/types';

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function CalendarPage() {
  const db = useDatabase();
  const navigate = useNavigate();
  const today = todayISO();
  const [cursor, setCursor] = useState(() => {
    const [y, m] = today.split('-').map(Number);
    return { year: y, month: m - 1 }; // month 0-indexed
  });
  const [selected, setSelected] = useState<string | null>(today);

  const monthStart = toISODate(new Date(cursor.year, cursor.month, 1));
  const monthEnd = toISODate(new Date(cursor.year, cursor.month + 1, 0));

  const workouts = useRxQuery<Workout>(
    db.workouts,
    { selector: { date: { $gte: monthStart, $lte: monthEnd } } },
    [monthStart, monthEnd],
  );
  const activities = useRxQuery<Activity>(
    db.activities,
    { selector: { date: { $gte: monthStart, $lte: monthEnd } } },
    [monthStart, monthEnd],
  );
  const chats = useRxQuery<ChatSession>(
    db.chatSessions,
    { selector: { date: { $gte: monthStart, $lte: monthEnd } } },
    [monthStart, monthEnd],
  );

  const byDate = useMemo(() => {
    const map = new Map<string, { workouts: Workout[]; activities: Activity[]; chats: ChatSession[] }>();
    const ensure = (d: string) => {
      if (!map.has(d)) map.set(d, { workouts: [], activities: [], chats: [] });
      return map.get(d)!;
    };
    workouts.forEach((w) => ensure(w.date).workouts.push(w));
    activities.forEach((a) => ensure(a.date).activities.push(a));
    chats.forEach((c) => ensure(c.date).chats.push(c));
    return map;
  }, [workouts, activities, chats]);

  const cells = useMemo(() => buildCells(cursor.year, cursor.month), [cursor]);
  const monthLabel = new Date(cursor.year, cursor.month, 1).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });

  const shift = (delta: number) => {
    const d = new Date(cursor.year, cursor.month + delta, 1);
    setCursor({ year: d.getFullYear(), month: d.getMonth() });
  };

  const sel = selected ? byDate.get(selected) : undefined;

  return (
    <div>
      <div className="card">
        <div className="row spread">
          <button className="ghost" onClick={() => shift(-1)}>
            ‹
          </button>
          <h2 style={{ margin: 0 }}>{monthLabel}</h2>
          <button className="ghost" onClick={() => shift(1)}>
            ›
          </button>
        </div>
        <div className="cal-grid" style={{ marginTop: 10 }}>
          {DOW.map((d) => (
            <div key={d} className="cal-head">
              {d}
            </div>
          ))}
          {cells.map((c, i) =>
            c === null ? (
              <div key={i} className="cal-cell empty" />
            ) : (
              <div
                key={i}
                className={`cal-cell ${c === today ? 'today' : ''}`}
                onClick={() => setSelected(c)}
                style={selected === c ? { borderColor: 'var(--accent)' } : undefined}
              >
                <span>{Number(c.split('-')[2])}</span>
                <div className="dots">
                  {(byDate.get(c)?.workouts.length ?? 0) > 0 && <span className="dot workout" />}
                  {(byDate.get(c)?.activities.length ?? 0) > 0 && <span className="dot activity" />}
                  {(byDate.get(c)?.chats.length ?? 0) > 0 && <span className="dot chat" />}
                </div>
              </div>
            ),
          )}
        </div>
        <div className="row wrap" style={{ marginTop: 10, fontSize: 11 }}>
          <span className="muted">
            <span className="dot workout" style={{ display: 'inline-block' }} /> workout
          </span>
          <span className="muted">
            <span className="dot activity" style={{ display: 'inline-block' }} /> activity
          </span>
          <span className="muted">
            <span className="dot chat" style={{ display: 'inline-block' }} /> chat
          </span>
        </div>
      </div>

      {selected && (
        <div className="card">
          <div className="row spread">
            <h2 style={{ margin: 0 }}>{selected}</h2>
            <button
              className="primary"
              onClick={() => navigate(`/chat?date=${selected}`)}
            >
              Open chat for this day
            </button>
          </div>
          {!sel || (sel.workouts.length === 0 && sel.activities.length === 0 && sel.chats.length === 0) ? (
            <p className="muted">Nothing logged. Open a chat to backfill this day.</p>
          ) : (
            <>
              {sel.workouts.map((w) => (
                <div key={w.id} className="row spread">
                  <span>🏋️ {w.focus ?? 'Workout'}</span>
                  <span className="muted">{w.completed ? 'done' : 'planned'}</span>
                </div>
              ))}
              {sel.activities.map((a) => (
                <div key={a.id} className="row spread">
                  <span>🤸 {a.type}</span>
                  <span className="muted">{a.durationMin ? `${a.durationMin} min` : ''}</span>
                </div>
              ))}
              {sel.chats.map((c) => (
                <div
                  key={c.id}
                  className="row spread"
                  style={{ cursor: 'pointer' }}
                  onClick={() => navigate(`/chat?session=${c.id}`)}
                >
                  <span>💬 {c.title ?? 'Chat'}</span>
                  <span className="badge">{c.mode}</span>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** Cells for a month grid, Monday-first; null for leading/trailing blanks. */
function buildCells(year: number, month: number): (string | null)[] {
  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  // JS getDay: 0=Sun..6=Sat → convert to Monday-first index 0=Mon..6=Sun
  const lead = (first.getDay() + 6) % 7;
  const cells: (string | null)[] = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(toISODate(new Date(year, month, d)));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}
