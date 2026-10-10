// The generation pipeline: one captured page in, a stream of events out. Stages run in parallel wherever they can;
// every stage degrades gracefully so the client always ends with something renderable.
import sharp from 'sharp';
import { randomUUID } from 'node:crypto';
import {
  normalizeScene, fallbackScene, SceneRuntime, SceneSchema,
  type Scene, type QuickRead, type Extraction, type PipelineEvent, type ExperienceRecord, type Verification, type VerificationCheck, type BoxT, type Issue, type StageName,
} from '@living-book/scene';
import { generateJson, generateImage, synthesize, imagePart, type Usage } from './gemini.js';
import { QUICK_SYSTEM, QUICK_SCHEMA, sceneSystem, EXTRACT_SYSTEM, verifySystem, extractionDigest } from './prompts.js';
import { compileTracking } from './tracking.js';
import { store } from './store.js';
import { config } from './config.js';

export type PipelineInput = { id?: string; image: Buffer; mime: string; ownerId: string; bookId?: string };
type Emit = (e: PipelineEvent) => void;

function pLimit(n: number) {
  let active = 0; const queue: (() => void)[] = [];
  const next = () => { active--; queue.shift()?.(); };
  return <T>(fn: () => Promise<T>) => new Promise<T>((resolve, reject) => {
    const run = () => { active++; fn().then(resolve, reject).finally(next); };
    active < n ? run() : queue.push(run);
  });
}
const withTimeout = <T>(p: Promise<T>, ms: number, what: string) => Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`${what} timed out after ${ms} ms`)), ms).unref())]);

const toPageBox = (box2d: number[], w: number, h: number): BoxT => {
  const [ymin, xmin, ymax, xmax] = box2d.map((v) => Math.min(Math.max(Number(v) || 0, 0), 1000)) as [number, number, number, number];
  return [Math.round((xmin / 1000) * w), Math.round((ymin / 1000) * h), Math.round((xmax / 1000) * w), Math.round((ymax / 1000) * h)];
};

export async function runPipeline(input: PipelineInput, emit: Emit): Promise<ExperienceRecord> {
  const id = input.id ?? randomUUID();
  const t0 = Date.now();
  const T = () => Date.now() - t0;
  const timings: Record<string, number> = {};
  const usages: Usage[] = [];
  const events: PipelineEvent[] = [];
  const send: Emit = (e) => { events.push(e); emit(e); };
  const stage = (stage: StageName, status: 'start' | 'done' | 'error', extra: Partial<{ detail: string; model: string; ms: number }> = {}) => {
    if (status === 'done' && extra.ms !== undefined) timings[stage] = extra.ms;
    send({ type: 'stage', stage, status, t: T(), ...extra } as PipelineEvent);
  };
  const audioClips: ExperienceRecord['audio'] = [];
  const assets: ExperienceRecord['assets'] = [];

  // ---- upload: normalise the photo ----
  stage('upload', 'start', { detail: 'preparing the page image' });
  const tUp = Date.now();
  const base = sharp(input.image, { failOn: 'none' }).rotate();
  const meta = await base.metadata();
  const pageJpeg = await base.clone().resize({ width: config.pageWidth, withoutEnlargement: false }).jpeg({ quality: 86 }).toBuffer();
  const pageMeta = await sharp(pageJpeg).metadata();
  const page = { w: pageMeta.width!, h: pageMeta.height! };
  const quickJpeg = await base.clone().resize({ width: 768 }).jpeg({ quality: 80 }).toBuffer();
  const hiresJpeg = (meta.width ?? 0) > 1400 ? await base.clone().resize({ width: 1600, withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer() : pageJpeg;
  const greyRaw = await sharp(pageJpeg).greyscale().raw().toBuffer();
  const pageUrl = await store.putFile(id, 'page', pageJpeg, 'image/jpeg');
  stage('upload', 'done', { ms: Date.now() - tUp, detail: `${page.w}×${page.h}` });

  // ---- track: compile detection data in parallel with everything else ----
  const trackingP = (async () => {
    stage('track', 'start', { detail: 'learning what the page looks like, for anchoring' });
    const t = Date.now();
    try {
      const r = await compileTracking(new Uint8Array(greyRaw.buffer, greyRaw.byteOffset, greyRaw.byteLength), page.w, page.h);
      const url = await store.putFile(id, 'tracking.mind', Buffer.from(r.buffer), 'application/octet-stream');
      stage('track', 'done', { ms: Date.now() - t, detail: `${r.trackPts.join('/')} tracking points` });
      const tracking = { url, width: page.w, height: page.h, trackPts: r.trackPts };
      send({ type: 'tracking', ...tracking, t: T() });
      return tracking;
    } catch (e: any) { stage('track', 'error', { detail: String(e?.message || e) }); return undefined; }
  })();

  // ---- read: quick pass (streamed) ----
  stage('read', 'start', { detail: 'reading the page', model: config.models.quick.id });
  const tRead = Date.now();
  let partialSent = 0;
  const quickRes = await withTimeout(generateJson<any>({
    model: 'quick', system: QUICK_SYSTEM, schema: QUICK_SCHEMA, parts: [imagePart(quickJpeg), { text: 'Read this page.' }],
    maxTokens: 700, thinking: 'minimal', mediaResolution: 'medium', temperature: 0.2, label: 'quick',
    onText: (so) => {
      const got: Partial<QuickRead> = {};
      for (const key of ['kind', 'subject', 'language', 'title', 'gist'] as const) {
        const m = new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`).exec(so);
        if (m) (got as any)[key] = JSON.parse(`"${m[1]}"`);
      }
      const n = Object.keys(got).length;
      if (n > partialSent) { partialSent = n; send({ type: 'quick-partial', data: got, t: T() }); }
    },
  }), 20000, 'quick read');
  usages.push(quickRes.usage);
  const q = quickRes.json;
  const quick: QuickRead = {
    kind: q.kind ?? 'mixed', subject: q.subject ?? '', language: (q.language ?? 'en').split('-')[0], title: q.title ?? '', gist: q.gist ?? '',
    figures: (Array.isArray(q.figures) ? q.figures : []).slice(0, 6).map((f: any, i: number) => ({ id: String(f.id || `fig${i + 1}`).replace(/[^A-Za-z0-9_-]/g, '_'), label: String(f.label ?? ''), kind: f.kind ?? 'other', box: toPageBox(f.box_2d ?? [0, 0, 1000, 1000], page.w, page.h) })),
    characters: (Array.isArray(q.characters) ? q.characters : []).slice(0, 8).map((c: any) => ({ name: String(c.name ?? ''), look: String(c.look ?? '') })),
    spread: !!q.spread, confidence: Number(q.confidence ?? 0.5), opener: q.opener ?? '', bookTitle: q.bookTitle || undefined,
  };
  stage('read', 'done', { ms: Date.now() - tRead, detail: `${quick.kind} · ${quick.subject} · ${quick.language}`, model: quickRes.usage.model });
  send({ type: 'quick', data: quick, t: T() });

  // ---- voice the opener right away ----
  const narratorVoice = config.voices.narrator[quick.language as 'en' | 'hi'] ?? config.voices.narrator.en;
  const narratorStyle = 'Say this warmly and clearly, like a friendly teacher';
  const openerP = (async () => {
    if (!quick.opener) return;
    stage('voice', 'start', { detail: 'voicing the opener', model: config.models.tts.id });
    const t = Date.now();
    try {
      const r = await withTimeout(synthesize({ text: quick.opener, voice: narratorVoice, style: narratorStyle, lang: quick.language }), 15000, 'opener tts');
      usages.push(r.usage);
      const url = await store.putFile(id, 'opener', r.wav, 'audio/wav');
      const clip = { id: 'opener', url, kind: 'opener' as const, text: quick.opener, durationMs: r.durationMs };
      audioClips.push(clip);
      send({ type: 'audio', ...clip, t: T() });
      stage('voice', 'done', { ms: Date.now() - t, detail: 'opener ready' });
    } catch (e: any) { stage('voice', 'error', { detail: String(e?.message || e) }); }
  })();

  // ---- build: scene (with one repair retry and a guaranteed fallback) ----
  const sceneP = (async (): Promise<{ scene: Scene; issues: Issue[]; version: number }> => {
    stage('build', 'start', { detail: 'composing the experience', model: config.models.scene.id });
    const t = Date.now();
    const system = sceneSystem(quick, page);
    const parts = [imagePart(pageJpeg), { text: `Quick read of the page: ${JSON.stringify({ kind: quick.kind, subject: quick.subject, title: quick.title, gist: quick.gist })}\nCompose the LivingScene JSON now.` }];
    let issues: Issue[] = [];
    try {
      const r1 = await withTimeout(generateJson({ model: 'scene', system, parts, maxTokens: 2200, thinking: 'minimal', mediaResolution: 'medium', temperature: 0.5, label: 'scene' }), 30000, 'scene');
      usages.push(r1.usage);
      const n1 = normalizeScene({ ...r1.json, page, v: 1, anchors: { ...Object.fromEntries(quick.figures.map((f) => [f.id, f.box])), ...(r1.json.anchors ?? {}) } });
      issues = n1.issues;
      if (n1.scene) {
        stage('build', 'done', { ms: Date.now() - t, detail: `${n1.scene.elements.length} elements, ${n1.scene.steps.length} steps${issues.length ? `, ${issues.length} repairs` : ''}`, model: r1.usage.model });
        return { scene: n1.scene, issues, version: 1 };
      }
      const r2 = await withTimeout(generateJson({ model: 'scene', system, parts: [...parts, { text: `Your previous output was invalid: ${issues.slice(0, 6).map((i) => `${i.where}: ${i.message}`).join('; ')}. Output a corrected LivingScene JSON.` }], maxTokens: 2200, thinking: 'low', mediaResolution: 'medium', temperature: 0.3, label: 'scene-repair' }), 30000, 'scene repair');
      usages.push(r2.usage);
      const n2 = normalizeScene({ ...r2.json, page, v: 1 });
      if (n2.scene) { stage('build', 'done', { ms: Date.now() - t, detail: `repaired: ${n2.scene.elements.length} elements`, model: r2.usage.model }); return { scene: n2.scene, issues: [...issues, ...n2.issues], version: 1 }; }
      issues = [...issues, ...n2.issues];
    } catch (e: any) { issues.push({ level: 'error', where: 'build', message: String(e?.message || e) }); }
    const fb = fallbackScene({ page, title: quick.title, figures: quick.figures.map((f) => f.box), lang: quick.language });
    stage('build', 'done', { ms: Date.now() - t, detail: 'fallback scene (page cut-outs)' });
    return { scene: fb, issues, version: 1 };
  })();

  // ---- understand: deep extraction ----
  const extractionP = (async (): Promise<Extraction | undefined> => {
    stage('understand', 'start', { detail: 'reading every word, value and figure', model: config.models.extract.id });
    const t = Date.now();
    try {
      const r = await withTimeout(generateJson<any>({ model: 'extract', system: EXTRACT_SYSTEM, parts: [imagePart(hiresJpeg), { text: `Page language hint: ${quick.language}. Extract now.` }], maxTokens: 3000, thinking: 'minimal', mediaResolution: 'high', temperature: 0.1, label: 'extract' }), 40000, 'extraction');
      usages.push(r.usage);
      const x = r.json;
      const ex: Extraction = {
        text: String(x.text ?? ''), headings: x.headings ?? [], values: x.values ?? [], worked: x.worked ?? [], equations: x.equations ?? [], entities: x.entities ?? [],
        setting: x.setting || undefined, dialogue: x.dialogue ?? [], steps: x.steps ?? [], claims: x.claims ?? [], language: x.language ?? quick.language,
      };
      stage('understand', 'done', { ms: Date.now() - t, detail: `${ex.values.length} values, ${ex.worked.length} worked examples, ${ex.claims.length} claims`, model: r.usage.model });
      send({ type: 'extraction', data: ex, t: T() });
      return ex;
    } catch (e: any) { stage('understand', 'error', { detail: String(e?.message || e) }); return undefined; }
  })();

  const built = await sceneP;
  let scene = built.scene;
  send({ type: 'scene', data: scene, issues: built.issues, version: built.version, t: T() });

  // ---- voice: narration per step + character lines ----
  const voiceP = (async () => {
    const limit = pLimit(3);
    const jobs: Promise<void>[] = [];
    const speakerVoice = new Map<string, string>();
    let poolIdx = 0;
    const voiceFor = (speaker: string) => {
      if (!speakerVoice.has(speaker)) speakerVoice.set(speaker, scene.audio.speakers[speaker]?.voice ?? config.voices.pool[poolIdx++ % config.voices.pool.length]!);
      return speakerVoice.get(speaker)!;
    };
    const t = Date.now();
    stage('voice', 'start', { detail: `voicing ${scene.steps.filter((s) => s.narration).length} narration steps and ${scene.audio.lines.length} lines`, model: config.models.tts.id });
    const say = (clipId: string, text: string, kind: 'narration' | 'line', extra: { stepId?: string; lineId?: string; speaker?: string; voice: string; style?: string }) => jobs.push(limit(async () => {
      try {
        const r = await withTimeout(synthesize({ text, voice: extra.voice, style: extra.style, lang: scene.lang }), 20000, `tts ${clipId}`);
        usages.push(r.usage);
        const url = await store.putFile(id, clipId, r.wav, 'audio/wav');
        const clip = { id: clipId, url, kind, text, stepId: extra.stepId, lineId: extra.lineId, speaker: extra.speaker, durationMs: r.durationMs };
        audioClips.push(clip);
        send({ type: 'audio', ...clip, t: T() });
      } catch (e: any) { send({ type: 'error', message: `voice ${clipId}: ${String(e?.message || e)}`, recoverable: true, t: T() }); }
    }));
    const nStyle = scene.audio.narrator?.style ? `Say this ${scene.audio.narrator.style}` : narratorStyle;
    for (const s of scene.steps) if (s.narration) say(`step-${s.id}`, s.narration, 'narration', { stepId: s.id, voice: narratorVoice, style: nStyle });
    for (const l of scene.audio.lines) say(`line-${l.id}`, l.text, 'line', { lineId: l.id, speaker: l.speaker, voice: voiceFor(l.speaker), style: scene.audio.speakers[l.speaker]?.style ? `Say this ${scene.audio.speakers[l.speaker]!.style}` : `Say this in character as ${l.speaker}` });
    for (const s of scene.steps) for (const [i, l] of (s.say ?? []).entries()) say(`say-${s.id}-${i}`, l.text, 'line', { stepId: s.id, speaker: l.speaker, voice: voiceFor(l.speaker), style: `Say this in character as ${l.speaker}` });
    await Promise.all(jobs);
    stage('voice', 'done', { ms: Date.now() - t, detail: `${audioClips.length} clips` });
  })();

  // ---- illustrate: generated assets ----
  const illustrateP = (async () => {
    const gens = scene.assets.filter((a) => a.type === 'gen');
    if (!gens.length) return;
    stage('illustrate', 'start', { detail: `drawing ${gens.length} ${gens.length === 1 ? 'picture' : 'pictures'}`, model: config.models.image.id });
    const t = Date.now();
    const limit = pLimit(3);
    const styleHint = scene.style?.mood ? `, ${scene.style.mood} mood` : '';
    await Promise.all(gens.map((a) => limit(async () => {
      if (a.type !== 'gen') return;
      try {
        const prompt = `${a.prompt}. Original children's-book illustration style${styleHint}, clean edges, centered, plain pure white background, no text.`;
        const r = await withTimeout(generateImage({ prompt, aspect: a.w && a.h ? (a.w > a.h * 1.3 ? '4:3' : a.h > a.w * 1.3 ? '3:4' : '1:1') : '1:1' }), 25000, `image ${a.id}`);
        usages.push(r.usage);
        const png = await sharp(r.bytes).resize({ width: 768, withoutEnlargement: true }).png().toBuffer();
        const url = await store.putFile(id, `asset-${a.id}`, png, 'image/png');
        assets.push({ id: a.id, url });
        send({ type: 'asset', id: a.id, url, t: T() });
      } catch (e: any) { send({ type: 'error', message: `image ${a.id}: ${String(e?.message || e)}`, recoverable: true, t: T() }); }
    })));
    stage('illustrate', 'done', { ms: Date.now() - t, detail: `${assets.length}/${gens.length} ready` });
  })();

  // ---- verify: against the page's own answers, independently, and for faithfulness ----
  const verifyP = (async (): Promise<Verification | undefined> => {
    const ex = await extractionP;
    if (!ex) return { status: 'unverified', checks: [], repaired: false, summary: 'The page could not be read in detail, so nothing was checked.' };
    stage('verify', 'start', { detail: 'checking values and facts against the page', model: config.models.verify.id });
    const t = Date.now();
    try {
      const r = await withTimeout(generateJson<any>({
        model: 'verify', system: verifySystem(), thinking: 'low', maxTokens: 2500, temperature: 0.1, label: 'verify',
        parts: [{ text: `EXTRACTION:\n${extractionDigest(ex)}\n\nSCENE:\n${JSON.stringify({ vars: scene.vars, derived: scene.derived, elements: scene.elements.map((e) => ({ id: e.id, type: e.type, text: (e as any).text })), steps: scene.steps.map((s) => ({ id: s.id, title: s.title, narration: s.narration, say: s.say })), lines: scene.audio.lines })}` }],
      }), 40000, 'verify');
      usages.push(r.usage);
      const checks: VerificationCheck[] = Array.isArray(r.json.checks) ? r.json.checks.filter((c: any) => c && c.name).map((c: any) => ({ name: String(c.name), method: ['page-answer', 'independent', 'faithfulness'].includes(c.method) ? c.method : 'faithfulness', expected: c.expected, got: c.got, pass: !!c.pass, detail: String(c.detail ?? '') })) : [];
      // deterministic page-answer checks from the model's variable mapping
      let repaired = false;
      const runMapping = (sc: Scene) => {
        const rt = new SceneRuntime(sc);
        const out: VerificationCheck[] = [];
        for (const m of Array.isArray(r.json.mapping) ? r.json.mapping : []) {
          const w = ex.worked[m.worked];
          if (!w || !m.derived || typeof m.answer !== 'number') continue;
          const vals = rt.evaluateWith(m.assign ?? {});
          const got = vals[m.derived];
          if (got === undefined) { out.push({ name: `worked example ${m.worked + 1}`, method: 'page-answer', expected: m.answer, got: 'n/a', pass: false, detail: `scene has no value "${m.derived}"` }); continue; }
          const rel = Math.abs(got - m.answer) / Math.max(Math.abs(m.answer), 1e-9);
          out.push({ name: `worked example ${m.worked + 1}: ${m.derived}`, method: 'page-answer', expected: `${m.answer} ${m.unit ?? w.unit ?? ''}`.trim(), got: `${Number(got.toFixed(4))} ${m.unit ?? w.unit ?? ''}`.trim(), pass: rel <= 0.02, detail: `computed from the scene's formula with the page's inputs ${JSON.stringify(m.assign ?? {})}; difference ${(rel * 100).toFixed(1)}%` });
        }
        return out;
      };
      let det = runMapping(scene);
      if (det.some((c) => !c.pass) && r.json.fixes?.derived?.length) {
        const fixed = structuredClone(scene);
        for (const f of r.json.fixes.derived) { const d = fixed.derived.find((x) => x.id === f.id); if (d && typeof f.expr === 'string') d.expr = f.expr; }
        const n = normalizeScene(fixed);
        if (n.scene) { const det2 = runMapping(n.scene); if (det2.filter((c) => c.pass).length > det.filter((c) => c.pass).length) { scene = n.scene; det = det2; repaired = true; } }
      }
      if (Array.isArray(r.json.fixes?.labels) && r.json.fixes.labels.length) {
        const fixed = structuredClone(scene);
        for (const f of r.json.fixes.labels) { const el = fixed.elements.find((x) => x.id === f.id); if (el && 'text' in el && typeof f.text === 'string') (el as any).text = f.text; }
        const n = normalizeScene(fixed); if (n.scene) { scene = n.scene; repaired = true; }
      }
      const unsupported: string[] = Array.isArray(r.json.unsupported) ? r.json.unsupported.filter((s: any) => typeof s === 'string') : [];
      const all = [...det, ...checks.filter((c) => c.method !== 'page-answer')];
      if (unsupported.length) all.push({ name: 'faithfulness', method: 'faithfulness', pass: false, detail: `not supported by the page: ${unsupported.slice(0, 3).join(' | ')}` });
      else if (!all.some((c) => c.method === 'faithfulness')) all.push({ name: 'faithfulness', method: 'faithfulness', pass: true, detail: 'labels, dialogue and narration are supported by the page text' });
      const failed = all.filter((c) => !c.pass);
      const status: Verification['status'] = failed.length ? 'failed' : det.length ? 'verified-page' : all.some((c) => c.method === 'independent') ? 'checked-independently' : all.length ? 'faithful' : 'unverified';
      const v: Verification = { status, checks: all, repaired, summary: String(r.json.summary ?? (failed.length ? `${failed.length} check(s) failed` : 'All checks passed')) };
      stage('verify', 'done', { ms: Date.now() - t, detail: `${all.filter((c) => c.pass).length}/${all.length} checks passed${repaired ? ', scene repaired' : ''}`, model: r.usage.model });
      if (repaired) send({ type: 'scene', data: scene, issues: [], version: 2, t: T() });
      send({ type: 'verification', data: v, t: T() });
      return v;
    } catch (e: any) {
      stage('verify', 'error', { detail: String(e?.message || e) });
      const v: Verification = { status: 'unverified', checks: [], repaired: false, summary: 'Verification did not complete.' };
      send({ type: 'verification', data: v, t: T() });
      return v;
    }
  })();

  const [tracking, verification] = await Promise.all([trackingP, verifyP, openerP, voiceP, illustrateP]);
  const costUsd = usages.reduce((a, u) => a + u.costUsd, 0);
  timings.total = T();
  stage('save', 'start');
  const record: ExperienceRecord = {
    id, createdAt: new Date(t0).toISOString(), ownerId: input.ownerId, bookId: input.bookId,
    page: { ...page, imageUrl: pageUrl }, quick, extraction: await extractionP, scene, audio: audioClips, assets, tracking, verification,
    timings, costUsd, events: [],
  };
  await store.putRecord({ ...record, events });
  stage('save', 'done', { ms: 0 });
  send({ type: 'done', t: T(), timings, costUsd, experienceId: id });
  console.log(`[pipeline] ${id} done in ${T()} ms, $${costUsd.toFixed(4)}, stages ${JSON.stringify(timings)}, usage ${usages.map((u) => `${u.model}:${u.inTokens}/${u.outTokens}`).join(' ')}`);
  return record;
}

export { SceneSchema };
