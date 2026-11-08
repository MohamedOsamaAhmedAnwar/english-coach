import { useEffect, useState } from 'react';
import { api } from '../api';
import { speak } from '../speech';
import { Icon } from '../components/Icons';
import { Recorder } from '../components/Recorder';

interface VocabRow {
  id: number;
  term: string;
  meaning: string | null;
  example: string | null;
  due_at: string;
  reps: number;
  lapses: number;
}

const RATINGS = [
  { q: 1, label: 'Again', hint: 'could not say it' },
  { q: 3, label: 'Hard', hint: 'needed effort' },
  { q: 4, label: 'Good', hint: 'said it clearly' },
  { q: 5, label: 'Easy', hint: 'automatic' },
];

export function Review({ onDone }: { onDone: () => void }) {
  const [items, setItems] = useState<VocabRow[]>([]);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(0);

  useEffect(() => {
    api
      .get<{ items: VocabRow[] }>('/api/vocab?due=1')
      .then((res) => setItems(res.items))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const current = items[index];

  const rate = async (q: number) => {
    if (!current) return;
    try {
      await api.post('/api/vocab/review', { id: current.id, rating: q });
      setSaved((s) => s + 1);
    } catch (err) {
      setError((err as Error).message);
    }
    setRevealed(false);
    setIndex((i) => i + 1);
  };

  if (loading) return <div className="page"><div className="prep-spinner" /></div>;

  if (!items.length) {
    return (
      <div className="page">
        <div className="card">
          <h2>Review queue is clear.</h2>
          <p className="muted">
            New chunks are scheduled at the end of each session. Come back when something is due — or open the next
            lesson instead.
          </p>
          <button className="btn" onClick={onDone}>
            Back to today
          </button>
        </div>
      </div>
    );
  }

  if (!current) {
    return (
      <div className="page">
        <div className="finish-card compact">
          <div className="finish-icon">
            <Icon name="check" size={24} />
          </div>
          <h2>{saved} chunk{saved === 1 ? '' : 's'} reviewed.</h2>
          <p className="muted">Spoken recall beats recognition. The hard ones come back sooner.</p>
          <button className="btn primary" onClick={onDone}>
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">Spoken review</p>
          <h1>
            {index + 1} / {items.length}
          </h1>
          <p className="lead">Say a full sentence with the chunk before you reveal anything.</p>
        </div>
      </header>

      <div className="review-card card">
        <div className="row between">
          <span className="pill">{current.reps === 0 ? 'new' : `${current.reps} review${current.reps === 1 ? '' : 's'}`}</span>
          <button className="icon-btn" title="Listen" onClick={() => speak(current.term)}>
            <Icon name="play" size={16} />
          </button>
        </div>

        <h2 className="review-term">{current.term}</h2>

        {!revealed && (
          <>
            <Recorder maxSeconds={30} onRecorded={() => undefined} compact />
            <button className="btn" onClick={() => setRevealed(true)}>
              Reveal meaning
            </button>
          </>
        )}

        {revealed && (
          <>
            {current.meaning && <p className="meaning">{current.meaning}</p>}
            {current.example && <p className="example">“{current.example}”</p>}
            {!current.meaning && !current.example && (
              <p className="muted tiny">No definition stored — judge by whether you could use it in a sentence.</p>
            )}
            <p className="muted tiny">How did the spoken sentence feel?</p>
            <div className="ratings">
              {RATINGS.map((r) => (
                <button key={r.q} className="rating" onClick={() => rate(r.q)}>
                  <strong>{r.label}</strong>
                  <span className="muted tiny">{r.hint}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {error && <p className="error-text">{error}</p>}
    </div>
  );
}
