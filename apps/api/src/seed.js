/**
 * Pre-generate lessons so sessions start instantly.
 *
 *   npm run seed                 # the next 10 unbuilt lessons
 *   npm run seed -- --count 30   # a wider buffer
 *   npm run seed -- --from w02d1 --to w04d5
 *   npm run seed -- --all        # everything (slow: hours)
 *
 * Generation is local (Ollama). Existing lesson files are skipped.
 */
import { CURRICULUM, loadLesson, lessonExists } from './content.js';

const argv = process.argv.slice(2);
const getArg = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};

const all = argv.includes('--all');
const count = Number(getArg('count') || 10);
const from = getArg('from');
const to = getArg('to');

let queue = CURRICULUM;
if (from) {
  const start = CURRICULUM.findIndex((s) => s.id === from);
  const end = to ? CURRICULUM.findIndex((s) => s.id === to) : CURRICULUM.length - 1;
  queue = CURRICULUM.slice(start === -1 ? 0 : start, end === -1 ? undefined : end + 1);
}

const pending = [];
for (const spec of queue) {
  if (await lessonExists(spec.id)) continue;
  pending.push(spec);
  if (!all && pending.length >= count) break;
}

console.log(`${pending.length} lesson(s) to generate.`);

let ok = 0;
let failed = 0;
const startedAt = Date.now();

for (const [index, spec] of pending.entries()) {
  const label = `[${index + 1}/${pending.length}] ${spec.id} · ${spec.topic}`;
  console.log(`\n${label}`);
  try {
    await loadLesson(spec.id, {
      generate: true,
      onProgress: (message) => console.log(`   ${message}`),
    });
    ok++;
  } catch (err) {
    failed++;
    console.error(`   FAILED: ${err.message}`);
    console.error('   (Re-run later; failed lessons are not cached.)');
  }
  const elapsed = Math.round((Date.now() - startedAt) / 1000);
  console.log(`   ${ok} ok · ${failed} failed · ${elapsed}s elapsed`);
}

console.log(`\nDone. ${ok} generated, ${failed} failed.`);
process.exit(failed && !ok ? 1 : 0);
