// Probe: Gemini Omni Flash on Vertex, through the Interactions API and through generateContent. Prints timing, saves clips.
import fs from 'node:fs';
import { clients } from '../../src/gemini.js';
const [out, prompt, image, mode = 'both'] = process.argv.slice(2);
const { ai } = await clients();
const MODEL = process.env.OMNI_MODEL || 'gemini-omni-1.1-flash-preview';
const img = image ? { data: fs.readFileSync(image).toString('base64'), mime: image.endsWith('.png') ? 'image/png' : 'image/jpeg' } : null;
if (mode === 'both' || mode === 'interactions') {
  const t0 = Date.now();
  try {
    const input: any = img ? [{ type: 'image', data: img.data, mime_type: img.mime }, { type: 'text', text: prompt }] : prompt;
    const r: any = await (ai as any).interactions.create({ model: MODEL, input, response_format: { type: 'video', aspect_ratio: '16:9', resolution: '720p' } });
    const v = r.output_video ?? r.steps?.flatMap((s: any) => s.content ?? []).find((c: any) => c.type === 'video');
    if (v?.data) { fs.writeFileSync(out!, Buffer.from(v.data, 'base64')); console.log(`interactions: saved ${out} ${(fs.statSync(out!).size / 1e6).toFixed(1)} MB in ${((Date.now() - t0) / 1000).toFixed(1)} s, id ${String(r.id).slice(0, 30)}`); }
    else console.log('interactions: no video', JSON.stringify(r).slice(0, 600));
    if (r.usage) console.log('usage', JSON.stringify(r.usage).slice(0, 400));
  } catch (e: any) { console.log('interactions ERROR', ((Date.now() - t0) / 1000).toFixed(1), 's', String(e?.message ?? e).slice(0, 600)); }
}
if (mode === 'both' || mode === 'generate') {
  const t0 = Date.now();
  try {
    const parts: any[] = [...(img ? [{ inlineData: { data: img.data, mimeType: img.mime } }] : []), { text: prompt }];
    const r: any = await ai.models.generateContent({ model: MODEL, contents: [{ role: 'user', parts }], config: { responseModalities: ['VIDEO'] } as any });
    const p = r.candidates?.[0]?.content?.parts?.find((x: any) => x.inlineData || x.fileData);
    const o = out!.replace(/\.mp4$/, '-gc.mp4');
    if (p?.inlineData?.data) { fs.writeFileSync(o, Buffer.from(p.inlineData.data, 'base64')); console.log(`generateContent: saved ${o} ${(fs.statSync(o).size / 1e6).toFixed(1)} MB in ${((Date.now() - t0) / 1000).toFixed(1)} s`); }
    else console.log('generateContent: no video', JSON.stringify(r).slice(0, 600));
    if (r.usageMetadata) console.log('usage', JSON.stringify(r.usageMetadata).slice(0, 400));
  } catch (e: any) { console.log('generateContent ERROR', ((Date.now() - t0) / 1000).toFixed(1), 's', String(e?.message ?? e).slice(0, 600)); }
}
