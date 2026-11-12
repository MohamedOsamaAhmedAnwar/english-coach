/**
 * Read-only UI smoke test.
 *
 *   node scripts/smoke.mjs
 *
 * Uses the system Edge/Chrome via playwright-core (no browser download).
 * It navigates the app, records console errors, and fails on runtime exceptions.
 * It does NOT submit the diagnostic or create sessions, so your data is untouched.
 */
import { chromium } from 'playwright-core';

const BASE = process.env.SMOKE_URL || 'http://127.0.0.1:5173';
const executablePath =
  process.env.BROWSER_PATH ||
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

const errors = [];
const warnings = [];

const API = process.env.SMOKE_API || 'http://127.0.0.1:8787';

// The app may be fresh (diagnostic pending) or already in use (levels set).
// Read the real state so the test adapts instead of assuming a fresh profile.
let diagnosticDone = false;
try {
  const state = await (await fetch(`${API}/api/state`)).json();
  diagnosticDone = Boolean(state?.levels && Object.keys(state.levels).length);
} catch {
  // If the API is unreachable the dashboard steps will fail with clear errors anyway.
}

const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: [
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    '--autoplay-policy=no-user-gesture-required',
  ],
});

const context = await browser.newContext({
  viewport: { width: 1360, height: 900 },
  permissions: ['microphone'],
});

const page = await context.newPage();

page.on('console', (msg) => {
  if (msg.type() === 'error') {
    const text = msg.text();
    // React devtools noise and favicon 404s are not app bugs.
    if (/favicon|DevTools|Download the React DevTools/i.test(text)) return;
    errors.push(`console: ${text}`);
  }
  if (msg.type() === 'warning' && /Warning:/i.test(msg.text())) warnings.push(msg.text());
});
page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
page.on('response', (res) => {
  if (res.status() >= 400 && !res.url().includes('favicon')) {
    errors.push(`http ${res.status()}: ${res.url()}`);
  }
});
page.on('requestfailed', (req) => {
  if (req.url().includes('/api/')) errors.push(`request failed: ${req.url()}`);
});

const step = async (name, fn) => {
  process.stdout.write(`• ${name} … `);
  try {
    await fn();
    console.log('ok');
  } catch (err) {
    console.log('FAIL');
    errors.push(`${name}: ${err.message}`);
  }
};

try {
  await step('loads dashboard', async () => {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.getByText('Steady', { exact: false }).first().waitFor({ timeout: 20_000 });
  });

  if (diagnosticDone) {
    await step('dashboard shows today session (profile already set)', async () => {
      await page
        .getByRole('button', { name: /start today's session|resume session/i })
        .first()
        .waitFor({ timeout: 15_000 });
    });
  } else {
    await step('shows placement check intro', async () => {
      await page.getByRole('button', { name: /start the check/i }).waitFor({ timeout: 15_000 });
      const text = await page.locator('body').innerText();
      if (!/find your real starting point/i.test(text)) throw new Error('expected diagnostic intro');
    });

    await step('diagnostic section opens', async () => {
      await page.getByRole('button', { name: /start the check/i }).click();
      await page.getByRole('button', { name: /^begin/i }).waitFor({ timeout: 15_000 });
      await page.getByRole('button', { name: /begin/i }).click();
      await page.getByText(/a short conversation at a train station/i).waitFor({ timeout: 15_000 });
      const text = await page.locator('body').innerText();
      if (!/return to bristol/i.test(text)) throw new Error('listening questions missing');
    });
  }

  await step('sidebar navigation', async () => {
    for (const [label, marker] of [
      ['Progress', /Evidence, not vibes/i],
      ['Library', /120 sessions/i],
      ['Settings', /Your setup/i],
      ['Today', /Steady/i],
    ]) {
      await page.getByRole('button', { name: label, exact: true }).click();
      await page.getByText(marker).first().waitFor({ timeout: 15_000 });
    }
  });

  await step('library lists 120 lessons', async () => {
    await page.getByRole('button', { name: 'Library', exact: true }).click();
    await page.getByText(/120 sessions/i).waitFor();
    await page.locator('.lesson-card').first().waitFor({ timeout: 15_000 });
    const cards = await page.locator('.lesson-card').count();
    if (cards < 5) throw new Error(`expected lesson cards, found ${cards}`);
  });

  await step('library filters work', async () => {
    await page.getByRole('button', { name: 'Foundation', exact: true }).click();
    await page.waitForTimeout(250);
    const shown = await page.locator('.lesson-card').count();
    if (shown === 0) throw new Error('phase filter hid every lesson');
  });

  await step('review page handles queue', async () => {
    await page.getByRole('button', { name: /Review/ }).first().click();
    await page.getByText(/Review queue is clear|Spoken review/i).first().waitFor({ timeout: 15_000 });
  });

  await step('health strip renders', async () => {
    const text = await page.locator('.health-strip').first().innerText();
    if (!/ready|offline|prepared/i.test(text)) throw new Error(`unexpected health strip: ${text}`);
  });
} finally {
  await browser.close();
}

if (warnings.length) {
  console.log(`\n${warnings.length} React warning(s):`);
  for (const w of warnings.slice(0, 5)) console.log(`  - ${w.slice(0, 200)}`);
}

if (errors.length) {
  console.log(`\n${errors.length} problem(s):`);
  for (const e of errors) console.log(`  - ${e}`);
  process.exit(1);
}

console.log('\nSmoke test passed, no console errors.');
