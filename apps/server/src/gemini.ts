// Thin wrapper over @google/genai (Agent Platform / Vertex AI, global endpoint): streamed JSON generation with
// first-token callbacks, image generation, speech synthesis, and token/cost accounting per call.
import { GoogleGenAI, Modality, type Part } from '@google/genai';
import { OAuth2Client } from 'google-auth-library';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { config, type ModelKey } from './config.js';
import { pcmToWav } from './wav.js';

const execFileP = promisify(execFile);

let cached: { ai: GoogleGenAI; liveAi: GoogleGenAI } | null = null;
let gcloudToken: { token: string; at: number } | null = null;

async function gcloudAuthClient() {
  // Local development only: Workspace ADC can require re-auth; the gcloud CLI token always works.
  const client = new OAuth2Client();
  const refresh = async () => {
    if (!gcloudToken || Date.now() - gcloudToken.at > 25 * 60 * 1000) {
      const { stdout } = await execFileP('gcloud', ['auth', 'print-access-token']);
      gcloudToken = { token: stdout.trim(), at: Date.now() };
    }
    client.setCredentials({ access_token: gcloudToken.token });
  };
  await refresh();
  setInterval(() => refresh().catch(() => {}), 10 * 60 * 1000).unref();
  return client;
}

export async function clients() {
  if (cached) return cached;
  const googleAuthOptions = config.useGcloudToken ? ({ authClient: await gcloudAuthClient() } as any) : undefined;
  cached = {
    ai: new GoogleGenAI({ vertexai: true, project: config.project, location: config.location, googleAuthOptions }),
    liveAi: new GoogleGenAI({ vertexai: true, project: config.project, location: config.liveLocation, googleAuthOptions }),
  };
  return cached;
}

export type Usage = { model: string; inTokens: number; outTokens: number; thoughtTokens: number; images?: number; costUsd: number; ms: number; ttfbMs?: number };

export function costOf(model: string, inTokens: number, outTokens: number): number {
  const p = config.prices[model];
  if (!p) return 0;
  return (inTokens * p.in + outTokens * p.out) / 1e6;
}

export function imagePart(bytes: Buffer, mime = 'image/jpeg'): Part {
  return { inlineData: { data: bytes.toString('base64'), mimeType: mime } };
}

/** Extract the first JSON object from model text (tolerates code fences and trailing prose). */
export function extractJson(text: string): any {
  const cleaned = text.replace(/```(?:json)?/gi, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('no JSON object in model output');
  return JSON.parse(cleaned.slice(start, end + 1));
}

export type GenJsonOptions = {
  model: ModelKey;
  system: string;
  parts: Part[];
  schema?: object;
  maxTokens?: number;
  thinking?: 'minimal' | 'low' | 'medium';
  mediaResolution?: 'low' | 'medium' | 'high';
  temperature?: number;
  onText?: (soFar: string) => void;
  label?: string;
};

export type GenJsonResult<T = any> = { json: T; text: string; usage: Usage };

/** Streamed structured generation. Falls back to the model's fallback id on a model-not-found / quota error. */
export async function generateJson<T = any>(opts: GenJsonOptions): Promise<GenJsonResult<T>> {
  const { ai } = await clients();
  const m = config.models[opts.model];
  const run = async (modelId: string) => {
    const t0 = Date.now();
    let ttfb: number | undefined;
    let text = '';
    let usage: any = null;
    const stream = await ai.models.generateContentStream({
      model: modelId,
      contents: [{ role: 'user', parts: opts.parts }],
      config: {
        systemInstruction: opts.system,
        responseMimeType: 'application/json',
        ...(opts.schema ? { responseSchema: opts.schema } : {}),
        maxOutputTokens: opts.maxTokens ?? 2000,
        temperature: opts.temperature ?? 0.4,
        thinkingConfig: { thinkingLevel: (opts.thinking ?? 'minimal').toUpperCase() } as any,
        ...(opts.mediaResolution ? { mediaResolution: `MEDIA_RESOLUTION_${opts.mediaResolution.toUpperCase()}` as any } : {}),
      },
    });
    for await (const chunk of stream) {
      const piece = chunk.text ?? '';
      if (piece) { if (ttfb === undefined) ttfb = Date.now() - t0; text += piece; opts.onText?.(text); }
      if (chunk.usageMetadata) usage = chunk.usageMetadata;
    }
    const inTokens = usage?.promptTokenCount ?? 0, outTokens = usage?.candidatesTokenCount ?? 0, thoughtTokens = usage?.thoughtsTokenCount ?? 0;
    const u: Usage = { model: modelId, inTokens, outTokens, thoughtTokens, costUsd: costOf(modelId, inTokens, outTokens + thoughtTokens), ms: Date.now() - t0, ttfbMs: ttfb };
    return { json: extractJson(text) as T, text, usage: u };
  };
  try { return await run(m.id); }
  catch (e: any) {
    const msg = String(e?.message || e);
    if (/not found|unsupported|404|429|RESOURCE_EXHAUSTED|503/i.test(msg) && m.fallback !== m.id) {
      console.warn(`[gemini] ${opts.label ?? opts.model}: ${m.id} failed (${msg.slice(0, 120)}); retrying with ${m.fallback}`);
      return run(m.fallback);
    }
    throw e;
  }
}

export type ImageResult = { bytes: Buffer; mime: string; usage: Usage };

/** Generate one image. `refs` are reference images for character consistency (only honoured by imageRef models). */
export async function generateImage(opts: { prompt: string; model?: ModelKey; aspect?: string; refs?: Buffer[] }): Promise<ImageResult> {
  const { ai } = await clients();
  const key = opts.model ?? (opts.refs?.length ? 'imageRef' : 'image');
  const m = config.models[key];
  const run = async (modelId: string) => {
    const t0 = Date.now();
    const parts: Part[] = [...(opts.refs ?? []).map((b) => imagePart(b, 'image/png')), { text: opts.prompt }];
    const res = await ai.models.generateContent({
      model: modelId,
      contents: [{ role: 'user', parts }],
      config: { responseModalities: [Modality.IMAGE], imageConfig: { aspectRatio: opts.aspect ?? '1:1' } } as any,
    });
    const part = res.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
    if (!part?.inlineData?.data) throw new Error('no image in response');
    const u = res.usageMetadata;
    const inTokens = u?.promptTokenCount ?? 0, outTokens = u?.candidatesTokenCount ?? 0;
    return { bytes: Buffer.from(part.inlineData.data, 'base64'), mime: part.inlineData.mimeType ?? 'image/png',
      usage: { model: modelId, inTokens, outTokens, thoughtTokens: 0, images: 1, costUsd: costOf(modelId, inTokens, outTokens), ms: Date.now() - t0 } };
  };
  try { return await run(m.id); } catch (e: any) { if (m.fallback !== m.id) { console.warn(`[gemini] image: ${m.id} failed (${String(e?.message).slice(0, 120)}); retrying with ${m.fallback}`); return run(m.fallback); } throw e; }
}

export type TtsResult = { wav: Buffer; durationMs: number; usage: Usage };

/** Synthesize speech (streamed PCM 24 kHz mono → WAV). `style` is a natural-language delivery instruction. */
export async function synthesize(opts: { text: string; voice?: string; style?: string; lang?: string; model?: ModelKey }): Promise<TtsResult> {
  const { ai } = await clients();
  const m = config.models[opts.model ?? 'tts'];
  const run = async (modelId: string) => {
    const t0 = Date.now();
    let ttfb: number | undefined;
    const chunks: Buffer[] = [];
    let usage: any = null;
    const prompt = `${opts.style ? opts.style.trim().replace(/[.:]?$/, ':') + ' ' : ''}${opts.text}`;
    const stream = await ai.models.generateContentStream({
      model: modelId,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: { responseModalities: [Modality.AUDIO], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: opts.voice ?? 'Kore' } } } } as any,
    });
    for await (const chunk of stream) {
      for (const p of chunk.candidates?.[0]?.content?.parts ?? []) {
        if (p.inlineData?.data) { if (ttfb === undefined) ttfb = Date.now() - t0; chunks.push(Buffer.from(p.inlineData.data, 'base64')); }
      }
      if (chunk.usageMetadata) usage = chunk.usageMetadata;
    }
    const pcm = Buffer.concat(chunks);
    if (!pcm.length) throw new Error('no audio in response');
    const inTokens = usage?.promptTokenCount ?? 0, outTokens = usage?.candidatesTokenCount ?? 0;
    return { wav: pcmToWav(pcm, 24000, 1), durationMs: Math.round((pcm.length / 2 / 24000) * 1000),
      usage: { model: modelId, inTokens, outTokens, thoughtTokens: 0, costUsd: costOf(modelId, inTokens, outTokens), ms: Date.now() - t0, ttfbMs: ttfb } };
  };
  try { return await run(m.id); } catch (e: any) { if (m.fallback !== m.id) { console.warn(`[gemini] tts: ${m.id} failed (${String(e?.message).slice(0, 120)}); retrying with ${m.fallback}`); return run(m.fallback); } throw e; }
}
