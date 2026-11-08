import { useState } from 'react';
import type { Lesson } from '../../types';
import { speak } from '../../speech';
import { SpeakingTask } from '../../components/SpeakingTask';
import { Icon } from '../../components/Icons';

export function WarmupBlock({
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
  const [band, setBand] = useState<number | null>(null);
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const question = lesson.speaking.warmup[0] || 'What did you do yesterday that was worth remembering?';

  return (
    <div className="block-body">
      <div className="block-intro">
        <p className="eyebrow">Warm-up · 5 min</p>
        <h2>Get the voice moving</h2>
        <p className="muted">
          Read the six chunks, play them, then answer one easy question out loud. This is not a test — it wakes up
          your mouth and checks the microphone before the real work.
        </p>
      </div>

      <div className="vocab-grid">
        {lesson.vocab.map((v) => (
          <div className="vocab-card" key={v.term}>
            <div className="vocab-head">
              <strong>{v.term}</strong>
              <button className="icon-btn" title="Listen" onClick={() => speak(v.term)}>
                <Icon name="play" size={14} />
              </button>
            </div>
            {v.ipa && <span className="ipa">{v.ipa}</span>}
            <p className="meaning">{v.meaning}</p>
            <p className="example">“{v.example}”</p>
            <button
              className="link tiny"
              onClick={() => {
                setSaved((s) => ({ ...s, [v.term]: true }));
                onAddPhrase(v.term);
              }}
            >
              {saved[v.term] ? 'saved to review' : '+ add to review'}
            </button>
          </div>
        ))}
      </div>

      <div className="card inner">
        <SpeakingTask
          question={question}
          hint="45 seconds. One clear sentence about now, one about the past. Do not plan — just speak."
          maxSeconds={45}
          sessionId={sessionId}
          lessonId={lesson.id}
          level={lesson.level}
          topic={lesson.topic}
          taskType="warmup"
          onResult={(r) => setBand(r.band)}
          onAddPhrase={onAddPhrase}
          submitLabel="Check my warm-up"
        />
      </div>

      <div className="block-footer">
        <button className="btn primary lg" onClick={() => onDone(band ?? 0)} disabled={band == null}>
          Continue to listening <Icon name="arrow" size={18} />
        </button>
        {band == null && (
          <button className="link tiny" onClick={() => onDone(0)}>
            Skip warm-up
          </button>
        )}
      </div>
    </div>
  );
}
