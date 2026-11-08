import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import type { AppState, Health } from './types';
import { warmVoices } from './speech';
import { Icon } from './components/Icons';
import { HealthBar } from './components/HealthBar';
import { Today } from './pages/Today';
import { Session } from './pages/Session';
import { Diagnostic } from './pages/Diagnostic';
import { Progress } from './pages/Progress';
import { Library } from './pages/Library';
import { Review } from './pages/Review';
import { Settings } from './pages/Settings';

type View = 'today' | 'session' | 'diagnostic' | 'progress' | 'library' | 'review' | 'settings';

const NAV: { id: View; label: string; icon: string }[] = [
  { id: 'today', label: 'Today', icon: 'today' },
  { id: 'progress', label: 'Progress', icon: 'chart' },
  { id: 'library', label: 'Library', icon: 'book' },
  { id: 'review', label: 'Review', icon: 'repeat' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
];

export default function App() {
  const [state, setState] = useState<AppState | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [view, setView] = useState<View>('today');
  const [lessonId, setLessonId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [booting, setBooting] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const [nextState, nextHealth] = await Promise.all([
        api.get<AppState>('/api/state'),
        api.get<Health>('/api/health'),
      ]);
      setState(nextState);
      setHealth(nextHealth);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBooting(false);
    }
  }, []);

  useEffect(() => {
    warmVoices();
    refresh();
    const timer = window.setInterval(() => {
      api
        .get<Health>('/api/health')
        .then(setHealth)
        .catch(() => undefined);
    }, 25_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const startSession = (id: string) => {
    setLessonId(id);
    setView('session');
  };

  const goto = (next: View) => {
    setView(next);
    if (next === 'today') refresh();
  };

  if (booting) {
    return (
      <div className="boot">
        <div className="brand big">
          <span className="logo-dot" /> Steady
        </div>
        <p className="muted">Starting your coach…</p>
      </div>
    );
  }

  if (error || !state) {
    return (
      <div className="boot">
        <div className="brand big">
          <span className="logo-dot" /> Steady
        </div>
        <p className="error-text">{error || 'Could not load state.'}</p>
        <p className="muted">
          The API server is not answering on port 8787. Run <code>npm run dev</code> in the project folder.
        </p>
        <button className="btn" onClick={refresh}>
          Retry
        </button>
      </div>
    );
  }

  const needsDiagnostic = !state.profile.onboardingDone;

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="logo-dot" /> Steady
        </div>
        <div className="side-sub">A2 → B2 · speaking first</div>

        <nav>
          {NAV.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${view === item.id ? 'active' : ''}`}
              onClick={() => goto(item.id)}
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
              {item.id === 'review' && state.dueReviews > 0 && (
                <span className="badge">{state.dueReviews}</span>
              )}
            </button>
          ))}
        </nav>

        <div className="side-foot">
          <div className="streak">
            <Icon name="flame" size={16} />
            <span>
              {state.streak.current} day{state.streak.current === 1 ? '' : 's'}
            </span>
          </div>
          <div className="mini-progress">
            <div className="track">
              <div className="fill" style={{ width: `${state.progress.percent}%` }} />
            </div>
            <div className="muted tiny">
              Day {state.progress.dayIndex} / {state.progress.totalSessions}
            </div>
          </div>
        </div>
      </aside>

      <main className="main">
        <HealthBar health={health} />

        {view === 'today' && (
          <Today
            state={state}
            needsDiagnostic={needsDiagnostic}
            onStart={startSession}
            onDiagnostic={() => setView('diagnostic')}
            onReview={() => setView('review')}
          />
        )}

        {view === 'session' && lessonId && (
          <Session
            lessonId={lessonId}
            state={state}
            onExit={() => {
              setLessonId(null);
              goto('today');
            }}
            onComplete={async () => {
              setLessonId(null);
              await refresh();
              setView('today');
            }}
          />
        )}

        {view === 'diagnostic' && (
          <Diagnostic
            onDone={async () => {
              await refresh();
              setView('today');
            }}
            onSkip={async () => {
              try {
                await api.post('/api/diagnostic/skip');
              } catch {
                /* ignore */
              }
              await refresh();
              setView('today');
            }}
          />
        )}

        {view === 'progress' && <Progress />}
        {view === 'library' && <Library onStart={startSession} />}
        {view === 'review' && <Review onDone={refresh} />}
        {view === 'settings' && <Settings state={state} health={health} onSaved={refresh} />}
      </main>
    </div>
  );
}
