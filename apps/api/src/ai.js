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

export async function chatJSON({
  system,
  user,
  model = MODEL,
  timeoutMs = 90_000,
  temperature = 0.3,
  maxTokens = 2000,
}) {
  const res = await fetch(`${OLLAMA}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify({
      model,
      stream: false,
      format: 'json',
      keep_alive: '15m',
      options: { temperature, num_ctx: 8192, num_predict: maxTokens, repeat_penalty: 1.08 },
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
/* Lesson generation — small, grounded calls                           */
/* ------------------------------------------------------------------ */

const COMMON_RULES = `Rules:
- Output ONLY a single JSON object. No markdown, no comments, no explanation.
- All content in English, appropriate to the stated level.
- Include every key in the shape. Do not add extra keys.
- Never discuss grammar rules inside dialogues or texts; the lesson must feel like real life.`;

const DIALOGUE_SYSTEM = `You write natural spoken English for a graded lesson. ${COMMON_RULES}
Shape:
{"title":"2 to 4 word title","accent":"British","script":[{"speaker":"First name","text":"one turn"}]}
Requirements:
- EXACTLY 10 turns, alternating two speakers.
- Every turn contains 2 or 3 complete sentences. Never a single short reply such as "Really?".
- The whole script is 200 to 300 words. Every turn adds something new.
- A real conversation with a concrete situation and a purpose. Every turn replies to the previous turn.
- Use contractions and natural spoken phrases. Only speech: no narration, no stage directions.
- Never teach grammar, never list vocabulary, never mention the lesson.`;

const DIALOGUE_MORE_SYSTEM = `You continue an English conversation for a graded lesson. ${COMMON_RULES}
Shape: {"script":[{"speaker":"First name","text":"one turn"}]}
Requirements:
- Return ONLY new turns that continue the conversation naturally. Never repeat or rewrite existing turns.
- Start with the speaker who did NOT speak last, then alternate.
- Each new turn contains 2 or 3 complete sentences, longer than a short reply.`;

const LISTENING_QUIZ_SYSTEM = `You write comprehension questions about a transcript. ${COMMON_RULES}
You receive the transcript. Every answer must be provable from it.
Shape:
{"gist":{"question":"main idea question","options":["option A","option B","option C"],"answer":0},
 "detail":[{"question":"detail question","answer":"short fact"}],
 "shadowing":["sentence copied exactly from the transcript"]}
Requirements:
- gist: exactly 3 plausible options. answer is the index 0, 1 or 2 of the correct option.
- detail: exactly 3 questions. Each answer is a short fact (2 to 6 words) taken from the transcript.
- shadowing: exactly 3 complete sentences copied word-for-word from the transcript, 8 to 18 words each.
- Never ask about anything the transcript does not state. Never use outside knowledge.`;

const VOCAB_SYSTEM = `You choose vocabulary and objectives for a graded English lesson. ${COMMON_RULES}
Shape:
{"objectives":["I can ...","I can ..."],
 "vocab":[{"term":"chunk","ipa":"","meaning":"simple definition","example":"natural sentence"}]}
Requirements:
- vocab: exactly 6 useful chunks of 2 to 4 words that fit this topic (e.g. "get ready", "run late", "catch up with", "on my way"). Never single frequency words such as usually, sometimes, always, never, busy, free, good.
- meaning: at most 8 words, learner-friendly.
- example: one natural sentence, 6 to 14 words, that shows the chunk in context.
- ipa: leave as "" unless you are certain.
- objectives: exactly 2 statements starting with "I can", tied to this lesson.
- Do not repeat a chunk.`;

const SPEAKING_TASKS_SYSTEM = `You write speaking tasks for a graded English lesson. ${COMMON_RULES}
Shape:
{"speaking":{"warmup":["easy question","easy question","easy question"],
 "qa":[{"question":"open question","hint":"useful language","target":["chunk","chunk"]}]}}
Requirements:
- warmup: exactly 3 easy questions to get talking, each answerable in about 15 seconds.
- qa: exactly 3 open questions on this topic, getting harder. Avoid yes/no questions. Each answer should take 30 to 45 seconds.
- hint: one useful structure or phrase, not an instruction.
- target: exactly 2 natural chunks the learner should try to use in the answer.
- No duplicate questions.`;

const MONOLOGUE_SYSTEM = `You write the long-turn and pronunciation tasks for a graded English lesson. ${COMMON_RULES}
Shape:
{"speaking":{"monologue":{"prompt":"long-turn task","structure":["step","step","step","step"],"useful":["chunk","chunk","chunk"]},
 "pronunciation":{"focus":"pronunciation focus","pairs":[["word","word"],["word","word"]],"drill":["sentence","sentence","sentence"]}},
 "phrases":["chunk","chunk","chunk","chunk"]}
Requirements:
- monologue.prompt: one task the learner can speak about for 60 to 120 seconds.
- structure: exactly 4 short steps (2 to 6 words each) the learner can follow.
- useful: exactly 3 chunks the learner can use in the long turn.
- pronunciation.focus: one SOUND feature such as short vs long vowels, consonant endings, word stress or linking. Never grammar, never verb tenses.
- pairs: exactly 2 pairs of REAL English words that differ by one sound (e.g. ["ship","sheep"], ["thin","sin"], ["live","leave"]). Each pair has two different words. Never invent words.
- drill: exactly 3 short sentences (5 to 12 words) that train the focus, and at least 2 of the sentences must use words from the pairs.
- phrases: exactly 4 reusable chunks for this topic and level.
- Keep every chunk under 12 words. Targets and phrases are language, not instructions.`;

const ARTICLE_SYSTEM = `You write a short graded reading passage. ${COMMON_RULES}
Shape: {"title":"2 to 5 word title","paragraphs":["first paragraph of 55 to 70 words","second paragraph of 55 to 70 words","third paragraph of 55 to 70 words"]}
Requirements:
- EXACTLY 3 paragraphs as 3 strings in the array. Each paragraph has 5 to 7 complete sentences (about 55 to 70 words). Total 170 to 210 words.
- Third person, magazine style: one clear idea with supporting details.
- Write about the SAME people in every paragraph. Do not introduce new characters halfway through.
- Describe facts and habits only. Never write meta-commentary such as "they discuss", "this passage" or "the text says".
- The people are NOT the ones in the listening dialogue. Use the new names given in the task.
- Same topic as the lesson but a DIFFERENT angle from the listening dialogue. Do not reuse its events.
- Plain text only: no headings, no lists, no markdown. Do not address the reader as "you".
- Count the paragraphs and words before you finish.`;

const ARTICLE_MORE_SYSTEM = `You add one paragraph to a graded reading passage. ${COMMON_RULES}
Shape: {"paragraphs":["one paragraph of 55 to 70 words"]}
Requirements:
- Continue the same passage naturally, about the SAME people as the existing paragraphs, in the same third-person style.
- Exactly one string in the array: one paragraph of 5 to 7 complete sentences (about 55 to 70 words). Do not repeat existing sentences.
- Plain text only.`;

const READING_QUIZ_SYSTEM = `You write reading comprehension questions about a passage. ${COMMON_RULES}
You receive the passage. Every answer must be proved by it.
Shape:
{"questions":[
 {"type":"tfng","question":"statement","answer":"True","why":"quote from the passage"},
 {"type":"tfng","question":"statement","answer":"False","why":"quote from the passage"},
 {"type":"mcq","question":"question","options":["option A","option B","option C"],"answer":0,"why":"quote from the passage"},
 {"type":"short","question":"question","answer":"short answer","why":"quote from the passage"},
 {"type":"short","question":"question","answer":"short answer","why":"quote from the passage"}],
 "summaryTask":"instruction to retell the passage aloud in 60 seconds"}
Requirements:
- EXACTLY 5 questions in that order: 2 tfng, 1 mcq, 2 short.
- tfng items are short STATEMENTS, never questions. Never start with Does, Is, Are, Can or Do. Each statement is either clearly supported, clearly contradicted, or truly absent from the passage.
- tfng.answer is exactly "True", "False" or "Not Given". Use "Not Given" only when the passage truly does not say.
- "why" quotes the exact words from the passage that prove the answer.
- mcq: exactly 3 options; answer is the integer index 0, 1 or 2 of the correct option. Only mcq has options.
- short answers: 1 to 5 words, copied from the passage where possible.
- Before returning, check every answer against the passage. If the passage does not support a statement, mark it False or Not Given. Never guess.`;

const WRITING_TASK_SYSTEM = `You write a writing task and a model answer for a graded English lesson. ${COMMON_RULES}
Shape:
{"writing":{"task":"writing task","genre":"email","minWords":60,"checklist":["check","check","check"],"model":"model answer"}}
Requirements:
- task: one practical task with a clear audience, purpose and 2 or 3 content points. 20 to 45 words.
- genre: one of email, message, paragraph, review, opinion.
- minWords: 60 for A2, 80 for B1, 100 for B2.
- checklist: exactly 3 questions the learner can check their own text against.
- model: a strong answer at the level. It must have AT LEAST minWords words. Count the words before returning; if it is short, add more. Write in paragraphs.
- Same topic as the lesson, but do not copy the reading passage.`;

function countWords(value) {
  return String(value || '').trim().split(/\s+/).filter(Boolean).length;
}

function asArticleText(raw) {
  const value = raw?.paragraphs ?? raw?.text ?? raw?.passage ?? raw?.article;
  if (Array.isArray(value)) {
    return value.map((part) => String(part ?? '').trim()).filter(Boolean).join('\n\n');
  }
  return String(value ?? '').trim();
}

function asTurns(list) {
  return Array.isArray(list)
    ? list
        .map((turn, index) => ({
          speaker: String(turn?.speaker ?? turn?.name ?? (index % 2 === 0 ? 'A' : 'B')).trim(),
          text: String(turn?.text ?? turn?.line ?? '').trim(),
        }))
        .filter((turn) => turn.text)
    : [];
}

function transcriptOf(script) {
  return script.map((turn) => `${turn.speaker}: ${turn.text}`).join('\n');
}

function otherSpeaker(script) {
  const names = [...new Set(script.map((turn) => turn.speaker))];
  const last = script[script.length - 1]?.speaker;
  if (names.length < 2) return last === 'A' ? 'B' : 'A';
  return names.find((name) => name !== last) ?? last;
}

function appendTurns(script, extra) {
  const seen = new Set(script.map((turn) => turn.text.toLowerCase()));
  const out = [...script];
  for (const turn of extra) {
    if (seen.has(turn.text.toLowerCase())) continue;
    const last = out[out.length - 1];
    const speaker = last && turn.speaker === last.speaker ? otherSpeaker(out) : turn.speaker;
    out.push({ speaker, text: turn.text });
    seen.add(turn.text.toLowerCase());
  }
  return out;
}

function contextFor(spec) {
  const fix = spec.fix ? `\nA previous attempt was rejected. Fix every item in this list:\n- ${spec.fix}` : '';
  return `Level: ${spec.genLevel} (${spec.level}). Topic: "${spec.topic}". Angle: ${spec.angle}.
Target language: ${spec.grammar}. Functions: ${spec.functions}. Session focus: ${spec.focusLabel}.${fix}`;
}

async function withRetry(fn, label) {
  let lastError;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt === 1) await new Promise((r) => setTimeout(r, 600));
    }
  }
  throw new Error(`${label} failed: ${lastError?.message}`);
}

function gen(system, user, { maxTokens, temperature, timeoutMs }) {
  return chatJSON({ system, user, model: GEN_MODEL, timeoutMs, temperature, maxTokens });
}

const NAME_POOL = ['Maya', 'Leo', 'Nadia', 'Omar', 'Priya', 'Ella', 'Ben', 'Rosa', 'Iris', 'Jonas'];

function articleNames(spec) {
  const seed = (spec.dayIndex || 1) % NAME_POOL.length;
  const first = NAME_POOL[seed];
  const second = NAME_POOL[(seed + 3) % NAME_POOL.length];
  return `${first} and ${second}`;
}

export async function generateLesson(spec, timeoutMs = 240_000) {
  const ctx = contextFor(spec);
  const opts = (maxTokens, temperature) => ({ maxTokens, temperature, timeoutMs });

  const dialogue = await withRetry(async () => {
    const raw = await gen(
      DIALOGUE_SYSTEM,
      `${ctx}\n\nInvent a specific scene for "${spec.angle}" and write the complete dialogue.`,
      opts(1400, 0.7)
    );
    const script = asTurns(raw.script);
    if (script.length < 4) throw new Error('the response had no usable script array');
    return { title: String(raw.title || spec.topic).trim(), accent: raw.accent, script };
  }, 'listening dialogue');

  let script = dialogue.script;
  const scriptWords = () => countWords(transcriptOf(script));
  for (
    let pass = 0;
    pass < 2 && (script.length < 10 || (scriptWords() < 150 && script.length < 14));
    pass++
  ) {
    const need = script.length < 10 ? Math.max(2, Math.min(4, 10 - script.length)) : 2;
    try {
      const extra = await gen(
        DIALOGUE_MORE_SYSTEM,
        `${ctx}\n\nConversation so far:\n${transcriptOf(script)}\n\nWrite ${need} new turns that continue it.`,
        opts(700, 0.7)
      );
      const turns = asTurns(extra.script ?? extra.turns);
      if (!turns.length) break;
      script = appendTurns(script, turns);
    } catch {
      break;
    }
  }

  const quiz = await withRetry(async () => {
    const raw = await gen(
      LISTENING_QUIZ_SYSTEM,
      `${ctx}\n\nTranscript:\n${transcriptOf(script)}\n\nWrite the questions about this transcript.`,
      opts(1100, 0.3)
    );
    const detail = Array.isArray(raw.detail) ? raw.detail.filter((q) => q?.question && q?.answer) : [];
    const gistOptions = Array.isArray(raw.gist?.options) ? raw.gist.options.filter(Boolean) : [];
    if (detail.length < 2 || gistOptions.length < 3) throw new Error('the quiz was incomplete');
    return {
      gist: raw.gist,
      detail,
      shadowing: Array.isArray(raw.shadowing) ? raw.shadowing : [],
    };
  }, 'listening questions');

  const vocabPart = await withRetry(async () => {
    const raw = await gen(
      VOCAB_SYSTEM,
      `${ctx}\n\nWrite the vocabulary and objectives. The dialogue is called "${dialogue.title}".`,
      opts(1100, 0.55)
    );
    const vocab = Array.isArray(raw.vocab) ? raw.vocab.filter((v) => v?.term && v?.meaning) : [];
    if (vocab.length < 4) throw new Error('the vocabulary list was too short');
    return { objectives: Array.isArray(raw.objectives) ? raw.objectives : [], vocab };
  }, 'vocabulary');

  const speakingPart = await withRetry(async () => {
    const raw = await gen(
      SPEAKING_TASKS_SYSTEM,
      `${ctx}\n\nWrite the warm-up and the three speaking questions.`,
      opts(1100, 0.65)
    );
    const qa = Array.isArray(raw.speaking?.qa) ? raw.speaking.qa.filter((q) => q?.question) : [];
    if (qa.length < 3) throw new Error('fewer than 3 speaking questions');
    return {
      warmup: Array.isArray(raw.speaking?.warmup) ? raw.speaking.warmup : [],
      qa,
    };
  }, 'speaking questions');

  const monologuePart = await withRetry(async () => {
    const raw = await gen(
      MONOLOGUE_SYSTEM,
      `${ctx}\n\nThe long turn is ${spec.seconds} seconds long. Write the long turn, the pronunciation task and the phrases.`,
      opts(1300, 0.6)
    );
    const monologue = raw.speaking?.monologue;
    if (!monologue?.prompt) throw new Error('the long turn prompt was missing');
    return {
      monologue,
      pronunciation: raw.speaking?.pronunciation ?? {},
      phrases: Array.isArray(raw.phrases) ? raw.phrases : [],
    };
  }, 'long turn');

  const article = await withRetry(async () => {
    const raw = await gen(
      ARTICLE_SYSTEM,
      `${ctx}\n\nWrite about ${articleNames(spec)} — two people who are NOT in the listening dialogue below.\nThe listening dialogue is called "${dialogue.title}":\n${transcriptOf(script)}\n\nWrite a passage on the same topic from a different angle. Do not reuse its events or characters.`,
      opts(1100, 0.65)
    );
    const text = asArticleText(raw);
    if (countWords(text) < 100) throw new Error('the passage was too short');
    return { title: String(raw.title || spec.topic).trim(), text };
  }, 'reading passage');

  let articleText = article.text;
  for (let pass = 0; pass < 3 && countWords(articleText) < 170; pass++) {
    try {
      const extra = await gen(
        ARTICLE_MORE_SYSTEM,
        `${ctx}\n\nPassage so far:\n${articleText}\n\nWrite one more paragraph that continues it.`,
        opts(600, 0.6)
      );
      const paragraph = asArticleText(extra);
      if (!paragraph || countWords(paragraph) < 25) break;
      articleText = `${articleText}\n\n${paragraph}`;
    } catch {
      break;
    }
  }

  const readingQuiz = await withRetry(async () => {
    const raw = await gen(
      READING_QUIZ_SYSTEM,
      `${ctx}\n\nPassage:\n${articleText}\n\nWrite the five questions about this passage.`,
      opts(1300, 0.3)
    );
    const questions = Array.isArray(raw.questions) ? raw.questions.filter((q) => q?.question) : [];
    if (questions.length < 3) throw new Error('fewer than 3 reading questions');
    return { questions, summaryTask: raw.summaryTask };
  }, 'reading questions');

  const minWords = spec.genLevel === 'A2' ? 60 : spec.genLevel === 'B1' ? 80 : 100;
  const writing = await withRetry(async () => {
    const raw = await gen(
      WRITING_TASK_SYSTEM,
      `${ctx}\n\nMinimum words: ${minWords}. Write one writing task and its model answer.`,
      opts(1100, 0.6)
    );
    if (!raw.writing?.task) throw new Error('the writing task was missing');
    return raw.writing;
  }, 'writing task');

  return {
    id: spec.id,
    level: spec.genLevel,
    phase: spec.phase,
    topic: spec.topic,
    grammar: spec.grammar,
    objectives: vocabPart.objectives,
    vocab: vocabPart.vocab,
    listening: {
      title: dialogue.title,
      accent: dialogue.accent,
      script,
      gist: quiz.gist,
      detail: quiz.detail,
      shadowing: quiz.shadowing,
    },
    speaking: {
      warmup: speakingPart.warmup,
      qa: speakingPart.qa,
      monologue: monologuePart.monologue,
      pronunciation: monologuePart.pronunciation,
    },
    phrases: monologuePart.phrases,
    reading: {
      title: article.title,
      text: articleText,
      questions: readingQuiz.questions,
      summaryTask: readingQuiz.summaryTask,
    },
    writing: {
      ...writing,
      minWords: Number(writing.minWords) > 10 ? Number(writing.minWords) : minWords,
    },
  };
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
