#!/usr/bin/env node
// Living Book evaluation harness: runs every page in eval/pages through the pipeline and scores the results.
import fs from 'node:fs/promises';
import path from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).map((a, i, arr) => (a.startsWith('--') ? [a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true] : [])).filter(Boolean));
const SERVER = args.server || 'http://localhost:8080';
const RUNS = Number(args.runs || 1);
const ONLY = args.only ? String(args.only) : null;
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname));
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outDir = path.join(root, 'output', stamp);
await fs.mkdir(outDir, { recursive: true });

const pages = (await fs.readdir(path.join(root, 'pages'))).filter((f) => /\.(jpe?g|png)$/i.test(f) && (!ONLY || f.includes(ONLY)));
const results = [];

async function runPage(file) {
  const img = await fs.readFile(path.join(root, 'pages', file));
  const t0 = Date.now();
  const res = await fetch(`${SERVER}/api/experiences`, { method: 'POST', body: img, headers: { 'content-type': 'image/jpeg', 'x-owner-id': 'eval' } });
  const text = await res.text();
  const events = text.split('\n').filter((l) => l.startsWith('data: ')).map((l) => { try { return JSON.parse(l.slice(6)); } catch { return null; } }).filter((e) => e && typeof e === 'object' && e.type);
  await fs.writeFile(path.join(outDir, `${file}.events.json`), JSON.stringify(events, null, 1));
  return { events, wall: Date.now() - t0, http: res.status };
}

const norm = (s) => String(s ?? '').toLowerCase().replace(/\s+/g, ' ');
function score(file, truth, events) {
  const quick = events.find((e) => e.type === 'quick')?.data;
  const scenes = events.filter((e) => e.type === 'scene');
  const scene = scenes[scenes.length - 1]?.data;
  const extraction = events.find((e) => e.type === 'extraction')?.data;
  const verifications = events.filter((e) => e.type === 'verification'); const verification = verifications[verifications.length - 1]?.data; // the latest scene version's verdict
  const done = events.find((e) => e.type === 'done');
  const ready = events.find((e) => e.type === 'ready');
  const stageDone = (name) => events.find((e) => e.type === 'stage' && e.stage === name && e.status === 'done')?.t;
  const firstAudio = events.find((e) => e.type === 'audio')?.t;
  const firstScene = scenes[0]?.t;
  const firstQuick = events.find((e) => e.type === 'quick-partial')?.t ?? events.find((e) => e.type === 'quick')?.t;
  const sceneText = scene ? [...scene.elements.map((el) => el.text ?? ''), ...scene.steps.map((s) => `${s.narration ?? ''} ${(s.say ?? []).map((l) => l.text).join(' ')}`), ...scene.audio.lines.map((l) => l.text)].map(norm).join(' | ') : '';
  const kindOk = truth?.kind ? (quick?.kind === truth.kind || (truth.kind === 'science' && quick?.kind === 'maths')) : null;
  const langOk = truth?.language ? quick?.language === truth.language : null;
  // a key value counts as recalled if it is in the structured values or appears verbatim in the transcribed text
  const exText = norm(extraction?.text ?? '');
  const valueHits = truth?.values ? truth.values.filter((v) => (extraction?.values ?? []).some((x) => Math.abs(Number(x.value) - v.value) <= Math.abs(v.value) * 0.005 + 1e-9) || new RegExp(`(^|[^\\d.])${String(v.value).replace('.', '\\.')}([^\\d]|$)`).test(exText)).length : null;
  const workedHits = truth?.worked ? truth.worked.filter((w) => (extraction?.worked ?? []).some((x) => Math.abs(Number(x.answer) - w.answer) <= Math.abs(w.answer) * 0.02)).length : null;
  const pageAnswerChecks = (verification?.checks ?? []).filter((c) => c.method === 'page-answer');
  const unsupported = truth?.mustNotClaim ? truth.mustNotClaim.filter((s) => sceneText.includes(norm(s))) : [];
  const dialogueHits = truth?.dialogue ? truth.dialogue.filter((d) => sceneText.includes(norm(d))).length : null;
  const lastScene = scenes[scenes.length - 1];
  const layout = lastScene?.layout; const motion = lastScene?.motion; // deterministic placement and liveliness, measured by the server
  return {
    file, id: done?.experienceId, http: null, kind: quick?.kind, kindOk, language: quick?.language, langOk, confidence: quick?.confidence,
    elements: scene?.elements.length ?? 0, steps: scene?.steps.length ?? 0, renderOk: !!scene && scene.elements.length > 0,
    valueHits, valueTotal: truth?.values?.length ?? 0, workedHits, workedTotal: truth?.worked?.length ?? 0,
    pageAnswerPass: pageAnswerChecks.filter((c) => c.pass).length, pageAnswerTotal: pageAnswerChecks.length,
    verification: verification?.status ?? 'none', unsupported, dialogueHits, dialogueTotal: truth?.dialogue?.length ?? 0,
    inkMean: layout?.mean, inkWorst: layout?.worst, moved: layout?.moved, dropped: layout?.dropped, moving: motion?.moving, movingTotal: motion?.total,
    L1: firstQuick, L2: firstScene, L3: firstAudio, L4: ready?.t ?? done?.t, L5: done?.t, read: stageDone('read'), build: stageDone('build'), understand: stageDone('understand'), verify: stageDone('verify'),
    cost: done?.costUsd, errors: events.filter((e) => e.type === 'error').map((e) => e.message.slice(0, 80)),
  };
}

for (const file of pages) {
  let truth = null;
  try { truth = JSON.parse(await fs.readFile(path.join(root, 'truth', file.replace(/\.(jpe?g|png)$/i, '.json')), 'utf8')); } catch { /* no truth */ }
  for (let i = 0; i < RUNS; i++) {
    process.stdout.write(`${file} run ${i + 1}/${RUNS} … `);
    try {
      const { events, wall, http } = await runPage(file);
      const s = score(file, truth, events); s.http = http; s.wall = wall;
      results.push(s);
      console.log(`${s.kind}/${s.language} L2 ${s.L2 ?? '-'} ms, done ${s.L4 ?? '-'} ms, verification ${s.verification}, moving ${s.moving ?? '-'}/${s.movingTotal ?? '-'}, ink ${s.inkMean == null ? '-' : `${Math.round(s.inkMean * 100)}%/${Math.round(s.inkWorst * 100)}% (${s.moved} moved)`}, $${(s.cost ?? 0).toFixed(3)}`);
    } catch (e) { console.log('FAILED', e.message); results.push({ file, http: 0, errors: [String(e.message)] }); }
  }
}

const pct = (arr, p) => { const a = arr.filter((x) => typeof x === 'number').sort((x, y) => x - y); if (!a.length) return null; return a[Math.min(a.length - 1, Math.floor((p / 100) * a.length))]; };
const ms = (v) => (v == null ? '–' : `${(v / 1000).toFixed(1)} s`);
const lat = (key) => `${ms(pct(results.map((r) => r[key]), 50))} / ${ms(pct(results.map((r) => r[key]), 90))}`;
const ok = results.filter((r) => r.http === 200);
const sum = (k) => ok.reduce((a, r) => a + (r[k] ?? 0), 0);
let md = `# Evaluation report\n\nGenerated ${new Date().toISOString()} against ${SERVER}; ${results.length} run(s) over ${pages.length} page(s). Events in \`eval/output/${stamp}/\`.\n\n`;
md += `## Summary\n\n| Metric | Result | Target |\n|---|---|---|\n`;
md += `| Page kind correct | ${ok.filter((r) => r.kindOk).length}/${ok.filter((r) => r.kindOk !== null).length} | — |\n`;
md += `| Language correct | ${ok.filter((r) => r.langOk).length}/${ok.filter((r) => r.langOk !== null).length} | — |\n`;
md += `| Key values recalled (Q-1) | ${sum('valueHits')}/${sum('valueTotal')} (${sum('valueTotal') ? Math.round((100 * sum('valueHits')) / sum('valueTotal')) : 0} %) | ≥ 95 % |\n`;
md += `| Worked answers extracted within 2 % (Q-2) | ${sum('workedHits')}/${sum('workedTotal')} | all |\n`;
md += `| Page-answer checks passed (Q-2) | ${sum('pageAnswerPass')}/${sum('pageAnswerTotal')} | all |\n`;
md += `| Scenes rendered (Q-3) | ${ok.filter((r) => r.renderOk).length}/${ok.length} | ≥ 95 % |\n`;
md += `| Unsupported claims found (Q-4) | ${ok.reduce((a, r) => a + (r.unsupported?.length ?? 0), 0)} | 0 |\n`;
md += `| Story dialogue preserved | ${sum('dialogueHits')}/${sum('dialogueTotal')} | — |\n`;
md += `| Overlays clear of printed ink (worst label < 10 % ink) | ${ok.filter((r) => typeof r.inkWorst === 'number' && r.inkWorst < 0.1).length}/${ok.filter((r) => typeof r.inkWorst === 'number').length} | all |\n`;
md += `| Scenes with ≥ 3 moving elements | ${ok.filter((r) => (r.moving ?? 0) >= 3).length}/${ok.length} | all |\n`;
md += `| Cost per page | $${(sum('cost') / Math.max(1, ok.length)).toFixed(3)} | reasonable |\n\n`;
md += `## Latency (p50 / p90, from capture confirm)\n\n| Moment | p50 / p90 | Target | Hard limit |\n|---|---|---|---|\n`;
md += `| L-1 first understanding | ${lat('L1')} | 1.5 s | 3 s |\n| L-2 first generated scene (held until verified; the reveal is at L-4 plus clip and picture loading) | ${lat('L2')} | 5 s | 10 s |\n| L-3 narration starts | ${lat('L3')} | 6 s | 12 s |\n| L-4 complete with verification (scene v1) | ${lat('L4')} | 15 s | 30 s |\n| Richer scene v2 voiced and verified (upgrade at the next loop) | ${lat('L5')} | — | — |\n\n`;
md += `| Stage done | p50 / p90 |\n|---|---|\n| read | ${lat('read')} |\n| build | ${lat('build')} |\n| understand | ${lat('understand')} |\n| verify | ${lat('verify')} |\n\n`;
md += `## Per page\n\n| Page | Kind | Lang | Conf | Elements | Steps | Moving | Ink under labels mean/worst (moved) | Values | Worked | Page-answer | Verification | Unsupported | L-2 | L-4 | Cost | Errors |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|\n`;
for (const r of results) md += `| ${r.file} | ${r.kind ?? '-'}${r.kindOk === false ? ' ✗' : ''} | ${r.language ?? '-'}${r.langOk === false ? ' ✗' : ''} | ${r.confidence ?? '-'} | ${r.elements ?? '-'} | ${r.steps ?? '-'} | ${r.moving ?? '-'}/${r.movingTotal ?? '-'} | ${r.inkMean == null ? '-' : `${Math.round(r.inkMean * 100)} % / ${Math.round(r.inkWorst * 100)} % (${r.moved ?? 0}${r.dropped ? `, ${r.dropped} dropped` : ''})`} | ${r.valueHits ?? '-'}/${r.valueTotal ?? '-'} | ${r.workedHits ?? '-'}/${r.workedTotal ?? '-'} | ${r.pageAnswerPass ?? '-'}/${r.pageAnswerTotal ?? '-'} | ${r.verification ?? '-'} | ${(r.unsupported ?? []).join('; ') || '0'} | ${ms(r.L2)} | ${ms(r.L4)} | $${(r.cost ?? 0).toFixed(3)} | ${(r.errors ?? []).join('; ')} |\n`;
await fs.writeFile(path.join(root, 'REPORT.md'), md);
await fs.writeFile(path.join(outDir, 'results.json'), JSON.stringify(results, null, 1));
console.log(`\nreport: eval/REPORT.md`);
