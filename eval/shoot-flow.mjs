#!/usr/bin/env node
// Drive the whole flow with the simulated camera and record what the reader sees at fixed moments:
//   node eval/shoot-flow.mjs --server http://localhost:8080 --out eval/output/flow
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
const args = Object.fromEntries(process.argv.slice(2).map((a, i, arr) => (a.startsWith('--') ? [a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true] : [])).filter(Boolean));
const SERVER = args.server || 'http://localhost:8080';
const OUT = path.resolve(String(args.out || 'eval/output/flow'));
await fs.mkdir(OUT, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: 430, height: 860 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.message)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)); });
await page.goto(`${SERVER}/scan?sim=1`, { waitUntil: 'load' });
await page.waitForTimeout(3500);
const t0 = Date.now();
await page.getByRole('button', { name: 'Bring it to life' }).click();
const MOMENTS = [800, 3000, 6000, 9000, 12000, 15000, 18000, 22000, 28000, 36000];
const log = [];
for (const at of MOMENTS) {
  const wait = at - (Date.now() - t0); if (wait > 0) await page.waitForTimeout(wait);
  const st = await page.evaluate(() => {
    const x = document.querySelector('.experience'); const pill = document.querySelector('.title-pill > span:last-child'); const cap = document.querySelector('.caption');
    const canv = [...document.querySelectorAll('.page-canvas')].map((c) => (c.className.includes('active') ? 'on' : 'off')).join('/');
    return { cls: x?.className ?? '(capture)', pill: pill?.textContent ?? '', caption: cap?.textContent?.slice(0, 60) ?? '', canvases: canv, assets: document.documentElement.dataset.assetsReady ?? '' };
  });
  const name = `t${String(Math.round(at / 1000)).padStart(2, '0')}s`;
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  log.push({ at, ...st });
  console.log(`${name}: ${st.cls} | ${st.pill} | canvases ${st.canvases} | ${st.caption}`);
}
await fs.writeFile(path.join(OUT, 'flow.json'), JSON.stringify({ log, errors, url: page.url() }, null, 1));
console.log('url', page.url(), '| errors:', errors.slice(0, 5).join(' || ') || 'none');
await browser.close();
