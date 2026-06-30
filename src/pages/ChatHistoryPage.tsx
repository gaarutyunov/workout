import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDatabase } from '../context/DatabaseContext';
import { useRxQuery } from '../hooks/useRxQuery';
import { todayISO, toISODate, shortLabel } from '../lib/dates';
import type { ChatSession } from '../db/types';

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// §7.7: two interchangeable layouts over the same chatSessions collection.
export function ChatHistoryPage() {
  const db = useDatabase();
  const navigate = useNavigate();
  const [layout, setLayout] = useState<'list' | 'calendar'>('list');
  const chats = useRxQuery<ChatSession>(db.chatSessions, { selector: {} });

  return (
    <div>
      <div className="card">
        <div className="row spread">
          <h2 style={{ margin: 0 }}>Chats</h2>
          <div className="row">
            <button className={layout === 'list' ? 'primary' : ''} onClick={() => setLayout('list')}>
              List
            </button>
            <button className={layout === 'calendar' ? 'primary' : ''} onClick={() => setLayout('calendar')}>
              Calendar
            </button>
            <button className="primary" onClick={() => navigate('/chat')}>
              + New
            </button>
          </div>
        </div>
      </div>
      {layout === 'list' ? (
        <ListLayout chats={chats} onOpen={(id) => navigate(`/chat?session=${id}`)} />
      ) : (
        <CalendarLayout
          chats={chats}
          onOpen={(id) => navigate(`/chat?session=${id}`)}
          onEmptyDay={(date) => navigate(`/chat?date=${date}`)}
        />
      )}
    </div>
  );
}

function ListLayout({ chats, onOpen }: { chats: ChatSession[]; onOpen: (id: string) => void }) {
  const sorted = useMemo(
    () => [...chats].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
    [chats],
  );
  if (sorted.length === 0) {
    return (
      <div className="card">
        <p className="muted">No chats yet. Start one from the Coach tab.</p>
      </div>
    );
  }
  return (
    <div className="card">
      {sorted.map((c) => (
        <div
          key={c.id}
          className="row spread"
          style={{ padding: '8px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
          onClick={() => onOpen(c.id)}
        >
          <div>
            <div>{c.title ?? 'Chat'}</div>
            <div className="muted" style={{ fontSize: 12 }}>
              {shortLabel(c.date)}
            </div>
          </div>
          <span className="badge">{c.mode}</span>
        </div>
      ))}
    </div>
  );
}

function CalendarLayout({
  chats,
  onOpen,
  onEmptyDay,
}: {
  chats: ChatSession[];
  onOpen: (id: string) => void;
  onEmptyDay: (date: string) => void;
}) {
  const today = todayISO();
  const [cursor, setCursor] = useState(() => {
    const [y, m] = today.split('-').map(Number);
    return { year: y, month: m - 1 };
  });

  const byDate = useMemo(() => {
    const map = new Map<string, ChatSession[]>();
    for (const c of chats) {
      const list = map.get(c.date) ?? [];
      list.push(c);
      map.set(c.date, list);
    }
    return map;
  }, [chats]);

  const cells = useMemo(() => {
    const first = new Date(cursor.year, cursor.month, 1);
    const daysInMonth = new Date(cursor.year, cursor.month + 1, 0).getDate();
    const lead = (first.getDay() + 6) % 7;
    const out: (string | null)[] = [];
    for (let i = 0; i < lead; i++) out.push(null);
    for (let d = 1; d <= daysInMonth; d++) out.push(toISODate(new Date(cursor.year, cursor.month, d)));
    while (out.length % 7 !== 0) out.push(null);
    return out;
  }, [cursor]);

  const label = new Date(cursor.year, cursor.month, 1).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });
  const shift = (delta: number) => {
    const d = new Date(cursor.year, cursor.month + delta, 1);
    setCursor({ year: d.getFullYear(), month: d.getMonth() });
  };

  return (
    <div className="card">
      <div className="row spread">
        <button className="ghost" onClick={() => shift(-1)}>
          ‹
        </button>
        <h2 style={{ margin: 0 }}>{label}</h2>
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
              onClick={() => {
                const list = byDate.get(c);
                if (list && list.length === 1) onOpen(list[0].id);
                else if (!list || list.length === 0) onEmptyDay(c);
              }}
            >
              <span>{Number(c.split('-')[2])}</span>
              <div className="dots">
                {(byDate.get(c) ?? []).map((chat) => (
                  <span
                    key={chat.id}
                    className="dot chat"
                    title={chat.title}
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpen(chat.id);
                    }}
                  />
                ))}
              </div>
            </div>
          ),
        )}
      </div>
      <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
        Tap a chat dot to reopen; tap an empty day to start a backfill chat.
      </p>
    </div>
  );
}
