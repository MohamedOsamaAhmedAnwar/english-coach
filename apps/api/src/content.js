import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT } from './db.js';
import { generateLesson } from './ai.js';

const LESSON_DIR = join(ROOT, 'content', 'lessons');

const WEEK_PLAN = [
  { phase: 'Foundation', level: 'A2', topic: 'Daily life and routines', grammar: 'present simple vs present continuous', fn: 'describing habits, comparing days' },
  { phase: 'Foundation', level: 'A2', topic: 'People and relationships', grammar: 'past simple', fn: 'describing people, telling a short story' },
  { phase: 'Foundation', level: 'A2', topic: 'Home and neighbourhood', grammar: 'there is / there are, quantifiers', fn: 'describing places, asking about location' },
  { phase: 'Foundation', level: 'A2', topic: 'Food, health and small habits', grammar: 'countable / uncountable nouns, should', fn: 'giving advice, expressing preferences' },
  { phase: 'Build', level: 'A2', topic: 'Work and study', grammar: 'present perfect', fn: 'talking about experience, giving updates' },
  { phase: 'Build', level: 'A2', topic: 'Travel and transport', grammar: 'future forms (going to, will, present continuous)', fn: 'making plans, predicting, booking' },
  { phase: 'Build', level: 'A2', topic: 'Free time, films and media', grammar: 'gerunds and infinitives', fn: 'expressing likes and opinions' },
  { phase: 'Build', level: 'A2', topic: 'Shopping, money and complaints', grammar: 'comparatives and superlatives', fn: 'comparing, complaining politely' },
  { phase: 'Build', level: 'B1', topic: 'Technology in daily life', grammar: 'first conditional', fn: 'troubleshooting, explaining a problem' },
  { phase: 'Build', level: 'B1', topic: 'City life and environment', grammar: 'modals of obligation and permission', fn: 'rules, suggestions, civic issues' },
  { phase: 'Build', level: 'B1', topic: 'Learning, memory and skills', grammar: 'used to / would', fn: 'past habits, describing change' },
  { phase: 'Build', level: 'B1', topic: 'Travel stories and culture shock', grammar: 'narrative tenses', fn: 'telling anecdotes, reacting' },
  { phase: 'Build', level: 'B1', topic: 'News and current events', grammar: 'passive voice', fn: 'reporting, summarising a story' },
  { phase: 'Build', level: 'B1', topic: 'Health, stress and wellbeing', grammar: 'second conditional', fn: 'hypotheticals, giving advice' },
  { phase: 'Push', level: 'B1', topic: 'Culture, identity and belonging', grammar: 'relative clauses', fn: 'defining, explaining, adding detail' },
  { phase: 'Push', level: 'B1', topic: 'Science and discovery', grammar: 'reported speech', fn: 'explaining research, paraphrasing' },
  { phase: 'Push', level: 'B1', topic: 'Jobs, interviews and self-presentation', grammar: 'modals of deduction', fn: 'speculating, selling your experience' },
  { phase: 'Push', level: 'B1', topic: 'Problems, solutions and trade-offs', grammar: 'linking devices and concession', fn: 'arguing, proposing, conceding' },
  { phase: 'Push', level: 'B2', topic: 'Education and opportunity', grammar: 'third conditional', fn: 'regret, evaluation, hypothetical past' },
  { phase: 'Consolidate', level: 'B2', topic: 'Business, meetings and negotiation', grammar: 'hedging and diplomatic language', fn: 'disagreeing politely, negotiating' },
  { phase: 'Consolidate', level: 'B2', topic: 'Media, persuasion and advertising', grammar: 'emphasis and inversion', fn: 'strong opinion, persuasive claims' },
  { phase: 'Consolidate', level: 'B2', topic: 'Urbanisation and sustainability', grammar: 'complex noun phrases', fn: 'academic precision, cause and effect' },
  { phase: 'Consolidate', level: 'B2', topic: 'Technology, AI and ethics', grammar: 'concessive clauses', fn: 'balanced argument, speculation' },
  { phase: 'Consolidate', level: 'B2', topic: 'Exam simulation and consolidation', grammar: 'mixed review', fn: 'full exam performance' },
];

const DAY_FOCUS = [
  { focus: 'speaking-intro', label: 'Speaking + listening: first contact with the topic' },
  { focus: 'listening-detail', label: 'Listening: detail, accent and shadowing' },
  { focus: 'speaking-intensive', label: 'Speaking intensive: long turns and fluency' },
  { focus: 'reading-writing', label: 'Reading + writing: input becomes output' },
  { focus: 'review-test', label: 'Review + mini test: consolidate the week' },
];

function levelLabel(level, day) {
  if (level === 'A2') return day >= 3 ? 'A2+' : 'A2';
  if (level === 'B1') return day >= 3 ? 'B1+' : 'B1';
  return 'B2';
}

export const CURRICULUM = WEEK_PLAN.flatMap((week, wi) =>
  DAY_FOCUS.map((dayPlan, di) => ({
    id: `w${String(wi + 1).padStart(2, '0')}d${di + 1}`,
    week: wi + 1,
    day: di + 1,
    dayIndex: wi * 5 + di + 1,
    phase: week.phase,
    level: levelLabel(week.level, di + 1),
    genLevel: week.level,
    topic: week.topic,
    angle: [
      'personal experience and opinions',
      'a real-world conversation and its details',
      'a longer turn with structure and examples',
      'an article or report plus a written response',
      'review and a short timed test',
    ][di],
    grammar: week.grammar,
    functions: week.fn,
    focus: dayPlan.focus,
    focusLabel: dayPlan.label,
    seconds: week.level === 'A2' ? 60 : week.level === 'B1' ? 90 : 120,
  }))
);

export function specFor(id) {
  return CURRICULUM.find((s) => s.id === id) || null;
}

export function specForDayIndex(dayIndex) {
  const clamped = Math.min(Math.max(1, dayIndex), CURRICULUM.length);
  return CURRICULUM[clamped - 1];
}

async function readLesson(id) {
  try {
    const raw = await readFile(join(LESSON_DIR, `${id}.json`), 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function lessonExists(id) {
  return Boolean(await readLesson(id));
}

export async function listLessons() {
  await mkdir(LESSON_DIR, { recursive: true });
  let files = [];
  try {
    files = (await readdir(LESSON_DIR)).filter((f) => f.endsWith('.json'));
  } catch {
    files = [];
  }
  const byId = new Map();
  for (const file of files) {
    try {
      const lesson = JSON.parse(await readFile(join(LESSON_DIR, file), 'utf8'));
      byId.set(lesson.id || file.replace('.json', ''), lesson);
    } catch {
      /* skip broken file */
    }
  }
  return CURRICULUM.map((spec) => ({
    ...spec,
    ready: byId.has(spec.id),
    title: byId.get(spec.id)?.topic
      ? `${byId.get(spec.id).topic}`
      : `${spec.topic} — ${spec.angle}`,
  }));
}

function asArray(value, fallback = []) {
  return Array.isArray(value) ? value : fallback;
}

export function validateLesson(lesson, spec) {
  if (!lesson || typeof lesson !== 'object') throw new Error('Lesson is not an object');
  const level = lesson.level || spec.genLevel;
  const id = spec.id;

  const vocab = asArray(lesson.vocab)
    .map((v) => ({
      term: String(v?.term || '').trim(),
      ipa: String(v?.ipa || ''),
      meaning: String(v?.meaning || ''),
      example: String(v?.example || ''),
    }))
    .filter((v) => v.term);

  const listening = lesson.listening || {};
  const script = asArray(listening.script)
    .map((line) => ({
      speaker: String(line?.speaker || 'Speaker'),
      text: String(line?.text || '').trim(),
    }))
    .filter((line) => line.text);

  const gist = listening.gist || {};
  const options = asArray(gist.options).map(String);
  const listeningDetail = asArray(listening.detail)
    .map((q) => ({ question: String(q?.question || ''), answer: String(q?.answer || '') }))
    .filter((q) => q.question);

  const reading = lesson.reading || {};
  const questions = asArray(reading.questions)
    .map((q) => ({
      type: ['tfng', 'mcq', 'short'].includes(q?.type) ? q.type : 'short',
      question: String(q?.question || ''),
      options: asArray(q?.options).map(String),
      answer:
        typeof q?.answer === 'number' ? q.answer : String(q?.answer ?? '').trim(),
      why: String(q?.why || ''),
    }))
    .filter((q) => q.question && (q.answer !== '' || Number.isFinite(q.answer)));

  const speaking = lesson.speaking || {};
  const monologue = speaking.monologue || {};

  const cleaned = {
    id,
    specId: id,
    level,
    phase: spec.phase,
    week: spec.week,
    day: spec.day,
    dayIndex: spec.dayIndex,
    topic: String(lesson.topic || spec.topic),
    angle: spec.angle,
    grammar: String(lesson.grammar || spec.grammar),
    objectives: asArray(lesson.objectives).map(String).slice(0, 4),
    vocab: vocab.slice(0, 8),
    listening: {
      title: String(listening.title || `${spec.topic} — listening`),
      accent: String(listening.accent || 'British'),
      script: script.slice(0, 18),
      gist: {
        question: String(gist.question || 'What is the main idea?'),
        options: options.length ? options : ['A', 'B', 'C'],
        answer: Number.isInteger(gist.answer) ? gist.answer : 0,
      },
      detail: listeningDetail.slice(0, 5),
      shadowing: asArray(listening.shadowing).map(String).filter(Boolean).slice(0, 5),
    },
    speaking: {
      warmup: asArray(speaking.warmup).map(String).filter(Boolean).slice(0, 5),
      qa: asArray(speaking.qa)
        .map((q) => ({
          question: String(q?.question || ''),
          hint: String(q?.hint || ''),
          target: asArray(q?.target).map(String),
        }))
        .filter((q) => q.question)
        .slice(0, 6),
      monologue: {
        prompt: String(monologue.prompt || `Talk about ${spec.topic.toLowerCase()} for ${spec.seconds} seconds.`),
        seconds: Number(monologue.seconds) > 20 ? Number(monologue.seconds) : spec.seconds,
        structure: asArray(monologue.structure).map(String),
        useful: asArray(monologue.useful).map(String),
      },
      pronunciation: {
        focus: String(speaking.pronunciation?.focus || 'word stress and clear endings'),
        pairs: asArray(speaking.pronunciation?.pairs).map((p) => asArray(p).map(String)),
        drill: asArray(speaking.pronunciation?.drill).map(String),
      },
    },
    reading: {
      title: String(reading.title || spec.topic),
      text: String(reading.text || '').trim(),
      questions: questions.slice(0, 6),
      summaryTask: String(reading.summaryTask || 'Retell the text aloud in 60 seconds using three key words.'),
    },
    writing: {
      task: String(lesson.writing?.task || 'Write a short paragraph about this topic.'),
      genre: String(lesson.writing?.genre || 'paragraph'),
      minWords: Number(lesson.writing?.minWords) || 60,
      checklist: asArray(lesson.writing?.checklist).map(String),
      model: String(lesson.writing?.model || ''),
    },
    phrases: asArray(lesson.phrases).map(String).filter(Boolean).slice(0, 6),
    generatedAt: new Date().toISOString(),
  };

  if (cleaned.listening.script.length < 3) {
    throw new Error('Lesson has no usable listening script');
  }
  if (cleaned.reading.text.length < 60) {
    throw new Error('Lesson has no usable reading text');
  }
  if (!cleaned.speaking.qa.length) {
    throw new Error('Lesson has no speaking questions');
  }
  return cleaned;
}

export async function loadLesson(id, { generate = true, onProgress } = {}) {
  const spec = specFor(id);
  if (!spec) throw Object.assign(new Error(`Unknown lesson ${id}`), { status: 404 });

  const existing = await readLesson(id);
  if (existing) {
    try {
      return validateLesson(existing, spec);
    } catch (err) {
      if (!generate) throw err;
    }
  }
  if (!generate) return null;

  await mkdir(LESSON_DIR, { recursive: true });
  onProgress?.(`Writing ${spec.id}: ${spec.topic}…`);
  let lastError;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const raw = await generateLesson({
        ...spec,
        requiredSchemaVersion: 2,
        attempt,
        instruction:
          attempt > 1
            ? 'The previous attempt was rejected for missing or invalid fields. Return complete, valid JSON with a full listening script, reading text and speaking questions.'
            : undefined,
      });
      const cleaned = validateLesson({ ...raw, id }, spec);
      await writeFile(join(LESSON_DIR, `${id}.json`), JSON.stringify(cleaned, null, 2), 'utf8');
      return cleaned;
    } catch (err) {
      lastError = err;
      onProgress?.(`Attempt ${attempt} failed: ${err.message}`);
    }
  }
  throw Object.assign(new Error(`Could not generate ${id}: ${lastError?.message}`), {
    status: 502,
  });
}
