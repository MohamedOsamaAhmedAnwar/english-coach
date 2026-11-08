import { useEffect, useState } from 'react';
import { api } from '../../api';
import type { Lesson, WritingFeedback } from '../../types';
import { Icon } from '../../components/Icons';
import { WritingFeedbackView } from '../../components/Feedback';

export function WritingBlock({
  lesson,
  sessionId,
  onDone,
  onAddPhrase,
}: {
  lesson: Lesson;
  sessionId: number | null;
  onDone: (score: number) => void;
  onAddPhrase: (phrase: string) => void;
}) {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<WritingFeedback | null>(null);
  const [band, setBand] = useState<number | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [showModel, setShowModel] = useState(false);

  useEffect(() => {
    const t = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(t);
  }, []);

  const words = text.trim() ? text.trim().split(/\s+/).filter(Boolean).length : 0;
  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');

  const submit = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.post<{ feedback: WritingFeedback; band: number | null }>(
        '/api/writing/attempt',
        {
          text,
          prompt: lesson.writing.task,
          taskType: lesson.writing.genre,
          level: lesson.level,
          minWords: lesson.writing.minWords,
          sessionId,
          lessonId: lesson.id,
        }
      );
      setFeedback(res.feedback);
      setBand(res.band ?? res.feedback.overall ?? null);
      for (const phrase of res.feedback.phrases || []) onAddPhrase(phrase);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="block-body">
      <div className="block-intro">
        <p className="eyebrow">Writing · 7 min</p>
        <h2>Put it into writing</h2>
        <p className="muted">
          Write without stopping for the first draft. Do not use a translator — the mistakes are the useful part.
        </p>
      </div>

      <div className="card inner">
        <div className="prompt-box">
          <p>{lesson.writing.task}</p>
        </div>
        <div className="row gap wrap">
          <span className="pill">{lesson.writing.genre}</span>
          <span className="pill">min {lesson.writing.minWords} words</span>
          <span className={`pill ${seconds > 600 ? 'warn' : ''}`}>
            {mm}:{ss} · target 8:00
          </span>
        </div>

        {lesson.writing.checklist.length > 0 && (
          <ul className="checklist tight">
            {lesson.writing.checklist.map((c, i) => (
              <li key={i}>
                <Icon name="check" size={14} /> {c}
              </li>
            ))}
          </ul>
        )}

        <textarea
          className="textarea writing"
          rows={9}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Start writing…"
          disabled={loading}
        />
        <div className="row between">
          <span className={`muted tiny ${words < lesson.writing.minWords ? 'warn-text' : ''}`}>
            {words} / {lesson.writing.minWords} words
          </span>
          {!feedback && (
            <button className="btn primary" onClick={submit} disabled={loading || words < 20}>
              {loading ? 'Marking…' : 'Get feedback'}
            </button>
          )}
        </div>

        {error && <p className="error-text">{error}</p>}
      </div>

      {feedback && (
        <div className="card inner">
          <WritingFeedbackView feedback={feedback} />
          {lesson.writing.model && (
            <div className="block">
              <button className="link tiny" onClick={() => setShowModel((v) => !v)}>
                {showModel ? 'Hide' : 'Show'} model answer
              </button>
              {showModel && <p className="preserve model-text">{lesson.writing.model}</p>}
            </div>
          )}
          <div className="row gap">
            <button
              className="btn ghost sm"
              onClick={() => {
                setFeedback(null);
                setBand(null);
                setText('');
                setSeconds(0);
              }}
            >
              Write a second draft
            </button>
          </div>
        </div>
      )}

      <div className="block-footer">
        <button className="btn primary lg" onClick={() => onDone(band ?? 0)} disabled={band == null}>
          Continue to wrap-up <Icon name="arrow" size={18} />
        </button>
        {band == null && <span className="muted tiny">Submit your text to unlock the session summary.</span>}
      </div>
    </div>
  );
}
