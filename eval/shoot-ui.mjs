#!/usr/bin/env node
// Screenshots of the app's own chrome (scan screen, experience with controls, library) at phone size, for design review.
//   node eval/shoot-ui.mjs --server http://localhost:8080 --id <experienceId> --out eval/output/ui
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
const args = Object.fromEntries(process.argv.slice(2).map((a, i, arr) => (a.startsWith('--') ? [a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true] : [])).filter(Boolean));
const SERVER = args.server || 'http://localhost:8080';
const OUT = path.resolve(String(args.out || 'eval/output/ui'));
await fs.mkdir(OUT, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 430, height: 860 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const shots = [['landing', '/', 1500], ['scan-camera', '/scan?sim=1', 3500], ['library', '/library', 2500]];
if (args.id) shots.push(['experience', `/x/${args.id}`, 6000], ['experience-late', `/x/${args.id}`, 16000], ['theatre', `/x/${args.id}`, 5000], ['sheet', `/x/${args.id}`, 5000]);
const click = async (name) => { const btn = page.getByRole('button', { name }); if (await btn.count()) { await btn.first().click(); await page.waitForTimeout(600); } };
for (const [name, url, wait] of shots) {
  await page.goto(`${SERVER}${url}`, { waitUntil: 'load' });
  await page.waitForTimeout(wait);
  if (name === 'scan-camera') await page.waitForTimeout(500);
  if (name === 'experience-late') await click('What if?');
  if (name === 'theatre') await click('How it was made');
  if (name === 'sheet') { const seal = page.locator('.seal'); if (await seal.count()) { await seal.first().click(); await page.waitForTimeout(600); } }
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  console.log(`${name}: ${url}`);
}
await browser.close();
