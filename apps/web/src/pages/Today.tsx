import type { AppState, SkillKey } from '../types';
import { Icon } from '../components/Icons';

const CEFR_PCT: Record<string, number> = {
  A1: 12,
  A2: 32,
  'A2+': 42,
  B1: 58,
  'B1+': 68,
  B2: 85,
  'B2+': 90,
  C1: 96,
};

const SKILL_ORDER: { key: SkillKey; label: string; icon: string }[] = [
  { key: 'speaking', label: 'Speaking', icon: 'mic' },
  { key: 'listening', label: 'Listening', icon: 'headphones' },
  { key: 'reading', label: 'Reading', icon: 'bookopen' },
  { key: 'writing', label: 'Writing', icon: 'pen' },
];

const BLOCKS = [
  { icon: 'flame', label: 'Warm-up + spoken review', min: 5 },
  { icon: 'headphones', label: 'Listening + shadowing', min: 10 },
  { icon: 'mic', label: 'Speaking: the core block', min: 20 },
  { icon: 'bookopen', label: 'Reading + retell', min: 8 },
  { icon: 'pen', label: 'Writing + feedback', min: 7 },
  { icon: 'repeat', label: 'Wrap-up + next-day plan', min: 3 },
];

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return 'Still up';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export function Today({
  state,
  needsDiagnostic,
  onStart,
  onDiagnostic,
  onReview,
}: {
  state: AppState;
  needsDiagnostic: boolean;
  onStart: (id: string) => void;
  onDiagnostic: () => void;
  onReview: () => void;
}) {
  const today = state.today;
  const resuming = Boolean(state.activeSession);

  if (needsDiagnostic) {
    return (
      <div className="page">
        <header className="page-head">
          <div>
            <p className="eyebrow">Welcome</p>
            <h1>Let's find your real starting point.</h1>
            <p className="lead">
              Before the lessons begin, a 30–35 minute check measures each skill separately. Most learners are not
              the same level everywhere — you may read at B1 and speak at A2. The app builds your plan from what it
              actually measures.
            </p>
          </div>
        </header>

        <section className="card intro-card">
          <div className="intro-grid">
            <div>
              <h3>What to expect</h3>
              <ul className="checklist">
                <li>
                  <Icon name="headphones" size={16} /> 6 listening questions on one short conversation
                </li>
                <li>
                  <Icon name="bookopen" size={16} /> 6 reading questions on a short article
                </li>
                <li>
                  <Icon name="mic" size={16} /> One 90-second speaking task, recorded and transcribed locally
                </li>
                <li>
                  <Icon name="pen" size={16} /> One 120–180 word writing task
                </li>
              </ul>
              <p className="muted tiny">
                Headphones on. Sit somewhere quiet. You can pause between sections — nothing is timed strictly.
              </p>
            </div>
            <div className="intro-cta">
              <button className="btn primary lg" onClick={onDiagnostic}>
                Start the check <Icon name="arrow" size={18} />
              </button>
              <p className="muted tiny">Takes about 35 minutes · gives you four separate levels</p>
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">
            Day {state.progress.dayIndex} of {state.progress.totalSessions} · Week {state.progress.week} ·{' '}
            {today?.phase || 'Foundation'}
          </p>
          <h1>
            {greeting()}, {state.profile.name}.
          </h1>
          <p className="lead">
            {state.streak.current > 1
              ? `${state.streak.current} days in a row. Protect the streak: one session is enough.`
              : 'One session today. Speaking is the block that matters most — do not skip it.'}
          </p>
        </div>
        <div className="head-stats">
          <div className="stat">
            <div className="stat-value">{state.streak.current}</div>
            <div className="stat-label">day streak</div>
          </div>
          <div className="stat">
            <div className="stat-value">{state.progress.percent}%</div>
            <div className="stat-label">to B2</div>
          </div>
        </div>
      </header>

      <div className="grid-2">
        <div className="stack">
          <section className="card hero">
            <div className="hero-top">
              <span className="pill accent">{today?.level || 'A2'}</span>
              <span className="pill">{today?.grammar}</span>
              {resuming && <span className="pill warn">session in progress</span>}
            </div>
            <h2>{today?.topic}</h2>
            <p className="lead">{today?.angle}</p>

            <div className="target-line">
              <span className="muted">Today's focus</span>
              <strong>{today?.focusLabel}</strong>
            </div>

            <ul className="block-list">
              {BLOCKS.map((b) => (
                <li key={b.label}>
                  <Icon name={b.icon} size={17} />
                  <span>{b.label}</span>
                  <span className="muted tiny">{b.min} min</span>
                </li>
              ))}
            </ul>

            <div className="hero-actions">
              {today && (
                <button className="btn primary lg" onClick={() => onStart(today.id)}>
                  {resuming ? 'Resume session' : "Start today's session"}
                  <Icon name="arrow" size={18} />
                </button>
              )}
              <span className="muted tiny">≈ {state.profile.dailyMinutes} minutes</span>
            </div>
            <p className="muted tiny">
              Lesson is written on demand by your local model the first time you open it — that first start can take
              2–5 minutes. It is cached after that.
            </p>
          </section>

          <section className="card">
            <div className="card-head">
              <h3>How this works</h3>
              <span className="pill">the loop</span>
            </div>
            <div className="loop">
              <div>
                <strong>1. You speak</strong>
                <p className="muted tiny">Every task ends in your voice. Nothing is graded from typing.</p>
              </div>
              <div>
                <strong>2. It measures</strong>
                <p className="muted tiny">
                  Whisper gives word timings: speed, pauses, fillers, script match. Numbers first, opinions second.
                </p>
              </div>
              <div>
                <strong>3. It corrects</strong>
                <p className="muted tiny">
                  Two fixes, one model answer, three chunks. The next session recycles what you got wrong.
                </p>
              </div>
            </div>
          </section>
        </div>

        <aside className="stack">
          <section className="card">
            <div className="card-head">
              <h3>Skill levels</h3>
              <span className="muted tiny">measured locally</span>
            </div>
            <div className="levels">
              {SKILL_ORDER.map(({ key, label, icon }) => {
                const level = state.levels[key];
                const pct = CEFR_PCT[level?.cefr || 'A2'] || 32;
                return (
                  <div className="level-row" key={key}>
                    <div className="level-head">
                      <span className="level-name">
                        <Icon name={icon} size={16} /> {label}
                        {key === 'speaking' && <span className="pill accent tiny">priority</span>}
                      </span>
                      <span className="mono">{level?.cefr || 'A2'}</span>
                    </div>
                    <div className="track">
                      <div className="fill" style={{ width: `${pct}%` }} />
                      <div className="marker" style={{ left: `${CEFR_PCT.B2}%` }} title="B2 target" />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="card">
            <div className="card-head">
              <h3>Review queue</h3>
              {state.dueReviews > 0 ? (
                <span className="badge">{state.dueReviews}</span>
              ) : (
                <span className="pill ok">clear</span>
              )}
            </div>
            <p className="muted tiny">
              {state.dueReviews > 0
                ? 'Say each chunk aloud before you rate it. Recognition is not the skill you need.'
                : 'No chunks due. New ones are added at the end of every session.'}
            </p>
            <button className="btn ghost sm" onClick={onReview} disabled={state.dueReviews === 0}>
              Open review <Icon name="arrow" size={15} />
            </button>
          </section>

          <section className="card">
            <div className="card-head">
              <h3>This week</h3>
            </div>
            <div className="week-dots">
              {Array.from({ length: 5 }).map((_, i) => {
                const dayIndex = (state.progress.week - 1) * 5 + i + 1;
                const done = dayIndex <= state.progress.sessionsDone;
                const current = dayIndex === state.progress.dayIndex;
                return (
                  <div key={i} className={`week-dot ${done ? 'done' : ''} ${current ? 'current' : ''}`}>
                    <span>{['M', 'T', 'W', 'T', 'F'][i]}</span>
                    {done ? <Icon name="check" size={13} /> : <span className="tiny muted">{dayIndex}</span>}
                  </div>
                );
              })}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
