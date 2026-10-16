// Probe: Gemini 3.8 TTS on Vertex (generateContent over REST) with speechMetadata.style, which is not read aloud.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const [out, voice, style, ...words] = process.argv.slice(2);
const token = execFileSync('gcloud', ['auth', 'print-access-token'], { encoding: 'utf8' }).trim();
const url = 'https://aiplatform.googleapis.com/v1/projects/cheerio-app/locations/global/publishers/google/models/gemini-3.8-flash-tts:generateContent';
const t0 = Date.now();
const body = { contents: [{ role: 'user', parts: [{ text: words.join(' '), speechMetadata: { style } }] }], generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } } };
const r: any = await fetch(url, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) }).then((x) => x.json());
const part = r.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData);
if (!part) { console.log('no audio', JSON.stringify(r).slice(0, 500)); process.exit(1); }
const pcm = Buffer.from(part.inlineData.data, 'base64');
const h = Buffer.alloc(44); h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8); h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(24000, 24); h.writeUInt32LE(48000, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
fs.writeFileSync(out!, Buffer.concat([h, pcm]));
console.log(`saved ${out} ${(pcm.length / 48000).toFixed(2)} s in ${((Date.now() - t0) / 1000).toFixed(1)} s (${part.inlineData.mimeType})`);
