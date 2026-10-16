// Probe: does a clip filmed with task image_to_video and a prompt without timecodes avoid cuts inside the clip?
import fs from 'node:fs';
import { clients } from '../../src/gemini.js';
const [frame, out, prompt, task = 'image_to_video'] = process.argv.slice(2);
const { ai } = await clients();
const t0 = Date.now();
const r: any = await (ai as any).interactions.create({
  model: 'gemini-omni-1.1-flash-preview',
  input: [{ type: 'image', data: fs.readFileSync(frame!).toString('base64'), mime_type: 'image/png' }, { type: 'text', text: prompt }],
  response_format: { type: 'video', aspect_ratio: '16:9', resolution: '720p' },
  ...(task !== 'none' ? { generation_config: { video_config: { task } } } : {}),
});
const v = r.output_video ?? r.steps?.flatMap((s: any) => s.content ?? []).find((c: any) => c.type === 'video');
fs.writeFileSync(out!, Buffer.from(v.data, 'base64'));
console.log(`saved ${out} in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
