const FILLERS = ['um', 'uh', 'erm', 'er', 'ah', 'eh', 'hmm', 'mmm'];

const FILLER_PHRASES = [
  'you know',
  'i mean',
  'sort of',
  'kind of',
  'like i said',
  'how do you say',
  'what is the word',
];

export function normalizeWord(word) {
  return word
    .toLowerCase()
    .replace(/[^a-z']/g, '')
    .replace(/^'+|'+$/g, '');
}

export function tokenize(text) {
  return (text || '')
    .split(/\s+/)
    .map(normalizeWord)
    .filter(Boolean);
}

function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    prev = cur;
  }
  return prev[n];
}

export function matchTarget(transcript, target) {
  const said = tokenize(transcript);
  const want = tokenize(target);
  if (!want.length) return { accuracy: 0, missed: [], extra: [] };

  const hit = new Set();
  const missed = [];
  for (const word of want) {
    const idx = said.findIndex((w, i) => !hit.has(i) && (w === word || levenshtein(w, word) <= 1));
    if (idx === -1) missed.push(word);
    else hit.add(idx);
  }
  const extra = said.filter((_, i) => !hit.has(i));
  const accuracy = (want.length - missed.length) / want.length;
  return { accuracy: Math.max(0, Math.min(1, accuracy)), missed, extra };
}

export function computeSpeechMetrics({ words = [], text = '', duration = 0, target = null }) {
  const tokens = tokenize(text);
  const wordCount = tokens.length;

  const timed = words
    .map((w) => ({ word: normalizeWord(w.word || w.text || ''), start: w.start, end: w.end }))
    .filter((w) => w.word && Number.isFinite(w.start) && Number.isFinite(w.end));

  let speechSpan = duration;
  if (timed.length > 1) {
    speechSpan = Math.max(0.1, timed[timed.length - 1].end - timed[0].start);
  }

  const pauses = [];
  for (let i = 1; i < timed.length; i++) {
    const gap = timed[i].start - timed[i - 1].end;
    if (gap > 0.7) pauses.push(Math.round(gap * 100) / 100);
  }
  const longestPause = pauses.length ? Math.max(...pauses) : 0;
  const longPauses = pauses.filter((p) => p >= 1.2).length;

  let fillerCount = 0;
  for (const t of tokens) if (FILLERS.includes(t)) fillerCount++;
  const lowerText = ` ${tokens.join(' ')} `;
  for (const phrase of FILLER_PHRASES) {
    const matches = lowerText.split(phrase).length - 1;
    fillerCount += matches;
  }

  let repetitions = 0;
  for (let i = 1; i < tokens.length; i++) {
    if (tokens[i] === tokens[i - 1] && tokens[i].length > 2) repetitions++;
  }

  const contentTokens = tokens.filter((t) => t.length > 3);
  const unique = new Set(tokens).size;
  const uniqueContent = new Set(contentTokens).size;

  const speechMinutes = Math.max(speechSpan, 0.5) / 60;
  const totalMinutes = Math.max(duration || speechSpan, 0.5) / 60;

  return {
    duration: Math.round((duration || speechSpan) * 10) / 10,
    speechSpan: Math.round(speechSpan * 10) / 10,
    wordCount,
    wpm: Math.round(wordCount / speechMinutes),
    wpmOverall: Math.round(wordCount / totalMinutes),
    pauseCount: pauses.length,
    pauses,
    longestPause,
    longPauses,
    fillerCount,
    fillerRate: wordCount ? Math.round((fillerCount / wordCount) * 1000) / 1000 : 0,
    repetitions,
    uniqueWords: unique,
    typeTokenRatio: wordCount ? Math.round((unique / wordCount) * 100) / 100 : 0,
    contentVariety: contentTokens.length
      ? Math.round((uniqueContent / contentTokens.length) * 100) / 100
      : 0,
    avgWordLength: wordCount
      ? Math.round((tokens.join('').length / wordCount) * 10) / 10
      : 0,
    target: target ? matchTarget(text, target) : null,
  };
}

export function describeMetrics(m) {
  if (!m) return 'No speech measured.';
  const bits = [
    `${m.wordCount} words`,
    `${m.wpm} wpm`,
    `${m.longPauses} long pause${m.longPauses === 1 ? '' : 's'}`,
    `${Math.round(m.fillerRate * 100)}% fillers`,
  ];
  if (m.target) bits.push(`${Math.round(m.target.accuracy * 100)}% script match`);
  return bits.join(' · ');
}
