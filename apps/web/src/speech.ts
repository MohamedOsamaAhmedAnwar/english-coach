let generation = 0;
let cachedVoices: SpeechSynthesisVoice[] = [];

export const speechSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;

function loadVoices(): SpeechSynthesisVoice[] {
  if (!speechSupported) return [];
  const voices = window.speechSynthesis.getVoices();
  if (voices.length) cachedVoices = voices;
  return cachedVoices;
}

export function warmVoices() {
  if (!speechSupported) return;
  loadVoices();
  window.speechSynthesis.onvoiceschanged = () => loadVoices();
}

export function englishVoices() {
  return loadVoices().filter((v) => /^en(-|_)/i.test(v.lang));
}

const BRITISH_FEMALE = ['sonia', 'libby', 'aria', 'hazel', 'serena', 'kate', 'google uk english female'];
const BRITISH_MALE = ['ryan', 'george', 'oliver', 'thomas', 'google uk english male'];
const AMERICAN_FEMALE = ['jenny', 'aria', 'michelle', 'ana', 'samantha', 'google us english'];
const AMERICAN_MALE = ['guy', 'eric', 'davis', 'andrew', 'alex', 'christopher'];

function rank(voice: SpeechSynthesisVoice, names: string[]) {
  const name = voice.name.toLowerCase();
  const idx = names.findIndex((n) => name.includes(n));
  const natural = name.includes('natural') ? -5 : 0;
  const online = name.includes('online') ? -1 : 0;
  return (idx === -1 ? 50 : idx) + natural + online;
}

function pick(names: string[], lang: string) {
  const pool = englishVoices().filter((v) => v.lang.toLowerCase().startsWith(lang));
  if (!pool.length) return null;
  return [...pool].sort((a, b) => rank(a, names) - rank(b, names))[0];
}

export function pickVoices(accent: 'British' | 'American' = 'British') {
  const lang = accent === 'American' ? 'en-us' : 'en-gb';
  const primary =
    pick(accent === 'American' ? AMERICAN_FEMALE : BRITISH_FEMALE, lang) ||
    pick(accent === 'American' ? BRITISH_FEMALE : AMERICAN_FEMALE, lang) ||
    englishVoices()[0] ||
    null;
  const secondary =
    pick(accent === 'American' ? AMERICAN_MALE : BRITISH_MALE, lang) ||
    pick(accent === 'American' ? BRITISH_MALE : AMERICAN_MALE, lang) ||
    englishVoices()[1] ||
    primary;
  return { primary, secondary };
}

function utter(
  text: string,
  opts: { rate?: number; pitch?: number; voice?: SpeechSynthesisVoice | null; volume?: number } = {}
): Promise<void> {
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    u.rate = opts.rate ?? 1;
    u.pitch = opts.pitch ?? 1;
    u.volume = opts.volume ?? 1;
    if (opts.voice) u.voice = opts.voice;
    else {
      const { primary } = pickVoices('British');
      if (primary) u.voice = primary;
    }
    let settled = false;
    const done = () => {
      if (!settled) {
        settled = true;
        resolve();
      }
    };
    u.onend = done;
    u.onerror = done;
    window.speechSynthesis.speak(u);
    // Safety net for browsers that never fire onend.
    setTimeout(done, Math.min(60_000, 900 + text.length * 95 * (1 / (opts.rate ?? 1))));
  });
}

export function stopSpeaking() {
  generation++;
  if (speechSupported) window.speechSynthesis.cancel();
}

export async function speak(
  text: string,
  opts: { rate?: number; accent?: 'British' | 'American'; pitch?: number; volume?: number } = {}
): Promise<void> {
  if (!speechSupported || !text) return;
  stopSpeaking();
  const gen = generation;
  const voices = pickVoices(opts.accent || 'British');
  await new Promise((r) => setTimeout(r, 60));
  if (gen !== generation) return;
  await utter(text, { rate: opts.rate, pitch: opts.pitch, voice: voices.primary, volume: opts.volume });
}

export interface DialogueHandle {
  done: Promise<void>;
  stop: () => void;
}

export function speakDialogue(
  lines: { speaker: string; text: string }[],
  opts: {
    rate?: number;
    accent?: 'British' | 'American';
    onLine?: (index: number) => void;
    gapMs?: number;
  } = {}
): DialogueHandle {
  const gen = ++generation;
  if (speechSupported) window.speechSynthesis.cancel();
  const voices = pickVoices(opts.accent || 'British');

  const speakers = Array.from(new Set(lines.map((l) => l.speaker)));
  const voiceFor = (speaker: string) => {
    const idx = speakers.indexOf(speaker);
    return idx % 2 === 0 ? voices.primary : voices.secondary;
  };

  const done = (async () => {
    await new Promise((r) => setTimeout(r, 80));
    for (let i = 0; i < lines.length; i++) {
      if (gen !== generation) return;
      opts.onLine?.(i);
      await utter(lines[i].text, {
        rate: opts.rate ?? 1,
        pitch: i % 2 === 0 ? 1 : 0.96,
        voice: voiceFor(lines[i].speaker),
      });
      if (gen !== generation) return;
      await new Promise((r) => setTimeout(r, opts.gapMs ?? 260));
    }
    opts.onLine?.(-1);
  })();

  return { done, stop: stopSpeaking };
}

export function recordingSupported() {
  return (
    typeof navigator !== 'undefined' &&
    Boolean(navigator.mediaDevices?.getUserMedia) &&
    typeof MediaRecorder !== 'undefined'
  );
}
