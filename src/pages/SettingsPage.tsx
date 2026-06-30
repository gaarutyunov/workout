import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDatabase, useSync } from '../context/DatabaseContext';
import { useRxDocument } from '../hooks/useRxQuery';
import { writeDoc } from '../db/write';
import { PROFILE_ID } from '../lib/ids';
import type { Profile } from '../db/types';
import * as dropbox from '../sync/dropbox/auth';
import * as openrouter from '../ai/openrouter';

const PERSIST_KEY = 'fitness.persistTranscripts';

export function SettingsPage() {
  const db = useDatabase();
  const sync = useSync();
  const profile = useRxDocument<Profile>(db.profile, PROFILE_ID);

  const [dropboxConnected, setDropboxConnected] = useState(dropbox.hasRefreshToken());
  const [keyConnected, setKeyConnected] = useState(openrouter.hasApiKey());
  const [keyInput, setKeyInput] = useState('');
  const [model, setModelState] = useState(openrouter.getModel());
  const [persist, setPersist] = useState(localStorage.getItem(PERSIST_KEY) !== 'false');

  useEffect(() => {
    setDropboxConnected(dropbox.hasRefreshToken());
    setKeyConnected(openrouter.hasApiKey());
  }, []);

  const connectDropbox = async () => {
    try {
      await dropbox.beginAuth();
    } catch (e) {
      alert((e as Error).message);
    }
  };
  const disconnectDropbox = async () => {
    dropbox.disconnect();
    await sync.stop();
    setDropboxConnected(false);
  };

  const saveKey = () => {
    if (!keyInput.trim()) return;
    openrouter.setApiKey(keyInput.trim());
    setKeyConnected(true);
    setKeyInput('');
  };
  const saveModel = (m: string) => {
    setModelState(m);
    openrouter.setModel(m);
  };
  const togglePersist = (v: boolean) => {
    setPersist(v);
    localStorage.setItem(PERSIST_KEY, v ? 'true' : 'false');
  };

  return (
    <div>
      <div className="card">
        <h2>Sync — Dropbox</h2>
        <p className="muted">
          Your data lives locally and syncs across your devices through your own Dropbox (App folder).
          No developer server, no shared secret.
        </p>
        {!dropbox.isConfigured() && (
          <div className="notice warn">
            No Dropbox app key configured (VITE_DROPBOX_APP_KEY). The app works fully offline without it.
          </div>
        )}
        {dropboxConnected ? (
          <div className="row spread">
            <span className="notice ok" style={{ margin: 0 }}>
              Connected {sync.isRunning ? '· syncing' : ''}
            </span>
            <button onClick={disconnectDropbox}>Disconnect</button>
          </div>
        ) : (
          <button className="primary" disabled={!dropbox.isConfigured()} onClick={connectDropbox}>
            Connect Dropbox
          </button>
        )}
      </div>

      <div className="card">
        <h2>AI coach — OpenRouter</h2>
        <p className="muted">
          The coach runs on your own OpenRouter account, so you control spend. Set a per-key limit in OpenRouter.
        </p>
        {keyConnected ? (
          <div className="row spread">
            <span className="notice ok" style={{ margin: 0 }}>
              Key saved
            </span>
            <button
              onClick={() => {
                openrouter.clearApiKey();
                setKeyConnected(false);
              }}
            >
              Remove key
            </button>
          </div>
        ) : (
          <>
            <button className="primary" onClick={() => openrouter.beginAuth()}>
              Connect with OpenRouter
            </button>
            <label>…or paste an API key</label>
            <div className="row">
              <input
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                placeholder="sk-or-…"
                type="password"
              />
              <button onClick={saveKey}>Save</button>
            </div>
          </>
        )}
        <label>Model</label>
        <select value={model} onChange={(e) => saveModel(e.target.value)}>
          <option value={openrouter.DEFAULT_MODEL}>{openrouter.DEFAULT_MODEL} (fast logging)</option>
          <option value={openrouter.ANALYSIS_MODEL}>{openrouter.ANALYSIS_MODEL} (deep analysis)</option>
          <option value="openai/gpt-4o">openai/gpt-4o</option>
          <option value="google/gemini-2.0-flash-001">google/gemini-2.0-flash-001</option>
        </select>
        <label className="row" style={{ alignItems: 'center', gap: 8, marginTop: 12 }}>
          <input
            type="checkbox"
            checked={persist}
            onChange={(e) => togglePersist(e.target.checked)}
            style={{ width: 'auto' }}
          />
          <span>Save & sync chat transcripts</span>
        </label>
      </div>

      <ProfileCard db={db} profile={profile} />

      <div className="card">
        <h2>Data</h2>
        <Link to="/import" className="btn">
          Import / restore from JSON
        </Link>
        <Link to="/history" className="btn" style={{ marginLeft: 8 }}>
          History
        </Link>
      </div>
    </div>
  );
}

function ProfileCard({
  db,
  profile,
}: {
  db: ReturnType<typeof useDatabase>;
  profile: Profile | null;
}) {
  const [goal, setGoal] = useState('');
  const [protein, setProtein] = useState('');
  const [kcalLow, setKcalLow] = useState('');
  const [kcalHigh, setKcalHigh] = useState('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (profile && !loaded) {
      setGoal(profile.goal ?? '');
      setProtein(String(profile.targets?.proteinG ?? ''));
      setKcalLow(String(profile.targets?.kcalLow ?? ''));
      setKcalHigh(String(profile.targets?.kcalHigh ?? ''));
      setLoaded(true);
    }
  }, [profile, loaded]);

  const save = async () => {
    await writeDoc(db, 'profile', {
      ...(profile ?? { id: PROFILE_ID }),
      id: PROFILE_ID,
      goal,
      targets: {
        ...profile?.targets,
        proteinG: protein ? Number(protein) : undefined,
        kcalLow: kcalLow ? Number(kcalLow) : undefined,
        kcalHigh: kcalHigh ? Number(kcalHigh) : undefined,
      },
    });
  };

  return (
    <div className="card">
      <h2>Profile & targets</h2>
      <label>Goal</label>
      <input value={goal} onChange={(e) => setGoal(e.target.value)} />
      <div className="row">
        <div style={{ flex: 1 }}>
          <label>Protein (g)</label>
          <input value={protein} onChange={(e) => setProtein(e.target.value)} inputMode="numeric" />
        </div>
        <div style={{ flex: 1 }}>
          <label>kcal low</label>
          <input value={kcalLow} onChange={(e) => setKcalLow(e.target.value)} inputMode="numeric" />
        </div>
        <div style={{ flex: 1 }}>
          <label>kcal high</label>
          <input value={kcalHigh} onChange={(e) => setKcalHigh(e.target.value)} inputMode="numeric" />
        </div>
      </div>
      <button className="primary" style={{ marginTop: 12 }} onClick={save}>
        Save profile
      </button>
    </div>
  );
}
