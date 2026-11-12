import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../api';
import type { AppState, Lesson } from '../types';
import { Icon } from '../components/Icons';
import { WarmupBlock } from './session/WarmupBlock';
import { ListeningBlock } from './session/ListeningBlock';
import { SpeakingBlock } from './session/SpeakingBlock';
import { ReadingBlock } from './session/ReadingBlock';
import { WritingBlock } from './session/WritingBlock';
import { WrapBlock } from './session/WrapBlock';

const STEPS = [
  { key: 'warmup', label: 'Warm-up', icon: 'flame' },
  { key: 'listening', label: 'Listening', icon: 'headphones' },
  { key: 'speaking', label: 'Speaking', icon: 'mic' },
  { key: 'reading', label: 'Reading', icon: 'bookopen' },
  { key: 'writing', label: 'Writing', icon: 'pen' },
  { key: 'wrap', label: 'Wrap-up', icon: 'repeat' },
];

const PREP_MESSAGES = [
  'Selecting vocabulary for your level…',
  'Writing the listening dialogue…',
  'Designing the speaking tasks…',
  'Building the reading passage…',
  'Writing the model answer…',
];

export function Session({
  lessonId,
  state,
  onExit,
  onComplete,
}: {
  lessonId: string;
  state: AppState;
  onExit: () => void;
  onComplete: () => void;
}) {
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [step, setStep] = useState(0);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [minutes, setMinutes] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [prepSeconds, setPrepSeconds] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const stepStart = useRef(Date.now());
  const added = useRef(new Set<string>());

  useEffect(() => {
    let cancelled = false;
    const startedAt = Date.now();
    const clock = window.setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    const prepClock = window.setInterval(() => setPrepSeconds((s) => s + 1), 1000);

    (async () => {
      try {
        let loaded: Lesson;
        try {
          const res = await api.get<{ lesson: Lesson }>(`/api/lessons/${lessonId}`);
          loaded = res.lesson;
        } catch (err) {
          if (err instanceof ApiError && err.status === 404) {
            setPreparing(true);
            const res = await api.post<{ lesson: Lesson }>(`/api/lessons/${lessonId}/prepare`);
            loaded = res.lesson;
          } else {
            throw err;
          }
        }
        if (cancelled) return;
        setPreparing(false);

        const created = await api.post<{ session: { id: number } }>('/api/sessions', { lessonId });
        if (cancelled) return;
        setSessionId(created.session.id);
        setLesson(loaded);
        stepStart.current = Date.now();
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      } finally {
        if (!cancelled) {
          setPreparing(false);
          window.clearInterval(prepClock);
        }
      }
    })();

    return () => {
      cancelled = true;
      window.clearInterval(clock);
      window.clearInterval(prepClock);
    };
  }, [lessonId]);

  const addPhrase = (term: string) => {
    if (!term || added.current.has(term)) return;
    added.current.add(term);
    api.post('/api/vocab', { items: [{ term, lessonId }] }).catch(() => undefined);
  };

  const complete = async (block: string, score: number) => {
    const spent = Math.max(1, Math.round((Date.now() - stepStart.current) / 60_000));
    setScores((s) => ({ ...s, [block]: score }));
    setMinutes((m) => m + spent);
    if (sessionId) {
      await api
        .post(`/api/sessions/${sessionId}/block`, {
          block,
          score,
          minutes: spent,
          data: {},
        })
        .catch(() => undefined);
    }
    stepStart.current = Date.now();
    setStep((s) => s + 1);
  };

  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const ss = String(elapsed % 60).padStart(2, '0');

  if (error) {
    return (
      <div className="page">
        <div className="card">
          <h2>This session could not start.</h2>
          <p className="error-text">{error}</p>
          <p className="muted">
            If the message mentions generation, the local model is probably offline or overloaded. Check
            <code> ollama list </code> and that <code>qwen2.5:7b</code> is available.
          </p>
          <div className="row gap">
            <button className="btn" onClick={() => window.location.reload()}>
              Retry
            </button>
            <button className="btn ghost" onClick={onExit}>
              Back to dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!lesson) {
    return (
      <div className="page">
        <div className="prep">
          <div className="prep-spinner" />
          <p className="eyebrow">{preparing ? 'Writing your lesson' : 'Loading your lesson'}</p>
          <h1>{preparing ? 'Your coach is preparing today’s material.' : 'One moment…'}</h1>
          <p className="muted">
            {preparing
              ? 'This happens once per lesson. The local model writes the dialogue, text, questions and model answer, then the lesson is cached for good.'
              : 'Fetching the cached lesson and starting your session.'}
          </p>
          {preparing && (
            <>
              <div className="prep-bar">
                <div style={{ width: `${Math.min(96, prepSeconds * 2.5)}%` }} />
              </div>
              <p className="muted tiny">
                {prepSeconds}s · {PREP_MESSAGES[Math.floor(prepSeconds / 6) % PREP_MESSAGES.length]}
              </p>
              <p className="muted tiny">
                Usually 2–5 minutes: the local model writes the lesson in short steps (dialogue, questions,
                vocabulary, speaking, reading, writing). It is cached after this.
              </p>
            </>
          )}
        </div>
      </div>
    );
  }

  const current = STEPS[step] || STEPS[STEPS.length - 1];

  return (
    <div className="page session">
      <header className="session-head">
        <div className="row between wrap">
          <div>
            <p className="eyebrow">
              Day {lesson.dayIndex} · Week {lesson.week} · {lesson.level} · {lesson.topic}
            </p>
            <h1>
              <Icon name={current.icon} size={22} /> {current.label}
            </h1>
          </div>
          <div className="row gap">
            <span className="pill mono">
              {mm}:{ss}
            </span>
            <button className="btn ghost sm" onClick={onExit}>
              Save & exit
            </button>
          </div>
        </div>

        <div className="stepper">
          {STEPS.map((s, i) => (
            <div
              key={s.key}
              className={`step ${i < step ? 'done' : ''} ${i === step ? 'active' : ''}`}
              title={s.label}
            >
              <span className="step-dot">{i < step ? <Icon name="check" size={12} /> : i + 1}</span>
              <span className="step-label">{s.label}</span>
            </div>
          ))}
        </div>
      </header>

      {step === 0 && (
        <WarmupBlock lesson={lesson} sessionId={sessionId} onDone={(s) => complete('warmup', s)} onAddPhrase={addPhrase} />
      )}
      {step === 1 && (
        <ListeningBlock lesson={lesson} sessionId={sessionId} onDone={(s) => complete('listening', s)} />
      )}
      {step === 2 && (
        <SpeakingBlock
          lesson={lesson}
          sessionId={sessionId}
          onDone={(s) => complete('speaking', s)}
          onAddPhrase={addPhrase}
        />
      )}
      {step === 3 && (
        <ReadingBlock
          lesson={lesson}
          sessionId={sessionId}
          onDone={(s) => complete('reading', s)}
          onAddPhrase={addPhrase}
        />
      )}
      {step === 4 && (
        <WritingBlock
          lesson={lesson}
          sessionId={sessionId}
          onDone={(s) => complete('writing', s)}
          onAddPhrase={addPhrase}
        />
      )}
      {step === 5 && (
        <WrapBlock
          lesson={lesson}
          sessionId={sessionId}
          scores={scores}
          minutes={minutes}
          onFinish={onComplete}
        />
      )}
    </div>
  );
}
