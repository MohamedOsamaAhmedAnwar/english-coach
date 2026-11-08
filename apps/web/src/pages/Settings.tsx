import { useState } from 'react';
import { api } from '../api';
import type { AppState, Health } from '../types';
import { Icon } from '../components/Icons';

export function Settings({
  state,
  health,
  onSaved,
}: {
  state: AppState;
  health: Health | null;
  onSaved: () => void;
}) {
  const [name, setName] = useState(state.profile.name);
  const [minutes, setMinutes] = useState(state.profile.dailyMinutes);
  const [exam, setExam] = useState(state.profile.examTarget);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.post('/api/profile', { name, dailyMinutes: minutes, examTarget: exam });
      setSaved(true);
      onSaved();
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page narrow">
      <header className="page-head">
        <div>
          <p className="eyebrow">Settings</p>
          <h1>Your setup</h1>
        </div>
      </header>

      <section className="card">
        <h3>Profile</h3>
        <label className="field">
          <span>Name</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </label>

        <div className="field">
          <span>Daily session length</span>
          <div className="seg">
            {[30, 45, 55, 75].map((m) => (
              <button key={m} className={minutes === m ? 'on' : ''} onClick={() => setMinutes(m)}>
                {m} min
              </button>
            ))}
          </div>
        </div>

        <label className="field">
          <span>Exam target</span>
          <input className="input" value={exam} onChange={(e) => setExam(e.target.value)} />
        </label>

        {error && <p className="error-text">{error}</p>}
        <div className="row gap">
          <button className="btn primary" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
          {saved && (
            <span className="pill ok">
              <Icon name="check" size={13} /> saved
            </span>
          )}
        </div>
      </section>

      <section className="card">
        <h3>Local engine</h3>
        <div className="kv">
          <span>Examiner model</span>
          <strong className={health?.ollama.ok ? 'good-text' : 'bad-text'}>
            {health?.ollama.model || '—'} {health?.ollama.ok ? '· online' : '· offline'}
          </strong>
        </div>
        <div className="kv">
          <span>Speech recogniser</span>
          <strong className={health?.asr.ok ? 'good-text' : 'bad-text'}>
            {health?.asr.model || 'whisper'} {health?.asr.device ? `· ${health.asr.device}` : ''}{' '}
            {health?.asr.ok ? '· ready' : '· offline'}
          </strong>
        </div>
        <div className="kv">
          <span>Lessons built</span>
          <strong>
            {health?.lessonsReady ?? 0} / {health?.lessonsTotal ?? 0}
          </strong>
        </div>
        <div className="kv">
          <span>Data folder</span>
          <strong className="mono tiny">english-coach/data</strong>
        </div>
        <p className="muted tiny">
          Everything stays on this machine: the database in <code>data/coach.db</code>, recordings in
          <code> data/audio/</code>, lessons in <code>content/lessons/</code>. To change the model, set
          <code> OLLAMA_MODEL</code> before starting the API.
        </p>
      </section>

      <section className="card">
        <h3>How the plan adapts</h3>
        <p className="muted tiny">
          Speaking and writing bands use a rolling average of your last five attempts. Listening and reading use the
          percentage on each lesson's questions. The plan does not rewrite itself silently — you can always open a
          harder or easier lesson from the Library.
        </p>
      </section>
    </div>
  );
}
