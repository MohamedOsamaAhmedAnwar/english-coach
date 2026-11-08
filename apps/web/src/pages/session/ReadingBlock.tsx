import { useEffect, useState } from 'react';
import { api } from '../../api';
import type { Lesson } from '../../types';
import { Icon } from '../../components/Icons';
import { SpeakingTask } from '../../components/SpeakingTask';

export function ReadingBlock({
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
  const [answers, setAnswers] = useState<Record<number, string | number>>({});
  const [checked, setChecked] = useState<{
    score: number;
    results: { id: string; correct: boolean; expected: string | number }[];
  } | null>(null);
  const [checking, setChecking] = useState(false);
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const t = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(t);
  }, []);

  const check = async () => {
    setChecking(true);
    try {
      const payload: Record<string, unknown> = {};
      lesson.reading.questions.forEach((_, i) => {
        payload[`r${i}`] = answers[i];
      });
      const res = await api.post<{
        score: number;
        results: { id: string; correct: boolean; expected: string | number }[];
      }>('/api/objective', { lessonId: lesson.id, block: 'reading', answers: payload });
      setChecked(res);
    } finally {
      setChecking(false);
    }
  };

  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');

  return (
    <div className="block-body">
      <div className="block-intro">
        <p className="eyebrow">Reading · 8 min</p>
        <h2>{lesson.reading.title}</h2>
        <p className="muted">
          Read once for the argument, then answer. You will finish by retelling the text aloud — that is where the
          reading turns into speaking.
        </p>
      </div>

      <article className="passage">
        <div className="passage-head">
          <span className="pill">
            <Icon name="bookopen" size={14} /> {Math.ceil(lesson.reading.text.split(/\s+/).length / 200)} min read
          </span>
          <span className="muted tiny mono">{mm}:{ss}</span>
        </div>
        {lesson.reading.text.split(/\n{2,}/).map((para, i) => (
          <p key={i}>{para}</p>
        ))}
      </article>

      <div className="card inner">
        <h3>Questions</h3>
        {lesson.reading.questions.map((q, i) => (
          <div className="quiz" key={i}>
            <p className="question">
              {i + 1}. {q.question}
            </p>

            {q.type === 'tfng' && (
              <div className="options row">
                {['True', 'False', 'Not Given'].map((option) => (
                  <button
                    key={option}
                    className={`option sm ${answers[i] === option ? 'selected' : ''}`}
                    onClick={() => setAnswers((a) => ({ ...a, [i]: option }))}
                    disabled={Boolean(checked)}
                  >
                    {option}
                  </button>
                ))}
              </div>
            )}

            {q.type === 'mcq' && (
              <div className="options">
                {q.options.map((option, oi) => (
                  <button
                    key={oi}
                    className={`option ${answers[i] === oi ? 'selected' : ''}`}
                    onClick={() => setAnswers((a) => ({ ...a, [i]: oi }))}
                    disabled={Boolean(checked)}
                  >
                    <span className="option-key">{String.fromCharCode(65 + oi)}</span>
                    {option}
                  </button>
                ))}
              </div>
            )}

            {q.type === 'short' && (
              <input
                className="input"
                value={String(answers[i] ?? '')}
                onChange={(e) => setAnswers((a) => ({ ...a, [i]: e.target.value }))}
                disabled={Boolean(checked)}
                placeholder="Short answer"
              />
            )}

            {checked && (
              <p className={`explain ${checked.results[i]?.correct ? 'good' : 'bad'}`}>
                {checked.results[i]?.correct ? 'Correct. ' : `Answer: ${checked.results[i]?.expected}. `}
                {q.why}
              </p>
            )}
          </div>
        ))}

        {!checked && (
          <button className="btn" onClick={check} disabled={checking || Object.keys(answers).length < lesson.reading.questions.length}>
            {checking ? 'Checking…' : 'Check answers'}
          </button>
        )}
        {checked && (
          <div className="row between">
            <strong>{checked.score}% correct</strong>
            <span className="muted tiny">reading score saved</span>
          </div>
        )}
      </div>

      <div className="card inner">
        <div className="card-head">
          <h3>Retell it aloud</h3>
          <span className="pill accent">60s</span>
        </div>
        <p className="muted tiny">{lesson.reading.summaryTask}</p>
        <SpeakingTask
          question="Retell the text in your own words. Cover the main claim, one supporting detail, and your reaction."
          maxSeconds={75}
          sessionId={sessionId}
          lessonId={lesson.id}
          level={lesson.level}
          topic={lesson.topic}
          taskType="retell"
          playPrompt={false}
          onAddPhrase={onAddPhrase}
          submitLabel="Check my retell"
        />
      </div>

      <div className="block-footer">
        <button className="btn primary lg" onClick={() => onDone(checked?.score ?? 0)} disabled={!checked}>
          Continue to writing <Icon name="arrow" size={18} />
        </button>
        {!checked && <span className="muted tiny">Check the reading answers first — they feed your progress chart.</span>}
      </div>
    </div>
  );
}
