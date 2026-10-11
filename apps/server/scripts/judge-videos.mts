// Gemini watches each recorded lesson (video and the tutor's voice) and scores how well it would demo on a printed
// page. pnpm exec tsx scripts/judge-videos.mts <videos-dir> <results.json (merged run results)> <picks.json> <out.json>
import fs from 'node:fs/promises';
import path from 'node:path';
import { generateJson } from '../src/gemini.js';
const [dir, resultsFile, picksFile, out] = process.argv.slice(2);
const results: any[] = JSON.parse(await fs.readFile(resultsFile!, 'utf8'));
const picks: any[] = JSON.parse(await fs.readFile(picksFile!, 'utf8'));
const files = (await fs.readdir(dir!)).filter((f) => f.endsWith('.mp4')).sort();
const system = `You are judging short screen recordings of an educational app. The app photographs a printed textbook page and brings the page's own diagram to life ON the page: hand-drawn animated overlays (moving objects, flowing particles, live readouts on sticky notes, marker highlights) while a voice tutor narrates the lesson step by step. Each recording shows the whole page with the overlays and captions; the audio is the tutor.
Score this recording for a live demo in front of hackathon judges, where the page will be printed and the phone pointed at it. Be strict and specific.
Return JSON: {
 "placement": 0-10 (overlays sit on the printed figure or in blank space, aligned with printed lines and points; nothing important covers body text),
 "motion": 0-10 (how much visibly moves, continuously, for the whole clip, and whether the motion shows the concept),
 "clarity": 0-10 (labels readable, nothing cluttered, the eye knows where to look),
 "correctness": 0-10 (what is drawn, the numbers and the narration agree with the page and with physics or maths),
 "narration": 0-10 (the voice explains clearly, in step with what is shown),
 "wow": 0-10 (would a judge say "wow" when this appears on a real printed page?),
 "alive_seconds": <approximate seconds in which something meaningful is moving>,
 "what_moves": "<one line: what the viewer sees animate>",
 "issues": ["<concrete problem>", ...],
 "verdict": "demo" | "maybe" | "skip"
}`;
const judged: any[] = [];
let i = 0;
await Promise.all(Array.from({ length: 4 }, async () => {
  while (i < files.length) {
    const f = files[i++]!;
    const name = f.replace(/\.mp4$/, '');
    const res = results.find((r) => r.file?.startsWith(name));
    const pick = picks.find((p) => p.file?.startsWith(name));
    try {
      const bytes = await fs.readFile(path.join(dir!, f));
      const r = await generateJson<any>({
        model: 'verify', system, label: 'judge-video', maxTokens: 900, temperature: 0.2, mediaResolution: 'low',
        parts: [{ inlineData: { mimeType: 'video/mp4', data: bytes.toString('base64') } } as any, { text: `Page concept: ${pick?.concept ?? 'unknown'} (${pick?.subject ?? ''}). Judge the recording.` }],
      });
      const j = r.json;
      const score = 0.3 * j.wow + 0.2 * j.motion + 0.2 * j.placement + 0.15 * j.correctness + 0.1 * j.clarity + 0.05 * j.narration;
      judged.push({ file: name, id: res?.id, verification: res?.verification, moving: res?.moving, concept: pick?.concept, subject: pick?.subject, ...j, score: Math.round(score * 10) / 10 });
      console.log(`${name.padEnd(12)} ${score.toFixed(1)}  wow ${j.wow} motion ${j.motion} place ${j.placement} correct ${j.correctness}  ${j.verdict}  | ${String(j.what_moves).slice(0, 90)}`);
    } catch (e: any) { console.log(`${name}: judge failed ${String(e?.message).slice(0, 100)}`); }
  }
}));
judged.sort((a, b) => b.score - a.score);
await fs.writeFile(out!, JSON.stringify(judged, null, 1));
console.log(`wrote ${out}: ${judged.length} judged, ${judged.filter((j) => j.verdict === 'demo').length} "demo"`);
process.exit(0);
