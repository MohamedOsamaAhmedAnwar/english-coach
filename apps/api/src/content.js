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
    title: byId.get(spec.id)?.topic || `${spec.topic} — ${spec.angle}`,
  }));
}

/* ------------------------------------------------------------------ */
/* Normalisation helpers                                               */
/* ------------------------------------------------------------------ */

function asArray(value, fallback = []) {
  if (Array.isArray(value)) return value;
  if (value == null) return fallback;
  return [value];
}

function str(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value);
  return '';
}

function words(text) {
  return str(text).split(/\s+/).filter(Boolean).length;
}

function coerceIndex(value, options = []) {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  const raw = str(value);
  if (!raw) return 0;
  if (/^[A-Za-z]$/.test(raw)) return raw.toUpperCase().charCodeAt(0) - 65;
  const n = Number(raw);
  if (Number.isFinite(n)) return n;
  const idx = options.findIndex((o) => str(o).toLowerCase() === raw.toLowerCase());
  return idx >= 0 ? idx : 0;
}

// Models often return options as "A) text" or "1. text"; the UI adds its own letter.
function cleanOption(value) {
  return str(value)
    .replace(/^\s*(?:[A-Za-z]|\d{1,2})\s*[).:-]\s+/, '')
    .trim();
}

function padOptions(options, count = 3) {
  const cleaned = options.map(cleanOption).filter(Boolean);
  const unique = [...new Set(cleaned)];
  while (unique.length < count) unique.push(`Option ${unique.length + 1}`);
  return unique;
}

function normaliseScript(listening) {
  const raw =
    listening.script ??
    listening.dialogue ??
    listening.lines ??
    listening.conversation ??
    listening.transcript;

  const lines = asArray(raw)
    .map((line, index) => {
      if (typeof line === 'string') {
        const match = line.match(/^\s*([A-Z][A-Za-z .'’-]{0,20}):\s*(.+)$/);
        if (match) return { speaker: match[1].trim(), text: match[2].trim() };
        return { speaker: index % 2 === 0 ? 'A' : 'B', text: line.trim() };
      }
      const text = str(line?.text ?? line?.line ?? line?.utterance ?? line?.dialogue ?? line?.content);
      return { speaker: str(line?.speaker ?? line?.name ?? (index % 2 === 0 ? 'A' : 'B')), text };
    })
    .filter((line) => line.text);

  if (lines.length) return lines;

  if (typeof raw === 'string') {
    return raw
      .split(/\n+/)
      .map((line, index) => ({ speaker: index % 2 === 0 ? 'A' : 'B', text: line.trim() }))
      .filter((line) => line.text);
  }
  return [];
}

function normaliseQuestions(reading, lesson) {
  const raw = asArray(reading.questions ?? lesson.questions ?? reading.items);
  return raw
    .map((q) => {
      const rawType = str(q?.type ?? q?.question_type).toLowerCase();
      let type = 'short';
      if (rawType.includes('tf') || rawType.includes('true')) type = 'tfng';
      else if (rawType.includes('mc') || rawType.includes('choice')) type = 'mcq';

      const options = padOptions(asArray(q?.options ?? q?.choices)).slice(0, 4);
      const answer =
        type === 'mcq' ? coerceIndex(q?.answer ?? q?.correct, options) : str(q?.answer ?? q?.correct);

      let finalAnswer = answer;
      if (type === 'tfng') {
        const a = str(answer).toLowerCase();
        finalAnswer = a.startsWith('t') ? 'True' : a.startsWith('f') ? 'False' : 'Not Given';
      }
      if (type === 'mcq') {
        const idx = Number(finalAnswer);
        finalAnswer = Number.isInteger(idx) && idx >= 0 && idx < options.length ? idx : 0;
      }
      return {
        type: type === 'mcq' && options.length < 2 ? 'short' : type,
        question: str(q?.question ?? q?.prompt),
        options: type === 'mcq' ? options : [],
        answer: finalAnswer,
        why: str(q?.why ?? q?.explanation ?? q?.reason),
      };
    })
    .filter((q) => q.question && (q.answer !== '' || Number.isFinite(q.answer)));
}

export function validateLesson(lesson, spec) {
  if (!lesson || typeof lesson !== 'object') throw new Error('Lesson is not an object');
  const id = spec.id;

  const vocabRaw = asArray(lesson.vocab ?? lesson.vocabulary);
  const vocab = vocabRaw
    .map((v) => ({
      term: str(v?.term ?? v?.word ?? v?.phrase),
      ipa: str(v?.ipa ?? v?.pronunciation),
      meaning: str(v?.meaning ?? v?.definition),
      example: str(v?.example ?? v?.sentence),
    }))
    .filter((v) => v.term && v.meaning);

  const listeningRaw = lesson.listening ?? lesson.listening_task ?? {};
  const script = normaliseScript(listeningRaw);
  const gistRaw = listeningRaw.gist ?? listeningRaw.main_idea ?? {};
  const gistOptions = padOptions(asArray(gistRaw.options));
  const gist = {
    question: str(gistRaw.question ?? 'What is the main idea?'),
    options: gistOptions,
    answer: Math.min(2, Math.max(0, coerceIndex(gistRaw.answer ?? gistRaw.correct, gistOptions))),
  };

  const detail = asArray(listeningRaw.detail ?? listeningRaw.details ?? listeningRaw.questions)
    .map((q) => ({
      question: str(q?.question ?? q?.prompt),
      answer: str(q?.answer ?? q?.correct),
    }))
    .filter((q) => q.question && q.answer);

  const readingRaw = lesson.reading ?? lesson.reading_task ?? {};
  const questions = normaliseQuestions(readingRaw, lesson);

  const speakingRaw = lesson.speaking ?? {};
  const qaRaw = asArray(speakingRaw.qa ?? speakingRaw.questions ?? speakingRaw.prompts);
  const qa = qaRaw
    .map((q) => {
      if (typeof q === 'string') return { question: q.trim(), hint: '', target: [] };
      return {
        question: str(q?.question ?? q?.prompt),
        hint: str(q?.hint ?? q?.guidance),
        target: asArray(q?.target ?? q?.targets ?? q?.useful_language).map(str).filter(Boolean),
      };
    })
    .filter((q) => q.question);

  const monologueRaw = speakingRaw.monologue ?? speakingRaw.long_turn ?? {};
  const pronRaw = speakingRaw.pronunciation ?? {};
  const pairs = asArray(pronRaw.pairs ?? pronRaw.minimal_pairs)
    .map((p) => asArray(p).map(str))
    .filter((p) => p.length === 2 && p[0] && p[1] && p[0].toLowerCase() !== p[1].toLowerCase());

  const writingRaw = lesson.writing ?? lesson.writing_task ?? {};
  const cleaned = {
    id,
    specId: id,
    level: spec.genLevel,
    phase: spec.phase,
    week: spec.week,
    day: spec.day,
    dayIndex: spec.dayIndex,
    topic: str(lesson.topic) || spec.topic,
    angle: spec.angle,
    grammar: str(lesson.grammar) || spec.grammar,
    objectives: asArray(lesson.objectives).map(str).filter(Boolean).slice(0, 4),
    vocab: vocab.slice(0, 8),
    listening: {
      title: str(listeningRaw.title) || `${spec.topic} — listening`,
      accent: /american|us/i.test(str(listeningRaw.accent)) ? 'American' : 'British',
      script,
      gist,
      detail: detail.slice(0, 5),
      shadowing: asArray(listeningRaw.shadowing ?? listeningRaw.repeat)
        .map(str)
        .filter((s) => s.split(/\s+/).length >= 3)
        .slice(0, 4),
    },
    speaking: {
      warmup: asArray(speakingRaw.warmup ?? speakingRaw.warm_up)
        .map(str)
        .filter(Boolean)
        .slice(0, 4),
      qa: qa.slice(0, 5),
      monologue: {
        prompt:
          str(monologueRaw.prompt) ||
          `Talk about ${spec.topic.toLowerCase()} for ${spec.seconds} seconds.`,
        seconds: spec.seconds,
        structure: asArray(monologueRaw.structure).map(str).filter(Boolean).slice(0, 6),
        useful: asArray(monologueRaw.useful ?? monologueRaw.useful_language)
          .map(str)
          .filter(Boolean)
          .slice(0, 5),
      },
      pronunciation: {
        focus: str(pronRaw.focus) || 'word stress and clear endings',
        pairs: pairs.slice(0, 4),
        drill: asArray(pronRaw.drill ?? pronRaw.sentences)
          .map(str)
          .filter((s) => s.split(/\s+/).length >= 3)
          .slice(0, 4),
      },
    },
    reading: {
      title: str(readingRaw.title) || spec.topic,
      text: str(readingRaw.text ?? readingRaw.passage ?? lesson.passage),
      questions: questions.slice(0, 6),
      summaryTask:
        str(readingRaw.summaryTask ?? readingRaw.summary_task) ||
        'Retell the text aloud in 60 seconds using three key words.',
    },
    writing: {
      task: str(writingRaw.task ?? writingRaw.prompt) || 'Write a short paragraph about this topic.',
      genre: str(writingRaw.genre ?? writingRaw.type) || 'paragraph',
      minWords:
        Number(writingRaw.minWords ?? writingRaw.min_words) > 10
          ? Number(writingRaw.minWords ?? writingRaw.min_words)
          : 60,
      checklist: asArray(writingRaw.checklist).map(str).filter(Boolean).slice(0, 4),
      model: str(writingRaw.model ?? writingRaw.model_answer),
    },
    phrases: asArray(lesson.phrases ?? lesson.target_language)
      .map(str)
      .filter(Boolean)
      .slice(0, 6),
    generatedAt: new Date().toISOString(),
  };

  // Repair rather than fail: models sometimes drop these, but the UI needs them.
  if (!cleaned.phrases.length) {
    cleaned.phrases = [
      ...cleaned.vocab.map((v) => v.term),
      ...cleaned.speaking.monologue.useful,
    ]
      .filter(Boolean)
      .slice(0, 4);
  }
  if (cleaned.listening.shadowing.length < 2) {
    cleaned.listening.shadowing = cleaned.listening.script
      .flatMap((line) => line.text.split(/(?<=[.!?])\s+/))
      .map((s) => s.trim())
      .filter((s) => s.split(/\s+/).length >= 6)
      .slice(0, 3);
  }
  if (!cleaned.speaking.warmup.length) {
    cleaned.speaking.warmup = [
      `What comes to mind when you hear "${cleaned.topic}"?`,
      'What did you do yesterday that was similar?',
      'What would you like to change about it?',
    ];
  }
  if (cleaned.speaking.pronunciation.drill.length < 2) {
    cleaned.speaking.pronunciation.drill = cleaned.listening.shadowing.slice(0, 3);
  }

  if (cleaned.listening.script.length < 3) throw new Error('Lesson has no usable listening script');
  if (words(cleaned.reading.text) < 60) throw new Error('Lesson has no usable reading text');
  if (!cleaned.speaking.qa.length) throw new Error('Lesson has no speaking questions');
  return cleaned;
}

const GRAMMAR_WORDS = new Set([
  'usually', 'sometimes', 'never', 'always', 'often', 'rarely', 'seldom',
  'busy', 'free', 'good', 'bad', 'nice', 'happy', 'sad',
]);

export function qualityIssues(lesson) {
  const issues = [];
  if (lesson.vocab.length < 5) issues.push('vocab must contain 6 items (currently ' + lesson.vocab.length + ')');
  if (lesson.vocab.filter((v) => v.term.trim().split(/\s+/).length === 1 && GRAMMAR_WORDS.has(v.term.toLowerCase())).length >= 3) {
    issues.push('vocab is full of basic frequency words; use useful multi-word chunks instead');
  }
  if (lesson.listening.script.length < 8) {
    issues.push('listening.script must have at least 8 turns (currently ' + lesson.listening.script.length + ')');
  }
  const scriptWords = lesson.listening.script.reduce((n, l) => n + words(l.text), 0);
  if (scriptWords < 150) issues.push('listening.script must total at least 150 words (currently ' + scriptWords + ')');
  if (words(lesson.reading.text) < 140) issues.push('reading.text must be at least 140 words (currently ' + words(lesson.reading.text) + ')');
  if (lesson.reading.questions.length < 4) issues.push('reading.questions must have 5 items');
  if (lesson.speaking.qa.length < 3) issues.push('speaking.qa must have 3 items');
  if (lesson.listening.shadowing.length < 2) issues.push('listening.shadowing must have 3 sentences from the script');
  if (lesson.speaking.pronunciation.pairs.length < 2) issues.push('pronunciation.pairs needs 2 real pairs such as ["ship","sheep"]');
  if (lesson.phrases.length < 3) issues.push('phrases must have at least 3 chunks');
  const mcq = lesson.reading.questions.filter((q) => q.type === 'mcq');
  if (mcq.some((q) => typeof q.answer !== 'number' || q.answer < 0 || q.answer >= q.options.length)) {
    issues.push('every mcq answer must be a valid option index');
  }
  const speakerNames = lesson.listening.script.map((l) => l.speaker).filter((n) => n.length > 2);
  if (
    speakerNames.length &&
    speakerNames.some((name) => new RegExp(`\\b${name}\\b`, 'i').test(lesson.reading.text))
  ) {
    issues.push('reading.text must describe different people, not the listening dialogue speakers');
  }
  return issues;
}

export async function loadLesson(id, { generate = true, onProgress } = {}) {
  const spec = specFor(id);
  if (!spec) throw Object.assign(new Error(`Unknown lesson ${id}`), { status: 404 });

  const existing = await readLesson(id);
  if (existing) {
    try {
      return validateLesson(existing, spec);
    } catch {
      if (!generate) throw new Error(`Cached lesson ${id} is invalid`);
    }
  }
  if (!generate) return null;

  await mkdir(LESSON_DIR, { recursive: true });
  let best = null;
  let lastError = null;
  let fixes = '';

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      onProgress?.(`Writing ${spec.id} (attempt ${attempt})…`);
      const raw = await generateLesson({ ...spec, requiredSchemaVersion: 2, fix: fixes || undefined });
      const cleaned = validateLesson({ ...raw, id }, spec);
      const issues = qualityIssues(cleaned);
      if (!best || issues.length < best.issues.length) best = { lesson: cleaned, issues };
      if (!issues.length) break;
      fixes = issues.join('; ');
      onProgress?.(`Quality check found: ${fixes}`);
    } catch (err) {
      lastError = err;
      fixes = `${err.message}. Return every required key with the exact shapes described.`;
      onProgress?.(`Attempt ${attempt} failed: ${err.message}`);
    }
  }

  if (!best) {
    throw Object.assign(new Error(`Could not generate ${id}: ${lastError?.message || 'unknown error'}`), {
      status: 502,
    });
  }
  if (best.issues.length) {
    onProgress?.(`Saving the best attempt with ${best.issues.length} quality notes.`);
  }
  await writeFile(join(LESSON_DIR, `${id}.json`), JSON.stringify(best.lesson, null, 2), 'utf8');
  return best.lesson;
}
