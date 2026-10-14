// End-to-end check of the developer platform against a running server:
//   pnpm exec tsx scripts/dev-platform-test.mts <page.jpg> [server]
// Locally it signs in a test reader (server DEV_USERS=1); against Cloud Run pass LT_DEV_TOKEN (a Firebase ID token) or
// LT_SECRET_KEY + LT_PUBLISHABLE_KEY for keys made in the dashboard. It makes keys, makes a lesson with the Node SDK
// (and one through the scanner path), reads, lists, quizzes and deletes, checks the errors, the frame rules and the
// SDK files, and revokes the keys it made.
import fs from 'node:fs';
import { LivingTextbook, LivingTextbookError } from '../../../packages/sdk/dist/index.js';

const [pagePath, serverArg] = process.argv.slice(2);
if (!pagePath) { console.error('usage: dev-platform-test.mts <page.jpg> [server]'); process.exit(1); }
const SERVER = (serverArg || 'http://localhost:8080').replace(/\/+$/, '');
const page = fs.readFileSync(pagePath);
const dev: Record<string, string> = process.env.LT_DEV_TOKEN ? { authorization: `Bearer ${process.env.LT_DEV_TOKEN}` } : { 'x-dev-user': 'platformtest' };
let failures = 0;
const ok = (cond: unknown, what: string, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'} ${what}${extra ? `  (${extra})` : ''}`); if (!cond) failures++; };
const j = async (r: Response) => { try { return await r.json(); } catch { return null; } };

// ---- keys (the dashboard's calls)
let secret = process.env.LT_SECRET_KEY, publishable = process.env.LT_PUBLISHABLE_KEY;
const made: string[] = [];
if (!secret || !publishable) {
  const mk = async (body: object) => { const r = await fetch(`${SERVER}/api/dev/keys`, { method: 'POST', headers: { ...dev, 'content-type': 'application/json' }, body: JSON.stringify(body) }); return { status: r.status, body: await j(r) }; };
  const s = await mk({ kind: 'secret', name: 'e2e server' });
  ok(s.status === 201 && /^ltsk_[0-9A-Za-z]{40}$/.test(s.body?.key), 'make a secret key', `${s.status} ${s.body?.display ?? s.body?.error}`);
  const p = await mk({ kind: 'publishable', name: 'e2e site', origins: ['http://localhost:5500', 'https://*.school.example'] });
  ok(p.status === 201 && /^ltpk_/.test(p.body?.key) && p.body?.origins?.length === 2, 'make a publishable key', `${p.status} ${JSON.stringify(p.body?.origins)}`);
  const bad = await mk({ kind: 'publishable', name: 'bad', origins: ['http://school.example'] });
  ok(bad.status === 400, 'a plain-http site is refused', bad.body?.error);
  const list = await (await fetch(`${SERVER}/api/dev/keys`, { headers: dev })).json();
  ok(Array.isArray(list) && list.some((k: any) => k.id === s.body.id && !k.key) && list.some((k: any) => k.id === p.body.id && k.key === p.body.key), 'the list never shows a secret key again, and shows the publishable one');
  secret = s.body.key; publishable = p.body.key; made.push(s.body.id, p.body.id);
}

// ---- the REST API through the Node SDK
const lt = new LivingTextbook({ apiKey: secret!, baseUrl: SERVER, timeoutMs: 180_000 });
const stages: string[] = [];
const t0 = Date.now();
const lesson = await lt.lessons.create({ image: page, externalUserId: 'e2e-student', metadata: { course: 'physics-10', week: 3 }, onProgress: (p) => stages.push(`${p.stage}:${p.status}`) });
ok(lesson.object === 'lesson' && lesson.status === 'ready' && lesson.steps.length > 0, 'make a lesson (streamed)', `${((Date.now() - t0) / 1000).toFixed(1)} s, "${lesson.title}", ${lesson.steps.length} steps, ${stages.length} progress events`);
ok(lesson.external_user_id === 'e2e-student' && lesson.metadata.week === '3' && lesson.source === 'api', 'your references come back', JSON.stringify(lesson.metadata));
ok(lesson.embed_url.endsWith(`/embed/lesson/${lesson.id}`) && lesson.page.image_url?.startsWith('http'), 'absolute embed and image addresses');
const again = await lt.lessons.retrieve(lesson.id);
ok(again.id === lesson.id, 'retrieve it');
const listed = await lt.lessons.list({ externalUserId: 'e2e-student', limit: 5 });
ok(listed.object === 'list' && listed.data.some((l) => l.id === lesson.id), 'list by learner', `${listed.data.length} shown, has_more ${listed.has_more}`);
const quiz = await lt.lessons.quiz(lesson.id);
ok(quiz.questions.length >= 2 && quiz.questions.every((q) => q.options.length >= 2 && q.answer_index >= 0), 'a quiz from the page', `${quiz.questions.length} questions`);
const usage = await lt.usage.retrieve();
ok(usage.today.lessons >= 1 && usage.days.length === 14, 'usage counts the lesson', `${usage.today.lessons} of ${usage.daily_limit} today`);

// ---- errors
const call = (path: string, init: RequestInit = {}) => fetch(`${SERVER}${path}`, init).then(async (r) => ({ status: r.status, body: await j(r) }));
let r = await call('/v1/lessons');
ok(r.status === 401 && r.body?.error?.code === 'missing_api_key', 'no key: 401 missing_api_key');
r = await call('/v1/lessons', { headers: { authorization: `Bearer ${publishable}` } });
ok(r.status === 403 && r.body?.error?.code === 'publishable_key', 'a publishable key on the API: 403');
r = await call('/v1/lessons', { headers: { authorization: 'Bearer ltsk_000000000000000000000000000000000000000x' } });
ok(r.status === 401 && r.body?.error?.code === 'invalid_api_key', 'an unknown key: 401 invalid_api_key');
const auth = { authorization: `Bearer ${secret}` };
r = await call('/v1/lessons', { method: 'POST', headers: { ...auth, 'content-type': 'text/plain' }, body: 'hello' });
ok(r.status === 415 && r.body?.error?.code === 'unsupported_media_type', 'a text body: 415');
r = await call('/v1/lessons', { method: 'POST', headers: { ...auth, 'content-type': 'image/png' }, body: Buffer.alloc(4000, 7) });
ok(r.status === 415 && r.body?.error?.code === 'image_type_unsupported', 'bytes that are not an image: 415');
r = await call('/v1/lessons', { method: 'POST', headers: { ...auth, 'content-type': 'application/json' }, body: JSON.stringify({ image_url: 'https://169.254.169.254/computeMetadata/v1/' }) });
ok(r.status === 400 && r.body?.error?.code === 'image_url_blocked', 'an image URL on a private address is refused', r.body?.error?.code);
r = await call('/v1/lessons', { method: 'POST', headers: { ...auth, 'content-type': 'application/json' }, body: JSON.stringify({ image_url: 'http://example.com/p.jpg' }) });
ok(r.status === 400 && r.body?.error?.code === 'image_url_invalid', 'a plain-http image URL is refused');
r = await call('/v1/lessons', { method: 'POST', headers: { ...auth, 'content-type': 'application/json' }, body: JSON.stringify({ image_base64: page.toString('base64'), metadata: { 'bad key': 1 } }) });
ok(r.status === 400 && r.body?.error?.code === 'metadata_invalid', 'bad metadata: 400');
r = await call('/v1/lessons/not-a-lesson', { headers: auth });
ok(r.status === 404 && r.body?.error?.code === 'lesson_not_found', 'someone else\'s or no lesson: 404');
r = await call('/v1/nothing', { headers: auth });
ok(r.status === 404 && r.body?.error?.code === 'route_not_found', 'an unknown route: 404');
r = await call('/v1/openapi.json');
ok(r.status === 200 && r.body?.openapi === '3.1.0' && !!r.body?.paths?.['/lessons'], 'the OpenAPI description');

// ---- the scanner path (publishable key) and the frame rules
const pub = await fetch(`${SERVER}/api/experiences`, { method: 'POST', body: page, headers: { 'content-type': 'image/jpeg', 'x-embed-key': publishable!, 'x-embed-parent': 'https://evil.example' } });
ok(pub.status === 403, 'the scanner refuses a site the key does not list', String(pub.status));
const viaScanner = await fetch(`${SERVER}/api/experiences`, { method: 'POST', body: page, headers: { 'content-type': 'image/jpeg', 'x-embed-key': publishable!, 'x-embed-parent': 'http://localhost:5500', 'x-owner-id': 'e2e-visitor' } });
const text = await viaScanner.text();
const done = text.split('\n').filter((l) => l.startsWith('data: ')).map((l) => { try { return JSON.parse(l.slice(6)); } catch { return null; } }).find((e) => e?.type === 'done');
ok(viaScanner.status === 200 && !!done?.experienceId, 'the scanner makes a lesson on a listed site', done?.experienceId);
if (done?.experienceId) {
  const scanned = await lt.lessons.retrieve(done.experienceId).catch((e) => e);
  ok(!(scanned instanceof Error) && scanned.source === 'embed', 'a scanner lesson belongs to the account', scanned.source ?? String(scanned.message));
  const pubRec = await (await fetch(`${SERVER}/api/experiences/${done.experienceId}`)).json();
  ok(pubRec && !('api' in pubRec) && !('ownerId' in pubRec), 'the public record shows neither the owner nor the partner\'s references');
  await lt.lessons.del(done.experienceId);
}
const csp = async (path: string) => (await fetch(`${SERVER}${path}`)).headers.get('content-security-policy') ?? '';
ok((await csp(`/embed/scan?key=${publishable}`)).includes("frame-ancestors 'self' http://localhost:5500 https://*.school.example"), 'the scanner frame is allowed only on the key\'s sites', await csp(`/embed/scan?key=${publishable}`));
ok((await csp('/embed/lesson/x')) === 'frame-ancestors *', 'a lesson frame may be embedded anywhere');
ok((await csp('/app/developers')) === "frame-ancestors 'self'", 'other pages cannot be framed', await csp('/app/developers'));
const sdk = await fetch(`${SERVER}/sdk/v1.js`);
ok(sdk.status === 200 && (sdk.headers.get('content-type') ?? '').includes('javascript') && (await sdk.text()).includes('LivingTextbook'), 'the embed script is served');
const tgz = await fetch(`${SERVER}/sdk/living-textbook-sdk.tgz`);
ok(tgz.status === 200 && (await tgz.arrayBuffer()).byteLength > 5000, 'the Node SDK package is served');

// ---- clean up: delete the lesson, revoke the keys made here
const del = await lt.lessons.del(lesson.id);
ok(del.deleted === true, 'delete the lesson');
const gone = await lt.lessons.retrieve(lesson.id).catch((e) => e);
ok(gone instanceof LivingTextbookError && gone.status === 404, 'it is gone');
for (const id of made) await fetch(`${SERVER}/api/dev/keys/${id}`, { method: 'DELETE', headers: dev });
if (made.length) {
  const after = await lt.lessons.list().catch((e) => e);
  ok(after instanceof LivingTextbookError && after.status === 401, 'a revoked key stops working', after?.code);
}
console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
