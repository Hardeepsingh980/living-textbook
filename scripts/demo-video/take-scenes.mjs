// The other takes for the demo video, each its own recording of the real app:
//   quiz      the pendulum lesson's quiz (answers chosen by their text: the sheet shuffles options)
//   warmup    two other lessons played and quizzed as the reader (no recording), so progress has real data
//   progress  the dashboard, then the progress page
//   films     the library's films, then the chapter film playing on its page
//   home      the landing page, signed out
//   dev       the developer docs, then a partner page (another origin) with the lesson player and the scanner
//   node scripts/demo-video/take-scenes.mjs <server> <out dir> <scene,...> [key=value ...]
import fs from 'node:fs';
import path from 'node:path';
import { PW, startCapture, framesToVideo, sleep } from './capture-lib.mjs';
const { chromium } = await import(PW);

const [server, out, which, ...kv] = process.argv.slice(2);
const opt = Object.fromEntries(kv.map((s) => s.split('=')));
const scenes = which.split(',');
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
async function context(signedIn) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 810 }, deviceScaleFactor: 4 / 3, permissions: ['microphone'] });
  if (signedIn) await ctx.addInitScript(() => { try { localStorage.setItem('lb.devUser', 'demo'); localStorage.setItem('lb.devUserName', 'Asha'); } catch {} });
  return ctx;
}
async function record(name, page, fn) {
  const dir = path.join(out, name);
  const cap = await startCapture(page, path.join(dir, 'frames'));
  await fn(cap);
  const res = await cap.stop();
  fs.writeFileSync(path.join(dir, 'take.json'), JSON.stringify({ frames: res.frames, events: res.events }, null, 1));
  framesToVideo(res.frames, path.join(dir, 'take.mp4'), { fps: 30 });
  console.log(`${name}: ${res.frames.length} frames, ${((res.frames.at(-1).t - res.frames[0].t) / 1000).toFixed(1)} s, events ${JSON.stringify(res.events.map((e) => [e.name, Math.round((e.t - res.frames[0].t) / 100) / 10]))}`);
}
/** Answer a quiz in the sheet: `plan` lists, per question, whether to choose the right option. */
async function answerQuiz(page, quiz, plan, cap) {
  await page.waitForSelector('.quiz-option', { timeout: 40000 });
  await sleep(1200);
  for (let k = 0; k < quiz.questions.length; k++) {
    const q = await page.locator('.quiz-q').textContent();
    const data = quiz.questions.find((x) => x.q.trim() === (q ?? '').trim()) ?? quiz.questions[k];
    const right = data.options[data.answer];
    const wrong = data.options.find((o, i) => i !== data.answer);
    const choose = plan[k] === false ? wrong : right;
    await page.locator('.quiz-option', { hasText: choose }).first().click();
    cap?.mark('answer', { k, right: plan[k] !== false });
    await sleep(plan[k] === false ? 3600 : 2200);
    await page.locator('.quiz-card button.primary').last().click();
    await sleep(900);
  }
  cap?.mark('score');
}
const quizOf = (id) => fetch(`${server}/api/experiences/${id}/quiz`).then((r) => r.json());

for (const scene of scenes) {
  if (scene === 'quiz') {
    const ctx = await context(true); const page = await ctx.newPage();
    const quiz = await quizOf(opt.lesson);
    await page.goto(`${server}/x/${opt.lesson}`, { waitUntil: 'load' });
    await page.waitForSelector('.experience.revealed', { timeout: 40000 });
    await sleep(9000);
    await record('quiz', page, async (cap) => {
      await sleep(1500);
      await page.click('.quiz-pill'); cap.mark('open');
      await answerQuiz(page, quiz, [true, true, false, true], cap);
      await sleep(3500);
    });
    await ctx.close();
  }
  if (scene === 'warmup') {
    const ctx = await context(true);
    for (const id of opt.warm.split('+')) {
      const page = await ctx.newPage();
      const quiz = await quizOf(id);
      await page.goto(`${server}/x/${id}`, { waitUntil: 'load' });
      await page.waitForSelector('.experience.revealed', { timeout: 40000 });
      await sleep(25000);
      await page.click('.quiz-pill');
      await answerQuiz(page, quiz, quiz.questions.map((_, i) => i !== 1), null);
      await sleep(1500);
      await page.close();
      console.log('warmed', id);
    }
    await ctx.close();
  }
  if (scene === 'progress') {
    const ctx = await context(true); const page = await ctx.newPage();
    await page.goto(`${server}/app`, { waitUntil: 'load' });
    await page.waitForSelector('.lesson-tile', { timeout: 30000 });
    await sleep(2500);
    await record('progress', page, async (cap) => {
      await sleep(3500);
      await page.evaluate(() => document.querySelector('.app-main')?.scrollTo({ top: 420, behavior: 'smooth' }));
      await sleep(2500);
      await page.click('a[href="/app/progress"]'); cap.mark('progress');
      await page.waitForSelector('.tile', { timeout: 30000 }).catch(() => {});
      await sleep(3500);
      await page.evaluate(() => document.querySelector('.app-main')?.scrollTo({ top: 520, behavior: 'smooth' }));
      await sleep(4000);
      await page.evaluate(() => document.querySelector('.app-main')?.scrollTo({ top: 1000, behavior: 'smooth' }));
      await sleep(3500);
    });
    await ctx.close();
  }
  if (scene === 'films') {
    const ctx = await context(true); const page = await ctx.newPage();
    await page.goto(`${server}/app/library?tab=films`, { waitUntil: 'load' });
    await sleep(3000);
    await record('films', page, async (cap) => {
      await sleep(2500);
      await page.goto(`${server}/app/jobs/${opt.chapter}`, { waitUntil: 'load' }); cap.mark('job');
      await page.waitForSelector('video', { timeout: 30000 });
      await page.evaluate(() => { const v = document.querySelector('video'); if (v) { v.muted = true; v.currentTime = 40; void v.play(); } });
      await sleep(9000);
      await page.goto(`${server}/app/jobs/${opt.short}`, { waitUntil: 'load' }); cap.mark('short');
      await page.waitForSelector('video', { timeout: 30000 });
      await page.evaluate(() => { const v = document.querySelector('video'); if (v) { v.muted = true; v.currentTime = 6; void v.play(); } });
      await sleep(7000);
    });
    await ctx.close();
  }
  if (scene === 'home') {
    const ctx = await context(false); const page = await ctx.newPage();
    await page.goto(`${server}/`, { waitUntil: 'load' });
    await sleep(4000);
    await record('home', page, async (cap) => {
      await sleep(3500);
      await page.hover('.hero-actions .primary.big').catch(() => {});
      await sleep(1500);
      await page.evaluate(() => document.querySelector('.home')?.scrollTo({ top: 760, behavior: 'smooth' }));
      await sleep(3000);
      await page.evaluate(() => document.querySelector('.home')?.scrollTo({ top: 0, behavior: 'smooth' }));
      await sleep(2500);
    });
    await ctx.close();
  }
  if (scene === 'dev') {
    const ctx = await context(true); const page = await ctx.newPage();
    await page.goto(`${server}/developers`, { waitUntil: 'load' });
    await sleep(2500);
    await record('dev', page, async (cap) => {
      await sleep(2500);
      await page.evaluate(() => document.getElementById('quickstart')?.scrollIntoView({ behavior: 'smooth' }));
      await sleep(3500);
      await page.goto(opt.partner, { waitUntil: 'load' }); cap.mark('partner');
      await page.waitForFunction(() => (window.__events ?? []).some((e) => e.startsWith('lesson ready')), null, { timeout: 40000 }).catch(() => {});
      await sleep(6000);
      await page.click('#scan').catch(() => {}); cap.mark('scanner');
      await sleep(5000);
    });
    await ctx.close();
  }
}
await browser.close();
