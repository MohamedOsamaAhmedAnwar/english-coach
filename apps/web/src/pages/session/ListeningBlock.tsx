import { useEffect, useRef, useState } from 'react';
import { api } from '../../api';
import type { Lesson } from '../../types';
import { speak, speakDialogue, stopSpeaking } from '../../speech';
import { Icon } from '../../components/Icons';
import { Recorder, type RecordedClip } from '../../components/Recorder';

export function ShadowLine({
  sentence,
  accent,
  sessionId,
  lessonId,
  level,
  topic,
  onAccuracy,
  compact,
}: {
  sentence: string;
  accent: 'British' | 'American';
  sessionId: number | null;
  lessonId: string;
  level: string;
  topic: string;
  onAccuracy: (accuracy: number) => void;
  compact?: boolean;
}) {
  const [clip, setClip] = useState<RecordedClip | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ accuracy: number; missed: string[]; transcript: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [key, setKey] = useState(0);

  const check = async () => {
    if (!clip) return;
    setLoading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('audio', clip.blob, 'shadow.webm');
      form.append('target', sentence);
      const res = await api.postForm<{
        transcript: string;
        metrics: { target: { accuracy: number; missed: string[] } | null };
      }>('/api/transcribe', form);
      const accuracy = res.metrics.target?.accuracy ?? 0;
      setResult({ accuracy, missed: res.metrics.target?.missed || [], transcript: res.transcript });
      onAccuracy(accuracy);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`shadow-line ${compact ? 'compact' : ''}`}>
      <div className="shadow-text">
        <button className="icon-btn" title="Listen" onClick={() => speak(sentence, { accent })}>
          <Icon name="play" size={14} />
        </button>
        <span>{sentence}</span>
      </div>

      {!result && (
        <div className="row gap wrap">
          <Recorder key={key} maxSeconds={25} onRecorded={setClip} compact disabled={loading} />
          {clip && (
            <button className="btn sm" onClick={check} disabled={loading}>
              {loading ? 'Checking…' : 'Compare'}
            </button>
          )}
        </div>
      )}

      {error && <p className="error-text tiny">{error}</p>}

      {result && (
        <div className="shadow-result">
          <div className={`score-pill ${result.accuracy >= 0.85 ? 'great' : result.accuracy >= 0.6 ? 'good' : 'low'}`}>
            {Math.round(result.accuracy * 100)}% match
          </div>
          {result.missed.length > 0 && (
            <div className="chips">
              {result.missed.map((w, i) => (
                <span key={`${w}-${i}`} className="chip small bad">
                  {w}
                </span>
              ))}
            </div>
          )}
          <p className="muted tiny">You said: “{result.transcript}”</p>
          <button
            className="link tiny"
            onClick={() => {
              setResult(null);
              setClip(null);
              setKey((k) => k + 1);
            }}
          >
            Try again
          </button>
        </div>
      )}
    </div>
  );
}

export function ListeningBlock({
  lesson,
  sessionId,
  onDone,
}: {
  lesson: Lesson;
  sessionId: number | null;
  onDone: (score: number) => void;
}) {
  const [rate, setRate] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [line, setLine] = useState(-1);
  const [showScript, setShowScript] = useState(false);
  const [gist, setGist] = useState<number | null>(null);
  const [details, setDetails] = useState<string[]>(lesson.listening.detail.map(() => ''));
  const [checked, setChecked] = useState<{
    score: number;
    results: { id: string; correct: boolean; expected: string | number }[];
  } | null>(null);
  const [checking, setChecking] = useState(false);
  const [shadowScores, setShadowScores] = useState<Record<number, number>>({});
  const handleRef = useRef<{ stop: () => void } | null>(null);

  useEffect(() => () => handleRef.current?.stop(), []);

  const play = () => {
    if (playing) {
      stopSpeaking();
      handleRef.current?.stop();
      setPlaying(false);
      setLine(-1);
      return;
    }
    setPlaying(true);
    const handle = speakDialogue(lesson.listening.script, {
      rate,
      accent: lesson.listening.accent === 'American' ? 'American' : 'British',
      onLine: (i) => {
        setLine(i);
        if (i === -1) setPlaying(false);
      },
    });
    handleRef.current = handle;
    handle.done.then(() => {
      setPlaying(false);
      setLine(-1);
    });
  };

  const check = async () => {
    setChecking(true);
    try {
      const answers: Record<string, number | string> = { gist: gist ?? -1 };
      details.forEach((value, i) => {
        answers[`d${i}`] = value;
      });
      const res = await api.post<{
        score: number;
        results: { id: string; correct: boolean; expected: string | number }[];
      }>('/api/objective', { lessonId: lesson.id, block: 'listening', answers });
      setChecked(res);
      setShowScript(true);
    } finally {
      setChecking(false);
    }
  };

  const shadowValues = Object.values(shadowScores);
  const shadowAvg = shadowValues.length
    ? shadowValues.reduce((a, b) => a + b, 0) / shadowValues.length
    : 0;
  const combined = checked ? Math.round(checked.score * 0.65 + shadowAvg * 100 * 0.35) : 0;

  return (
    <div className="block-body">
      <div className="block-intro">
        <p className="eyebrow">Listening · 10 min</p>
        <h2>{lesson.listening.title}</h2>
        <p className="muted">
          Listen once without reading. Answer the big question, then the details. Finally, shadow the speaker —
          same words, same rhythm.
        </p>
      </div>

      <div className="card inner audio-card">
        <div className="row between wrap">
          <div className="row gap">
            <button className={`btn ${playing ? 'active' : 'primary'}`} onClick={play}>
              <Icon name={playing ? 'stop' : 'play'} size={16} />
              {playing ? 'Stop' : 'Play conversation'}
            </button>
            <div className="seg">
              {[0.85, 1, 1.15].map((r) => (
                <button
                  key={r}
                  className={rate === r ? 'on' : ''}
                  onClick={() => setRate(r)}
                  title={`${Math.round(r * 100)}% speed`}
                >
                  {r === 0.85 ? 'slow' : r === 1 ? 'natural' : 'fast'}
                </button>
              ))}
            </div>
          </div>
          <span className="pill">{lesson.listening.accent} accent</span>
        </div>

        {playing && line >= 0 && line < lesson.listening.script.length && (
          <p className="now-playing">
            <span className="speaker">{lesson.listening.script[line].speaker}:</span>{' '}
            {lesson.listening.script[line].text}
          </p>
        )}

        <button className="link tiny" onClick={() => setShowScript((v) => !v)}>
          {showScript ? 'Hide transcript' : 'Show transcript (try not to, first)'}
        </button>

        {showScript && (
          <div className="transcript-lines">
            {lesson.listening.script.map((l, i) => (
              <p key={i} className={line === i ? 'active' : ''}>
                <span className="speaker">{l.speaker}</span> {l.text}
              </p>
            ))}
          </div>
        )}
      </div>

      <div className="card inner">
        <h3>1. Main idea</h3>
        <p className="question">{lesson.listening.gist.question}</p>
        <div className="options">
          {lesson.listening.gist.options.map((option, i) => (
            <button
              key={i}
              className={`option ${gist === i ? 'selected' : ''}`}
              onClick={() => setGist(i)}
              disabled={Boolean(checked)}
            >
              <span className="option-key">{String.fromCharCode(65 + i)}</span>
              {option}
            </button>
          ))}
        </div>
      </div>

      <div className="card inner">
        <h3>2. Detail</h3>
        <p className="muted tiny">Write short answers. Spelling does not matter; the key information does.</p>
        {lesson.listening.detail.map((q, i) => (
          <label className="field" key={i}>
            <span>{q.question}</span>
            <input
              value={details[i] || ''}
              onChange={(e) => setDetails((d) => d.map((v, j) => (j === i ? e.target.value : v)))}
              placeholder="Your answer"
              disabled={Boolean(checked)}
            />
          </label>
        ))}
        {!checked && (
          <button className="btn" onClick={check} disabled={checking || gist == null}>
            {checking ? 'Checking…' : 'Check answers'}
          </button>
        )}

        {checked && (
          <div className="check-results">
            <div className="row between">
              <strong>{checked.score}% correct</strong>
              <span className="muted tiny">answers unlocked the transcript</span>
            </div>
            {checked.results.map((r) => (
              <div key={r.id} className={`check-row ${r.correct ? 'ok' : 'bad'}`}>
                <Icon name={r.correct ? 'check' : 'stop'} size={14} />
                <span className="muted tiny">{r.id.startsWith('d') ? `detail ${Number(r.id.slice(1)) + 1}` : 'main idea'}</span>
                <span>
                  {r.correct ? 'correct' : `expected: ${r.expected}`}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card inner">
        <h3>3. Shadowing</h3>
        <p className="muted tiny">
          Play a line, then say it immediately — copy the stress, not just the words. Aim for 85%+ match.
        </p>
        {lesson.listening.shadowing.map((sentence, i) => (
          <ShadowLine
            key={i}
            sentence={sentence}
            accent={lesson.listening.accent === 'American' ? 'American' : 'British'}
            sessionId={sessionId}
            lessonId={lesson.id}
            level={lesson.level}
            topic={lesson.topic}
            onAccuracy={(acc) => setShadowScores((s) => ({ ...s, [i]: acc }))}
          />
        ))}
      </div>

      <div className="block-footer">
        <button className="btn primary lg" onClick={() => onDone(combined)}>
          Continue to speaking <Icon name="arrow" size={18} />
        </button>
        {!checked && <span className="muted tiny">You can continue without checking, but you lose the score.</span>}
      </div>
    </div>
  );
}
