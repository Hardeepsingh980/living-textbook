// Gather finished stories for sharing: each story's latest film, compressed to fit a 28 MB limit (phones and chat
// apps), and a summary of its review rounds (score per round, what was fixed).
//   node scripts/story-deliver.mjs <out dir> <slug...>
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const [outDir, ...slugs] = process.argv.slice(2);
const root = path.resolve('../../eval/output/stories');
fs.mkdirSync(outDir, { recursive: true });
const summary = [];
for (const slug of slugs) {
  const dir = path.join(root, slug);
  const doc = JSON.parse(fs.readFileSync(path.join(dir, 'story.json'), 'utf8'));
  const films = fs.readdirSync(dir).filter((f) => /^film-(r\d+|final)\.mp4$/.test(f)).sort((a, b) => (a.includes('final') ? 1 : b.includes('final') ? -1 : Number(a.match(/\d+/)) - Number(b.match(/\d+/))));
  const film = path.join(dir, films.at(-1));
  const secs = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', film], { encoding: 'utf8' }));
  const out = path.join(outDir, `${slug}.mp4`);
  const kbps = Math.max(600, Math.floor((28 * 8 * 1000) / secs) - 140);
  const log = path.join(outDir, `${slug}-pass`);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', film, '-c:v', 'libx264', '-preset', 'slow', '-b:v', `${kbps}k`, '-pass', '1', '-passlogfile', log, '-an', '-f', 'null', '/dev/null']);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', film, '-c:v', 'libx264', '-preset', 'slow', '-b:v', `${kbps}k`, '-pass', '2', '-passlogfile', log, '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', out]);
  for (const f of fs.readdirSync(outDir)) if (f.startsWith(`${slug}-pass`)) fs.rmSync(path.join(outDir, f));
  const rounds = doc.reviews.map((r) => ({ round: r.round, overall: r.overall, worst: Math.min(...r.shots.map((s) => s.score)), applied: r.applied ?? [] }));
  summary.push({ slug, id: doc.id, title: doc.title, book: doc.book, seconds: Math.round(secs), mb: +(fs.statSync(out).size / 1e6).toFixed(1), cost: +doc.cost.usd.toFixed(2), shots: doc.shots.length, rounds, from: films.at(-1) });
  console.log(`${slug}: ${films.at(-1)} ${secs.toFixed(0)} s -> ${(fs.statSync(out).size / 1e6).toFixed(1)} MB | rounds ${rounds.map((r) => r.overall).join(' -> ')} | $${doc.cost.usd.toFixed(2)}`);
}
fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 1));
