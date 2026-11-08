import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import type { AttemptResult, WritingFeedback } from '../types';
import { speak, speakDialogue, stopSpeaking } from '../speech';
import { Icon } from '../components/Icons';
import { Recorder, type RecordedClip } from '../components/Recorder';
import { Band, SpeakingFeedbackView, WritingFeedbackView } from '../components/Feedback';

interface DiagQuestion {
  q: string;
  options?: string[];
  type?: 'tfng';
  answer: number | string;
}

interface DiagData {
  listening: { title: string; script: { speaker: string; text: string }[]; questions: DiagQuestion[] };
  reading: { title: string; text: string; questions: DiagQuestion[] };
  speaking: { prompt: string; seconds: number };
  writing: { prompt: string; minWords: number };
}

interface DiagResult {
  listening: { correct: number; total: number; percent: number; cefr: string; band: number };
  reading: { correct: number; total: number; percent: number; cefr: string; band: number };
  speaking: { band: number; cefr: string };
  writing: { band: number; cefr: string; words: number };
  weakest: string | null;
  summary: string;
}

type Stage = 'intro' | 'listening' | 'reading' | 'speaking' | 'writing' | 'submitting' | 'result';

const STAGES: { key: Stage; label: string }[] = [
  { key: 'listening', label: 'Listening' },
  { key: 'reading', label: 'Reading' },
  { key: 'speaking', label: 'Speaking' },
  { key: 'writing', label: 'Writing' },
];

export function Diagnostic({ onDone, onSkip }: { onDone: () => void; onSkip: () => void }) {
  const [diag, setDiag] = useState<DiagData | null>(null);
  const [stage, setStage] = useState<Stage>('intro');
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [line, setLine] = useState(-1);

  const [listening, setListening] = useState<Record<number, number>>({});
  const [reading, setReading] = useState<Record<number, number | string>>({});

  const [clip, setClip] = useState<RecordedClip | null>(null);
  const [transcribing, setTranscribing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [duration, setDuration] = useState(0);
  const [speechError, setSpeechError] = useState<string | null>(null);

  const [writing, setWriting] = useState('');

  const [result, setResult] = useState<DiagResult | null>(null);
  const [speakingFeedback, setSpeakingFeedback] = useState<AttemptResult['feedback'] | null>(null);
  const [writingFeedback, setWritingFeedback] = useState<WritingFeedback | null>(null);
  const handleRef = useRef<{ stop: () => void } | null>(null);

  useEffect(() => {
    api
      .get<{ diagnostic: DiagData }>('/api/diagnostic')
      .then((res) => setDiag(res.diagnostic))
      .catch((err) => setError(err.message));
    return () => handleRef.current?.stop();
  }, []);

  const play = () => {
    if (!diag) return;
    if (playing) {
      stopSpeaking();
      setPlaying(false);
      setLine(-1);
      return;
    }
    setPlaying(true);
    const handle = speakDialogue(diag.listening.script, {
      rate: 0.95,
      accent: 'British',
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

  const transcribe = async () => {
    if (!clip) return;
    setTranscribing(true);
    setSpeechError(null);
    try {
      const form = new FormData();
      form.append('audio', clip.blob, 'diagnostic.webm');
      const res = await api.postForm<{ transcript: string; duration: number }>('/api/transcribe', form);
      setTranscript(res.transcript);
      setDuration(res.duration || clip.seconds);
    } catch (err) {
      setSpeechError(
        `${(err as Error).message} You can type what you said instead — the writing section will judge your range anyway.`
      );
    } finally {
      setTranscribing(false);
    }
  };

  const submit = async () => {
    setStage('submitting');
    setError(null);
    try {
      const res = await api.post<{
        result: DiagResult;
        speakingFeedback: AttemptResult['feedback'];
        writingFeedback: WritingFeedback;
      }>('/api/diagnostic', {
        listening,
        reading,
        speaking: { transcript, duration: duration || 70 },
        writing: { text: writing },
      });
      setResult(res.result);
      setSpeakingFeedback(res.speakingFeedback);
      setWritingFeedback(res.writingFeedback);
      setStage('result');
    } catch (err) {
      setError((err as Error).message);
      setStage('writing');
    }
  };

  const writingWords = writing.trim() ? writing.trim().split(/\s+/).length : 0;
  const stageIndex = STAGES.findIndex((s) => s.key === stage);

  if (error && !diag) {
    return (
      <div className="page">
        <div className="card">
          <h2>The check could not load.</h2>
          <p className="error-text">{error}</p>
          <button className="btn" onClick={() => window.location.reload()}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (stage === 'result' && result) {
    const levels: { key: string; label: string; cefr: string; detail: string; band: number }[] = [
      {
        key: 'listening',
        label: 'Listening',
        cefr: result.listening.cefr,
        detail: `${result.listening.correct}/${result.listening.total} correct`,
        band: result.listening.band,
      },
      {
        key: 'reading',
        label: 'Reading',
        cefr: result.reading.cefr,
        detail: `${result.reading.correct}/${result.reading.total} correct`,
        band: result.reading.band,
      },
      {
        key: 'speaking',
        label: 'Speaking',
        cefr: result.speaking.cefr,
        detail: 'graded long turn',
        band: result.speaking.band,
      },
      {
        key: 'writing',
        label: 'Writing',
        cefr: result.writing.cefr,
        detail: `${result.writing.words} words`,
        band: result.writing.band,
      },
    ];

    return (
      <div className="page">
        <header className="page-head">
          <p className="eyebrow">Diagnostic complete</p>
          <h1>Your starting profile</h1>
          <p className="lead">{result.summary}</p>
        </header>

        <div className="diag-results">
          {levels.map((l) => (
            <div className={`card level-card ${result.weakest === l.key ? 'focus' : ''}`} key={l.key}>
              <p className="eyebrow">{l.label}</p>
              <div className="level-big">{l.cefr}</div>
              <p className="muted tiny">{l.detail}</p>
              <Band value={l.band} label="band" />
              {result.weakest === l.key && <span className="pill warn">priority track</span>}
            </div>
          ))}
        </div>

        <div className="card inner">
          <h3>What the examiner saw</h3>
          <p className="muted tiny">
            Your plan starts at these levels per skill and moves each one independently. Speaking gets the most
            time because that is your goal.
          </p>
          {speakingFeedback && (
            <details>
              <summary>Speaking feedback</summary>
              {speakingFeedback && (
                <SpeakingFeedbackView
                  result={{
                    id: 0,
                    transcript,
                    metrics: {
                      duration: duration || 70,
                      speechSpan: duration || 70,
                      wordCount: transcript.split(/\s+/).filter(Boolean).length,
                      wpm: Math.round((transcript.split(/\s+/).filter(Boolean).length / Math.max(1, duration)) * 60),
                      wpmOverall: 0,
                      pauseCount: 0,
                      longestPause: 0,
                      longPauses: 0,
                      fillerCount: 0,
                      fillerRate: 0,
                      repetitions: 0,
                      uniqueWords: 0,
                      typeTokenRatio: 0,
                      contentVariety: 0,
                      avgWordLength: 0,
                      target: null,
                    },
                    metricsLine: '',
                    feedback: speakingFeedback,
                    band: result.speaking.band,
                    cefr: result.speaking.cefr,
                    offline: Boolean(speakingFeedback.offline),
                  }}
                />
              )}
            </details>
          )}
          {writingFeedback && (
            <details>
              <summary>Writing feedback</summary>
              <WritingFeedbackView feedback={writingFeedback} />
            </details>
          )}
        </div>

        <div className="block-footer">
          <button className="btn primary lg" onClick={onDone}>
            Build my plan <Icon name="arrow" size={18} />
          </button>
        </div>
      </div>
    );
  }

  if (!diag) {
    return (
      <div className="page">
        <div className="prep">
          <div className="prep-spinner" />
          <p className="muted">Loading the placement check…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page session">
      <header className="session-head">
        <div className="row between wrap">
          <div>
            <p className="eyebrow">Placement check · not timed strictly</p>
            <h1>{stage === 'intro' ? 'Find your four levels' : STAGES[stageIndex]?.label}</h1>
          </div>
          <span className="pill">~35 min</span>
        </div>

        {stage !== 'intro' && (
          <div className="stepper">
            {STAGES.map((s, i) => (
              <div
                key={s.key}
                className={`step ${i < stageIndex ? 'done' : ''} ${i === stageIndex ? 'active' : ''}`}
              >
                <span className="step-dot">{i < stageIndex ? <Icon name="check" size={12} /> : i + 1}</span>
                <span className="step-label">{s.label}</span>
              </div>
            ))}
          </div>
        )}
      </header>

      {stage === 'intro' && (
        <div className="block-body">
          <div className="card inner">
            <h3>Four short sections</h3>
            <ul className="checklist">
              <li>
                <Icon name="headphones" size={16} /> <strong>Listening</strong> — one conversation, six questions.
                You may replay it twice.
              </li>
              <li>
                <Icon name="bookopen" size={16} /> <strong>Reading</strong> — one article, six questions.
              </li>
              <li>
                <Icon name="mic" size={16} /> <strong>Speaking</strong> — one 90-second answer, recorded and
                transcribed on this machine.
              </li>
              <li>
                <Icon name="pen" size={16} /> <strong>Writing</strong> — one 120–180 word argument.
              </li>
            </ul>
            <p className="muted tiny">
              Do not prepare. The point is to measure what you can do right now, so the plan starts in the right
              place.
            </p>
            <div className="row gap">
              <button className="btn primary lg" onClick={() => setStage('listening')}>
                Begin <Icon name="arrow" size={18} />
              </button>
              <button className="link tiny" onClick={onSkip}>
                Skip — assume A2 everywhere
              </button>
            </div>
          </div>
        </div>
      )}

      {stage === 'listening' && (
        <div className="block-body">
          <div className="card inner audio-card">
            <div className="row between wrap">
              <h3>{diag.listening.title}</h3>
              <button className={`btn ${playing ? 'active' : 'primary'}`} onClick={play}>
                <Icon name={playing ? 'stop' : 'play'} size={16} />
                {playing ? 'Stop' : 'Play'}
              </button>
            </div>
            {playing && line >= 0 && line < diag.listening.script.length && (
              <p className="now-playing">
                <span className="speaker">{diag.listening.script[line].speaker}:</span>{' '}
                {diag.listening.script[line].text}
              </p>
            )}
            <p className="muted tiny">Replay as often as you need, but try once first.</p>
          </div>

          <div className="card inner">
            {diag.listening.questions.map((q, i) => (
              <div className="quiz" key={i}>
                <p className="question">
                  {i + 1}. {q.q}
                </p>
                <div className="options">
                  {q.options?.map((option, oi) => (
                    <button
                      key={oi}
                      className={`option ${listening[i] === oi ? 'selected' : ''}`}
                      onClick={() => setListening((a) => ({ ...a, [i]: oi }))}
                    >
                      <span className="option-key">{String.fromCharCode(65 + oi)}</span>
                      {option}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="block-footer">
            <button
              className="btn primary lg"
              onClick={() => setStage('reading')}
              disabled={Object.keys(listening).length < diag.listening.questions.length}
            >
              Next: reading <Icon name="arrow" size={18} />
            </button>
            {Object.keys(listening).length < diag.listening.questions.length && (
              <span className="muted tiny">Answer all six to continue — guessing is fine.</span>
            )}
          </div>
        </div>
      )}

      {stage === 'reading' && (
        <div className="block-body">
          <article className="passage">
            <h3>{diag.reading.title}</h3>
            {diag.reading.text.split(/\n{2,}/).map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </article>

          <div className="card inner">
            {diag.reading.questions.map((q, i) => (
              <div className="quiz" key={i}>
                <p className="question">
                  {i + 1}. {q.q}
                </p>
                {q.type === 'tfng' ? (
                  <div className="options row">
                    {['True', 'False', 'Not Given'].map((option) => (
                      <button
                        key={option}
                        className={`option sm ${reading[i] === option ? 'selected' : ''}`}
                        onClick={() => setReading((a) => ({ ...a, [i]: option }))}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="options">
                    {q.options?.map((option, oi) => (
                      <button
                        key={oi}
                        className={`option ${reading[i] === oi ? 'selected' : ''}`}
                        onClick={() => setReading((a) => ({ ...a, [i]: oi }))}
                      >
                        <span className="option-key">{String.fromCharCode(65 + oi)}</span>
                        {option}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="block-footer">
            <button
              className="btn primary lg"
              onClick={() => setStage('speaking')}
              disabled={Object.keys(reading).length < diag.reading.questions.length}
            >
              Next: speaking <Icon name="arrow" size={18} />
            </button>
          </div>
        </div>
      )}

      {stage === 'speaking' && (
        <div className="block-body">
          <div className="card inner">
            <div className="prompt-box">
              <p>{diag.speaking.prompt}</p>
              <button className="icon-btn" onClick={() => speak(diag.speaking.prompt)}>
                <Icon name="play" size={15} />
              </button>
            </div>
            <p className="muted tiny">
              You have about 90 seconds. Cover all four points. Start speaking within 15 seconds — a pause at the
              start is normal, but do not plan a perfect answer.
            </p>

            {!transcript && !transcribing && (
              <>
                <Recorder maxSeconds={diag.speaking.seconds} onRecorded={setClip} />
                {clip && (
                  <button className="btn primary" onClick={transcribe}>
                    Transcribe my answer
                  </button>
                )}
              </>
            )}

            {transcribing && <p className="muted">Transcribing locally… this can take 10–30 seconds.</p>}

            {speechError && (
              <div className="notice bad">
                <p>{speechError}</p>
              </div>
            )}

            {(transcript || speechError) && (
              <div className="field">
                <span>Transcript (edit if the recogniser misheard you)</span>
                <textarea
                  className="textarea"
                  rows={5}
                  value={transcript}
                  onChange={(e) => setTranscript(e.target.value)}
                  placeholder="Type what you said…"
                />
                <span className={`muted tiny ${transcript.trim().split(/\s+/).filter(Boolean).length < 30 ? 'warn-text' : ''}`}>
                  {transcript.trim() ? transcript.trim().split(/\s+/).filter(Boolean).length : 0} words
                </span>
              </div>
            )}
          </div>

          <div className="block-footer">
            <button
              className="btn primary lg"
              onClick={() => setStage('writing')}
              disabled={transcript.trim().split(/\s+/).filter(Boolean).length < 25}
            >
              Next: writing <Icon name="arrow" size={18} />
            </button>
            {transcript.trim().split(/\s+/).filter(Boolean).length < 25 && (
              <span className="muted tiny">Speak (or type) at least 25 words so the examiner has evidence.</span>
            )}
          </div>
        </div>
      )}

      {stage === 'writing' && (
        <div className="block-body">
          <div className="card inner">
            <div className="prompt-box">
              <p>{diag.writing.prompt}</p>
            </div>
            <p className="muted tiny">Aim for {diag.writing.minWords}+ words. No dictionary, no translator.</p>
            <textarea
              className="textarea writing"
              rows={10}
              value={writing}
              onChange={(e) => setWriting(e.target.value)}
              placeholder="Write your answer…"
            />
            <div className="row between">
              <span className={`muted tiny ${writingWords < diag.writing.minWords ? 'warn-text' : ''}`}>
                {writingWords} / {diag.writing.minWords} words
              </span>
              <span className="muted tiny">You can edit before submitting.</span>
            </div>
          </div>

          {error && <p className="error-text">{error}</p>}

          <div className="block-footer">
            <button
              className="btn primary lg"
              onClick={submit}
              disabled={writingWords < diag.writing.minWords}
            >
              Finish and see my levels <Icon name="check" size={18} />
            </button>
          </div>
        </div>
      )}

      {stage === 'submitting' && (
        <div className="prep">
          <div className="prep-spinner" />
          <p className="eyebrow">Marking your check</p>
          <h1>Grading all four skills locally…</h1>
          <p className="muted">The examiner is reading your transcript and your text. About 30–90 seconds.</p>
        </div>
      )}
    </div>
  );
}
