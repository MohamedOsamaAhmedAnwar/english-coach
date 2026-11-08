import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(__dirname, '..', '..', '..');
export const DATA_DIR = join(ROOT, 'data');
export const AUDIO_DIR = join(DATA_DIR, 'audio');

mkdirSync(DATA_DIR, { recursive: true });
mkdirSync(AUDIO_DIR, { recursive: true });

const db = new DatabaseSync(join(DATA_DIR, 'coach.db'));
db.exec('PRAGMA journal_mode = WAL;');

db.exec(`
CREATE TABLE IF NOT EXISTS profile (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  name TEXT,
  goal_level TEXT NOT NULL DEFAULT 'B2',
  exam_target TEXT NOT NULL DEFAULT 'IELTS 7.5',
  daily_minutes INTEGER NOT NULL DEFAULT 55,
  start_date TEXT NOT NULL DEFAULT (date('now')),
  onboarding_done INTEGER NOT NULL DEFAULT 0,
  prefs_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS skill_levels (
  skill TEXT PRIMARY KEY,
  cefr TEXT NOT NULL,
  score REAL NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lesson_id TEXT NOT NULL,
  day_index INTEGER NOT NULL,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  summary_json TEXT
);

CREATE TABLE IF NOT EXISTS block_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  block TEXT NOT NULL,
  score REAL,
  minutes REAL,
  data_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS speaking_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER,
  lesson_id TEXT,
  task_type TEXT NOT NULL,
  prompt TEXT,
  transcript TEXT,
  metrics_json TEXT,
  feedback_json TEXT,
  audio_path TEXT,
  cefr TEXT,
  band REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS writing_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER,
  lesson_id TEXT,
  task_type TEXT NOT NULL,
  prompt TEXT,
  text TEXT,
  word_count INTEGER,
  feedback_json TEXT,
  cefr TEXT,
  band REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS vocab (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  term TEXT NOT NULL UNIQUE,
  meaning TEXT,
  example TEXT,
  lesson_id TEXT,
  added_at TEXT NOT NULL DEFAULT (datetime('now')),
  ease REAL NOT NULL DEFAULT 2.5,
  interval_days INTEGER NOT NULL DEFAULT 0,
  due_at TEXT NOT NULL DEFAULT (date('now')),
  reps INTEGER NOT NULL DEFAULT 0,
  lapses INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vocab_id INTEGER NOT NULL,
  rating INTEGER NOT NULL,
  reviewed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS errors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  wrong TEXT,
  right TEXT,
  lesson_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS diagnostics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  answers_json TEXT NOT NULL,
  result_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_speaking_created ON speaking_attempts(created_at);
CREATE INDEX IF NOT EXISTS idx_writing_created ON writing_attempts(created_at);
CREATE INDEX IF NOT EXISTS idx_blocks_session ON block_results(session_id);
`);

export function ensureProfile() {
  const row = db.prepare('SELECT * FROM profile WHERE id = 1').get();
  if (row) return row;
  db.prepare('INSERT INTO profile (id, name) VALUES (1, ?)').run('Learner');
  for (const skill of ['speaking', 'listening', 'reading', 'writing']) {
    db.prepare(
      'INSERT OR IGNORE INTO skill_levels (skill, cefr, score) VALUES (?, ?, ?)'
    ).run(skill, 'A2', 0);
  }
  return db.prepare('SELECT * FROM profile WHERE id = 1').get();
}

export function getProfile() {
  return ensureProfile();
}

export function setSkillLevel(skill, cefr, score) {
  db.prepare(
    `INSERT INTO skill_levels (skill, cefr, score, updated_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(skill) DO UPDATE SET cefr = excluded.cefr,
       score = excluded.score, updated_at = excluded.updated_at`
  ).run(skill, cefr, Number(score) || 0);
}

export function getSkillLevels() {
  return Object.fromEntries(
    db.prepare('SELECT skill, cefr, score FROM skill_levels').all().map((r) => [r.skill, r])
  );
}

export function json(value, fallback = null) {
  if (value == null) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export default db;
