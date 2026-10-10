#!/usr/bin/env node
// Visual judge: rates rendered screenshots of each experience (and its scene JSON) with Gemini on concept clarity,
// placement, readability, liveliness and correctness, so the whole generation is evaluated, not only the numbers.
//
//   node eval/judge.mjs --shots eval/output/<stamp>/shots --server http://localhost:8080
//
// Expects shots named <experienceId>-<n>.png (from eval/shoot.mjs or the browser pane) and reads each experience
// record from the server. Appends a "Generation quality" section to eval/REPORT.md.
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { GoogleGenAI } from '@google/genai';
import { OAuth2Client } from 'google-auth-library';

const args = Object.fromEntries(process.argv.slice(2).map((a, i, arr) => (a.startsWith('--') ? [a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true] : [])).filter(Boolean));
const SERVER = args.server || 'http://localhost:8080';
const SHOTS = path.resolve(String(args.shots || 'eval/output/shots'));
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname));

const authClient = new OAuth2Client();
authClient.setCredentials({ access_token: execFileSync('gcloud', ['auth', 'print-access-token']).toString().trim() });
const ai = new GoogleGenAI({ vertexai: true, project: process.env.GCP_PROJECT || 'cheerio-app', location: 'global', googleAuthOptions: { authClient } });

const RUBRIC = `You are reviewing an augmented-reality learning experience generated automatically from a photographed book page.
You see: (1) the original page, (2) one or more screenshots of the animated overlay rendered on top of that page at different moments, and (3) the scene JSON and narration.
Score each criterion from 1 (bad) to 5 (excellent) and justify in one sentence each:
- concept_clarity: would a 12-year-old understand the page's main idea better because of this overlay? Does the motion show the concept (not just decorate)?
- placement: are elements on or beside the figure they explain, inside the page, not covering body text, sized sensibly?
- readability: labels large, few words, not overlapping, consistent style?
- liveliness: is something clearly moving/changing in a meaningful way, continuously?
- correctness: numbers, formulas, names, events and dialogue match the page; nothing invented?
- narration: short, warm, child-safe, matches what is shown, in the page's language?
Then give "overall" (1-5), the single most important "fix" (one sentence, concrete), and "verdict": "ship" | "improve" | "redo".
Return JSON only: {"concept_clarity":n,"placement":n,"readability":n,"liveliness":n,"correctness":n,"narration":n,"overall":n,"notes":{"concept_clarity":"...","placement":"...","readability":"...","liveliness":"...","correctness":"...","narration":"..."},"fix":"...","verdict":"..."}`;

async function judge(rec, shotFiles) {
  const parts = [];
  const page = await fetch(`${SERVER}${rec.page.imageUrl}`).then((r) => r.arrayBuffer());
  parts.push({ text: 'ORIGINAL PAGE:' }, { inlineData: { data: Buffer.from(page).toString('base64'), mimeType: 'image/jpeg' } });
  for (const f of shotFiles) { parts.push({ text: `OVERLAY SCREENSHOT ${path.basename(f)}:` }, { inlineData: { data: (await fs.readFile(f)).toString('base64'), mimeType: f.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg' } }); }
  const sc = rec.scene;
  parts.push({ text: `SCENE JSON (abridged): ${JSON.stringify({ kind: sc.kind, vars: sc.vars, derived: sc.derived, elements: sc.elements.map((e) => ({ id: e.id, type: e.type, x: e.x, y: e.y, w: e.w, h: e.h, anchor: e.anchor, text: e.text, anim: e.anim?.length })), steps: sc.steps, lines: sc.audio?.lines })}\nNARRATION CLIPS: ${JSON.stringify(rec.audio.map((a) => ({ kind: a.kind, text: a.text, seconds: Math.round(a.durationMs / 1000) })))}\nVERIFICATION: ${JSON.stringify(rec.verification?.status)} ${rec.verification?.summary ?? ''}` });
  parts.push({ text: RUBRIC });
  const res = await ai.models.generateContent({ model: 'gemini-3.8-flash', contents: [{ role: 'user', parts }], config: { responseMimeType: 'application/json', thinkingConfig: { thinkingLevel: 'LOW' }, temperature: 0.2, maxOutputTokens: 1500 } });
  const text = res.text ?? '';
  const start = text.indexOf('{'), end = text.lastIndexOf('}');
  return JSON.parse(text.slice(start, end + 1));
}

const files = (await fs.readdir(SHOTS).catch(() => [])).filter((f) => /\.(png|jpe?g)$/i.test(f));
const byId = new Map();
for (const f of files) { const id = f.replace(/-\d+\.(png|jpe?g)$/i, ''); if (!byId.has(id)) byId.set(id, []); byId.get(id).push(path.join(SHOTS, f)); }
if (!byId.size) { console.error(`no screenshots in ${SHOTS}`); process.exit(1); }
const rows = [];
for (const [id, shots] of byId) {
  const rec = await fetch(`${SERVER}/api/experiences/${id}`).then((r) => r.json());
  process.stdout.write(`${rec.quick?.title ?? id} … `);
  try { const j = await judge(rec, shots.sort()); rows.push({ id, title: rec.quick?.title, kind: rec.quick?.kind, ...j }); console.log(`overall ${j.overall} (${j.verdict}) — ${j.fix}`); }
  catch (e) { console.log('judge failed', e.message); rows.push({ id, title: rec.quick?.title, kind: rec.quick?.kind, error: e.message }); }
}
const avg = (k) => { const v = rows.filter((r) => typeof r[k] === 'number').map((r) => r[k]); return v.length ? (v.reduce((a, b) => a + b, 0) / v.length).toFixed(1) : '–'; };
let md = `\n## Generation quality (visual judge, ${new Date().toISOString()})\n\nGemini 3.8 Flash rated the page + overlay screenshots + scene JSON on a 1–5 scale.\n\n| Page | Kind | Clarity | Placement | Readability | Liveliness | Correctness | Narration | Overall | Verdict | Most important fix |\n|---|---|---|---|---|---|---|---|---|---|---|\n`;
for (const r of rows) md += r.error ? `| ${r.title} | ${r.kind} | – | – | – | – | – | – | – | error | ${r.error.slice(0, 80)} |\n` : `| ${r.title} | ${r.kind} | ${r.concept_clarity} | ${r.placement} | ${r.readability} | ${r.liveliness} | ${r.correctness} | ${r.narration} | **${r.overall}** | ${r.verdict} | ${r.fix} |\n`;
md += `| **Average** | | ${avg('concept_clarity')} | ${avg('placement')} | ${avg('readability')} | ${avg('liveliness')} | ${avg('correctness')} | ${avg('narration')} | **${avg('overall')}** | | |\n\n`;
for (const r of rows.filter((r) => !r.error)) md += `<details><summary>${r.title}</summary>\n\n${Object.entries(r.notes ?? {}).map(([k, v]) => `- **${k}**: ${v}`).join('\n')}\n\n</details>\n\n`;
await fs.appendFile(path.join(root, 'REPORT.md'), md);
await fs.writeFile(path.join(SHOTS, 'judgements.json'), JSON.stringify(rows, null, 1));
console.log('appended to eval/REPORT.md');
