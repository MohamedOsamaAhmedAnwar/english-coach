const OLLAMA = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
export const MODEL = process.env.OLLAMA_MODEL || 'qwen2.5:7b';
const GEN_MODEL = process.env.OLLAMA_GEN_MODEL || MODEL;

let modelCache = { at: 0, models: [] };

export async function ollamaStatus() {
  try {
    if (Date.now() - modelCache.at > 30_000) {
      const res = await fetch(`${OLLAMA}/api/tags`, { signal: AbortSignal.timeout(2500) });
      const body = await res.json();
      modelCache = { at: Date.now(), models: (body.models || []).map((m) => m.name) };
    }
    return { ok: modelCache.models.length > 0, models: modelCache.models, model: MODEL };
  } catch (err) {
    return { ok: false, models: [], model: MODEL, error: String(err.message || err) };
  }
}

function extractJson(text) {
  if (!text) throw new Error('Empty model response');
  let cleaned = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON object in model response');
  cleaned = cleaned.slice(start, end + 1);
  try {
    return JSON.parse(cleaned);
  } catch {
    const repaired = cleaned
      .replace(/,\s*([}\]])/g, '$1')
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201c\u201d]/g, '"');
    return JSON.parse(repaired);
  }
}

export async function chatJSON({ system, user, model = MODEL, timeoutMs = 90_000, temperature = 0.3 }) {
  const res = await fetch(`${OLLAMA}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify({
      model,
      stream: false,
      format: 'json',
      keep_alive: '15m',
      options: { temperature, num_ctx: 8192, num_predict: 1600 },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Ollama error ${res.status}: ${await res.text()}`);
  const body = await res.json();
  return extractJson(body.message?.content || '');
}

/* ------------------------------------------------------------------ */
/* Grading                                                             */
/* ------------------------------------------------------------------ */

const CEFR_BAND = { A1: 3, A2: 4, B1: 5.5, B2: 6.5, C1: 7.5, C2: 8.5 };

const SPEAKING_SYSTEM = `You are a strict but encouraging IELTS/CEFR speaking examiner.
Grade the learner's spoken answer using the transcript and measured speech data.
Rules:
- Judge only what is evidenced. Never invent quotations.
- "youSaid" must be copied exactly from the transcript.
- Feedback must be understandable to a learner at the stated level.
- Be concrete: no generic advice like "practice more".
Return ONLY JSON in this exact shape:
{"scores":{"fluency":0-9,"lexis":0-9,"grammar":0-9,"pronunciation":0-9},
 "overall":0-9,"cefr":"A2|B1|B2|C1",
 "strengths":["one specific thing that worked"],
 "fixes":[{"youSaid":"exact quote","better":"natural B2 version","why":"short reason"}],
 "modelAnswer":"a natural answer at the next level, 2-4 sentences, using the learner's own ideas",
 "phrases":["chunk 1","chunk 2","chunk 3"],
 "summary":"one sentence on what to work on next"}`;

export async function gradeSpeaking({ prompt, taskType, transcript, metrics, level, topic }) {
  const user = [
    `Learner level: ${level}. Topic: ${topic}. Task type: ${taskType}.`,
    `Task prompt: ${prompt}`,
    `Measured speech data: ${JSON.stringify(metrics)}`,
    `Transcript:\n"""${transcript}"""`,
    'Give 1-2 fixes maximum. If pronunciation cannot be judged from the transcript, base that score on clarity of word choice and note nothing false.',
  ].join('\n\n');
  return chatJSON({ system: SPEAKING_SYSTEM, user, timeoutMs: 90_000 });
}

const WRITING_SYSTEM = `You are an IELTS/CEFR writing examiner and a precise editor.
Return ONLY JSON:
{"scores":{"task":0-9,"coherence":0-9,"lexis":0-9,"grammar":0-9},
 "overall":0-9,"cefr":"A2|B1|B2|C1",
 "strengths":["specific strength"],
 "corrections":[{"original":"exact substring","corrected":"fixed version","type":"grammar|vocabulary|spelling|punctuation|cohesion","why":"short reason"}],
 "upgrade":"a rewritten version of the learner's text one level higher, same ideas, same length",
 "phrases":["chunk 1","chunk 2","chunk 3"],
 "summary":"one sentence"}
Rules: corrections must quote the learner's exact text. Maximum 6 corrections, most important first. Do not rewrite the whole text in "corrections".`;

export async function gradeWriting({ prompt, taskType, text, level, minWords }) {
  const user = [
    `Learner level: ${level}. Task type: ${taskType}. Minimum words: ${minWords || 60}.`,
    `Task: ${prompt}`,
    `Learner text (${text.split(/\s+/).filter(Boolean).length} words):\n"""${text}"""`,
  ].join('\n\n');
  return chatJSON({ system: WRITING_SYSTEM, user, timeoutMs: 120_000 });
}

/* ------------------------------------------------------------------ */
/* Lesson generation                                                   */
/* ------------------------------------------------------------------ */

const LESSON_SCHEMA = `{
 "id":"<given id>","level":"A2|B1|B2","phase":"<given phase>","topic":"<given topic>","grammar":"<given grammar>",
 "objectives":["2-3 can-do statements"],
 "vocab":[{"term":"word or chunk","ipa":"/.../ or ''","meaning":"simple English definition","example":"natural sentence"}],
 "listening":{"title":"short title","accent":"British|American","script":[{"speaker":"name","text":"..."}],
   "gist":{"question":"...","options":["a","b","c"],"answer":0},
   "detail":[{"question":"...","answer":"expected short answer"}],
   "shadowing":["3 sentences copied from the script, 8-16 words each"]},
 "speaking":{"warmup":["3 easy questions"],
   "qa":[{"question":"...","hint":"useful structure","target":["chunk to use"]}],
   "monologue":{"prompt":"...","seconds":90,"structure":["Point","Reason","Example","Restate"],"useful":["3 chunks"]},
   "pronunciation":{"focus":"e.g. word stress / connected speech","pairs":[["minimal","pair"]],"drill":["3 short sentences to repeat"]}},
 "reading":{"title":"...","text":"120-220 words at the target level","questions":[
   {"type":"tfng","question":"...","answer":"True|False|Not Given","why":"..."},
   {"type":"mcq","question":"...","options":["a","b","c"],"answer":0,"why":"..."},
   {"type":"short","question":"...","answer":"...","why":"..."}],
   "summaryTask":"one sentence instruction to retell the text aloud"},
 "writing":{"task":"...","genre":"email|paragraph|opinion|description","minWords":60,"checklist":["3 checks"],"model":"a model answer at target level"},
 "phrases":["3-5 high-value chunks to reuse"]
}`;

export async function generateLesson(spec, timeoutMs = 180_000) {
  const system = `You write graded English lesson content for a self-study app. Output ONLY valid JSON matching the schema.
Content rules:
- Everything in English. Vocabulary definitions simple, never circular.
- Listening script: natural spoken English, 8-14 turns, 180-320 words, at the given level. Realistic hesitations are fine.
- Reading text: 120-220 words, level-appropriate, informative, no markdown.
- Answers must be correct and unambiguous. For "tfng" answers use exactly "True", "False" or "Not Given".
- Monologue seconds: 60 for A2, 90 for B1, 120 for B2.
- Schema: ${LESSON_SCHEMA}`;
  const user = `Create the lesson for this spec:\n${JSON.stringify(spec, null, 2)}`;
  const lesson = await chatJSON({
    system,
    user,
    model: GEN_MODEL,
    timeoutMs,
    temperature: 0.7,
  });
  return lesson;
}

/* ------------------------------------------------------------------ */
/* Heuristic fallback graders (used when Ollama is unavailable)        */
/* ------------------------------------------------------------------ */

export function scoreToBand(score) {
  return Math.round(score * 2) / 2;
}

export function bandToCefr(band) {
  if (band >= 8) return 'C1';
  if (band >= 6.2) return 'B2';
  if (band >= 4.6) return 'B1';
  return 'A2';
}

export function heuristicSpeaking({ transcript, metrics, level, prompt }) {
  const words = transcript.trim().split(/\s+/).filter(Boolean);
  const wpm = metrics?.wpm || 0;
  const fillerRate = metrics?.fillerRate || 0;
  const longPauses = metrics?.longPauses || 0;
  const unique = new Set(words.map((w) => w.toLowerCase().replace(/[^a-z']/g, ''))).size;
  const variety = words.length ? unique / words.length : 0;

  let fluency = 3.5;
  if (wpm >= 90) fluency += 1;
  if (wpm >= 120) fluency += 0.8;
  if (wpm > 165) fluency -= 0.4;
  fluency -= Math.min(1.5, longPauses * 0.3);
  fluency -= Math.min(1.2, fillerRate * 12);

  let lexis = 3.8 + Math.min(1.6, words.length / 60) + (variety > 0.55 ? 0.6 : 0);
  let grammar = 3.8 + Math.min(1.4, words.length / 70);
  if (/\b(because|although|however|whereas|which|that)\b/i.test(transcript)) grammar += 0.5;
  if (/\b(i am agree|i very like|more better|peoples|informations)\b/i.test(transcript)) grammar -= 0.8;

  const cap = { A2: 5.5, B1: 6.5, B2: 7.5 }[level] || 6.5;
  const clamp = (v) => Math.max(2, Math.min(cap, v));
  const scores = {
    fluency: clamp(fluency),
    lexis: clamp(lexis),
    grammar: clamp(grammar),
    pronunciation: clamp(4 + (wpm > 100 ? 0.6 : 0) - Math.min(1, fillerRate * 8)),
  };
  const overall = Math.round(((scores.fluency + scores.lexis + scores.grammar + scores.pronunciation) / 4) * 2) / 2;

  return {
    scores,
    overall,
    cefr: bandToCefr(overall),
    strengths: [`You produced ${words.length} words at about ${Math.round(wpm)} words per minute.`],
    fixes: [],
    modelAnswer: '',
    phrases: [],
    summary: 'AI examiner is offline, so this is a measurement-only score. Start Ollama for detailed corrections.',
    offline: true,
  };
}

export function heuristicWriting({ text, level, minWords }) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 2);
  const avgSentence = words.length / Math.max(1, sentences.length);
  const unique = new Set(words.map((w) => w.toLowerCase().replace(/[^a-z']/g, ''))).size;
  const variety = words.length ? unique / words.length : 0;

  let base = 3.6;
  if (words.length >= (minWords || 60)) base += 0.8;
  if (words.length >= (minWords || 60) * 1.4) base += 0.4;
  if (avgSentence > 12) base += 0.5;
  if (variety > 0.55) base += 0.5;
  if (/\b(however|although|therefore|moreover|in addition|on the other hand)\b/i.test(text)) base += 0.5;
  if (/\b(i am agree|more better|peoples|informations|alot)\b/i.test(text)) base -= 0.7;

  const cap = { A2: 5.5, B1: 6.5, B2: 7.5 }[level] || 6.5;
  const overall = Math.min(cap, Math.max(2.5, base));
  return {
    scores: {
      task: Math.min(cap, base + (words.length >= (minWords || 60) ? 0.3 : -0.6)),
      coherence: Math.min(cap, base),
      lexis: Math.min(cap, base + (variety > 0.55 ? 0.3 : -0.2)),
      grammar: Math.min(cap, base - 0.2 + (avgSentence > 12 ? 0.3 : 0)),
    },
    overall,
    cefr: bandToCefr(overall),
    strengths: [`You wrote ${words.length} words in ${sentences.length} sentences.`],
    corrections: [],
    upgrade: '',
    phrases: [],
    summary: 'AI examiner is offline, so this is a structure-only score. Start Ollama for detailed corrections.',
    offline: true,
  };
}

export { CEFR_BAND };
