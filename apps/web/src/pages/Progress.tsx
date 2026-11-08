import { useEffect, useState } from 'react';
import { api } from '../api';
import type { ProgressData, SkillKey } from '../types';
import { Icon } from '../components/Icons';

const SKILLS: { key: SkillKey; label: string; icon: string; source: string }[] = [
  { key: 'speaking', label: 'Speaking', icon: 'mic', source: 'speaking' },
  { key: 'listening', label: 'Listening', icon: 'headphones', source: 'listening' },
  { key: 'reading', label: 'Reading', icon: 'bookopen', source: 'reading' },
  { key: 'writing', label: 'Writing', icon: 'pen', source: 'writing' },
];

function Sparkline({ values, max = 9, label }: { values: number[]; max?: number; label: string }) {
  if (values.length < 2) {
    return <div className="spark-empty">Not enough data yet — {label}</div>;
  }
  const w = 260;
  const h = 64;
  const pad = 6;
  const stepX = (w - pad * 2) / (values.length - 1);
  const points = values.map((v, i) => {
    const x = pad + i * stepX;
    const y = h - pad - (Math.max(0, Math.min(max, v)) / max) * (h - pad * 2);
    return { x, y, v };
  });
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const area = `${path} L ${points[points.length - 1].x} ${h - pad} L ${points[0].x} ${h - pad} Z`;
  const last = values[values.length - 1];
  const first = values[0];
  const delta = last - first;

  return (
    <div className="spark">
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
        <path d={area} className="spark-area" />
        <path d={path} className="spark-line" />
        <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r="3.5" className="spark-dot" />
      </svg>
      <div className="spark-meta">
        <span className="mono">{last.toFixed(1)}</span>
        <span className={`tiny ${delta >= 0 ? 'good-text' : 'bad-text'}`}>
          {delta >= 0 ? '+' : ''}
          {delta.toFixed(1)} over {values.length} attempts
        </span>
      </div>
    </div>
  );
}

export function Progress() {
  const [data, setData] = useState<ProgressData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<ProgressData>('/api/progress')
      .then(setData)
      .catch((err) => setError(err.message));
  }, []);

  if (error) return <div className="page"><p className="error-text">{error}</p></div>;
  if (!data) return <div className="page"><div className="prep-spinner" /></div>;

  const speakingValues = data.series.speaking.map((p) => Number(p.band) || 0).filter(Boolean);
  const writingValues = data.series.writing.map((p) => Number(p.band) || 0).filter(Boolean);
  const listeningValues = data.series.listening.map((p) => ((Number(p.score) || 0) / 100) * 9);
  const readingValues = data.series.reading.map((p) => ((Number(p.score) || 0) / 100) * 9);

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">Progress</p>
          <h1>Evidence, not vibes.</h1>
          <p className="lead">
            Bands are estimates against CEFR/IELTS descriptors, anchored by measurable speech data. Trends matter
            more than any single session.
          </p>
        </div>
        <div className="head-stats">
          <div className="stat">
            <div className="stat-value">{data.totals.sessions}</div>
            <div className="stat-label">sessions</div>
          </div>
          <div className="stat">
            <div className="stat-value">{data.streak.current}</div>
            <div className="stat-label">day streak</div>
          </div>
        </div>
      </header>

      <div className="grid-2">
        <div className="stack">
          {SKILLS.map(({ key, label, icon }) => {
            const values =
              key === 'speaking'
                ? speakingValues
                : key === 'writing'
                  ? writingValues
                  : key === 'listening'
                    ? listeningValues
                    : readingValues;
            const level = data.levels[key];
            return (
              <section className="card" key={key}>
                <div className="card-head">
                  <h3>
                    <Icon name={icon} size={17} /> {label}
                  </h3>
                  <span className="pill">{level?.cefr || 'A2'}</span>
                </div>
                <Sparkline values={values} label={`${label.toLowerCase()} scored from now on`} />
              </section>
            );
          })}
        </div>

        <aside className="stack">
          <section className="card">
            <div className="card-head">
              <h3>Totals</h3>
            </div>
            <div className="totals">
              <div>
                <strong>{data.totals.speakingAttempts}</strong>
                <span className="muted tiny">spoken answers</span>
              </div>
              <div>
                <strong>{data.totals.writingAttempts}</strong>
                <span className="muted tiny">written pieces</span>
              </div>
              <div>
                <strong>{data.totals.vocab}</strong>
                <span className="muted tiny">chunks saved</span>
              </div>
              <div>
                <strong>{data.totals.sessions}</strong>
                <span className="muted tiny">sessions done</span>
              </div>
            </div>
          </section>

          <section className="card">
            <div className="card-head">
              <h3>Recurring errors</h3>
              <span className="muted tiny">from examiner fixes</span>
            </div>
            {data.errors.length === 0 && <p className="muted tiny">No errors logged yet. They appear after graded answers.</p>}
            <ul className="error-list">
              {data.errors.map((e, i) => (
                <li key={i}>
                  <span className="chip small bad">{e.n}×</span>
                  <div>
                    <span className="strike">{e.wrong}</span>
                    <span className="muted"> → </span>
                    <span className="good-text">{e.right}</span>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className="card">
            <div className="card-head">
              <h3>Recent sessions</h3>
            </div>
            <ul className="session-list">
              {data.recentSessions.map((s) => {
                const summary = (s.summary || {}) as { topic?: string; minutes?: number };
                return (
                  <li key={s.id}>
                    <span className="mono tiny">day {s.day_index}</span>
                    <span>{summary.topic || s.lesson_id}</span>
                    <span className="muted tiny">{summary.minutes ? `${summary.minutes} min` : ''}</span>
                  </li>
                );
              })}
              {data.recentSessions.length === 0 && <li className="muted tiny">No finished sessions yet.</li>}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}
