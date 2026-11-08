import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import type { Spec } from '../types';
import { Icon } from '../components/Icons';

const PHASES = ['All', 'Foundation', 'Build', 'Push', 'Consolidate'];

export function Library({ onStart }: { onStart: (id: string) => void }) {
  const [lessons, setLessons] = useState<Spec[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState('All');
  const [query, setQuery] = useState('');

  useEffect(() => {
    api
      .get<{ lessons: Spec[] }>('/api/lessons')
      .then((res) => setLessons(res.lessons))
      .catch((err) => setError(err.message));
  }, []);

  const filtered = useMemo(() => {
    return lessons.filter((l) => {
      if (phase !== 'All' && l.phase !== phase) return false;
      if (query && !`${l.topic} ${l.grammar} ${l.angle}`.toLowerCase().includes(query.toLowerCase())) return false;
      return true;
    });
  }, [lessons, phase, query]);

  const readyCount = lessons.filter((l) => l.ready).length;
  const groups = useMemo(() => {
    const map = new Map<number, Spec[]>();
    for (const l of filtered) {
      if (!map.has(l.week)) map.set(l.week, []);
      map.get(l.week)!.push(l);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [filtered]);

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">Curriculum</p>
          <h1>120 sessions, A2 → B2.</h1>
          <p className="lead">
            Six phases, five sessions a week. Any lesson can be opened early; unbuilt ones are written by your local
            model the first time you start them.
          </p>
        </div>
        <div className="head-stats">
          <div className="stat">
            <div className="stat-value">{readyCount}</div>
            <div className="stat-label">built</div>
          </div>
          <div className="stat">
            <div className="stat-value">{lessons.length}</div>
            <div className="stat-label">total</div>
          </div>
        </div>
      </header>

      <div className="filters">
        {PHASES.map((p) => (
          <button key={p} className={`seg-btn ${phase === p ? 'on' : ''}`} onClick={() => setPhase(p)}>
            {p}
          </button>
        ))}
        <input
          className="input search"
          placeholder="Search topics or grammar…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {error && <p className="error-text">{error}</p>}

      <div className="week-groups">
        {groups.map(([week, items]) => (
          <section key={week} className="week-group">
            <div className="week-head">
              <span className="pill">Week {week}</span>
              <span className="muted tiny">{items[0]?.phase}</span>
            </div>
            <div className="lesson-grid">
              {items.map((l) => (
                <article className={`lesson-card ${l.ready ? '' : 'unbuilt'}`} key={l.id}>
                  <div className="lesson-top">
                    <span className="mono tiny">day {l.dayIndex}</span>
                    <span className={`pill tiny ${l.ready ? 'ok' : ''}`}>{l.ready ? 'ready' : 'on demand'}</span>
                  </div>
                  <h3>{l.topic}</h3>
                  <p className="muted tiny">{l.angle}</p>
                  <div className="chips">
                    <span className="chip small">{l.level}</span>
                    <span className="chip small">{l.grammar}</span>
                  </div>
                  <div className="lesson-foot">
                    <span className="muted tiny">{l.focusLabel}</span>
                    <button className="icon-btn" title="Open lesson" onClick={() => onStart(l.id)}>
                      <Icon name="arrow" size={16} />
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
