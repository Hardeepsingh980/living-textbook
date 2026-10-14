// Living Textbook SDK for servers: make living lessons from photos of textbook pages, then read, list and delete them
// and fetch their quizzes. Works in Node 18+, Deno, Bun and edge runtimes (anything with fetch, FormData and Blob).
//
//   import { LivingTextbook } from '@living-textbook/sdk';
//   const lt = new LivingTextbook({ apiKey: process.env.LIVING_TEXTBOOK_SECRET_KEY! });
//   const lesson = await lt.lessons.create({ image: await fs.readFile('page.jpg'), externalUserId: 'student-42' });
//   console.log(lesson.embed_url);
import type { Lesson, LessonList, Quiz, Usage, Progress, ErrorType } from './types.js';

export * from './types.js';
export { createEmbed } from './embed.js';
export type { EmbedOptions, LessonPlayer, LessonPlayerOptions, Scanner, ScannerOptions, EmbedEvent, EmbedEventType, EmbeddedLesson } from './embed.js';

import { VERSION, DEFAULT_BASE_URL } from './constants.js';
export { VERSION, DEFAULT_BASE_URL };

/** An error the API explained: `status` is the HTTP status, `type` and `code` say what went wrong. */
export class LivingTextbookError extends Error {
  constructor(public status: number, public type: ErrorType | 'connection_error', public code: string, message: string) {
    super(message);
    this.name = 'LivingTextbookError';
  }
}

export interface ClientOptions {
  /** Your secret key (ltsk_...). Keep it on your server. */
  apiKey: string;
  /** The API's address; defaults to the hosted service. */
  baseUrl?: string;
  /** How long one call may take before it is abandoned (default 120 s: making a lesson takes 10-30 s). */
  timeoutMs?: number;
  /** A fetch implementation, for runtimes without a global one or for tests. */
  fetch?: typeof fetch;
}

/** A page image: bytes (Uint8Array, a Node Buffer, ArrayBuffer) or a Blob/File. */
export type ImageInput = Uint8Array | ArrayBuffer | Blob;

export interface CreateLessonParams {
  /** The page image (JPEG, PNG or WebP, up to 15 MB). Send this or `imageUrl`. */
  image?: ImageInput;
  /** A public https URL of the page image. */
  imageUrl?: string;
  /** Your own id for the learner (opaque to us, up to 128 characters); filter lists by it later. */
  externalUserId?: string;
  /** Up to 20 short values kept with the lesson and returned with it. */
  metadata?: Record<string, string | number | boolean>;
  /** Called for each step while the lesson is made (the request then streams progress). */
  onProgress?: (p: Progress) => void;
  signal?: AbortSignal;
}

export interface ListLessonsParams { limit?: number; startingAfter?: string; externalUserId?: string }

/** The image's type from its first bytes (so a Blob without a type still arrives correctly). */
function sniff(b: Uint8Array): string {
  if (b[0] === 0xff && b[1] === 0xd8) return 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
  return 'application/octet-stream';
}
async function toBlob(image: ImageInput): Promise<Blob> {
  if (typeof Blob !== 'undefined' && image instanceof Blob) {
    if (image.type) return image;
    const head = new Uint8Array(await image.slice(0, 16).arrayBuffer());
    return new Blob([image], { type: sniff(head) });
  }
  const bytes = image instanceof ArrayBuffer ? new Uint8Array(image) : (image as Uint8Array);
  const copy = new Uint8Array(bytes.byteLength); copy.set(bytes); // a plain ArrayBuffer-backed copy (Node Buffers may share a pool)
  return new Blob([copy.buffer], { type: sniff(copy) });
}

/** Reads a server-sent event stream: calls `on(event, data)` for each event. */
export async function readEvents(body: ReadableStream<Uint8Array>, on: (event: string, data: string) => void): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  const flush = (chunk: string) => {
    let event = 'message'; const data: string[] = [];
    for (const line of chunk.split(/\r?\n/)) {
      if (!line || line.startsWith(':')) continue;
      const i = line.indexOf(':');
      const field = i < 0 ? line : line.slice(0, i), value = i < 0 ? '' : line.slice(i + 1).replace(/^ /, '');
      if (field === 'event') event = value; else if (field === 'data') data.push(value);
    }
    if (data.length) on(event, data.join('\n'));
  };
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.search(/\r?\n\r?\n/)) >= 0) {
      const m = /\r?\n\r?\n/.exec(buf.slice(idx))!;
      flush(buf.slice(0, idx)); buf = buf.slice(idx + m[0].length);
    }
  }
  if (buf.trim()) flush(buf);
}

export class LivingTextbook {
  private readonly key: string;
  private readonly base: string;
  private readonly timeoutMs: number;
  private readonly doFetch: typeof fetch;

  constructor(options: ClientOptions) {
    if (!options?.apiKey) throw new Error('LivingTextbook: pass your secret key as { apiKey }.');
    if (options.apiKey.startsWith('ltpk_')) throw new Error('LivingTextbook: this is a publishable key (ltpk_); it only opens the scanner embed. Use your secret key (ltsk_) on your server.');
    this.key = options.apiKey;
    this.base = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.timeoutMs = options.timeoutMs ?? 120_000;
    const f = options.fetch ?? (typeof fetch !== 'undefined' ? fetch : undefined);
    if (!f) throw new Error('LivingTextbook: no fetch in this runtime; pass { fetch }.');
    this.doFetch = f.bind(globalThis) as typeof fetch;
  }

  private async call(method: string, path: string, init: { body?: BodyInit; headers?: Record<string, string>; signal?: AbortSignal } = {}): Promise<Response> {
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(), this.timeoutMs);
    const signal = init.signal ? anySignal([init.signal, timeout.signal]) : timeout.signal;
    try {
      const res = await this.doFetch(`${this.base}/v1${path}`, { method, body: init.body, signal, headers: { authorization: `Bearer ${this.key}`, 'user-agent': `living-textbook-sdk/${VERSION}`, ...init.headers } });
      if (!res.ok) {
        const j: any = await res.json().catch(() => null);
        const e = j?.error;
        throw new LivingTextbookError(res.status, e?.type ?? 'api_error', e?.code ?? `http_${res.status}`, e?.message ?? `The API answered ${res.status}.`);
      }
      return res;
    } catch (e: any) {
      if (e instanceof LivingTextbookError) throw e;
      if (timeout.signal.aborted) throw new LivingTextbookError(0, 'connection_error', 'timeout', `No answer within ${Math.round(this.timeoutMs / 1000)} s.`);
      if (init.signal?.aborted) throw e;
      throw new LivingTextbookError(0, 'connection_error', 'network', `Could not reach the API: ${String(e?.message ?? e)}`);
    } finally { clearTimeout(timer); }
  }
  private async json<T>(method: string, path: string, init?: Parameters<LivingTextbook['call']>[2]): Promise<T> {
    return (await (await this.call(method, path, init)).json()) as T;
  }

  readonly lessons = {
    /** Make a lesson from a page image. Resolves when the lesson is ready (10-30 s). */
    create: async (params: CreateLessonParams): Promise<Lesson> => {
      if (!params?.image && !params?.imageUrl) throw new Error('lessons.create: pass { image } (bytes or a Blob) or { imageUrl }.');
      const metadata = params.metadata ? Object.fromEntries(Object.entries(params.metadata).map(([k, v]) => [k, String(v)])) : undefined;
      let body: BodyInit; const headers: Record<string, string> = {};
      if (params.image) {
        const form = new FormData();
        form.append('image', await toBlob(params.image), 'page');
        if (params.externalUserId) form.append('external_user_id', params.externalUserId);
        if (metadata) form.append('metadata', JSON.stringify(metadata));
        body = form;
      } else {
        body = JSON.stringify({ image_url: params.imageUrl, external_user_id: params.externalUserId, metadata });
        headers['content-type'] = 'application/json';
      }
      if (!params.onProgress) return this.json<Lesson>('POST', '/lessons', { body, headers, signal: params.signal });
      const res = await this.call('POST', '/lessons?stream=true', { body, headers: { ...headers, accept: 'text/event-stream' }, signal: params.signal });
      let lesson: Lesson | null = null; let failure: LivingTextbookError | null = null;
      await readEvents(res.body!, (event, data) => {
        let d: any; try { d = JSON.parse(data); } catch { return; }
        if (event === 'progress') params.onProgress!(d as Progress);
        else if (event === 'lesson') lesson = d as Lesson;
        else if (event === 'error') failure = new LivingTextbookError(422, d?.error?.type ?? 'api_error', d?.error?.code ?? 'generation_failed', d?.error?.message ?? 'The lesson could not be made.');
      });
      if (failure) throw failure;
      if (!lesson) throw new LivingTextbookError(502, 'api_error', 'stream_ended', 'The stream ended before the lesson was ready.');
      return lesson;
    },
    /** Get one of your lessons. */
    retrieve: (id: string): Promise<Lesson> => this.json('GET', `/lessons/${encodeURIComponent(id)}`),
    /** Your lessons, newest first, a page at a time (`has_more` and `startingAfter` page through them). */
    list: (params: ListLessonsParams = {}): Promise<LessonList> => {
      const q = new URLSearchParams();
      if (params.limit) q.set('limit', String(params.limit));
      if (params.startingAfter) q.set('starting_after', params.startingAfter);
      if (params.externalUserId) q.set('external_user_id', params.externalUserId);
      return this.json('GET', `/lessons${q.size ? `?${q}` : ''}`);
    },
    /** Delete one of your lessons (its page image, voice and pictures go with it). */
    del: (id: string): Promise<{ id: string; object: 'lesson'; deleted: true }> => this.json('DELETE', `/lessons/${encodeURIComponent(id)}`),
    /** A short quiz from the page's own text (made on first request, then kept). */
    quiz: (id: string): Promise<Quiz> => this.json('GET', `/lessons/${encodeURIComponent(id)}/quiz`),
  };

  readonly usage = {
    /** Lessons made today and over the last 14 days, against your daily allowance. */
    retrieve: (): Promise<Usage> => this.json('GET', '/usage'),
  };

  /** Iterate over every lesson (newest first), fetching pages as needed. */
  async *allLessons(params: Omit<ListLessonsParams, 'startingAfter'> = {}): AsyncGenerator<Lesson> {
    let after: string | undefined;
    for (;;) {
      const page = await this.lessons.list({ ...params, startingAfter: after, limit: params.limit ?? 100 });
      for (const l of page.data) yield l;
      if (!page.has_more || !page.data.length) return;
      after = page.data[page.data.length - 1]!.id;
    }
  }

  /** The address of a lesson's player, for an iframe (`embed_url` on a lesson is the same). */
  embedUrl(lessonId: string): string { return `${this.base}/embed/lesson/${encodeURIComponent(lessonId)}`; }
  /** The address of the scanner, for an iframe on one of your publishable key's sites. */
  scannerUrl(publishableKey: string): string { return `${this.base}/embed/scan?key=${encodeURIComponent(publishableKey)}`; }
}

/** An AbortSignal that aborts when any of `signals` does (AbortSignal.any where available). */
function anySignal(signals: AbortSignal[]): AbortSignal {
  const any = (AbortSignal as any).any as ((s: AbortSignal[]) => AbortSignal) | undefined;
  if (any) return any(signals);
  const c = new AbortController();
  for (const s of signals) { if (s.aborted) { c.abort(); break; } s.addEventListener('abort', () => c.abort(), { once: true }); }
  return c.signal;
}

export default LivingTextbook;
