import { describe, it, expect } from 'vitest';
import { LivingTextbook, LivingTextbookError, readEvents, createEmbed } from './index.js';

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new Array(2000).fill(7)]);
const lesson = { id: 'L1', object: 'lesson', title: 'Heat', embed_url: 'https://x/embed/lesson/L1' };

function fakeFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const calls: { url: string; init: RequestInit }[] = [];
  const f = (async (url: any, init: any) => { calls.push({ url: String(url), init }); return handler(String(url), init); }) as typeof fetch;
  return { f, calls };
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const stream = (text: string, chunk = 7) => new ReadableStream<Uint8Array>({
  start(c) { const b = new TextEncoder().encode(text); for (let i = 0; i < b.length; i += chunk) c.enqueue(b.slice(i, i + chunk)); c.close(); },
});

describe('the client', () => {
  it('refuses a publishable key and a missing key', () => {
    expect(() => new LivingTextbook({ apiKey: 'ltpk_abc' })).toThrow(/publishable/);
    expect(() => new LivingTextbook({ apiKey: '' })).toThrow();
  });

  it('uploads a page as multipart with the learner and metadata', async () => {
    const { f, calls } = fakeFetch(() => json(lesson, 201));
    const lt = new LivingTextbook({ apiKey: 'ltsk_test', baseUrl: 'https://lt.example/', fetch: f });
    const l = await lt.lessons.create({ image: JPEG, externalUserId: 'stu-1', metadata: { week: 3 } });
    expect(l.id).toBe('L1');
    expect(calls[0]!.url).toBe('https://lt.example/v1/lessons');
    expect((calls[0]!.init.headers as any).authorization).toBe('Bearer ltsk_test');
    const form = calls[0]!.init.body as FormData;
    expect((form.get('image') as Blob).type).toBe('image/jpeg');
    expect(form.get('external_user_id')).toBe('stu-1');
    expect(JSON.parse(String(form.get('metadata')))).toEqual({ week: '3' });
  });

  it('sends an image URL as JSON', async () => {
    const { f, calls } = fakeFetch(() => json(lesson, 201));
    await new LivingTextbook({ apiKey: 'ltsk_test', fetch: f }).lessons.create({ imageUrl: 'https://cdn.example/p.jpg' });
    expect((calls[0]!.init.headers as any)['content-type']).toBe('application/json');
    expect(JSON.parse(String(calls[0]!.init.body))).toMatchObject({ image_url: 'https://cdn.example/p.jpg' });
  });

  it('streams progress, then returns the lesson', async () => {
    const sse = `event: progress\ndata: {"stage":"read","status":"start","detail":""}\n\n: keep-alive\n\nevent: progress\ndata: {"stage":"read","status":"done","detail":"ok"}\n\nevent: lesson\ndata: ${JSON.stringify(lesson)}\n\n`;
    const { f, calls } = fakeFetch(() => new Response(stream(sse), { status: 200, headers: { 'content-type': 'text/event-stream' } }));
    const seen: string[] = [];
    const l = await new LivingTextbook({ apiKey: 'ltsk_test', fetch: f }).lessons.create({ image: JPEG, onProgress: (p) => seen.push(`${p.stage}:${p.status}`) });
    expect(calls[0]!.url).toContain('/v1/lessons?stream=true');
    expect(seen).toEqual(['read:start', 'read:done']);
    expect(l.title).toBe('Heat');
  });

  it('turns a streamed error into an exception', async () => {
    const sse = 'event: error\ndata: {"error":{"type":"invalid_request_error","code":"page_not_supported","message":"Not a page."}}\n\n';
    const { f } = fakeFetch(() => new Response(stream(sse), { status: 200 }));
    await expect(new LivingTextbook({ apiKey: 'ltsk_test', fetch: f }).lessons.create({ image: JPEG, onProgress: () => {} })).rejects.toMatchObject({ code: 'page_not_supported' });
  });

  it('explains API errors', async () => {
    const { f } = fakeFetch(() => json({ error: { type: 'authentication_error', code: 'invalid_api_key', message: 'Bad key.' } }, 401));
    const err = await new LivingTextbook({ apiKey: 'ltsk_test', fetch: f }).lessons.retrieve('L1').catch((e) => e);
    expect(err).toBeInstanceOf(LivingTextbookError);
    expect(err).toMatchObject({ status: 401, type: 'authentication_error', code: 'invalid_api_key', message: 'Bad key.' });
  });

  it('pages through every lesson', async () => {
    const pages: Record<string, unknown> = {
      '': { object: 'list', data: [{ id: 'a' }, { id: 'b' }], has_more: true },
      b: { object: 'list', data: [{ id: 'c' }], has_more: false },
    };
    const { f, calls } = fakeFetch((url) => json(pages[new URL(url).searchParams.get('starting_after') ?? '']));
    const ids: string[] = [];
    for await (const l of new LivingTextbook({ apiKey: 'ltsk_test', fetch: f }).allLessons({ externalUserId: 'u' })) ids.push(l.id);
    expect(ids).toEqual(['a', 'b', 'c']);
    expect(calls[0]!.url).toContain('external_user_id=u');
  });

  it('builds embed addresses', () => {
    const lt = new LivingTextbook({ apiKey: 'ltsk_test', baseUrl: 'https://lt.example', fetch: (() => {}) as any });
    expect(lt.embedUrl('L 1')).toBe('https://lt.example/embed/lesson/L%201');
    expect(lt.scannerUrl('ltpk_x')).toBe('https://lt.example/embed/scan?key=ltpk_x');
  });
});

describe('server-sent events', () => {
  it('survive any chunking and CRLF line ends', async () => {
    const got: string[] = [];
    await readEvents(stream('event: a\r\ndata: 1\r\n\r\nevent: b\ndata: 2\ndata: 3\n\n', 3), (e, d) => got.push(`${e}=${d}`));
    expect(got).toEqual(['a=1', 'b=2\n3']);
  });
});

describe('the embed', () => {
  it('never takes a secret key', () => {
    expect(() => createEmbed({ publishableKey: 'ltsk_oops' })).toThrow(/secret key/);
  });
});
