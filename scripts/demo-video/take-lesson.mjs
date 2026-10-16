// The main take, in one continuous recording of the real app (signed in as the local test reader "demo"): the
// dashboard, a photo of a page uploaded, Gemini building the lesson with "How it was made" open, the reveal, the
// Gemini Live tutor narrating, a student's spoken question (a simulated microphone plays it), the what-if at the
// end of the lesson, then the quiz.
//   node scripts/demo-video/take-lesson.mjs <server> <page.jpg> <question-mic.wav> <out dir>
import fs from 'node:fs';
import path from 'node:path';
import { PW, startCapture, sleep } from './capture-lib.mjs';
const { chromium } = await import(PW);

const [server, pagePath, micWav, out] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required',
    '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${path.resolve(micWav)}%noloop`],
});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 810 }, deviceScaleFactor: 4 / 3, permissions: ['microphone', 'camera'] });
await ctx.addInitScript(() => { try { localStorage.setItem('lb.devUser', 'demo'); } catch {} window.__captureLive = true; });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${server}/app`, { waitUntil: 'load' });
await page.waitForSelector('.start-card', { timeout: 20000 });
await sleep(1500);

const cap = await startCapture(page, path.join(out, 'frames'));
const timeOrigin = await page.evaluate(() => performance.timeOrigin);
const state = () => page.evaluate(() => {
  const exp = document.querySelector('.experience');
  return {
    cls: exp?.className ?? '',
    caption: document.querySelector('.caption')?.textContent ?? '',
    step: [...document.querySelectorAll('.dots span')].findIndex((s) => s.classList.contains('on')),
    pill: document.querySelector('.pill.tutor')?.textContent ?? '',
    knob: !!document.querySelector('.knob-panel'),
    theatre: !!document.querySelector('.theatre-dock'),
  };
}).catch(() => null);
const trace = [];
let last = '';
const poll = async (ms) => {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    const s = await state();
    const key = JSON.stringify(s);
    if (s && key !== last) { trace.push({ t: Date.now(), ...s }); last = key; }
    await sleep(300);
  }
};

await poll(1200);
cap.mark('upload');
await page.setInputFiles('.start-card input[type=file]', pagePath);
await page.waitForSelector('.experience', { timeout: 20000 });
await sleep(1500);
await page.click('.spark-button').catch(() => {}); // open "How it was made"
cap.mark('theatre-open');
// until the lesson shows
for (let i = 0; i < 120; i++) { await poll(500); if ((await state())?.cls.includes('revealed')) break; }
cap.mark('revealed');
await poll(2500);
if ((await state())?.theatre) { await page.click('.spark-button').catch(() => {}); cap.mark('theatre-closed'); }
// the lesson: narration, the question (simulated microphone), the end of the lesson and the what-if
let sawKnob = false, knobGoneAt = 0;
const lessonUntil = Date.now() + 170_000;
while (Date.now() < lessonUntil) {
  await poll(1000);
  const s = await state();
  if (s?.knob && !sawKnob) { sawKnob = true; cap.mark('knob'); }
  if (sawKnob && !s?.knob && !knobGoneAt) knobGoneAt = Date.now();
  if (sawKnob && /question|try|explore|ask/i.test(s?.caption ?? '') && /\?/.test(s?.caption ?? '') && s?.pill && !/Thinking|Changing/.test(s.pill)) { await poll(4000); break; }
}
cap.mark('lesson-done');
// the quiz: the right answer twice, then one wrong, then the score
const id = await page.evaluate(() => location.pathname.split('/').pop());
const quiz = await fetch(`${server}/api/experiences/${id}/quiz`).then((r) => r.json()).catch(() => null);
await page.click('.quiz-pill');
cap.mark('quiz-open');
await page.waitForSelector('.quiz-option', { timeout: 30000 }).catch(() => {});
await poll(1500);
const qs = quiz?.questions ?? [];
for (let k = 0; k < Math.min(3, qs.length); k++) {
  const pick = k === 2 ? (qs[k].answer + 1) % 4 : qs[k].answer;
  await page.locator('.quiz-option').nth(pick).click().catch(() => {});
  cap.mark('quiz-answer', { k, right: pick === qs[k].answer });
  await poll(2600);
  await page.locator('.quiz-card button.primary').last().click().catch(() => {});
  await poll(900);
}
for (let k = 3; k < qs.length; k++) {
  await page.locator('.quiz-option').nth(qs[k].answer).click().catch(() => {});
  await poll(1500);
  await page.locator('.quiz-card button.primary').last().click().catch(() => {});
  await poll(800);
}
cap.mark('quiz-score');
await poll(3500);
const live = await page.evaluate(() => (window.__liveAudio ?? []).slice());
const micStartedAt = await page.evaluate(() => window.__micStartedAt ?? null);
const res = await cap.stop();
fs.writeFileSync(path.join(out, 'take.json'), JSON.stringify({ lessonId: id, timeOrigin, micStartedAt, frames: res.frames, events: res.events, trace, errors }, null, 1));
fs.writeFileSync(path.join(out, 'live.json'), JSON.stringify(live));
console.log(`lesson ${id}: ${res.frames.length} frames over ${((res.frames.at(-1).t - res.frames[0].t) / 1000).toFixed(0)} s, ${live.length} voice chunks, mic at ${micStartedAt ? Math.round(timeOrigin + micStartedAt - res.frames[0].t) : '-'} ms, errors ${errors.length}`);
console.log(JSON.stringify(res.events.map((e) => [e.name, Math.round((e.t - res.frames[0].t) / 100) / 10])));
await browser.close();
