import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { createWriteStream } from 'node:fs';
import { rm } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { join } from 'node:path';
import db, {
  AUDIO_DIR,
  getProfile,
  getSkillLevels,
  setSkillLevel,
  json,
} from './db.js';
import { CURRICULUM, specFor, specForDayIndex, listLessons, loadLesson } from './content.js';
import { bandToCefr, gradeSpeaking, gradeWriting, heuristicSpeaking, heuristicWriting, ollamaStatus } from './ai.js';
import { computeSpeechMetrics, describeMetrics } from './metrics.js';
import { asrStatus, transcribeFile } from './asr.js';

const PORT = Number(process.env.PORT || 8787);

const app = Fastify({ logger: { level: 'info', transport: undefined } });
await app.register(cors, { origin: true });
await app.register(multipart, { limits: { fileSize: 30 * 1024 * 1024, files: 1 } });

app.setErrorHandler((err, req, reply) => {
  req.log.error({ err }, 'request failed');
  const status = err.statusCode || err.status || 500;
  reply.status(status).send({ error: err.message || 'Unexpected error' });
});

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function todayISO() {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 10);
}

function daysBetween(a, b) {
  return Math.round((new Date(`${b}T00:00:00`) - new Date(`${a}T00:00:00`)) / 86_400_000);
}

function streak() {
  const rows = db
    .prepare(
      `SELECT DISTINCT date(finished_at) AS day FROM sessions
       WHERE status = 'done' ORDER BY day DESC LIMIT 400`
    )
    .all();
  if (!rows.length) return { current: 0, best: 0, lastDay: null };
  const days = rows.map((r) => r.day);
  const last = days[0];
  const today = todayISO();
  const gap = daysBetween(last, today);
  let current = 0;
  if (gap <= 1) {
    current = 1;
    for (let i = 1; i < days.length; i++) {
      if (daysBetween(days[i], days[i - 1]) === 1) current++;
      else break;
    }
  }
  let best = 1;
  let run = 1;
  for (let i = 1; i < days.length; i++) {
    if (daysBetween(days[i], days[i - 1]) === 1) run++;
    else run = 1;
    best = Math.max(best, run);
  }
  return { current, best: Math.max(best, current), lastDay: last };
}

function updateSkill(skill, band) {
  const recent = db
    .prepare(
      `SELECT band FROM ${
        skill === 'speaking' ? 'speaking_attempts' : 'writing_attempts'
      } WHERE band IS NOT NULL ORDER BY id DESC LIMIT 5`
    )
    .all();
  const avg =
    recent.reduce((sum, r) => sum + r.band, 0) / Math.max(1, recent.length) || band;
  setSkillLevel(skill, bandToCefr(avg), Math.round(avg * 10) / 10);
}

function weekOf(dayIndex) {
  return Math.min(24, Math.ceil(dayIndex / 5));
}

function dayState() {
  const profile = getProfile();
  const done = db
    .prepare(`SELECT COUNT(*) AS n FROM sessions WHERE status = 'done'`)
    .get().n;
  const active = db
    .prepare(`SELECT * FROM sessions WHERE status = 'active' ORDER BY id DESC LIMIT 1`)
    .get();
  const nextIndex = Math.min(done + 1, CURRICULUM.length);
  const spec = active ? specFor(active.lesson_id) : specForDayIndex(nextIndex);
  return { profile, done, active, spec, nextIndex };
}

function publicProfile() {
  const p = getProfile();
  return {
    id: p.id,
    name: p.name,
    goalLevel: p.goal_level,
    examTarget: p.exam_target,
    dailyMinutes: p.daily_minutes,
    startDate: p.start_date,
    onboardingDone: Boolean(p.onboarding_done),
    prefs: json(p.prefs_json, {}),
  };
}

/* ------------------------------------------------------------------ */
/* Health + state                                                      */
/* ------------------------------------------------------------------ */

app.get('/api/health', async () => {
  const [ollama, asr] = await Promise.all([ollamaStatus(), asrStatus()]);
  return {
    ok: true,
    time: new Date().toISOString(),
    ollama,
    asr,
    lessonsReady: (await listLessons()).filter((l) => l.ready).length,
    lessonsTotal: CURRICULUM.length,
  };
});

app.get('/api/state', async () => {
  const { profile, done, active, spec, nextIndex } = dayState();
  const levels = getSkillLevels();
  const due = db
    .prepare(`SELECT COUNT(*) AS n FROM vocab WHERE due_at <= date('now')`)
    .get().n;
  return {
    profile: publicProfile(),
    levels,
    streak: streak(),
    progress: {
      sessionsDone: done,
      totalSessions: CURRICULUM.length,
      dayIndex: nextIndex,
      week: weekOf(nextIndex),
      percent: Math.round((done / CURRICULUM.length) * 100),
    },
    dueReviews: due,
    activeSession: active ? { id: active.id, lessonId: active.lesson_id, dayIndex: active.day_index } : null,
    today: spec
      ? {
          id: spec.id,
          dayIndex: spec.dayIndex,
          week: spec.week,
          day: spec.day,
          level: spec.level,
          phase: spec.phase,
          topic: spec.topic,
          angle: spec.angle,
          grammar: spec.grammar,
          functions: spec.functions,
          focus: spec.focus,
          focusLabel: spec.focusLabel,
          seconds: spec.seconds,
        }
      : null,
  };
});

app.post('/api/profile', async (req) => {
  const { name, dailyMinutes, goalLevel, examTarget, prefs } = req.body || {};
  db.prepare(
    `UPDATE profile SET name = COALESCE(?, name),
      daily_minutes = COALESCE(?, daily_minutes),
      goal_level = COALESCE(?, goal_level),
      exam_target = COALESCE(?, exam_target),
      prefs_json = COALESCE(?, prefs_json) WHERE id = 1`
  ).run(
    name ?? null,
    dailyMinutes ? Number(dailyMinutes) : null,
    goalLevel ?? null,
    examTarget ?? null,
    prefs ? JSON.stringify(prefs) : null
  );
  return { profile: publicProfile() };
});

/* ------------------------------------------------------------------ */
/* Lessons                                                             */
/* ------------------------------------------------------------------ */

app.get('/api/lessons', async () => ({ lessons: await listLessons() }));

app.get('/api/lessons/:id', async (req, reply) => {
  const lesson = await loadLesson(req.params.id, { generate: false });
  if (!lesson) return reply.status(404).send({ error: 'Lesson not generated yet', id: req.params.id });
  return { lesson };
});

app.post('/api/lessons/:id/prepare', async (req) => {
  const spec = specFor(req.params.id);
  if (!spec) throw Object.assign(new Error('Unknown lesson'), { status: 404 });
  const lesson = await loadLesson(req.params.id, { generate: true });
  return { lesson, spec };
});

/* ------------------------------------------------------------------ */
/* Sessions                                                           */
/* ------------------------------------------------------------------ */

app.post('/api/sessions', async (req) => {
  const { lessonId } = req.body || {};
  const state = dayState();
  const resolved = lessonId || state.active?.lesson_id || state.spec?.id;
  if (!resolved) throw Object.assign(new Error('No lesson available'), { status: 400 });

  const existing = db
    .prepare(`SELECT * FROM sessions WHERE status = 'active' AND lesson_id = ? ORDER BY id DESC LIMIT 1`)
    .get(resolved);
  if (existing) {
    return {
      session: { id: existing.id, lessonId: existing.lesson_id, dayIndex: existing.day_index },
      resumed: true,
    };
  }

  const spec = specFor(resolved);
  const info = db
    .prepare(`INSERT INTO sessions (lesson_id, day_index) VALUES (?, ?)`)
    .run(resolved, spec?.dayIndex || state.nextIndex);
  return {
    session: { id: Number(info.lastInsertRowid), lessonId: resolved, dayIndex: spec?.dayIndex || state.nextIndex },
    resumed: false,
  };
});

app.post('/api/sessions/:id/block', async (req) => {
  const id = Number(req.params.id);
  const { block, score, minutes, data } = req.body || {};
  db.prepare(
    `INSERT INTO block_results (session_id, block, score, minutes, data_json) VALUES (?, ?, ?, ?, ?)`
  ).run(id, String(block || 'unknown'), score == null ? null : Number(score), minutes == null ? null : Number(minutes), JSON.stringify(data || {}));
  return { ok: true };
});

app.post('/api/sessions/:id/finish', async (req) => {
  const id = Number(req.params.id);
  const { summary } = req.body || {};
  const session = db.prepare(`SELECT * FROM sessions WHERE id = ?`).get(id);
  if (!session) throw Object.assign(new Error('Session not found'), { status: 404 });

  const blocks = db.prepare(`SELECT block, score, minutes FROM block_results WHERE session_id = ?`).all(id);
  const minutes = Math.round(blocks.reduce((s, b) => s + (b.minutes || 0), 0));
  const speaking = db
    .prepare(`SELECT band, metrics_json, feedback_json FROM speaking_attempts WHERE session_id = ? ORDER BY id DESC LIMIT 1`)
    .get(id);
  const writing = db
    .prepare(`SELECT band FROM writing_attempts WHERE session_id = ? ORDER BY id DESC LIMIT 1`)
    .get(id);

  db.prepare(`UPDATE sessions SET status = 'done', finished_at = datetime('now'), summary_json = ? WHERE id = ?`).run(
    JSON.stringify(summary || {}),
    id
  );

  return {
    ok: true,
    summary: {
      minutes,
      blocks: blocks.length,
      speakingBand: speaking?.band ?? null,
      writingBand: writing?.band ?? null,
      metrics: json(speaking?.metrics_json, null),
    },
    streak: streak(),
  };
});

/* ------------------------------------------------------------------ */
/* Speaking                                                            */
/* ------------------------------------------------------------------ */

async function gradeSpeakingAttempt({ transcript, metrics, taskType, prompt, level, topic, sessionId, lessonId, audioPath }) {
  const safeTranscript = (transcript || '').trim();
  if (safeTranscript.split(/\s+/).filter(Boolean).length < 3) {
    const err = new Error('Too little speech detected. Try again, a little closer to the mic.');
    err.status = 422;
    throw err;
  }

  let feedback;
  try {
    feedback = await gradeSpeaking({
      prompt: prompt || '',
      taskType: taskType || 'monologue',
      transcript: safeTranscript,
      metrics,
      level: level || 'A2',
      topic: topic || '',
    });
  } catch {
    feedback = heuristicSpeaking({ transcript: safeTranscript, metrics, level, prompt });
  }

  const band = Number(feedback.overall) || null;
  const cefr = feedback.cefr || (band ? bandToCefr(band) : null);

  const info = db
    .prepare(
      `INSERT INTO speaking_attempts
       (session_id, lesson_id, task_type, prompt, transcript, metrics_json, feedback_json, audio_path, cefr, band)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      sessionId ?? null,
      lessonId ?? null,
      taskType || 'monologue',
      prompt ?? null,
      safeTranscript,
      JSON.stringify(metrics),
      JSON.stringify(feedback),
      audioPath ?? null,
      cefr,
      band
    );

  for (const fix of feedback.fixes || []) {
    if (fix?.youSaid && fix?.better) {
      db.prepare(`INSERT INTO errors (kind, wrong, right, lesson_id) VALUES (?, ?, ?, ?)`).run(
        'speaking',
        String(fix.youSaid).slice(0, 200),
        String(fix.better).slice(0, 200),
        lessonId ?? null
      );
    }
  }
  if (band) updateSkill('speaking', band);

  return {
    id: Number(info.lastInsertRowid),
    transcript: safeTranscript,
    metrics,
    metricsLine: describeMetrics(metrics),
    feedback,
    band,
    cefr,
    offline: Boolean(feedback.offline),
  };
}

async function saveUploadedAudio(req, prefix = 'spk') {
  if (!req.isMultipart()) throw Object.assign(new Error('Expected multipart audio upload'), { status: 415 });
  const fields = {};
  let filePath = null;
  for await (const part of req.parts()) {
    if (part.type === 'file') {
      filePath = join(
        AUDIO_DIR,
        `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.webm`
      );
      await pipeline(part.file, createWriteStream(filePath));
    } else {
      fields[part.fieldname] = part.value;
    }
  }
  if (!filePath) throw Object.assign(new Error('No audio file received'), { status: 400 });
  return { fields, filePath };
}

app.post('/api/speaking/attempt', async (req) => {
  const { fields, filePath } = await saveUploadedAudio(req, 'spk');

  let asr;
  try {
    asr = await transcribeFile(filePath);
  } catch (err) {
    await rm(filePath, { force: true });
    const e = new Error(
      `Speech recogniser unavailable: ${err.message}. Start the ASR service (services/asr) or type your answer instead.`
    );
    e.status = 503;
    throw e;
  }

  const metrics = computeSpeechMetrics({
    words: asr.words,
    text: asr.text,
    duration: asr.duration,
    target: fields.target || null,
  });

  return gradeSpeakingAttempt({
    transcript: asr.text,
    metrics,
    taskType: fields.taskType,
    prompt: fields.prompt,
    level: fields.level,
    topic: fields.topic,
    sessionId: fields.sessionId ? Number(fields.sessionId) : null,
    lessonId: fields.lessonId || null,
    audioPath: filePath.replace(/\\/g, '/'),
  });
});

app.post('/api/speaking/transcript', async (req) => {
  const { transcript, taskType, prompt, level, topic, sessionId, lessonId, target, duration } = req.body || {};
  const metrics = computeSpeechMetrics({
    text: transcript || '',
    duration: Number(duration) || Math.max(8, (transcript || '').split(/\s+/).length / 2.2),
    target: target || null,
  });
  return gradeSpeakingAttempt({
    transcript,
    metrics,
    taskType,
    prompt,
    level,
    topic,
    sessionId,
    lessonId,
  });
});

app.post('/api/transcribe', async (req) => {
  const { fields, filePath } = await saveUploadedAudio(req, 'trs');
  try {
    const asr = await transcribeFile(filePath);
    const metrics = computeSpeechMetrics({
      words: asr.words,
      text: asr.text,
      duration: asr.duration,
      target: fields.target || null,
    });
    return { transcript: asr.text, metrics, duration: asr.duration, words: asr.words };
  } catch (err) {
    const e = new Error(`Speech recogniser unavailable: ${err.message}`);
    e.status = 503;
    throw e;
  }
});

/* ------------------------------------------------------------------ */
/* Writing                                                             */
/* ------------------------------------------------------------------ */

app.post('/api/writing/attempt', async (req) => {
  const { text, prompt, taskType, level, minWords, sessionId, lessonId } = req.body || {};
  const clean = (text || '').trim();
  const wordCount = clean.split(/\s+/).filter(Boolean).length;
  if (wordCount < 20) throw Object.assign(new Error('Write at least 20 words.'), { status: 422 });

  let feedback;
  try {
    feedback = await gradeWriting({ prompt, taskType, text: clean, level, minWords });
  } catch {
    feedback = heuristicWriting({ text: clean, level, minWords });
  }

  const band = Number(feedback.overall) || null;
  const cefr = feedback.cefr || (band ? bandToCefr(band) : null);

  const info = db
    .prepare(
      `INSERT INTO writing_attempts
       (session_id, lesson_id, task_type, prompt, text, word_count, feedback_json, cefr, band)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      sessionId ?? null,
      lessonId ?? null,
      taskType || 'paragraph',
      prompt ?? null,
      clean,
      wordCount,
      JSON.stringify(feedback),
      cefr,
      band
    );

  for (const c of feedback.corrections || []) {
    if (c?.original && c?.corrected) {
      db.prepare(`INSERT INTO errors (kind, wrong, right, lesson_id) VALUES (?, ?, ?, ?)`).run(
        `writing:${c.type || 'grammar'}`,
        String(c.original).slice(0, 200),
        String(c.corrected).slice(0, 200),
        lessonId ?? null
      );
    }
  }
  if (band) updateSkill('writing', band);

  return {
    id: Number(info.lastInsertRowid),
    wordCount,
    feedback,
    band,
    cefr,
    offline: Boolean(feedback.offline),
  };
});

/* ------------------------------------------------------------------ */
/* Objective checks (listening / reading)                              */
/* ------------------------------------------------------------------ */

app.post('/api/objective', async (req) => {
  const { lessonId, block, answers } = req.body || {};
  const lesson = await loadLesson(lessonId, { generate: false });
  if (!lesson) throw Object.assign(new Error('Lesson not found'), { status: 404 });

  let items = [];
  if (block === 'listening') {
    const gist = lesson.listening.gist;
    items = [
      { id: 'gist', expected: gist.answer, type: 'index' },
      ...lesson.listening.detail.map((q, i) => ({ id: `d${i}`, expected: q.answer, type: 'text' })),
    ];
  } else if (block === 'reading') {
    items = lesson.reading.questions.map((q, i) => ({
      id: `r${i}`,
      expected: q.answer,
      type: q.type === 'mcq' ? 'index' : 'text',
    }));
  } else {
    throw Object.assign(new Error('Unknown block'), { status: 400 });
  }

  const results = items.map((item) => {
    const given = answers?.[item.id];
    let correct = false;
    if (item.type === 'index') {
      correct = Number(given) === Number(item.expected);
    } else if (typeof item.expected === 'number') {
      correct = Number(given) === item.expected;
    } else {
      const norm = (v) =>
        String(v ?? '')
          .toLowerCase()
          .replace(/[^a-z0-9' ]/g, '')
          .replace(/\s+/g, ' ')
          .trim();
      const exp = norm(item.expected);
      const got = norm(given);
      correct = Boolean(got) && (got === exp || (exp.length > 4 && (got.includes(exp) || exp.includes(got))));
    }
    return { id: item.id, correct, expected: item.expected, given: given ?? null };
  });

  const score = Math.round((results.filter((r) => r.correct).length / Math.max(1, results.length)) * 100);
  return { score, results };
});

/* ------------------------------------------------------------------ */
/* Vocabulary + spaced repetition                                     */
/* ------------------------------------------------------------------ */

app.get('/api/vocab', async (req) => {
  const dueOnly = req.query?.due === '1';
  const rows = dueOnly
    ? db.prepare(`SELECT * FROM vocab WHERE due_at <= date('now') ORDER BY due_at LIMIT 30`).all()
    : db.prepare(`SELECT * FROM vocab ORDER BY added_at DESC LIMIT 200`).all();
  return { items: rows };
});

app.post('/api/vocab', async (req) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : [req.body];
  let added = 0;
  for (const item of items) {
    if (!item?.term) continue;
    const info = db
      .prepare(
        `INSERT INTO vocab (term, meaning, example, lesson_id) VALUES (?, ?, ?, ?)
         ON CONFLICT(term) DO NOTHING`
      )
      .run(String(item.term).trim(), item.meaning ?? null, item.example ?? null, item.lessonId ?? null);
    added += info.changes || 0;
  }
  return { added };
});

app.post('/api/vocab/review', async (req) => {
  const { id, rating } = req.body || {};
  const item = db.prepare(`SELECT * FROM vocab WHERE id = ?`).get(Number(id));
  if (!item) throw Object.assign(new Error('Word not found'), { status: 404 });
  const q = Math.max(0, Math.min(5, Number(rating) || 0));

  let ease = item.ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  ease = Math.max(1.3, Math.min(2.9, ease));
  let interval;
  if (q < 3) {
    interval = 0;
    db.prepare(`UPDATE vocab SET lapses = lapses + 1 WHERE id = ?`).run(item.id);
  } else if (item.reps === 0) interval = 1;
  else if (item.reps === 1) interval = 3;
  else interval = Math.round(item.interval_days * ease);

  db.prepare(
    `UPDATE vocab SET ease = ?, interval_days = ?, reps = reps + 1,
      due_at = date('now', '+' || ? || ' days') WHERE id = ?`
  ).run(ease, interval, interval, item.id);
  db.prepare(`INSERT INTO reviews (vocab_id, rating) VALUES (?, ?)`).run(item.id, q);

  return { ok: true, nextDueInDays: interval };
});

/* ------------------------------------------------------------------ */
/* Diagnostic                                                          */
/* ------------------------------------------------------------------ */

const DIAGNOSTIC = {
  listening: {
    title: 'A short conversation at a train station',
    script: [
      { speaker: 'Clerk', text: "Good morning. Where are you travelling today?" },
      { speaker: 'Anna', text: "Hi. I'd like a return ticket to Bristol, please. I'm coming back on Sunday evening." },
      { speaker: 'Clerk', text: 'Of course. The next train leaves at ten forty from platform six. It takes about an hour and a half.' },
      { speaker: 'Anna', text: "That's fine. Is there a quiet coach? I need to finish some work on the way." },
      { speaker: 'Clerk', text: 'Coach B is usually quieter. But I should warn you, there are engineering works on Sunday, so the return journey will take longer.' },
      { speaker: 'Anna', text: 'How much longer?' },
      { speaker: 'Clerk', text: 'About forty minutes. You will need to change at Reading and take a bus for the last part.' },
      { speaker: 'Anna', text: "OK, I'll take it anyway. Can I pay by card?" },
    ],
    questions: [
      { q: 'What kind of ticket does Anna buy?', options: ['Single to Bristol', 'Return to Bristol', 'Return to Reading'], answer: 1 },
      { q: 'What time does her train leave?', options: ['10:14', '10:40', '11:40'], answer: 1 },
      { q: 'Why does she want a quiet coach?', options: ['She wants to sleep', 'She needs to work', 'She is travelling with a child'], answer: 1 },
      { q: 'What problem is there on Sunday?', options: ['A strike', 'Engineering works', 'Bad weather'], answer: 1 },
      { q: 'How does she pay?', options: ['By card', 'In cash', 'With a voucher'], answer: 0 },
      { q: 'What must she do on the return journey?', options: ['Change at Reading and take a bus', 'Change at Bristol', 'Take a later train'], answer: 0 },
    ],
  },
  reading: {
    title: 'The four-day week',
    text: `For most of the last century, the five-day working week seemed as fixed as sunrise. Recently, however, dozens of companies in Europe and Asia have tested a four-day week without cutting pay. The early results are surprising. In a large trial in the United Kingdom, most participating companies decided to keep the shorter week, reporting that productivity stayed the same or improved. Employees said they slept better and felt less stressed.\n\nSupporters argue that a shorter week forces organisations to remove unnecessary meetings and focus on the work that matters. Critics are less convinced. They point out that the trials were voluntary, involved mostly office jobs, and often depended on enthusiastic managers. In hospitals, factories and shops, where work must be covered continuously, a four-day week is far harder to arrange. Some researchers also warn about a "compression effect": staff may simply work longer and faster days, which can damage health over time.\n\nWhat seems clear is that the debate is no longer about whether the five-day week is natural, but about who gets to work differently — and who does not.`,
    questions: [
      { q: 'The five-day week has always been questioned by employers.', type: 'tfng', answer: 'False' },
      { q: 'In the UK trial, most companies kept the four-day week.', type: 'tfng', answer: 'True' },
      { q: 'The article says the four-day week is easy to introduce in hospitals.', type: 'tfng', answer: 'False' },
      { q: 'What is the "compression effect"?', options: ['Working fewer but longer days', 'Hiring fewer staff', 'Compressing salaries'], answer: 0 },
      { q: 'Why are the trials criticised?', options: ['They were too expensive', 'They involved mainly office jobs', 'They reduced productivity'], answer: 1 },
      { q: 'What is the main point of the final paragraph?', options: ['The debate is now about fairness of access', 'The five-day week will return', 'Researchers disagree about health'], answer: 0 },
    ],
  },
  speaking: {
    prompt: 'Describe a skill you would like to learn. You should say what it is, why you want to learn it, how you would learn it, and how it would change your life.',
    seconds: 90,
  },
  writing: {
    prompt:
      'Some people believe that working from home is better for employees, while others think it damages teamwork. Discuss both views and give your own opinion. Write 120–180 words.',
    minWords: 120,
  },
};

app.get('/api/diagnostic', async () => ({ diagnostic: DIAGNOSTIC }));

function estimateFromPercent(percent) {
  if (percent >= 85) return { cefr: 'B1+', band: 5.5 };
  if (percent >= 70) return { cefr: 'B1', band: 5 };
  if (percent >= 50) return { cefr: 'A2+', band: 4 };
  return { cefr: 'A2', band: 3.5 };
}

app.post('/api/diagnostic', async (req) => {
  const { listening = {}, reading = {}, speaking = {}, writing = {} } = req.body || {};

  const scoreSection = (section, answers) => {
    const results = section.questions.map((q, i) => {
      const given = answers[i];
      if (q.type === 'tfng') {
        return String(given || '').trim().toLowerCase() === String(q.answer).toLowerCase();
      }
      return Number(given) === Number(q.answer);
    });
    const correct = results.filter(Boolean).length;
    return { correct, total: results.length, percent: Math.round((correct / results.length) * 100) };
  };

  const listeningScore = scoreSection(DIAGNOSTIC.listening, listening);
  const readingScore = scoreSection(DIAGNOSTIC.reading, reading);

  const speakingMetrics = computeSpeechMetrics({
    text: speaking.transcript || '',
    duration: Number(speaking.duration) || 60,
  });

  let speakingGrade;
  try {
    speakingGrade = await gradeSpeaking({
      prompt: DIAGNOSTIC.speaking.prompt,
      taskType: 'ielts-part2',
      transcript: speaking.transcript || '',
      metrics: speakingMetrics,
      level: 'A2',
      topic: 'a skill you would like to learn',
    });
  } catch {
    speakingGrade = heuristicSpeaking({
      transcript: speaking.transcript || '',
      metrics: speakingMetrics,
      level: 'A2',
      prompt: DIAGNOSTIC.speaking.prompt,
    });
  }

  let writingGrade;
  try {
    writingGrade = await gradeWriting({
      prompt: DIAGNOSTIC.writing.prompt,
      taskType: 'discussion-essay',
      text: writing.text || '',
      level: 'A2',
      minWords: DIAGNOSTIC.writing.minWords,
    });
  } catch {
    writingGrade = heuristicWriting({
      text: writing.text || '',
      level: 'A2',
      minWords: DIAGNOSTIC.writing.minWords,
    });
  }

  const listenEst = estimateFromPercent(listeningScore.percent);
  const readEst = estimateFromPercent(readingScore.percent);
  const speakBand = Number(speakingGrade.overall) || 4;
  const writeBand = Number(writingGrade.overall) || 4;

  const result = {
    listening: { ...listeningScore, ...listenEst },
    reading: { ...readEst, ...readingScore },
    speaking: { band: speakBand, cefr: bandToCefr(speakBand), metrics: speakingMetrics },
    writing: { band: writeBand, cefr: bandToCefr(writeBand), words: (writing.text || '').split(/\s+/).filter(Boolean).length },
    weakest: null,
    summary: '',
  };

  const bands = {
    listening: listenEst.band,
    reading: readEst.band,
    speaking: speakBand,
    writing: writeBand,
  };
  result.weakest = Object.entries(bands).sort((a, b) => a[1] - b[1])[0][0];
  result.summary = `Estimated levels — listening ${result.listening.cefr}, reading ${result.reading.cefr}, speaking ${result.speaking.cefr}, writing ${result.writing.cefr}. Start with the ${result.weakest} track as your priority.`;

  setSkillLevel('listening', listenEst.cefr.replace('+', ''), listenEst.band);
  setSkillLevel('reading', readEst.cefr.replace('+', ''), readEst.band);
  setSkillLevel('speaking', result.speaking.cefr, speakBand);
  setSkillLevel('writing', result.writing.cefr, writeBand);
  db.prepare(`UPDATE profile SET onboarding_done = 1, start_date = date('now') WHERE id = 1`).run();
  db.prepare(`INSERT INTO diagnostics (answers_json, result_json) VALUES (?, ?)`).run(
    JSON.stringify(req.body || {}),
    JSON.stringify(result)
  );

  return { result, speakingFeedback: speakingGrade, writingFeedback: writingGrade };
});

app.post('/api/diagnostic/skip', async () => {
  db.prepare(`UPDATE profile SET onboarding_done = 1, start_date = date('now') WHERE id = 1`).run();
  for (const skill of ['speaking', 'listening', 'reading', 'writing']) {
    db.prepare(
      `INSERT INTO skill_levels (skill, cefr, score) VALUES (?, 'A2', 3.5)
       ON CONFLICT(skill) DO UPDATE SET cefr = 'A2', score = 3.5`
    ).run(skill);
  }
  return { ok: true };
});

/* ------------------------------------------------------------------ */
/* Progress                                                            */
/* ------------------------------------------------------------------ */

app.get('/api/progress', async () => {
  const speaking = db
    .prepare(`SELECT date(created_at) AS day, band, cefr FROM speaking_attempts WHERE band IS NOT NULL ORDER BY id DESC LIMIT 40`)
    .all()
    .reverse();
  const writing = db
    .prepare(`SELECT date(created_at) AS day, band, cefr FROM writing_attempts WHERE band IS NOT NULL ORDER BY id DESC LIMIT 40`)
    .all()
    .reverse();
  const listening = db
    .prepare(`SELECT date(created_at) AS day, score FROM block_results WHERE block = 'listening' ORDER BY id DESC LIMIT 40`)
    .all()
    .reverse();
  const reading = db
    .prepare(`SELECT date(created_at) AS day, score FROM block_results WHERE block = 'reading' ORDER BY id DESC LIMIT 40`)
    .all()
    .reverse();
  const errors = db
    .prepare(`SELECT kind, wrong, right, COUNT(*) AS n FROM errors GROUP BY wrong ORDER BY n DESC, id DESC LIMIT 12`)
    .all();
  const recentSessions = db
    .prepare(`SELECT id, lesson_id, day_index, finished_at, summary_json FROM sessions WHERE status = 'done' ORDER BY id DESC LIMIT 10`)
    .all()
    .map((s) => ({ ...s, summary: json(s.summary_json, null) }));

  return {
    levels: getSkillLevels(),
    streak: streak(),
    series: { speaking, writing, listening, reading },
    errors,
    recentSessions,
    totals: {
      speakingAttempts: db.prepare(`SELECT COUNT(*) AS n FROM speaking_attempts`).get().n,
      writingAttempts: db.prepare(`SELECT COUNT(*) AS n FROM writing_attempts`).get().n,
      vocab: db.prepare(`SELECT COUNT(*) AS n FROM vocab`).get().n,
      sessions: db.prepare(`SELECT COUNT(*) AS n FROM sessions WHERE status = 'done'`).get().n,
    },
  };
});

app.get('/api/attempts/:kind', async (req) => {
  const table = req.params.kind === 'writing' ? 'writing_attempts' : 'speaking_attempts';
  const rows = db.prepare(`SELECT * FROM ${table} ORDER BY id DESC LIMIT 50`).all();
  return {
    attempts: rows.map((r) => ({
      ...r,
      metrics: json(r.metrics_json, null),
      feedback: json(r.feedback_json, null),
      metrics_json: undefined,
      feedback_json: undefined,
    })),
  };
});

app.get('/api/errors', async () => ({
  errors: db.prepare(`SELECT * FROM errors ORDER BY id DESC LIMIT 100`).all(),
}));

/* ------------------------------------------------------------------ */

await app.listen({ port: PORT, host: '127.0.0.1' });
console.log(`English Coach API on http://127.0.0.1:${PORT}`);
