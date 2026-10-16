// The developer platform over HTTP. Two parts:
//  - /api/dev/*  the dashboard: a signed-in developer makes, renames and revokes keys and sees usage;
//  - /v1/*       the public REST API: partner servers make lessons from page images with a secret key, then read,
//                list and delete them and fetch their quizzes. Errors are JSON: { error: { type, code, message } }.
import type { Context, Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { randomUUID } from 'node:crypto';
import type { ApiInfo, ExperienceRecord, PipelineEvent } from '@living-book/scene';
import { store, type DevKeyDoc, type DevKeyKind } from './store.js';
import { userFromRequest } from './auth.js';
import { runPipeline } from './pipeline.js';
import { quizFor } from './quiz.js';
import { fetchImage, ImageFetchError } from './fetchimage.js';
import { openapi } from './openapi.js';
import { InputError, MAX_IMAGE, sniffImage, cleanExternalId, cleanMetadata } from './devinput.js';
import {
  createDevKey, publicKey, resolveKey, forgetKey, touchKey, rateLimit, publicOrigin, lessonObject, normalizeOrigin, apiOwner,
  utcDay, lastDays, DEV_DAILY, DEV_PER_MINUTE, MAX_KEYS, MAX_ORIGINS,
} from './devkeys.js';

type ErrType = 'invalid_request_error' | 'authentication_error' | 'permission_error' | 'not_found_error' | 'rate_limit_error' | 'api_error';
const fail = (c: Context, status: number, type: ErrType, code: string, message: string, headers: Record<string, string> = {}) =>
  c.json({ error: { type, code, message } }, status as any, headers);

/** The page image and the partner's references, from multipart, JSON (image_url or image_base64) or a raw image body. */
async function readLessonInput(c: Context): Promise<{ image: Buffer; mime: string; externalUserId?: string; metadata?: Record<string, string> }> {
  const ct = (c.req.header('content-type') || '').toLowerCase();
  let image: Buffer | undefined, ext: unknown, meta: unknown;
  try {
    if (ct.startsWith('multipart/form-data')) {
      const form = await c.req.parseBody().catch(() => { throw new InputError(400, 'invalid_body', 'We cannot read the multipart body.'); });
      const f = form['image'] ?? form['file'];
      if (f && typeof f !== 'string') image = Buffer.from(await (f as File).arrayBuffer());
      else if (typeof form['image_url'] === 'string') image = (await fetchImage(form['image_url'], MAX_IMAGE)).bytes;
      ext = form['external_user_id']; meta = form['metadata'];
    } else if (ct.startsWith('application/json')) {
      const body = await c.req.json().catch(() => { throw new InputError(400, 'invalid_json', 'The body is not valid JSON.'); });
      if (typeof body?.image_base64 === 'string') image = Buffer.from(body.image_base64.replace(/^data:[^,]*,/, ''), 'base64');
      else if (typeof body?.image_url === 'string') image = (await fetchImage(body.image_url, MAX_IMAGE)).bytes;
      ext = body?.external_user_id; meta = body?.metadata;
    } else if (ct.startsWith('image/') || ct.startsWith('application/octet-stream')) {
      image = Buffer.from(await c.req.arrayBuffer());
      ext = c.req.query('external_user_id'); meta = c.req.query('metadata');
    } else {
      throw new InputError(415, 'unsupported_media_type', 'Send the page as multipart/form-data (field "image"), as JSON with "image_url" or "image_base64", or as a raw image/jpeg, image/png or image/webp body.');
    }
  } catch (e) {
    if (e instanceof ImageFetchError) throw new InputError(e.status, e.code, e.message);
    throw e;
  }
  if (!image || !image.length) throw new InputError(400, 'image_missing', 'No page image was sent: use the multipart field "image", or "image_url" / "image_base64" in JSON.');
  if (image.length > MAX_IMAGE) throw new InputError(413, 'image_too_large', 'The image is larger than 15 MB.');
  if (image.length < 1000) throw new InputError(400, 'image_too_small', 'The image is too small to read (under 1 KB).');
  const mime = sniffImage(image);
  if (!mime) throw new InputError(415, 'image_type_unsupported', 'The image must be a JPEG, PNG or WebP.');
  return { image, mime, externalUserId: cleanExternalId(ext), metadata: cleanMetadata(meta) };
}

/** The secret key on a REST call ("Authorization: Bearer ltsk_..." or "X-Api-Key"), or the error to answer with. */
async function secretKey(c: Context): Promise<DevKeyDoc | Response> {
  const h = c.req.header('authorization');
  const raw = (h?.startsWith('Bearer ') ? h.slice(7) : c.req.header('x-api-key') ?? '').trim();
  if (!raw) return fail(c, 401, 'authentication_error', 'missing_api_key', 'Send your secret key as "Authorization: Bearer ltsk_...".');
  if (raw.startsWith('ltpk_')) return fail(c, 403, 'permission_error', 'publishable_key', 'A publishable key (ltpk_) only opens the scanner embed. Call the REST API from your server with a secret key (ltsk_).');
  const doc = await resolveKey(raw);
  if (!doc) return fail(c, 401, 'authentication_error', 'invalid_api_key', 'This API key is not valid, or it was revoked.');
  if (doc.kind !== 'secret') return fail(c, 403, 'permission_error', 'publishable_key', 'Call the REST API with a secret key (ltsk_).');
  touchKey(doc);
  return doc;
}

/** One of the account's lessons, or the 404 to answer with (lessons of other accounts are not found, not forbidden). */
async function ownLesson(c: Context, key: DevKeyDoc): Promise<ExperienceRecord | Response> {
  const rec = await store.getRecord(c.req.param('id') ?? '');
  if (!rec || rec.ownerId !== apiOwner(key.owner)) return fail(c, 404, 'not_found_error', 'lesson_not_found', 'No lesson with this id belongs to your account.');
  return rec;
}

const rateHeaders = (r: { limit: number; remaining: number; resetSeconds: number }) => ({ 'X-RateLimit-Limit': String(r.limit), 'X-RateLimit-Remaining': String(r.remaining), 'X-RateLimit-Reset': String(r.resetSeconds) });

/** A developer's usage for the dashboard and the API: today and the last 14 days, in total and per key. */
async function usageOf(owner: string) {
  const days = lastDays(14);
  const docs = await store.getDevUsage(owner, days).catch(() => []);
  const byDay = new Map(docs.map((d) => [d.day, d]));
  const list = days.map((day) => ({ day, lessons: byDay.get(day)?.total ?? 0, by_key: byDay.get(day)?.byKey ?? {} }));
  return { object: 'usage' as const, daily_limit: DEV_DAILY, per_minute_limit: DEV_PER_MINUTE, today: list[list.length - 1]!, days: list };
}

export function mountDeveloperPlatform(app: Hono) {
  // ---------- the dashboard (signed-in developers) ----------
  const developer = async (c: Context) => userFromRequest(c);
  const signin = (c: Context) => c.json({ error: 'Sign in to manage API keys.', code: 'signin-required' }, 401);

  app.get('/api/dev/keys', async (c) => {
    const user = await developer(c); if (!user) return signin(c);
    return c.json((await store.listDevKeys(user.uid)).map(publicKey), 200, { 'Cache-Control': 'no-store' });
  });
  app.post('/api/dev/keys', async (c) => {
    const user = await developer(c); if (!user) return signin(c);
    const body = await c.req.json().catch(() => ({} as any));
    const kind: DevKeyKind | null = body?.kind === 'secret' || body?.kind === 'publishable' ? body.kind : null;
    if (!kind) return c.json({ error: 'Choose a secret key (for your server) or a publishable key (for the scanner embed).' }, 400);
    const name = String(body?.name ?? '').trim().slice(0, 60) || (kind === 'secret' ? 'Server key' : 'Website key');
    let origins: string[] = [];
    if (kind === 'publishable') {
      const raw: string[] = Array.isArray(body?.origins) ? body.origins.map(String) : String(body?.origins ?? '').split(/[\s,]+/);
      const wanted = raw.map((s) => s.trim()).filter(Boolean);
      const bad = wanted.filter((s) => !normalizeOrigin(s));
      if (bad.length) return c.json({ error: `These are not site addresses: ${bad.slice(0, 3).join(', ')}. Use https://your-site.com (or http://localhost:3000 while developing).` }, 400);
      origins = [...new Set(wanted.map((s) => normalizeOrigin(s)!))];
      if (!origins.length) return c.json({ error: 'List the sites that will show the scanner, for example https://your-school.app.' }, 400);
      if (origins.length > MAX_ORIGINS) return c.json({ error: `At most ${MAX_ORIGINS} sites per key.` }, 400);
    }
    const active = (await store.listDevKeys(user.uid)).filter((k) => !k.revokedAt);
    if (active.length >= MAX_KEYS) return c.json({ error: `You have ${MAX_KEYS} active keys. Revoke one you no longer use first.` }, 400);
    const { key, doc } = await createDevKey(user.uid, { name, kind, origins });
    console.log(`[dev] key ${doc.id} (${kind}) made for ${user.uid.slice(0, 8)}`);
    return c.json({ ...publicKey(doc), key }, 201, { 'Cache-Control': 'no-store' });
  });
  const ownKey = async (c: Context) => {
    const user = await developer(c); if (!user) return { error: signin(c) };
    const doc = (await store.listDevKeys(user.uid)).find((k) => k.id === c.req.param('id'));
    if (!doc) return { error: c.json({ error: 'not found' }, 404) };
    return { doc };
  };
  app.patch('/api/dev/keys/:id', async (c) => {
    const r = await ownKey(c); if (r.error) return r.error; const doc = r.doc!;
    if (doc.revokedAt) return c.json({ error: 'This key was revoked.' }, 400);
    const body = await c.req.json().catch(() => ({} as any));
    const patch: Partial<DevKeyDoc> = {};
    if (typeof body?.name === 'string' && body.name.trim()) patch.name = body.name.trim().slice(0, 60);
    if (body?.origins !== undefined && doc.kind === 'publishable') {
      const wanted = (Array.isArray(body.origins) ? body.origins.map(String) : String(body.origins).split(/[\s,]+/)).map((s: string) => s.trim()).filter(Boolean);
      const bad = wanted.filter((s: string) => !normalizeOrigin(s));
      if (bad.length) return c.json({ error: `These are not site addresses: ${bad.slice(0, 3).join(', ')}.` }, 400);
      const origins = [...new Set(wanted.map((s: string) => normalizeOrigin(s)!))] as string[];
      if (!origins.length || origins.length > MAX_ORIGINS) return c.json({ error: `List between 1 and ${MAX_ORIGINS} sites.` }, 400);
      patch.origins = origins;
    }
    await store.patchDevKey(doc.hash, patch); forgetKey(doc.hash);
    return c.json(publicKey({ ...doc, ...patch }));
  });
  app.delete('/api/dev/keys/:id', async (c) => {
    const r = await ownKey(c); if (r.error) return r.error; const doc = r.doc!;
    const revokedAt = doc.revokedAt ?? new Date().toISOString();
    await store.patchDevKey(doc.hash, { revokedAt }); forgetKey(doc.hash);
    console.log(`[dev] key ${doc.id} revoked`);
    return c.json(publicKey({ ...doc, revokedAt }));
  });
  app.get('/api/dev/usage', async (c) => {
    const user = await developer(c); if (!user) return signin(c);
    return c.json(await usageOf(user.uid), 200, { 'Cache-Control': 'no-store' });
  });
  app.get('/api/dev/lessons', async (c) => {
    const user = await developer(c); if (!user) return signin(c);
    const recs = await store.listRecords(apiOwner(user.uid), 30);
    const base = publicOrigin(c);
    return c.json(recs.map((r) => lessonObject(r, base)), 200, { 'Cache-Control': 'no-store' });
  });

  // ---------- the public REST API (secret keys) ----------
  app.get('/v1', (c) => c.json({ object: 'api', version: 'v1', docs: `${publicOrigin(c)}/developers`, openapi: `${publicOrigin(c)}/v1/openapi.json` }));
  app.get('/v1/openapi.json', (c) => c.json(openapi(publicOrigin(c)), 200, { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=300' }));

  app.post('/v1/lessons', async (c) => {
    const key = await secretKey(c); if (key instanceof Response) return key;
    if (Number(c.req.header('content-length') || 0) > MAX_IMAGE * 1.4 + 65536) return fail(c, 413, 'invalid_request_error', 'image_too_large', 'The image is larger than 15 MB.');
    let input: Awaited<ReturnType<typeof readLessonInput>>;
    try { input = await readLessonInput(c); }
    catch (e) { if (e instanceof InputError) return fail(c, e.status, 'invalid_request_error', e.code, e.message); throw e; }
    const rl = rateLimit(key.id);
    if (!rl.ok) return fail(c, 429, 'rate_limit_error', 'rate_limited', `At most ${rl.limit} lessons a minute per key. Try again in ${rl.resetSeconds} s.`, { ...rateHeaders(rl), 'Retry-After': String(rl.resetSeconds) });
    const q = await store.bumpDevUsage(key.owner, utcDay(), key.id, DEV_DAILY).catch(() => ({ allowed: true, used: 0 }));
    if (!q.allowed) return fail(c, 429, 'rate_limit_error', 'daily_limit', `Your account has made its ${DEV_DAILY} lessons for today. The allowance resets at midnight UTC.`, rateHeaders(rl));
    touchKey(key, true);
    const id = randomUUID(), base = publicOrigin(c);
    const api: ApiInfo = { keyId: key.id, source: 'api', externalUserId: input.externalUserId, metadata: input.metadata };
    const run = (emit: (e: PipelineEvent) => void) => runPipeline({ id, image: input.image, mime: input.mime, ownerId: apiOwner(key.owner), api }, emit);
    const settle = async (rec: ExperienceRecord) => {
      if (rec.quick?.kind === 'unsupported') {
        await store.deleteRecord(rec.id).catch(() => {});
        return { error: { type: 'invalid_request_error' as const, code: 'page_not_supported', message: 'This image does not look like a page of a book. Send a clear photo or scan of one page.' } };
      }
      console.log(`[v1] lesson ${rec.id} for key ${key.id}`);
      return { lesson: lessonObject(rec, base) };
    };
    if (c.req.query('stream') === 'true' || c.req.query('stream') === '1') {
      // Server-sent events: "progress" for each stage, then "lesson" (or "error"); a comment line every 15 s keeps proxies open
      return streamSSE(c, async (stream) => {
        let chain: Promise<void> = Promise.resolve();
        const write = (event: string, data: unknown) => { chain = chain.then(() => stream.writeSSE({ event, data: JSON.stringify(data) })).catch(() => {}); };
        const keepAlive = setInterval(() => { chain = chain.then(() => stream.write(': keep-alive\n\n')).then(() => {}).catch(() => {}); }, 15000);
        write('progress', { stage: 'accepted', status: 'done', detail: id });
        try {
          const rec = await run((e) => { if (e.type === 'stage') write('progress', { stage: e.stage, status: e.status, detail: e.detail ?? '' }); });
          const r = await settle(rec);
          if ('error' in r) write('error', { error: r.error }); else write('lesson', r.lesson);
        } catch (e: any) {
          console.error('[v1] generation failed', String(e?.message || e).slice(0, 200));
          write('error', { error: { type: 'api_error', code: 'generation_failed', message: 'We cannot make the lesson now. Please try again.' } });
        } finally { clearInterval(keepAlive); await chain; }
      });
    }
    try {
      const r = await settle(await run(() => {}));
      if ('error' in r) return c.json({ error: r.error }, 422, rateHeaders(rl));
      return c.json(r.lesson, 201, rateHeaders(rl));
    } catch (e: any) {
      console.error('[v1] generation failed', String(e?.message || e).slice(0, 200));
      return fail(c, 502, 'api_error', 'generation_failed', 'We cannot make the lesson now. Please try again.', rateHeaders(rl));
    }
  });

  app.get('/v1/lessons', async (c) => {
    const key = await secretKey(c); if (key instanceof Response) return key;
    const limit = Math.min(100, Math.max(1, Number(c.req.query('limit')) || 20));
    const after = c.req.query('starting_after'), ext = c.req.query('external_user_id');
    let recs = await store.listRecords(apiOwner(key.owner), 1000);
    if (ext) recs = recs.filter((r) => r.api?.externalUserId === ext);
    let start = 0;
    if (after) { const i = recs.findIndex((r) => r.id === after); if (i < 0) return fail(c, 400, 'invalid_request_error', 'starting_after_unknown', 'starting_after is not one of your lessons.'); start = i + 1; }
    const page = recs.slice(start, start + limit), base = publicOrigin(c);
    return c.json({ object: 'list', data: page.map((r) => lessonObject(r, base)), has_more: start + limit < recs.length });
  });
  app.get('/v1/lessons/:id', async (c) => {
    const key = await secretKey(c); if (key instanceof Response) return key;
    const rec = await ownLesson(c, key); if (rec instanceof Response) return rec;
    return c.json(lessonObject(rec, publicOrigin(c)));
  });
  app.delete('/v1/lessons/:id', async (c) => {
    const key = await secretKey(c); if (key instanceof Response) return key;
    const rec = await ownLesson(c, key); if (rec instanceof Response) return rec;
    await store.deleteRecord(rec.id);
    return c.json({ id: rec.id, object: 'lesson', deleted: true });
  });
  app.get('/v1/lessons/:id/quiz', async (c) => {
    const key = await secretKey(c); if (key instanceof Response) return key;
    const rec = await ownLesson(c, key); if (rec instanceof Response) return rec;
    const quiz = await quizFor(rec.id).catch(() => null);
    if (!quiz) return fail(c, 404, 'not_found_error', 'quiz_unavailable', 'We cannot make a quiz for this lesson.');
    return c.json({ object: 'quiz', lesson_id: rec.id, language: quiz.language, questions: quiz.questions.map((q) => ({ question: q.q, options: q.options, answer_index: q.answer, explanation: q.why })) });
  });
  app.get('/v1/usage', async (c) => {
    const key = await secretKey(c); if (key instanceof Response) return key;
    return c.json(await usageOf(key.owner));
  });
  app.all('/v1/*', (c) => fail(c, 404, 'not_found_error', 'route_not_found', `No such endpoint: ${c.req.method} ${new URL(c.req.url).pathname}. See ${publicOrigin(c)}/developers.`));
}
