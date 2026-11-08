import { useState } from 'react';
import type { Health } from '../types';

export function HealthBar({ health }: { health: Health | null }) {
  const [open, setOpen] = useState(false);
  if (!health) return null;

  const issues: { key: string; title: string; detail: string }[] = [];
  if (!health.ollama.ok) {
    issues.push({
      key: 'ollama',
      title: 'AI examiner offline',
      detail: `Start Ollama and pull the model: ollama serve · ollama pull ${health.ollama.model}`,
    });
  }
  if (!health.asr.ok) {
    issues.push({
      key: 'asr',
      title: 'Speech recognition offline',
      detail: 'Start services/asr (see README). Until then you can type answers instead of speaking.',
    });
  }

  if (!issues.length) {
    return (
      <div className="health-strip">
        <span className="dot ok" /> local AI ready
        <span className="sep">·</span>
        <span className="dot ok" /> whisper ready
        {health.asr.model && <span className="muted tiny">({health.asr.model})</span>}
        <span className="sep">·</span>
        <span className="muted tiny">
          {health.lessonsReady}/{health.lessonsTotal} lessons prepared
        </span>
      </div>
    );
  }

  return (
    <div className={`health-strip warn ${open ? 'open' : ''}`}>
      <button className="health-toggle" onClick={() => setOpen((v) => !v)}>
        <span className="dot bad" />
        {issues.length} local service{issues.length > 1 ? 's' : ''} offline
        <span className="muted tiny">{open ? 'hide' : 'details'}</span>
      </button>
      {open && (
        <div className="health-details">
          {issues.map((issue) => (
            <div key={issue.key}>
              <strong>{issue.title}.</strong> <span className="muted">{issue.detail}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
