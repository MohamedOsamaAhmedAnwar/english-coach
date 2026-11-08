import { useState } from 'react';
import { api } from '../../api';
import type { Lesson } from '../../types';
import { Icon } from '../../components/Icons';

function describe(label: string, value: number | undefined, mode: 'band' | 'percent') {
  if (value == null || value === 0) return { label, text: 'not scored', tone: 'muted' };
  if (mode === 'band') {
    return {
      label,
      text: `${value.toFixed(1)} band`,
      tone: value >= 6.5 ? 'great' : value >= 5 ? 'good' : 'low',
    };
  }
  return { label, text: `${Math.round(value)}%`, tone: value >= 80 ? 'great' : value >= 60 ? 'good' : 'low' };
}

export function WrapBlock({
  lesson,
  sessionId,
  scores,
  minutes,
  onFinish,
}: {
  lesson: Lesson;
  sessionId: number | null;
  scores: Record<string, number>;
  minutes: number;
  onFinish: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ streak?: number; vocab?: number } | null>(null);

  const rows = [
    describe('Warm-up speaking', scores.warmup, 'band'),
    describe('Listening', scores.listening, 'percent'),
    describe('Speaking', scores.speaking, 'band'),
    describe('Reading', scores.reading, 'percent'),
    describe('Writing', scores.writing, 'band'),
  ];

  const finish = async () => {
    setSaving(true);
    setError(null);
    try {
      if (sessionId) {
        await api.post(`/api/sessions/${sessionId}/block`, {
          block: 'wrap',
          score: 100,
          minutes: 3,
          data: { completed: true },
        });
      }

      let streak: number | undefined;
      if (sessionId) {
        const res = await api.post<{ streak: { current: number } }>(`/api/sessions/${sessionId}/finish`, {
          summary: { scores, minutes, topic: lesson.topic },
        });
        streak = res.streak?.current;
      }
      const vocabRes = await api.post<{ added: number }>('/api/vocab', {
        items: [
          ...lesson.vocab.map((v) => ({
            term: v.term,
            meaning: v.meaning,
            example: v.example,
            lessonId: lesson.id,
          })),
          ...lesson.phrases.map((p) => ({ term: p, meaning: '', example: '', lessonId: lesson.id })),
        ],
      });
      setSaved({ streak, vocab: vocabRes.added });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (saved) {
    return (
      <div className="block-body">
        <div className="finish-card">
          <div className="finish-icon">
            <Icon name="check" size={26} />
          </div>
          <p className="eyebrow">Session complete</p>
          <h2>{minutes} minutes of real practice.</h2>
          <p className="lead">
            {saved.vocab && saved.vocab > 0
              ? `${saved.vocab} new chunks went into your review queue.`
              : 'Your review queue is up to date.'}{' '}
            {saved.streak != null && saved.streak > 0
              ? `Streak: ${saved.streak} day${saved.streak === 1 ? '' : 's'}.`
              : ''}
          </p>

          <div className="recap">
            {rows.map((r) => (
              <div className="recap-row" key={r.label}>
                <span className={r.tone}>{r.label}</span>
                <strong className={r.tone}>{r.text}</strong>
              </div>
            ))}
          </div>

          <div className="card inner">
            <h3>Carry these into tomorrow</h3>
            <div className="chips">
              {lesson.phrases.map((p, i) => (
                <span className="chip" key={i}>
                  {p}
                </span>
              ))}
            </div>
            <p className="muted tiny">
              Tomorrow's warm-up recycles them. If you cannot say one from memory, it is not learned yet.
            </p>
          </div>

          <button className="btn primary lg" onClick={onFinish}>
            Back to dashboard <Icon name="arrow" size={18} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="block-body">
      <div className="block-intro">
        <p className="eyebrow">Wrap-up · 3 min</p>
        <h2>Close the loop</h2>
        <p className="muted">
          Here is what the session produced. Finishing saves your scores, schedules the new chunks for review, and
          updates your streak.
        </p>
      </div>

      <div className="recap">
        {rows.map((r) => (
          <div className="recap-row" key={r.label}>
            <span className={r.tone}>{r.label}</span>
            <strong className={r.tone}>{r.text}</strong>
          </div>
        ))}
        <div className="recap-row">
          <span>Time on task</span>
          <strong>{minutes} min</strong>
        </div>
      </div>

      <div className="card inner">
        <h3>New chunks</h3>
        <div className="chips">
          {[...lesson.vocab.map((v) => v.term), ...lesson.phrases].slice(0, 10).map((t, i) => (
            <span className="chip" key={`${t}-${i}`}>
              {t}
            </span>
          ))}
        </div>
        <p className="muted tiny">
          These join the spoken review queue. You will be asked to say them, not recognise them.
        </p>
      </div>

      {error && <p className="error-text">{error}</p>}

      <div className="block-footer">
        <button className="btn primary lg" onClick={finish} disabled={saving}>
          {saving ? 'Saving…' : 'Finish session'} <Icon name="check" size={18} />
        </button>
      </div>
    </div>
  );
}
