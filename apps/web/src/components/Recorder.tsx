import { useRecorder } from '../useRecorder';

export interface RecordedClip {
  blob: Blob;
  seconds: number;
}

interface Props {
  maxSeconds: number;
  onRecorded: (clip: RecordedClip | null) => void;
  disabled?: boolean;
  compact?: boolean;
  prompt?: string;
  autoStart?: boolean;
}

export function Recorder({ maxSeconds, onRecorded, disabled, compact }: Props) {
  const rec = useRecorder(maxSeconds);
  const remaining = Math.max(0, Math.ceil(maxSeconds - rec.seconds));

  if (rec.error) {
    return (
      <div className="recorder error">
        <p>{rec.error}</p>
        <button className="btn ghost sm" onClick={rec.reset}>
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className={`recorder ${compact ? 'compact' : ''}`}>
      {rec.status === 'idle' && (
        <button className="btn record" onClick={rec.start} disabled={disabled}>
          <span className="mic-dot" /> Speak
        </button>
      )}

      {rec.status === 'requesting' && <div className="muted">Waiting for microphone…</div>}

      {rec.status === 'recording' && (
        <div className="recording">
          <button className="btn record active" onClick={rec.stop}>
            <span className="square" /> Stop
          </button>
          <div className="meter" aria-hidden>
            {Array.from({ length: 16 }).map((_, i) => (
              <span
                key={i}
                className={i / 16 < rec.level ? 'on' : ''}
                style={{ height: `${18 + (i % 5) * 6}px` }}
              />
            ))}
          </div>
          <div className="timer">
            {rec.seconds.toFixed(0)}s <span className="muted">/ {maxSeconds}s</span>
          </div>
        </div>
      )}

      {rec.status === 'ready' && rec.url && (
        <div className="playback">
          <audio src={rec.url} controls />
          <div className="row gap">
            <span className="pill ok">{Math.round(rec.seconds)}s recorded</span>
            <button
              className="btn ghost sm"
              onClick={() => {
                rec.reset();
                onRecorded(null);
              }}
            >
              Record again
            </button>
            <button
              className="btn sm"
              onClick={() => rec.blob && onRecorded({ blob: rec.blob, seconds: rec.seconds })}
            >
              Use this
            </button>
          </div>
        </div>
      )}

      {rec.status === 'recording' && remaining <= 5 && (
        <p className="muted tiny">Finishing in {remaining}s — wrap up your sentence.</p>
      )}
    </div>
  );
}
