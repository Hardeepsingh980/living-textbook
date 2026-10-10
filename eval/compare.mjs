#!/usr/bin/env node
// Compare two judge rounds: node eval/compare.mjs eval/output/<a>/shots/judgements.json eval/output/<b>/shots/judgements.json
import fs from 'node:fs/promises';
const [a, b] = process.argv.slice(2);
if (!a || !b) { console.error('usage: compare.mjs <judgements A> <judgements B>'); process.exit(1); }
const A = JSON.parse(await fs.readFile(a, 'utf8')), B = JSON.parse(await fs.readFile(b, 'utf8'));
const keys = ['concept_clarity', 'placement', 'readability', 'liveliness', 'correctness', 'narration', 'overall'];
const byTitle = (rows) => Object.fromEntries(rows.map((r) => [r.title, r]));
const ba = byTitle(A), bb = byTitle(B);
const titles = [...new Set([...Object.keys(ba), ...Object.keys(bb)])];
const avg = (rows, k) => { const v = rows.filter((r) => typeof r[k] === 'number').map((r) => r[k]); return v.length ? v.reduce((x, y) => x + y, 0) / v.length : NaN; };
console.log(`| Page | ${keys.map((k) => `${k} A→B`).join(' | ')} | verdict A→B |`);
console.log(`|---|${keys.map(() => '---').join('|')}|---|`);
for (const t of titles) { const x = ba[t] ?? {}, y = bb[t] ?? {}; console.log(`| ${t} | ${keys.map((k) => `${x[k] ?? '–'}→${y[k] ?? '–'}`).join(' | ')} | ${x.verdict ?? '–'}→${y.verdict ?? '–'} |`); }
console.log(`| **Average** | ${keys.map((k) => `${avg(A, k).toFixed(1)}→${avg(B, k).toFixed(1)}`).join(' | ')} | |`);
