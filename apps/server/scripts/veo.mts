// Generate a short clip with Veo on Vertex AI (an offline asset tool; uses the gcloud user token).
//   pnpm exec tsx scripts/veo.mts <out.mp4> "<prompt>" [--image first-frame.jpg] [--seconds 8] [--aspect 9:16] [--model veo-3.1-fast-generate-001] [--res 720p] [--audio]
import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
const argv = process.argv.slice(2);
const out = argv[0]!, prompt = argv[1]!;
const opt = (k: string, d: string) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1]! : d; };
const model = opt('model', 'veo-3.1-fast-generate-001'), seconds = Number(opt('seconds', '8')), aspect = opt('aspect', '9:16'), res = opt('res', '720p');
const imagePath = opt('image', ''), audio = argv.includes('--audio');
const project = process.env.GCP_PROJECT || 'cheerio-app', region = 'us-central1';
const token = execFileSync('gcloud', ['auth', 'print-access-token'], { encoding: 'utf8' }).trim();
const base = `https://${region}-aiplatform.googleapis.com/v1/projects/${project}/locations/${region}/publishers/google/models/${model}`;
const headers = { Authorization: `Bearer ${token}`, 'content-type': 'application/json', 'x-goog-user-project': project };
const instance: any = { prompt };
if (imagePath) instance.image = { bytesBase64Encoded: (await fs.readFile(imagePath)).toString('base64'), mimeType: imagePath.endsWith('.png') ? 'image/png' : 'image/jpeg' };
const body = { instances: [instance], parameters: { aspectRatio: aspect, durationSeconds: seconds, sampleCount: 1, resolution: res, generateAudio: audio, personGeneration: 'allow_adult', enhancePrompt: true } };
const t0 = Date.now();
const start = await fetch(`${base}:predictLongRunning`, { method: 'POST', headers, body: JSON.stringify(body) }).then((r) => r.json() as Promise<any>);
if (!start.name) { console.error('start failed:', JSON.stringify(start).slice(0, 600)); process.exit(1); }
console.log('operation', start.name.split('/').pop());
for (;;) {
  await new Promise((r) => setTimeout(r, 10000));
  const op = await fetch(`${base}:fetchPredictOperation`, { method: 'POST', headers, body: JSON.stringify({ operationName: start.name }) }).then((r) => r.json() as Promise<any>);
  if (op.error) { console.error('failed:', JSON.stringify(op.error).slice(0, 600)); process.exit(1); }
  if (!op.done) { process.stdout.write(`.`); continue; }
  const vids = op.response?.videos ?? op.response?.generatedSamples?.map((s: any) => s.video) ?? [];
  const v = vids[0];
  if (!v) { console.error('no video:', JSON.stringify(op.response).slice(0, 600)); process.exit(1); }
  if (v.bytesBase64Encoded) await fs.writeFile(out, Buffer.from(v.bytesBase64Encoded, 'base64'));
  else if (v.gcsUri || v.uri) { execFileSync('gcloud', ['storage', 'cp', v.gcsUri || v.uri, out], { stdio: 'inherit' }); }
  console.log(`\nsaved ${out} in ${Math.round((Date.now() - t0) / 1000)} s${op.response?.raiMediaFilteredCount ? ` (filtered: ${JSON.stringify(op.response.raiMediaFilteredReasons)})` : ''}`);
  break;
}
