// The media a story is made of: clips from Gemini Omni (Veo 3.1 when Omni fails), voices from Gemini TTS with an acting
// style that is never read aloud, music from Lyria. Each call reports its cost, so a story knows what it cost to make.
import { GoogleAuth } from 'google-auth-library';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { clients, gcloudAuthClient, generateJson } from '../gemini.js';
import { config } from '../config.js';

export type Spend = (model: string, usd: number) => void;

let auth: GoogleAuth | null = null;
let local: Awaited<ReturnType<typeof gcloudAuthClient>> | null = null;
/** An access token for REST calls the SDK does not cover (TTS acting styles, Lyria, Veo). */
export async function accessToken(): Promise<string> {
  if (config.useGcloudToken) { local ??= await gcloudAuthClient(); return (await local.getAccessToken()).token!; }
  auth ??= new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
  return (await auth.getAccessToken())!;
}

async function vertex(url: string, body: unknown, timeoutMs = 120_000): Promise<any> {
  const token = await accessToken();
  const res = await fetch(url, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'x-goog-user-project': config.project }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok || json.error) throw new Error(`${res.status} ${JSON.stringify(json.error ?? json).slice(0, 300)}`);
  return json;
}

/** A small gate so a story never has more than `n` calls of one kind in flight (the video model has a fixed quota). */
export function gate(n: number) {
  let active = 0; const waiting: (() => void)[] = [];
  return async <T>(fn: () => Promise<T>): Promise<T> => {
    while (active >= n) await new Promise<void>((r) => waiting.push(r));
    active++;
    try { return await fn(); } finally { active--; waiting.shift()?.(); }
  };
}
const videoGate = gate(Number(process.env.STORY_VIDEO_PARALLEL || 4));
const voiceGate = gate(6);

// ---------------------------------------------------------------- voices

/** WAV bytes → duration in ms (reads the fmt and data chunks). */
export function wavMs(wav: Buffer): number {
  let p = 12, rate = 24000, ch = 1, bits = 16;
  while (p + 8 <= wav.length) {
    const id = wav.toString('ascii', p, p + 4), size = wav.readUInt32LE(p + 4);
    if (id === 'fmt ') { ch = wav.readUInt16LE(p + 10); rate = wav.readUInt32LE(p + 12); bits = wav.readUInt16LE(p + 22); }
    if (id === 'data') return Math.round((Math.min(size, wav.length - p - 8) / (rate * ch * (bits / 8))) * 1000);
    p += 8 + size + (size % 2);
  }
  return 0;
}

/** Speak one line in a voice with an acting style (Gemini 3.8 TTS; the style travels as speechMetadata, so it is
 *  never read aloud). Inline tags such as <gasp> or <short pause> in the text are performed. */
export async function speak(text: string, voice: string, style: string | undefined, spend: Spend): Promise<{ wav: Buffer; ms: number }> {
  const model = 'gemini-3.8-flash-tts';
  const url = `https://aiplatform.googleapis.com/v1/projects/${config.project}/locations/global/publishers/google/models/${model}:generateContent`;
  const part: any = { text };
  if (style) part.speechMetadata = { style };
  return voiceGate(async () => {
    for (let attempt = 0; ; attempt++) {
      try {
        const r = await vertex(url, { contents: [{ role: 'user', parts: [part] }], generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } } }, 60_000);
        const data = r.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData)?.inlineData?.data;
        if (!data) throw new Error('no audio');
        let wav: Buffer = Buffer.from(data, 'base64');
        if (wav.toString('ascii', 0, 4) !== 'RIFF') wav = pcmWav(wav, 24000);
        const u = r.usageMetadata ?? {};
        spend(model, ((u.promptTokenCount ?? 0) * 0.5 + (u.candidatesTokenCount ?? 0) * 9) / 1e6);
        return { wav, ms: wavMs(wav) };
      } catch (e: any) {
        if (attempt >= 2) throw e;
        await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
      }
    }
  });
}

function pcmWav(pcm: Buffer, rate: number): Buffer {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8); h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

// ---------------------------------------------------------------- music

/** About 32 s of instrumental music for the story's mood (Lyria 2 on Vertex). */
export async function compose(prompt: string, spend: Spend): Promise<Buffer> {
  const url = `https://us-central1-aiplatform.googleapis.com/v1/projects/${config.project}/locations/us-central1/publishers/google/models/lyria-002:predict`;
  // Lyria blocks music that comes too close to a known piece ("recitation"); then it tries a new seed, then a plainer brief
  const briefs = [prompt, prompt, `Gentle, warm instrumental background music for a children's story, ${prompt.split(/[.,;]/)[0]!.toLowerCase().replace(/^gentle|^warm/, '').trim()}, original melody, soft and calm`];
  let last: unknown;
  for (const [k, brief] of briefs.entries()) {
    try {
      const r = await vertex(url, { instances: [{ prompt: brief, negative_prompt: 'vocals, singing, lyrics, speech, heavy drums, distortion, harsh, scary', ...(k ? { seed: Math.floor(Math.random() * 1e6) } : {}) }], parameters: k ? {} : { sample_count: 1 } }, 150_000);
      const b = r.predictions?.[0]?.bytesBase64Encoded ?? r.predictions?.[0]?.audioContent;
      if (!b) throw new Error('Lyria returned no audio');
      spend('lyria-002', 0.06);
      return Buffer.from(b, 'base64');
    } catch (e) { last = e; console.warn(`[story] music attempt ${k + 1} failed: ${String((e as any)?.message).slice(0, 120)}`); }
  }
  throw last;
}

// ---------------------------------------------------------------- clips

export type Clip = { bytes: Buffer; ref?: string; model: string; ms: number };
const OMNI = process.env.STORY_VIDEO_MODEL || 'gemini-omni-1.1-flash-preview';
const VEO = 'veo-3.1-fast-generate-001';

function omniVideo(r: any): { data?: string; uri?: string } | undefined {
  return r?.output_video ?? r?.steps?.flatMap((s: any) => s.content ?? []).find((c: any) => c.type === 'video');
}
function omniCost(r: any): number {
  const out = r?.usage?.total_output_tokens ?? 57_920, inp = r?.usage?.total_input_tokens ?? 0;
  return (inp * 1.5 + out * 17.5) / 1e6;
}

/** A 10 s, 720p clip (16:9) from start images (the first is the frame to begin from) and a prompt. Omni first; after
 *  two failed attempts, Veo 3.1 Fast from the first image. */
export async function filmClip(opts: { images: Buffer[]; prompt: string; spend: Spend; aspect?: '16:9' | '9:16' }): Promise<Clip> {
  return videoGate(async () => {
    const { ai } = await clients();
    let lastErr: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      const t0 = Date.now();
      try {
        const input = [...opts.images.map((b) => ({ type: 'image', data: b.toString('base64'), mime_type: sniff(b) })), { type: 'text', text: opts.prompt }];
        // the image_to_video task keeps the clip one shot that starts from the frame (without it the model likes to cut)
        const r: any = await (ai as any).interactions.create({ model: OMNI, input, response_format: { type: 'video', aspect_ratio: opts.aspect ?? '16:9', resolution: '720p' }, generation_config: { video_config: { task: 'image_to_video' } } });
        const v = omniVideo(r);
        if (!v?.data) throw new Error(`no video (${r?.status ?? 'unknown'})`);
        opts.spend(OMNI, omniCost(r));
        return { bytes: Buffer.from(v.data, 'base64'), ref: r.id, model: OMNI, ms: Date.now() - t0 };
      } catch (e: any) {
        lastErr = e;
        console.warn(`[story] omni attempt ${attempt + 1} failed: ${String(e?.message ?? e).slice(0, 160)}`);
        await new Promise((r) => setTimeout(r, 1500));
      }
    }
    try { return await veoClip(opts.images[0], opts.prompt, opts.spend, opts.aspect); }
    catch (e) { throw new Error(`no clip: ${String((lastErr as any)?.message ?? lastErr).slice(0, 120)} / veo: ${String((e as any)?.message ?? e).slice(0, 120)}`); }
  });
}

/** Change an Omni clip by instruction ("Make the dog white. Keep everything else the same."). */
export async function editClip(ref: string, instruction: string, spend: Spend): Promise<Clip> {
  return videoGate(async () => {
    const { ai } = await clients();
    const t0 = Date.now();
    const r: any = await (ai as any).interactions.create({ model: OMNI, previous_interaction_id: ref, input: instruction, response_format: { type: 'video', aspect_ratio: '16:9', resolution: '720p' } });
    const v = omniVideo(r);
    if (!v?.data) throw new Error(`edit gave no video (${r?.status ?? 'unknown'})`);
    spend(OMNI, omniCost(r));
    return { bytes: Buffer.from(v.data, 'base64'), ref: r.id, model: OMNI, ms: Date.now() - t0 };
  });
}

async function veoClip(image: Buffer | undefined, prompt: string, spend: Spend, aspect: '16:9' | '9:16' = '16:9'): Promise<Clip> {
  const t0 = Date.now();
  const base = `https://us-central1-aiplatform.googleapis.com/v1/projects/${config.project}/locations/us-central1/publishers/google/models/${VEO}`;
  const instance: any = { prompt };
  if (image) instance.image = { bytesBase64Encoded: image.toString('base64'), mimeType: sniff(image) };
  const start = await vertex(`${base}:predictLongRunning`, { instances: [instance], parameters: { aspectRatio: aspect, durationSeconds: 8, sampleCount: 1, resolution: '720p', generateAudio: true, personGeneration: 'allow_adult' } });
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 8000));
    const op = await vertex(`${base}:fetchPredictOperation`, { operationName: start.name });
    if (!op.done) continue;
    const v = (op.response?.videos ?? [])[0];
    if (!v?.bytesBase64Encoded) throw new Error(`veo gave no video${op.response?.raiMediaFilteredCount ? ' (filtered)' : ''}`);
    spend(VEO, 0.8);
    return { bytes: Buffer.from(v.bytesBase64Encoded, 'base64'), model: VEO, ms: Date.now() - t0 };
  }
  throw new Error('veo timed out');
}

/** Does a clip's own soundtrack contain speech or singing? The video model sometimes adds voices even when asked not
 *  to; such a clip plays without its own sound, so only the story's voices are heard. */
export async function clipHasSpeech(file: string, spend: Spend): Promise<{ speech: boolean; heard: string }> {
  const { stdout } = await promisify(execFile)('ffmpeg', ['-v', 'error', '-i', file, '-vn', '-ac', '1', '-ar', '16000', '-f', 'wav', 'pipe:1'], { encoding: 'buffer', maxBuffer: 1 << 26 });
  if (!stdout?.length) return { speech: false, heard: '' };
  const r = await generateJson<{ speech: boolean; heard?: string }>({
    model: 'extract', label: 'clip-speech', maxTokens: 300, thinking: 'low',
    schema: { type: 'object', properties: { speech: { type: 'boolean' }, heard: { type: 'string' } }, required: ['speech'] },
    system: 'You listen to the soundtrack of a short animated clip. Say whether any human or animal voice speaks words or sings (a gasp, a laugh or a bark is not speech). Answer JSON {"speech": true|false, "heard": "the words, if any"}.',
    parts: [{ inlineData: { data: stdout.toString('base64'), mimeType: 'audio/wav' } } as any, { text: 'Is there speech or singing in this soundtrack?' }],
  });
  spend(r.usage.model, r.usage.costUsd);
  return { speech: !!r.json?.speech, heard: String(r.json?.heard ?? '') };
}

export function sniff(b: Buffer): string {
  if (b[0] === 0x89 && b[1] === 0x50) return 'image/png';
  if (b[0] === 0x52 && b[1] === 0x49 && b[8] === 0x57) return 'image/webp';
  return 'image/jpeg';
}
