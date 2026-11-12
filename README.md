# Steady — a local English coach (A2 → B2, speaking first)

A self-hosted web app that runs a 45–60 minute guided session every day: warm-up, listening, speaking, reading,
writing, wrap-up. Your voice is recorded, transcribed and scored **on this machine**. No account, no subscription,
no audio leaving your computer.

The plan goes from **A2 to B2 over 120 sessions (~24 weeks, 5 days/week)**, with an IELTS track designed to slot in
afterwards. Speaking is the spine: every other block ends in spoken output.

---

## What you need

| Requirement | Why | Check |
|---|---|---|
| Node 22.5+ | API uses the built-in `node:sqlite` | `node -v` |
| Python 3.10+ | local speech recognition | `python --version` |
| Ollama + a 7B instruct model | examiner / lesson writer | `ollama list` |
| Chrome or Edge | MediaRecorder + speech synthesis | — |
| Microphone + **headphones** | echo ruins ASR accuracy | — |

The default model is `qwen2.5:7b` (already installed on this machine). `qwen2.5:3b` works too, with weaker
feedback.

---

## Install (once)

```powershell
cd C:\Users\moham\english-coach
npm install

cd services\asr
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

The first transcription downloads the Whisper `small.en` model (~480 MB) into
`C:\Users\moham\.cache\huggingface`. It is cached after that.

## Run

```powershell
cd C:\Users\moham\english-coach
.\start.ps1
```

That opens three things:

| Service | Port | Purpose |
|---|---|---|
| ASR | 8756 | faster-whisper, word-level timestamps |
| API | 8787 | lessons, grading, progress, SQLite |
| Web | 5173 | the app (opens in your browser) |

Manual start, if you prefer separate terminals:

```powershell
# terminal 1 — speech
cd services\asr
.\.venv\Scripts\python.exe -m uvicorn app:app --host 127.0.0.1 --port 8756

# terminal 2 — everything else (API + web)
cd C:\Users\moham\english-coach
npm run dev
```

Then open <http://localhost:5173>.

Optional, while both servers run: `npm run smoke` drives the UI in system Edge/Chrome and fails on console
errors or broken navigation. It is read-only — it does not submit the diagnostic or create a session.

---

## First run

1. The app opens on the **placement check**: 6 listening questions, 6 reading questions, one 90-second speaking
   task, one 120–180 word writing task (~35 min).
2. It grades each skill separately and sets your starting level per skill. Reading at B1 and speaking at A2 is
   normal and expected.
3. Day 1 is already written and cached. Every later lesson is written by the local model the first time you open it
   (about 2–5 minutes, several short model calls), then cached in `content/lessons/`.

---

## The daily session

| Block | Min | What you actually do |
|---|---|---|
| Warm-up + spoken review | 5 | Say six target chunks, then answer one easy question aloud |
| Listening + shadowing | 10 | Natural-speed dialogue → main idea → details → repeat sentences and compare to the transcript |
| **Speaking** | 20 | 3 guided answers → 1 long turn (60–120 s) → pronunciation drill with word-level scoring |
| Reading + retell | 8 | Graded article → questions → retell it aloud in 60 s |
| Writing + feedback | 7 | Short timed task → examiner corrections → upgraded version |
| Wrap-up | 3 | Scores saved, chunks queued for spaced review, streak updated |

Nothing can be completed by typing. If the microphone or recogniser is unavailable, the app says so and offers a
typed fallback rather than silently faking a speaking score.

---

## How scoring works

**Measured, then judged.** Whisper gives word timings, so the app computes objective numbers first:

- speech rate (WPM) and speech span
- pauses ≥ 0.7 s and ≥ 1.2 s
- filler density (*um, uh, like, you know*)
- repetitions and self-corrections
- unique-word ratio
- for shadowing/pronunciation tasks: word-level match against the target sentence, with the missed words listed

The local examiner (`qwen2.5:7b`) then scores four axes — fluency, lexis, grammar, pronunciation — against
CEFR/IELTS-style descriptors, quoting your exact words as evidence and returning strict JSON. It must give **two
fixes, one model answer and three reusable chunks**, never a wall of text.

If Ollama is offline, the app still reports the measured data and says clearly that the AI layer was skipped.

**Honest limitations:**

- Pronunciation scoring from transcripts is approximate: it reliably catches word-level errors, endings and
  fluency problems, not subtle vowel quality. That is why dedicated minimal-pair and word-stress drills exist.
- Bands are estimates for tracking, not official IELTS results.
- 7B models are decent examiners but can be inconsistent. Task scores from one session should be read as a trend,
  not a verdict.

---

## Progress data

Everything lives in this folder:

```
data/coach.db          SQLite: sessions, attempts, errors, vocab, SRS schedule
data/audio/            your recorded answers (webm)
content/lessons/       cached lesson JSON (delete one to have it rewritten)
```

The **Progress** page shows per-skill trends, recurring errors (built from the examiner's fixes), totals, and
recent sessions. The **Review** page is spoken recall with SM-2 scheduling — you say the chunk before revealing
the meaning.

---

## Curriculum

24 weeks × 5 sessions, six phases:

| Weeks | Phase | Level | Focus |
|---|---|---|---|
| 1–4 | Foundation | A2 → A2+ | tenses, high-frequency chunks, 60–90 s answers |
| 5–12 | Build | A2+ → B1 | narrative, conditionals, opinions, connected speech |
| 13–18 | Push | B1 → B1+ | abstract topics, hedging, natural intonation |
| 19–24 | Consolidate | B1+ → B2 | argumentation, paraphrase, IELTS-style long turns |

Topics rotate across tech/AI, travel, business, health, entertainment, science/news and IELTS frequency topics
(environment, education, urbanisation, technology, work). Explanations are in English only, written just above
your current level.

### Reality check on the goal

From A2, solid B2 at 45–60 min/day takes roughly **6–8 months of consistent days**. IELTS **band 8.5** is a
multi-year project from A2 (C1+/C2 in all four skills). The app is built to make B2 real first; the IELTS phase
targets **7.0–7.5** as the first serious exam milestone, with 8.5 as the long-range stretch. Skipping straight to
8.5 training from A2 produces frustration, not fluency.

---

## Configuration

Set environment variables before starting the API:

| Variable | Default | Effect |
|---|---|---|
| `OLLAMA_MODEL` | `qwen2.5:7b` | examiner model |
| `OLLAMA_GEN_MODEL` | same | lesson writer model |
| `OLLAMA_URL` | `http://127.0.0.1:11434` | Ollama endpoint |
| `ASR_URL` | `http://127.0.0.1:8756` | speech service |
| `WHISPER_MODEL` | `small.en` | `base.en` faster, `medium.en` more accurate |
| `WHISPER_DEVICE` | `cpu` | `cuda` if you have the CUDA libs for CTranslate2 |
| `PORT` | `8787` | API port |

Memory note: 8 GB RAM + 7B model + Whisper can contend. If grading stutters, use
`OLLAMA_MODEL=qwen2.5:3b` for chat and keep 7B for lessons, or `WHISPER_MODEL=base.en`.

---

## Troubleshooting

**"Speech recognition offline"** — the ASR service is not running or still loading its model. Check
<http://127.0.0.1:8756/health>. First start takes 10–40 s.

**"AI examiner offline"** — `ollama serve` is not running or the model is missing. `ollama list`, then
`ollama pull qwen2.5:7b`.

**Microphone blocked** — click the padlock in the address bar → allow microphone for `localhost`. The app must be
opened via `http://localhost:5173`, not a file path.

**Lesson generation fails** — the model returned invalid JSON twice. Delete the partial file if one exists and
retry; or open an earlier lesson. The prompt and validator live in `apps/api/src/content.js` and `ai.js`.

**Port already in use** — another process is on 5173/8787/8756. Close it, or set `PORT` (API) and update
`apps/web/vite.config.ts` proxy.

---

## Project layout

```
apps/web            React + Vite UI (Today, Session, Diagnostic, Progress, Library, Review, Settings)
apps/api            Fastify + node:sqlite; lesson cache, grading, SRS, progress
services/asr        FastAPI + faster-whisper (word timestamps)
content/lessons     cached lessons
data                SQLite database + your recordings
```

---

## What is intentionally not built yet

- The IELTS phase (weeks 25–36, full mocks, Task 1 graphs) — the content schema already supports it.
- Pitch/intonation analysis for pronunciation.
- Audio export and spaced-repetition audio shadowing.
- Desktop packaging (Tauri) and PWA install.
- Multi-user accounts. This is a one-learner app by design.
