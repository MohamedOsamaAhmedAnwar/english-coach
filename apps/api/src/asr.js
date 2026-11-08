import { readFile } from 'node:fs/promises';

const ASR_URL = process.env.ASR_URL || 'http://127.0.0.1:8756';

let cache = { at: 0, status: null };

export async function asrStatus() {
  if (Date.now() - cache.at < 10_000 && cache.status) return cache.status;
  try {
    const res = await fetch(`${ASR_URL}/health`, { signal: AbortSignal.timeout(2500) });
    const body = await res.json();
    cache = { at: Date.now(), status: { ok: Boolean(body.ready), ...body } };
  } catch (err) {
    cache = {
      at: Date.now(),
      status: { ok: false, error: String(err.message || err), hint: 'Start services/asr (see README)' },
    };
  }
  return cache.status;
}

export async function transcribeFile(path, { language = 'en' } = {}) {
  const buffer = await readFile(path);
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: 'audio/webm' }), 'answer.webm');
  form.append('language', language);

  const res = await fetch(`${ASR_URL}/transcribe`, {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(240_000),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Transcription failed (${res.status}): ${detail.slice(0, 300)}`);
  }
  return res.json();
}
