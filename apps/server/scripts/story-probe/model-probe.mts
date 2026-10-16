// Probe: which models answer from this project (global endpoint), with a short video when one is given.
import fs from 'node:fs';
import { clients } from '../../src/gemini.js';
const [video, ...models] = process.argv.slice(2);
const { ai } = await clients();
for (const model of models) {
  const t0 = Date.now();
  try {
    const parts: any[] = [];
    if (video && video !== '-') parts.push({ inlineData: { data: fs.readFileSync(video).toString('base64'), mimeType: 'video/mp4' } });
    parts.push({ text: video && video !== '-' ? 'In two sentences: what happens in this video, and what is its visual style?' : 'Say OK.' });
    const r = await ai.models.generateContent({ model, contents: [{ role: 'user', parts }], config: { maxOutputTokens: 4000 } });
    console.log(`${model}: ${((Date.now() - t0) / 1000).toFixed(1)} s | ${(r.text ?? '').replace(/\s+/g, ' ').slice(0, 300)} | tokens in ${r.usageMetadata?.promptTokenCount} out ${r.usageMetadata?.candidatesTokenCount} thought ${r.usageMetadata?.thoughtsTokenCount}`);
  } catch (e: any) { console.log(`${model}: ERROR ${String(e?.message ?? e).slice(0, 200)}`); }
}
