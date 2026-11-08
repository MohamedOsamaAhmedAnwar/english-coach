import { useState } from 'react';
import type { AttemptResult, WritingFeedback } from '../types';
import { speak } from '../speech';

export function Band({ value, label }: { value?: number | null; label?: string }) {
  if (value == null) return null;
  const tone = value >= 7 ? 'great' : value >= 5.5 ? 'good' : 'low';
  return (
    <div className={`band ${tone}`}>
      <div className="band-num">{value.toFixed(1)}</div>
      <div className="band-label">{label || 'band'}</div>
    </div>
  );
}

export function ScoreBar({ name, value, max = 9 }: { name: string; value?: number; max?: number }) {
  if (value == null) return null;
  const pct = Math.max(4, Math.min(100, (value / max) * 100));
  return (
    <div className="scorebar">
      <div className="scorebar-head">
        <span>{name}</span>
        <span className="mono">{value.toFixed(1)}</span>
      </div>
      <div className="track">
        <div className="fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Metric({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className={`metric ${warn ? 'warn' : ''}`}>
      <div className="metric-value">{value}</div>
      <div className="metric-label">{label}</div>
    </div>
  );
}

export function SpeakingFeedbackView({
  result,
  onAddPhrase,
  compact,
}: {
  result: AttemptResult;
  onAddPhrase?: (phrase: string) => void;
  compact?: boolean;
}) {
  const f = result.feedback || {};
  const m = result.metrics;
  const [showTranscript, setShowTranscript] = useState(false);

  return (
    <div className={`feedback ${compact ? 'compact' : ''}`}>
      <div className="feedback-head">
        <Band value={result.band} label={result.cefr || 'estimated'} />
        <div className="feedback-summary">
          {f.summary && <p>{f.summary}</p>}
          {result.offline && (
            <p className="muted tiny">
              Ollama is offline, so only measurable data was scored. Start Ollama for corrections and model answers.
            </p>
          )}
        </div>
      </div>

      <div className="metrics">
        <Metric label="words per minute" value={String(m.wpm)} warn={m.wpm < 80} />
        <Metric label="words" value={String(m.wordCount)} />
        <Metric label="long pauses" value={String(m.longPauses)} warn={m.longPauses > 2} />
        <Metric label="fillers" value={`${Math.round(m.fillerRate * 100)}%`} warn={m.fillerRate > 0.06} />
        {m.target && (
          <Metric
            label="script match"
            value={`${Math.round(m.target.accuracy * 100)}%`}
            warn={m.target.accuracy < 0.8}
          />
        )}
      </div>

      {m.target && m.target.missed.length > 0 && (
        <p className="note">
          <strong>Unclear or missing words:</strong>{' '}
          {m.target.missed.slice(0, 8).map((w, i) => (
            <span key={`${w}-${i}`} className="chip small">
              {w}
            </span>
          ))}
        </p>
      )}

      {f.scores && (
        <div className="scores">
          <ScoreBar name="Fluency" value={f.scores.fluency} />
          <ScoreBar name="Vocabulary" value={f.scores.lexis} />
          <ScoreBar name="Grammar" value={f.scores.grammar} />
          <ScoreBar name="Pronunciation" value={f.scores.pronunciation} />
        </div>
      )}

      {!compact && f.strengths?.length ? (
        <div className="block">
          <h4>What worked</h4>
          <ul className="tight">
            {f.strengths.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {f.fixes?.length ? (
        <div className="block">
          <h4>Fix these</h4>
          {f.fixes.slice(0, 3).map((fix, i) => (
            <div className="fix" key={i}>
              <div className="fix-row">
                <span className="tag bad">you</span>
                <span className="quote">“{fix.youSaid}”</span>
              </div>
              <div className="fix-row">
                <span className="tag good">better</span>
                <span className="quote better">{fix.better}</span>
                <button className="icon-btn" title="Play" onClick={() => speak(fix.better)}>
                  ▶
                </button>
              </div>
              {fix.why && <p className="muted tiny">{fix.why}</p>}
            </div>
          ))}
        </div>
      ) : null}

      {f.modelAnswer ? (
        <div className="block model">
          <h4>
            Model answer
            <button className="icon-btn" onClick={() => speak(f.modelAnswer!)}>
              ▶
            </button>
          </h4>
          <p>{f.modelAnswer}</p>
        </div>
      ) : null}

      {f.phrases?.length ? (
        <div className="block">
          <h4>Reuse tomorrow</h4>
          <div className="chips">
            {f.phrases.map((p, i) => (
              <button key={i} className="chip" onClick={() => onAddPhrase?.(p)} title="Add to review">
                + {p}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <button className="link tiny" onClick={() => setShowTranscript((v) => !v)}>
        {showTranscript ? 'Hide' : 'Show'} transcript
      </button>
      {showTranscript && <p className="transcript">{result.transcript}</p>}
    </div>
  );
}

export function WritingFeedbackView({ feedback }: { feedback: WritingFeedback }) {
  const f = feedback;
  return (
    <div className="feedback">
      <div className="feedback-head">
        <Band value={f.overall} label={f.cefr || 'estimated'} />
        <div className="feedback-summary">
          {f.summary && <p>{f.summary}</p>}
          {f.offline && (
            <p className="muted tiny">Ollama offline: structure-only scoring. Start Ollama for corrections.</p>
          )}
        </div>
      </div>

      {f.scores && (
        <div className="scores">
          <ScoreBar name="Task" value={f.scores.task} />
          <ScoreBar name="Coherence" value={f.scores.coherence} />
          <ScoreBar name="Vocabulary" value={f.scores.lexis} />
          <ScoreBar name="Grammar" value={f.scores.grammar} />
        </div>
      )}

      {f.strengths?.length ? (
        <div className="block">
          <h4>What worked</h4>
          <ul className="tight">
            {f.strengths.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {f.corrections?.length ? (
        <div className="block">
          <h4>Corrections</h4>
          {f.corrections.map((c, i) => (
            <div className="fix" key={i}>
              <div className="fix-row">
                <span className="tag bad">{c.type}</span>
                <span className="quote strike">{c.original}</span>
              </div>
              <div className="fix-row">
                <span className="tag good">better</span>
                <span className="quote better">{c.corrected}</span>
              </div>
              {c.why && <p className="muted tiny">{c.why}</p>}
            </div>
          ))}
        </div>
      ) : null}

      {f.upgrade ? (
        <div className="block model">
          <h4>Upgraded version</h4>
          <p className="preserve">{f.upgrade}</p>
        </div>
      ) : null}

      {f.phrases?.length ? (
        <div className="block">
          <h4>Reuse tomorrow</h4>
          <div className="chips">
            {f.phrases.map((p, i) => (
              <span key={i} className="chip">
                {p}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
