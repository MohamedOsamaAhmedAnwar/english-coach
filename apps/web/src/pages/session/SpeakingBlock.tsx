import { useState } from 'react';
import type { AttemptResult, Lesson } from '../../types';
import { speak } from '../../speech';
import { SpeakingTask } from '../../components/SpeakingTask';
import { Icon } from '../../components/Icons';
import { ShadowLine } from './ListeningBlock';

export function SpeakingBlock({
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
  const [qaBands, setQaBands] = useState<Record<number, number>>({});
  const [monoBand, setMonoBand] = useState<number | null>(null);
  const [pron, setPron] = useState<Record<number, number>>({});
  const [extra, setExtra] = useState<AttemptResult[]>([]);

  const collect = (r: AttemptResult) => {
    setExtra((prev) => [...prev, r]);
    return r.band ?? 0;
  };

  const bands = [...Object.values(qaBands), ...(monoBand != null ? [monoBand] : [])].filter((b) => b > 0);
  const avg = bands.length ? bands.reduce((a, b) => a + b, 0) / bands.length : 0;
  const pronAvg = Object.values(pron).length
    ? Object.values(pron).reduce((a, b) => a + b, 0) / Object.values(pron).length
    : 0;

  return (
    <div className="block-body">
      <div className="block-intro">
        <p className="eyebrow">Speaking · 20 min · the core block</p>
        <h2>Say it out loud</h2>
        <p className="muted">
          Three parts: short answers, one long turn, then pronunciation. No typing counts here. If you get stuck,
          say the simple version — a finished simple sentence beats a perfect unfinished one.
        </p>
      </div>

      <section className="card inner">
        <div className="card-head">
          <h3>Part 1 · Guided questions</h3>
          <span className="pill">{lesson.speaking.qa.length} answers</span>
        </div>
        <p className="muted tiny">
          Aim for 2–4 sentences each. Use the chunks in the chips; the examiner rewards range, not length.
        </p>
        <div className="task-stack">
          {lesson.speaking.qa.map((q, i) => (
            <SpeakingTask
              key={i}
              question={q.question}
              hint={q.hint}
              targets={q.target}
              maxSeconds={lesson.level === 'B2' ? 75 : 60}
              sessionId={sessionId}
              lessonId={lesson.id}
              level={lesson.level}
              topic={lesson.topic}
              taskType="qa"
              onResult={(r) => {
                const band = collect(r);
                if (band) setQaBands((s) => ({ ...s, [i]: band }));
              }}
              onAddPhrase={onAddPhrase}
              submitLabel="Check my answer"
            />
          ))}
        </div>
      </section>

      <section className="card inner">
        <div className="card-head">
          <h3>Part 2 · Long turn</h3>
          <span className="pill accent">{lesson.speaking.monologue.seconds}s</span>
        </div>
        <div className="prompt-box">
          <p>{lesson.speaking.monologue.prompt}</p>
          <button
            className="icon-btn"
            title="Listen"
            onClick={() => speak(lesson.speaking.monologue.prompt)}
          >
            <Icon name="play" size={15} />
          </button>
        </div>

        <div className="structure">
          <span className="muted tiny">Structure</span>
          <div className="chips">
            {lesson.speaking.monologue.structure.map((s, i) => (
              <span className="chip" key={i}>
                {i + 1}. {s}
              </span>
            ))}
          </div>
        </div>

        {lesson.speaking.monologue.useful.length > 0 && (
          <div className="structure">
            <span className="muted tiny">Useful language</span>
            <div className="chips">
              {lesson.speaking.monologue.useful.map((s, i) => (
                <button key={i} className="chip" onClick={() => speak(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        <SpeakingTask
          question={`Speak for ${lesson.speaking.monologue.seconds} seconds.`}
          hint="Plan for 15 seconds in your head, then go. Follow the structure above."
          maxSeconds={lesson.speaking.monologue.seconds}
          sessionId={sessionId}
          lessonId={lesson.id}
          level={lesson.level}
          topic={lesson.topic}
          taskType="monologue"
          graderPrompt={`${lesson.speaking.monologue.prompt} Expected structure: ${lesson.speaking.monologue.structure.join(', ')}.`}
          playPrompt={false}
          onResult={(r) => {
            const band = collect(r);
            if (band) setMonoBand(band);
          }}
          onAddPhrase={onAddPhrase}
          submitLabel="Check my long turn"
          startNote="Record in one take. Pausing to think is allowed — silence is not a mistake, but 15 seconds of it is."
        />
      </section>

      <section className="card inner">
        <div className="card-head">
          <h3>Part 3 · Pronunciation</h3>
          <span className="pill">{lesson.speaking.pronunciation.focus}</span>
        </div>
        <p className="muted tiny">
          Play each pair, hear the difference, then record the drill sentence. Accuracy is measured against the
          target words.
        </p>

        {lesson.speaking.pronunciation.pairs.length > 0 && (
          <div className="pairs">
            {lesson.speaking.pronunciation.pairs.map((pair, i) => (
              <div className="pair" key={i}>
                {pair.map((word) => (
                  <button key={word} className="chip" onClick={() => speak(word)}>
                    <Icon name="play" size={12} /> {word}
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}

        <div className="drills">
          {lesson.speaking.pronunciation.drill.map((sentence, i) => (
            <ShadowLine
              key={i}
              sentence={sentence}
              accent="British"
              sessionId={sessionId}
              lessonId={lesson.id}
              level={lesson.level}
              topic={lesson.topic}
              onAccuracy={(acc) => setPron((s) => ({ ...s, [i]: acc }))}
              compact
            />
          ))}
        </div>
      </section>

      <div className="block-footer column">
        <div className="row gap wrap">
          <span className="pill">
            {Object.keys(qaBands).length}/{lesson.speaking.qa.length} questions
          </span>
          <span className="pill">{monoBand != null ? `long turn ${monoBand.toFixed(1)}` : 'long turn pending'}</span>
          <span className="pill">
            pronunciation {pronAvg ? `${Math.round(pronAvg * 100)}%` : 'pending'}
          </span>
        </div>
        <button className="btn primary lg" onClick={() => onDone(avg)} disabled={bands.length === 0}>
          Continue to reading <Icon name="arrow" size={18} />
        </button>
        {bands.length === 0 && <span className="muted tiny">Record at least one answer to continue.</span>}
      </div>
    </div>
  );
}
