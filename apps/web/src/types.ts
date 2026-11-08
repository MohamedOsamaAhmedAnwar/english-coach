export type SkillKey = 'speaking' | 'listening' | 'reading' | 'writing';

export interface Spec {
  id: string;
  week: number;
  day: number;
  dayIndex: number;
  phase: string;
  level: string;
  topic: string;
  angle: string;
  grammar: string;
  functions: string;
  focus: string;
  focusLabel: string;
  seconds: number;
  ready?: boolean;
  title?: string;
}

export interface VocabItem {
  term: string;
  ipa?: string;
  meaning: string;
  example: string;
}

export interface Lesson {
  id: string;
  specId: string;
  level: string;
  phase: string;
  week: number;
  day: number;
  dayIndex: number;
  topic: string;
  angle: string;
  grammar: string;
  objectives: string[];
  vocab: VocabItem[];
  listening: {
    title: string;
    accent: string;
    script: { speaker: string; text: string }[];
    gist: { question: string; options: string[]; answer: number };
    detail: { question: string; answer: string }[];
    shadowing: string[];
  };
  speaking: {
    warmup: string[];
    qa: { question: string; hint: string; target: string[] }[];
    monologue: { prompt: string; seconds: number; structure: string[]; useful: string[] };
    pronunciation: { focus: string; pairs: string[][]; drill: string[] };
  };
  reading: {
    title: string;
    text: string;
    questions: {
      type: 'tfng' | 'mcq' | 'short';
      question: string;
      options: string[];
      answer: number | string;
      why: string;
    }[];
    summaryTask: string;
  };
  writing: {
    task: string;
    genre: string;
    minWords: number;
    checklist: string[];
    model: string;
  };
  phrases: string[];
}

export interface SpeakingFeedback {
  scores?: { fluency?: number; lexis?: number; grammar?: number; pronunciation?: number };
  overall?: number;
  cefr?: string;
  strengths?: string[];
  fixes?: { youSaid: string; better: string; why: string }[];
  modelAnswer?: string;
  phrases?: string[];
  summary?: string;
  offline?: boolean;
}

export interface WritingFeedback {
  scores?: { task?: number; coherence?: number; lexis?: number; grammar?: number };
  overall?: number;
  cefr?: string;
  strengths?: string[];
  corrections?: { original: string; corrected: string; type: string; why: string }[];
  upgrade?: string;
  phrases?: string[];
  summary?: string;
  offline?: boolean;
}

export interface AttemptResult {
  id: number;
  transcript: string;
  metrics: SpeechMetrics;
  metricsLine: string;
  feedback: SpeakingFeedback;
  band: number | null;
  cefr: string | null;
  offline: boolean;
}

export interface SpeechMetrics {
  duration: number;
  speechSpan: number;
  wordCount: number;
  wpm: number;
  wpmOverall: number;
  pauseCount: number;
  longestPause: number;
  longPauses: number;
  fillerCount: number;
  fillerRate: number;
  repetitions: number;
  uniqueWords: number;
  typeTokenRatio: number;
  contentVariety: number;
  avgWordLength: number;
  target: { accuracy: number; missed: string[]; extra: string[] } | null;
}

export interface Health {
  ok: boolean;
  ollama: { ok: boolean; models: string[]; model: string; error?: string };
  asr: { ok: boolean; ready?: boolean; loading?: boolean; model?: string; device?: string; error?: string; hint?: string };
  lessonsReady: number;
  lessonsTotal: number;
}

export interface Level {
  skill: SkillKey;
  cefr: string;
  score: number;
  updated_at?: string;
}

export interface AppState {
  profile: {
    id: number;
    name: string;
    goalLevel: string;
    examTarget: string;
    dailyMinutes: number;
    startDate: string;
    onboardingDone: boolean;
    prefs: Record<string, unknown>;
  };
  levels: Record<SkillKey, Level>;
  streak: { current: number; best: number; lastDay: string | null };
  progress: { sessionsDone: number; totalSessions: number; dayIndex: number; week: number; percent: number };
  dueReviews: number;
  activeSession: { id: number; lessonId: string; dayIndex: number } | null;
  today: Spec | null;
}

export interface DiagnosticPayload {
  listening: Record<number, number>;
  reading: Record<number, number | string>;
  speaking: { transcript: string; duration: number };
  writing: { text: string };
}

export interface ProgressData {
  levels: Record<SkillKey, Level>;
  streak: { current: number; best: number; lastDay: string | null };
  series: Record<string, { day: string; band?: number; score?: number; cefr?: string }[]>;
  errors: { kind: string; wrong: string; right: string; n: number }[];
  recentSessions: { id: number; lesson_id: string; day_index: number; finished_at: string; summary: Record<string, unknown> | null }[];
  totals: { speakingAttempts: number; writingAttempts: number; vocab: number; sessions: number };
}
