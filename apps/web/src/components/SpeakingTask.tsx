import { useState } from 'react';
import { api, ApiError } from '../api';
import type { AttemptResult } from '../types';
import { speak } from '../speech';
import { Recorder, type RecordedClip } from './Recorder';
import { SpeakingFeedbackView } from './Feedback';
import { Icon } from './Icons';

export interface SpeakingTaskProps {
  question: string;
  hint?: string;
  targets?: string[];
  maxSeconds: number;
  sessionId?: number | null;
  lessonId?: string;
  level: string;
  topic: string;
  taskType: string;
  graderPrompt?: string;
  accent?: 'British' | 'American';
  compact?: boolean;
  playPrompt?: boolean;
  onResult?: (result: AttemptResult) => void;
  onAddPhrase?: (phrase: string) => void;
  submitLabel?: string;
  startNote?: string;
}

export function SpeakingTask({
  question,
  hint,
  targets = [],
  maxSeconds,
  sessionId,
  lessonId,
  level,
  topic,
  taskType,
  graderPrompt,
  accent = 'British',
  compact,
  playPrompt = true,
  onResult,
  onAddPhrase,
  submitLabel = 'Get feedback',
  startNote,
}: SpeakingTaskProps) {
  const [clip, setClip] = useState<RecordedClip | null>(null);
  const [result, setResult] = useState<AttemptResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState('');
  const [attemptKey, setAttemptKey] = useState(0);

  const reset = () => {
    setClip(null);
    setResult(null);
    setError(null);
    setTyped('');
    setAttemptKey((k) => k + 1);
  };

  const submit = async () => {
    setLoading(true);
    setError(null);
    try {
      let response: AttemptResult;
      if (typing || !clip) {
        if (typed.trim().length < 5) {
          throw new Error('Say or type at least a few words.');
        }
        response = await api.post<AttemptResult>('/api/speaking/transcript', {
          transcript: typed,
          taskType,
          prompt: graderPrompt || question,
          level,
          topic,
          sessionId,
          lessonId,
          target: targets[0] || null,
          duration: Math.max(8, typed.split(/\s+/).filter(Boolean).length / 2.2),
        });
      } else {
        const form = new FormData();
        form.append('audio', clip.blob, 'answer.webm');
        form.append('taskType', taskType);
        form.append('prompt', graderPrompt || question);
        form.append('level', level);
        form.append('topic', topic);
        if (sessionId) form.append('sessionId', String(sessionId));
        if (lessonId) form.append('lessonId', lessonId);
        if (targets[0]) form.append('target', targets[0]);
        response = await api.postForm<AttemptResult>('/api/speaking/attempt', form);
      }
      setResult(response);
      onResult?.(response);
    } catch (err) {
      const message = (err as Error).message;
      setError(message);
      if (err instanceof ApiError && err.status === 503) setTyping(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`task ${compact ? 'compact' : ''}`}>
      <div className="task-question">
        <p>{question}</p>
        {playPrompt && (
          <button className="icon-btn" title="Listen" onClick={() => speak(question, { accent })}>
            <Icon name="play" size={15} />
          </button>
        )}
      </div>

      {hint && <p className="hint">{hint}</p>}
      {targets.length > 0 && (
        <div className="chips">
          {targets.map((t) => (
            <span className="chip" key={t}>
              {t}
            </span>
          ))}
        </div>
      )}

      {!result && !typing && (
        <Recorder key={attemptKey} maxSeconds={maxSeconds} onRecorded={setClip} disabled={loading} compact={compact} />
      )}

      {typing && !result && (
        <textarea
          className="textarea"
          rows={4}
          placeholder="Type what you would say… (used when the microphone or recogniser is unavailable)"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
        />
      )}

      {startNote && !result && <p className="muted tiny">{startNote}</p>}

      {error && (
        <div className="notice bad">
          <p>{error}</p>
          <button className="link tiny" onClick={() => setTyping((v) => !v)}>
            {typing ? 'Use the microphone instead' : 'Type the answer instead'}
          </button>
        </div>
      )}

      {!result && (
        <div className="row gap">
          <button className="btn primary" onClick={submit} disabled={loading || (!clip && !typed.trim())}>
            {loading ? 'Listening back…' : submitLabel}
          </button>
          {clip && !typing && (
            <button className="link tiny" onClick={() => setTyping(true)}>
              Type instead
            </button>
          )}
          {loading && <span className="muted tiny">Whisper is transcribing, then the examiner grades it…</span>}
        </div>
      )}

      {result && (
        <>
          <SpeakingFeedbackView result={result} onAddPhrase={onAddPhrase} compact={compact} />
          <button className="btn ghost sm" onClick={reset}>
            Try this again
          </button>
        </>
      )}
    </div>
  );
}
