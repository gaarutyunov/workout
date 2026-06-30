import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { CoreMessage } from 'ai';
import { useDatabase } from '../context/DatabaseContext';
import { writeDoc } from '../db/write';
import { runAgentTurn } from '../ai/agent';
import { hasApiKey } from '../ai/openrouter';
import { chatSessionId } from '../lib/ids';
import { todayISO, shortLabel } from '../lib/dates';
import type { ChatMessage, ChatSession } from '../db/types';

const QUICK_REPLIES = ['Log workout', 'Log meal', 'Just chat'];
const PERSIST_KEY = 'fitness.persistTranscripts';

function persistEnabled(): boolean {
  return localStorage.getItem(PERSIST_KEY) !== 'false';
}

export function ChatPage() {
  const db = useDatabase();
  const [params] = useSearchParams();
  const today = todayISO();

  // Resolve the chat's bound date + session id from the URL (§8.4 step 1).
  const dateParam = params.get('date');
  const sessionParam = params.get('session');
  const [sessionId, setSessionId] = useState<string | null>(sessionParam);
  const [activeDate, setActiveDate] = useState<string>(dateParam ?? today);
  const isBackfill = activeDate !== today;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [streaming, setStreaming] = useState('');
  const [toolLog, setToolLog] = useState<string[]>([]);
  const logRef = useRef<HTMLDivElement>(null);
  const connected = hasApiKey();

  // Load an existing session, or stage a fresh one (created on first send).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (sessionParam) {
        const doc = await db.chatSessions.findOne(sessionParam).exec();
        if (doc && !cancelled) {
          const s = doc.toJSON() as ChatSession;
          setSessionId(s.id);
          setActiveDate(s.date);
          setMessages(s.messages ?? []);
        }
      } else {
        // Greet for a new chat (§8.4 step 2). No model call needed for the greeting.
        const greeting = isBackfill
          ? `Backfilling ${shortLabel(activeDate)}. Want to log a workout, log a meal, or just chat?`
          : `Hey! ${shortLabel(activeDate)}. Want to log a workout, log a meal, or just chat?`;
        if (!cancelled) setMessages([{ role: 'assistant', content: greeting, ts: new Date().toISOString() }]);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionParam]);

  useEffect(() => {
    logRef.current?.scrollTo(0, logRef.current.scrollHeight);
  }, [messages, streaming]);

  const coreHistory = useMemo<CoreMessage[]>(
    () =>
      messages
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content ?? '' })),
    [messages],
  );

  const persist = async (msgs: ChatMessage[], id: string) => {
    if (!persistEnabled()) return;
    const title = deriveTitle(msgs, isBackfill, activeDate);
    const existing = await db.chatSessions.findOne(id).exec();
    await writeDoc(db, 'chatSessions', {
      id,
      date: activeDate,
      title,
      mode: isBackfill ? 'backfill' : 'today',
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      messages: msgs,
    });
  };

  const send = async (text: string) => {
    if (!text.trim() || busy || !connected) return;
    const id = sessionId ?? chatSessionId(activeDate, Date.now(), Math.random());
    if (!sessionId) setSessionId(id);

    const userMsg: ChatMessage = { role: 'user', content: text.trim(), ts: new Date().toISOString() };
    const withUser = [...messages, userMsg];
    setMessages(withUser);
    setInput('');
    setBusy(true);
    setStreaming('');
    setToolLog([]);

    try {
      const history: CoreMessage[] = [
        ...coreHistory,
        { role: 'user', content: text.trim() },
      ];
      const result = await runAgentTurn({
        db,
        activeDate,
        isBackfill,
        messages: history,
        onTextDelta: (d) => setStreaming((prev) => prev + d),
        onToolCall: (name) => setToolLog((prev) => [...prev, name]),
      });
      const finalMsgs: ChatMessage[] = [...withUser];
      if (result.toolsUsed.length) {
        finalMsgs.push({
          role: 'tool',
          name: result.toolsUsed.join(', '),
          content: `ran: ${result.toolsUsed.join(', ')}`,
          ts: new Date().toISOString(),
        });
      }
      finalMsgs.push({ role: 'assistant', content: result.text, ts: new Date().toISOString() });
      setMessages(finalMsgs);
      await persist(finalMsgs, id);
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `⚠ ${(e as Error).message}`, ts: new Date().toISOString() },
      ]);
    } finally {
      setBusy(false);
      setStreaming('');
    }
  };

  if (!connected) {
    return (
      <div className="card">
        <h2>Connect your AI coach</h2>
        <p className="muted">
          The coach runs on your own OpenRouter account (you control spend). Add a key to start chatting.
        </p>
        <Link to="/settings" className="btn primary">
          Go to Settings
        </Link>
      </div>
    );
  }

  return (
    <div className="chat-wrap">
      {isBackfill && <div className="notice warn">Backfill mode — writes land on {activeDate}, not today.</div>}
      <div className="chat-log" ref={logRef}>
        {messages.map((m, i) => (
          <div key={i} className={`msg ${m.role}`}>
            {m.role === 'tool' ? `🔧 ${m.content}` : m.content}
          </div>
        ))}
        {busy && toolLog.length > 0 && <div className="msg tool">🔧 {toolLog.join(' → ')}</div>}
        {streaming && <div className="msg assistant">{streaming}</div>}
        {busy && !streaming && <div className="msg assistant muted">thinking…</div>}
      </div>

      {messages.length <= 1 && !busy && (
        <div className="row wrap" style={{ marginBottom: 8 }}>
          {QUICK_REPLIES.map((q) => (
            <button key={q} className="chip accent" onClick={() => send(q)}>
              {q}
            </button>
          ))}
        </div>
      )}

      <div className="chat-input">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Log a set, a meal, or ask a question…"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
        />
        <button className="primary" disabled={busy} onClick={() => send(input)}>
          Send
        </button>
      </div>
    </div>
  );
}

function deriveTitle(msgs: ChatMessage[], isBackfill: boolean, date: string): string {
  const firstUser = msgs.find((m) => m.role === 'user')?.content ?? '';
  const snippet = firstUser.slice(0, 32);
  const prefix = isBackfill ? `Backfill ${date}` : 'Chat';
  return snippet ? `${prefix} — ${snippet}` : prefix;
}
