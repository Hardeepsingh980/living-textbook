// Voice every line of the demo script with Gemini text-to-speech, one clip per sentence (so each caption matches its
// clip exactly), plus the student's question for the simulated microphone, with silence before it.
//   cd apps/server && LB_USE_GCLOUD_TOKEN=1 pnpm exec tsx ../../scripts/demo-video/tts.mts <out dir> [question delay s]
import fs from 'node:fs';
import path from 'node:path';
import { synthesize } from '../../apps/server/src/gemini.js';
import { config } from '../../apps/server/src/config.js';

const out = path.resolve(process.argv[2] ?? 'eval/output/demo-video');
const questionDelay = Number(process.argv[3] ?? 26);
const script = JSON.parse(fs.readFileSync(new URL(process.env.SCRIPT || './script.json', import.meta.url), 'utf8')); // SCRIPT=./script2.json for the second video
fs.mkdirSync(path.join(out, 'vo'), { recursive: true });
config.models.tts.id = 'gemini-3.8-flash-tts'; // the fuller TTS model for the narrator; the lite one is its fallback
config.models.tts.fallback = 'gemini-3.8-flash-lite-tts';

async function voice(text: string, voice: string) {
  try { return await synthesize({ text, voice }); }
  catch (e: any) { console.warn(`voice ${voice} failed (${String(e?.message).slice(0, 80)}); using Aoede`); return synthesize({ text, voice: 'Aoede' }); }
}
const manifest: { scene: string; index: number; text: string; file: string; ms: number }[] = [];
for (const sc of script.scenes) {
  for (const [i, text] of (sc.lines as string[]).entries()) {
    const file = path.join(out, 'vo', `${sc.id}-${i}.wav`);
    if (!fs.existsSync(file)) { const r = await voice(text, script.narratorVoice); fs.writeFileSync(file, r.wav); }
    const ms = Math.round(((fs.statSync(file).size - 44) / 2 / 24000) * 1000);
    manifest.push({ scene: sc.id, index: i, text, file, ms });
    console.log(`${sc.id}-${i} ${(ms / 1000).toFixed(1)} s  ${text}`);
  }
}
fs.writeFileSync(path.join(out, 'vo', 'manifest.json'), JSON.stringify(manifest, null, 1));
// the student's question, after `questionDelay` seconds of silence (the fake microphone starts with the lesson). A take
// recorded with the microphone file keeps its question, so the video plays the words the tutor heard.
if (fs.existsSync(path.join(out, 'question.wav'))) { console.log('question: kept'); process.exit(0); }
const q = await voice(script.question, script.studentVoice);
const pcm = q.wav.subarray(44);
const silence = Buffer.alloc(Math.round(questionDelay * 24000) * 2);
const tail = Buffer.alloc(24000 * 2 * 40); // then quiet for the rest of the lesson
const body = Buffer.concat([silence, pcm, tail]);
const header = Buffer.alloc(44);
header.write('RIFF', 0); header.writeUInt32LE(36 + body.length, 4); header.write('WAVE', 8); header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22); header.writeUInt32LE(24000, 24); header.writeUInt32LE(48000, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(body.length, 40);
fs.writeFileSync(path.join(out, 'question-mic.wav'), Buffer.concat([header, body]));
fs.writeFileSync(path.join(out, 'question.wav'), q.wav);
console.log(`question: ${(q.durationMs / 1000).toFixed(1)} s after ${questionDelay} s of silence`);
