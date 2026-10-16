// Probe: what do these audio files say, word for word, and how is it delivered?
import fs from 'node:fs';
import { clients } from '../../src/gemini.js';
const { ai } = await clients();
for (const f of process.argv.slice(2)) {
  const b = fs.readFileSync(f);
  console.log(f.split('/').pop(), 'header', b.subarray(0, 4).toString(), b.subarray(44, 48).toString('hex'));
  const r = await ai.models.generateContent({ model: 'gemini-3.8-flash', contents: [{ role: 'user', parts: [{ inlineData: { data: b.toString('base64'), mimeType: 'audio/wav' } }, { text: 'Transcribe every spoken word exactly, then in a few words describe the delivery (tone, loudness, non-speech sounds). Format: TRANSCRIPT: ... | DELIVERY: ...' }] }] });
  console.log('  ', (r.text ?? '').replace(/\s+/g, ' ').slice(0, 300));
}
