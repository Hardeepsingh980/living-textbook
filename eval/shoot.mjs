#!/usr/bin/env node
// Render each experience in the web app's review mode (no chrome, muted, looping) with headless Chromium and save
// screenshots at a few moments, so the visual judge and humans can see what a reader sees.
//
//   node eval/shoot.mjs --server http://localhost:8080 --ids <id1,id2,...> --out eval/output/shots
//   node eval/shoot.mjs --server http://localhost:8080 --from eval/output/<stamp>   (ids from results.json)
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const args = Object.fromEntries(process.argv.slice(2).map((a, i, arr) => (a.startsWith('--') ? [a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true] : [])).filter(Boolean));
const SERVER = args.server || 'http://localhost:8080';
const OUT = path.resolve(String(args.out || 'eval/output/shots'));
await fs.mkdir(OUT, { recursive: true });
let ids = args.ids ? String(args.ids).split(',') : [];
if (args.from) { const res = JSON.parse(await fs.readFile(path.join(String(args.from), 'results.json'), 'utf8')); ids = res.map((r) => r.id).filter(Boolean); }
if (!ids.length) { console.error('no ids'); process.exit(1); }

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 430, height: 860 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const MOMENTS = [2500, 7000, 14000];
for (const id of ids) {
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message)));
  await page.goto(`${SERVER}/x/${id}?review=1`, { waitUntil: 'load' });
  // wait until the renderer has every generated picture (keyed and uploaded) before the first shot
  await page.waitForFunction(() => document.documentElement.dataset.assetsReady === '1', null, { timeout: 12000 }).catch(() => errors.push('assets not ready in 12 s'));
  let last = 0;
  for (let i = 0; i < MOMENTS.length; i++) { await page.waitForTimeout(MOMENTS[i] - last); last = MOMENTS[i]; await page.screenshot({ path: path.join(OUT, `${id}-${i + 1}.png`) }); }
  console.log(`${id}: ${MOMENTS.length} shots${errors.length ? `, page errors: ${errors.slice(0, 2).join(' | ')}` : ''}`);
  await page.close();
}
await browser.close();
console.log(`shots in ${OUT}`);
