// The generation pipeline: one captured page in, a stream of events out. Stages run in parallel wherever they can;
// every stage degrades gracefully so the client always ends with something renderable.
import sharp from 'sharp';
import { randomUUID } from 'node:crypto';
import {
  normalizeScene, fallbackScene, SceneRuntime, SceneSchema, inkMapFromGrey, freeRegionsFromInk, layoutScene, motionReport,
  type Scene, type QuickRead, type Extraction, type PipelineEvent, type ExperienceRecord, type Verification, type VerificationCheck, type BoxT, type Issue, type StageName,
} from '@living-book/scene';
import { generateJson, generateImage, synthesize, imagePart, type Usage } from './gemini.js';
import type { Part } from '@google/genai';
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
  // where the ink is: a coarse map of dark pixels, so overlays can be kept off printed text deterministically
  const ink = inkMapFromGrey(new Uint8Array(greyRaw.buffer, greyRaw.byteOffset, greyRaw.byteLength), page.w, page.h);
  let characterCrops: Record<string, BoxT> = {};
  const normalize = (raw: unknown, extra: { dropTexts?: string[] } = {}) => normalizeScene(raw, { ink, dropTexts: extra.dropTexts, characterCrops });
  const sceneMetrics = (sc: Scene, issues: Issue[]) => { const now = layoutScene(structuredClone(sc), ink, []); const m = motionReport(sc); return { layout: { mean: Math.round(now.inkBefore * 1000) / 1000, worst: Math.round(now.worstBefore * 1000) / 1000, moved: issues.filter((i) => /moved off printed ink/.test(i.message)).length, dropped: issues.filter((i) => /no clean space/.test(i.message)).length }, motion: { moving: m.moving.length, total: m.total } }; };
  const pageUrl = await store.putFile(id, 'page', pageJpeg, 'image/jpeg');
  stage('upload', 'done', { ms: Date.now() - tUp, detail: `${page.w}×${page.h}` });

  // ---- track: compile detection data (needed only for re-acquisition, so it waits for the quick read to avoid CPU contention) ----
  let releaseTracking!: () => void;
  const trackingGate = new Promise<void>((r) => { releaseTracking = r; });
  const trackingP = (async () => {
    await trackingGate;
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
    maxTokens: 700, thinking: 'minimal', mediaResolution: 'low', temperature: 0.2, label: 'quick', // 768 px + low: first token ≈1.4 s, done ≈2 s (measured 2026-10-10)
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
    // figure ids are normalised to fig1..figN: the scene prompt's examples use that convention, so anchors line up
    figures: (Array.isArray(q.figures) ? q.figures : []).slice(0, 6).map((f: any, i: number) => ({ id: `fig${i + 1}`, label: String(f.label ?? ''), kind: f.kind ?? 'other', box: toPageBox(f.box_2d ?? [0, 0, 1000, 1000], page.w, page.h) })),
    textBlocks: (Array.isArray(q.textBlocks) ? q.textBlocks : []).slice(0, 8).map((b: any) => toPageBox(b.box_2d ?? [0, 0, 0, 0], page.w, page.h)),
    characters: (Array.isArray(q.characters) ? q.characters : []).slice(0, 8).map((c: any) => { const box = Array.isArray(c.box_2d) && c.box_2d.length === 4 ? toPageBox(c.box_2d, page.w, page.h) : undefined; return { name: String(c.name ?? ''), look: String(c.look ?? ''), box: box && box[2] - box[0] > 20 && box[3] - box[1] > 20 ? box : undefined }; }),
    spread: !!q.spread, confidence: Number(q.confidence ?? 0.5), opener: q.opener ?? '', bookTitle: q.bookTitle || undefined,
  };
  // a character the page draws is the printed art: generated look-alikes are swapped for cut-outs of that drawing
  characterCrops = Object.fromEntries(quick.characters.filter((c) => c.box).map((c) => [c.name, c.box!]));
  stage('read', 'done', { ms: Date.now() - tRead, detail: `${quick.kind} · ${quick.subject} · ${quick.language}`, model: quickRes.usage.model });
  console.log(`[read] ttfb ${quickRes.usage.ttfbMs} ms, total ${quickRes.usage.ms} ms, in ${quickRes.usage.inTokens} out ${quickRes.usage.outTokens}, image ${quickJpeg.length} bytes`);
  send({ type: 'quick', data: quick, t: T() });

  const narratorVoice = config.voices.narrator[quick.language as 'en' | 'hi'] ?? config.voices.narrator.en;
  // the opener used to be voiced here; nothing is spoken before the validated scene is revealed, so it is no longer synthesised
  const openerP = Promise.resolve();


  // ---- build: scene v1 fast (with one repair retry and a guaranteed fallback); scene v2 richer, in parallel ----
  const system = sceneSystem(quick, page, freeRegionsFromInk(ink, quick.figures[0]?.box));
  // the main figure, cropped and overlaid with a labelled grid in anchor-relative units, so coordinates are read, not guessed
  const gridParts: Part[] = [];
  const mainFig = quick.figures[0];
  if (mainFig) {
    try {
      const [x0, y0, x1, y1] = mainFig.box;
      const bw = Math.max(40, x1 - x0), bh = Math.max(40, y1 - y0);
      const scale = Math.min(2, 900 / Math.max(bw, bh));
      const crop = await sharp(pageJpeg).extract({ left: Math.max(0, x0), top: Math.max(0, y0), width: Math.min(page.w - Math.max(0, x0), bw), height: Math.min(page.h - Math.max(0, y0), bh) }).resize({ width: Math.round(bw * scale) }).png().toBuffer();
      const cw = Math.round(bw * scale), ch = Math.round(bh * scale);
      let g = '';
      for (let i = 0; i <= 10; i++) {
        const gx = Math.round((cw * i) / 10), gy = Math.round((ch * i) / 10);
        g += `<line x1="${gx}" y1="0" x2="${gx}" y2="${ch}" stroke="#ff2d55" stroke-width="1" stroke-opacity="0.7"/><line x1="0" y1="${gy}" x2="${cw}" y2="${gy}" stroke="#ff2d55" stroke-width="1" stroke-opacity="0.7"/>`;
        if (i < 10) g += `<text x="${gx + 3}" y="14" font-size="13" font-family="sans-serif" fill="#ff2d55">${Math.round((bw * i) / 10)}</text><text x="3" y="${gy + 15}" font-size="13" font-family="sans-serif" fill="#ff2d55">${Math.round((bh * i) / 10)}</text>`;
      }
      const grid = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${cw}" height="${ch}">${g}</svg>`);
      const gridded = await sharp(crop).composite([{ input: grid, top: 0, left: 0 }]).jpeg({ quality: 85 }).toBuffer();
      gridParts.push({ text: `Figure ${mainFig.id} ("${mainFig.label}") cropped, with a grid in anchor-relative units: x 0..${bw} left→right, y 0..${bh} top→bottom (grid lines every 10 %). Use these units for elements anchored to ${mainFig.id}.` }, imagePart(gridded));
    } catch (e: any) { console.warn('[build] grid crop failed', String(e?.message || e)); }
  }
  const sceneParts = [imagePart(pageJpeg), ...gridParts, { text: `Quick read of the page: ${JSON.stringify({ kind: quick.kind, subject: quick.subject, title: quick.title, gist: quick.gist })}\nCompose the LivingScene JSON now.` }];
  releaseTracking(); // the compile is CPU-heavy; it starts once the scene requests are on their way
  const anchorsFromQuick = Object.fromEntries(quick.figures.map((f) => [f.id, f.box]));
  const sceneP = (async (): Promise<{ scene: Scene; issues: Issue[]; version: number }> => {
    stage('build', 'start', { detail: 'composing the experience', model: config.models.scene.id });
    const t = Date.now();
    const parts = sceneParts;
    let issues: Issue[] = [];
    try {
      const r1 = await withTimeout(generateJson({ model: 'scene', system, parts, maxTokens: 2600, thinking: 'minimal', mediaResolution: 'medium', temperature: 0.5, label: 'scene' }), 30000, 'scene');
      usages.push(r1.usage);
      const n1 = normalize({ ...r1.json, page, v: 1, anchors: { ...anchorsFromQuick, ...(r1.json.anchors ?? {}) } }, { dropTexts: [quick.title] });
      issues = n1.issues;
      if (!n1.scene) console.warn('[build] v1 invalid:', issues.slice(0, 4).map((i) => `${i.where}: ${i.message}`).join(' | ').slice(0, 300), '| raw:', JSON.stringify(r1.json).slice(0, 400));
      if (n1.scene) {
        stage('build', 'done', { ms: Date.now() - t, detail: `${n1.scene.elements.length} elements, ${n1.scene.steps.length} steps${issues.length ? `, ${issues.length} repairs` : ''}`, model: r1.usage.model });
        return { scene: n1.scene, issues, version: 1 };
      }
      const r2 = await withTimeout(generateJson({ model: 'scene', system, parts: [...parts, { text: `Your previous output was invalid: ${issues.slice(0, 6).map((i) => `${i.where}: ${i.message}`).join('; ')}. Output a corrected LivingScene JSON.` }], maxTokens: 2200, thinking: 'low', mediaResolution: 'medium', temperature: 0.3, label: 'scene-repair' }), 30000, 'scene repair');
      usages.push(r2.usage);
      const n2 = normalize({ ...r2.json, page, v: 1, anchors: { ...anchorsFromQuick, ...(r2.json.anchors ?? {}) } }, { dropTexts: [quick.title] });
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

  // scene v2: the richer model, swapped in by the client at the next loop (upgrade in place, never a blank wait)
  const richP = (async (): Promise<Scene | undefined> => {
    if (quick.kind === 'unsupported') return undefined;
    const t = Date.now();
    try {
      const richSystem = system + '\nThis is the detailed version: use the full element budget (6–10 elements, 4–6 steps) while staying compact in syntax.';
      let r: { json: any; usage: (typeof usages)[number] };
      try { r = await withTimeout(generateJson({ model: 'sceneRich', system: richSystem, parts: sceneParts, maxTokens: 3200, thinking: 'low', mediaResolution: 'medium', temperature: 0.5, label: 'scene-rich' }), 60000, 'scene rich'); }
      catch (e: any) {
        if (!/JSON/i.test(String(e?.message))) throw e;
        // malformed JSON (an unquoted expression, a truncated string): one more try with the error in hand
        r = await withTimeout(generateJson({ model: 'sceneRich', system: richSystem, parts: [...sceneParts, { text: `Your previous output was not valid JSON (${String(e?.message).slice(0, 120)}). Output the LivingScene again as strictly valid JSON: every expression is a quoted string.` }], maxTokens: 3200, thinking: 'low', mediaResolution: 'medium', temperature: 0.3, label: 'scene-rich-retry' }), 60000, 'scene rich retry');
      }
      usages.push(r.usage);
      const n = normalize({ ...r.json, page, v: 1, anchors: { ...anchorsFromQuick, ...(r.json.anchors ?? {}) } }, { dropTexts: [quick.title] });
      if (!n.scene) { console.warn('[build] rich scene invalid:', n.issues.slice(0, 3).map((i) => i.message).join('; ')); return undefined; }
      let rich = n.scene, richIssues = n.issues;
      // liveliness: a scene in which fewer than three things move gets one more pass that adds motion showing the concept
      const m = motionReport(rich);
      if (m.moving.length < 3) {
        try {
          const r3 = await withTimeout(generateJson({ model: 'sceneRich', system: richSystem, parts: [...sceneParts, { text: `The scene below has only ${m.moving.length} moving element(s)${m.moving.length ? ` (${m.moving.join(', ')})` : ''}. Rewrite it as the complete LivingScene JSON with at least 3 elements that visibly move and SHOW the concept: particles (rate ≥ 30) flowing along a "path" or across a region on the figure (carbon dioxide into the leaf, water up the stem, electrons round the wires, rain from the cloud, vapour rising), objects whose x/y are bound to t or animated along the figure, arrows that draw themselves. Keep every value, label and narration unchanged.\n${JSON.stringify(rich)}` }], maxTokens: 3400, thinking: 'low', mediaResolution: 'medium', temperature: 0.4, label: 'scene-motion' }), 50000, 'scene motion');
          usages.push(r3.usage);
          const n3 = normalize({ ...r3.json, page, v: 1, anchors: { ...anchorsFromQuick, ...(r3.json.anchors ?? {}) } }, { dropTexts: [quick.title] });
          if (n3.scene && motionReport(n3.scene).moving.length > m.moving.length) { rich = n3.scene; richIssues = [...richIssues, ...n3.issues, { level: 'warn', where: 'scene', message: `motion pass: ${m.moving.length} → ${motionReport(n3.scene).moving.length} moving elements` }]; }
        } catch (e: any) { console.warn('[build] motion pass failed:', String(e?.message || e).slice(0, 120)); }
      }
      stage('build', 'done', { ms: Date.now() - t, detail: `richer version: ${rich.elements.length} elements, ${rich.steps.length} steps, ${motionReport(rich).moving.length} moving`, model: r.usage.model });
      send({ type: 'scene', data: rich, issues: richIssues, version: 2, t: T(), ...sceneMetrics(rich, richIssues) });
      return rich;
    } catch (e: any) { console.warn('[build] rich scene failed:', String(e?.message || e).slice(0, 160)); return undefined; }
  })();

  const built = await sceneP;
  let scene = built.scene;
  send({ type: 'scene', data: scene, issues: built.issues, version: built.version, t: T(), ...sceneMetrics(scene, built.issues) });

  // ---- voice: narration per step + character lines, for each scene version ----
  const speakerVoice = new Map<string, string>();
  let poolIdx = 0;
  const voiceFor = (sc: Scene, speaker: string) => {
    if (!speakerVoice.has(speaker)) speakerVoice.set(speaker, sc.audio.speakers[speaker]?.voice ?? config.voices.pool[poolIdx++ % config.voices.pool.length]!);
    return speakerVoice.get(speaker)!;
  };
  const superseded = new Set<string>(); // clip ids re-voiced after a repair: an older synthesis of the same id is dropped when it lands
  const synthClip = async (sc: Scene, version: number, clipId: string, text: string, kind: 'narration' | 'line', extra: { stepId?: string; lineId?: string; speaker?: string; voice: string }, generation = 0) => {
    const prefix = version === 1 ? '' : `v${version}-`;
    const fullId = prefix + clipId;
    try {
      const r = await withTimeout(synthesize({ text, voice: extra.voice, lang: sc.lang }), 20000, `tts ${clipId}`);
      usages.push(r.usage);
      if (generation === 0 && superseded.has(fullId)) return; // a repair already replaced this clip
      const url = await store.putFile(id, fullId + (generation ? `-${generation}` : ''), r.wav, 'audio/wav');
      const clip = { id: fullId, url, kind, text, stepId: extra.stepId, lineId: extra.lineId, speaker: extra.speaker, durationMs: r.durationMs, version };
      const at = audioClips.findIndex((c) => c.id === fullId);
      if (at >= 0) audioClips.splice(at, 1);
      audioClips.push(clip);
      send({ type: 'audio', ...clip, t: T() });
    } catch (e: any) { send({ type: 'error', message: `voice ${clipId}: ${String(e?.message || e)}`, recoverable: true, t: T() }); }
  };
  const revoiceSteps = async (sc: Scene, version: number, stepIds: string[]) => {
    const prefix = version === 1 ? '' : `v${version}-`;
    for (const sid of stepIds) superseded.add(`${prefix}step-${sid}`);
    await Promise.all(sc.steps.filter((s) => stepIds.includes(s.id) && s.narration).map((s) => synthClip(sc, version, `step-${s.id}`, s.narration!, 'narration', { stepId: s.id, voice: narratorVoice }, 1)));
  };
  const voiceScene = async (sc: Scene, version: number) => {
    const limit = pLimit(3);
    const jobs: Promise<void>[] = [];
    const t = Date.now();
    stage('voice', 'start', { detail: `voicing ${sc.steps.filter((s) => s.narration).length} narration steps and ${sc.audio.lines.length} lines`, model: config.models.tts.id });
    const say = (clipId: string, text: string, kind: 'narration' | 'line', extra: { stepId?: string; lineId?: string; speaker?: string; voice: string }) => jobs.push(limit(() => synthClip(sc, version, clipId, text, kind, extra)));
    for (const s of sc.steps) if (s.narration) say(`step-${s.id}`, s.narration, 'narration', { stepId: s.id, voice: narratorVoice });
    for (const l of sc.audio.lines) say(`line-${l.id}`, l.text, 'line', { lineId: l.id, speaker: l.speaker, voice: voiceFor(sc, l.speaker) });
    for (const s of sc.steps) for (const [i, l] of (s.say ?? []).entries()) say(`say-${s.id}-${i}`, l.text, 'line', { stepId: s.id, speaker: l.speaker, voice: voiceFor(sc, l.speaker) });
    await Promise.all(jobs);
    stage('voice', 'done', { ms: Date.now() - t, detail: `${jobs.length} clips (v${version})` });
  };
  const voiceP = voiceScene(scene, 1);
  const richVoiceP = richP.then((sc) => (sc ? voiceScene(sc, 2) : undefined));

  // ---- illustrate: generated assets (v1 now, v2's extra ones when it lands) ----
  const illustrated = new Set<string>();
  const drawn = new Map<string, string>(); // character name or normalised prompt → url, so a later scene version reuses the same picture
  const drawnKey = (a: { prompt: string; character?: string }) => (a.character ? `c:${a.character.toLowerCase().trim()}` : `p:${a.prompt.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()}`);
  const illustrate = async (sc: Scene) => {
    const wanted = sc.assets.filter((a) => a.type === 'gen' && !illustrated.has(a.id));
    wanted.forEach((a) => illustrated.add(a.id));
    const gens = wanted.filter((a) => {
      if (a.type !== 'gen') return false;
      const url = drawn.get(drawnKey(a));
      if (!url) return true;
      assets.push({ id: a.id, url }); send({ type: 'asset', id: a.id, url, t: T() });
      return false;
    });
    if (!gens.length) return;
    stage('illustrate', 'start', { detail: `drawing ${gens.length} ${gens.length === 1 ? 'picture' : 'pictures'}`, model: config.models.image.id });
    const t = Date.now();
    const limit = pLimit(3);
    const styleHint = sc.style?.mood ? `, ${sc.style.mood} mood` : '';
    await Promise.all(gens.map((a) => limit(async () => {
      if (a.type !== 'gen') return;
      try {
        const prompt = `${a.prompt}. Original children's-book illustration style${styleHint}, clean edges, centered, plain pure white background, no text.`;
        const r = await withTimeout(generateImage({ prompt, aspect: a.w && a.h ? (a.w > a.h * 1.3 ? '4:3' : a.h > a.w * 1.3 ? '3:4' : '1:1') : '1:1' }), 25000, `image ${a.id}`);
        usages.push(r.usage);
        const png = await sharp(r.bytes).resize({ width: 768, withoutEnlargement: true }).png().toBuffer();
        const url = await store.putFile(id, `asset-${a.id}`, png, 'image/png');
        drawn.set(drawnKey(a), url);
        assets.push({ id: a.id, url });
        send({ type: 'asset', id: a.id, url, t: T() });
      } catch (e: any) { send({ type: 'error', message: `image ${a.id}: ${String(e?.message || e)}`, recoverable: true, t: T() }); }
    })));
    stage('illustrate', 'done', { ms: Date.now() - t, detail: `${assets.length}/${illustrated.size} ready` });
  };
  const illustrateP = illustrate(scene);
  const richIllustrateP = richP.then((sc) => (sc ? illustrate(sc) : undefined));

  // ---- verify: against the page's own answers, independently, and for faithfulness ----
  const verifyScene = async (ex: Extraction, sc: Scene, version: number): Promise<{ v: Verification; scene: Scene }> => {
    let scene = sc;
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
          if (!sc.derived.some((d) => d.id === m.derived)) { out.push({ name: `worked example ${m.worked + 1}`, method: 'page-answer', expected: `${m.answer} ${m.unit ?? w.unit ?? ''}`.trim(), got: 'not computed', pass: false, detail: `the scene does not compute "${m.derived}"; nothing to compare` }); continue; }
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
        const n = normalize(fixed);
        if (n.scene) { const det2 = runMapping(n.scene); if (det2.filter((c) => c.pass).length > det.filter((c) => c.pass).length) { scene = n.scene; det = det2; repaired = true; } }
      }
      if (Array.isArray(r.json.fixes?.narration) && r.json.fixes.narration.length) {
        const changed: string[] = [];
        const oldText = new Map<string, string>();
        for (const f of r.json.fixes.narration) {
          const st = scene.steps.find((s) => s.id === f.step);
          if (!st || typeof f.text !== 'string' || !f.text.trim() || f.text.trim() === st.narration) continue;
          oldText.set(st.id, st.narration ?? ''); st.narration = f.text.trim().slice(0, 300); changed.push(st.id);
        }
        if (changed.length) {
          repaired = true;
          const normT = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
          const gone = (claim: string) => { const c = normT(claim); return c.length > 3 && changed.some((sid) => normT(oldText.get(sid) ?? '').includes(c.slice(0, 40)) && !normT(scene.steps.find((s) => s.id === sid)?.narration ?? '').includes(c.slice(0, 40))); };
          const unsup: string[] = Array.isArray(r.json.unsupported) ? r.json.unsupported.filter((s: any) => typeof s === 'string') : [];
          r.json.unsupported = unsup.filter((u: string) => !gone(u));
          // the verifier wrote the fix for its own narration complaints: applying it settles them
          for (const c of checks) if (!c.pass && c.method === 'faithfulness' && (/narration|step|script|says/i.test(`${c.name} ${c.detail}`) || changed.some((sid) => new RegExp(`(^|[^\\p{L}\\p{N}])${sid}([^\\p{L}\\p{N}]|$)`, 'u').test(`${c.name} ${c.detail}`)) || unsup.some((u) => gone(u) && normT(c.detail).includes(normT(u).slice(0, 30))))) { c.pass = true; c.detail = `${c.detail} (narration rewritten)`; }
          checks.push({ name: 'narration rewritten to match the page', method: 'faithfulness', pass: true, detail: changed.map((sid) => `${sid}: "${scene.steps.find((s) => s.id === sid)?.narration?.slice(0, 80)}"`).join(' | ').slice(0, 220) });
          await revoiceSteps(scene, version, changed);
        }
      }
      if (Array.isArray(r.json.fixes?.labels) && r.json.fixes.labels.length) {
        const fixed = structuredClone(scene);
        for (const f of r.json.fixes.labels) { const el = fixed.elements.find((x) => x.id === f.id); if (el && 'text' in el && typeof f.text === 'string') (el as any).text = f.text; }
        const n = normalize(fixed); if (n.scene) { scene = n.scene; repaired = true; }
      }
      let unsupported: string[] = Array.isArray(r.json.unsupported) ? r.json.unsupported.filter((s: any) => typeof s === 'string') : [];
      // a failing check that names a character line ("l2", "line l2") counts as a complaint about that line's text
      for (const c of checks) {
        if (c.pass || c.method !== 'faithfulness') continue;
        for (const l of scene.audio.lines) if (new RegExp(`(^|[^\\p{L}\\p{N}])${l.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^\\p{L}\\p{N}]|$)`, 'u').test(`${c.name} ${c.detail}`) && !unsupported.includes(l.text)) unsupported.push(l.text);
      }
      // repair: a character line the page does not print is removed rather than spoken (narration is left to the judge)
      if (unsupported.length) {
        const normText = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
        const same = (a: string, b: string) => { const x = normText(a), y = normText(b); return x.length > 3 && y.length > 3 && (x === y || (Math.min(x.length, y.length) >= 12 && (x.includes(y) || y.includes(x)))); };
        const fixed = structuredClone(scene);
        const resolved = new Set<string>();
        const hit = (text: string) => { const u = unsupported.find((x) => same(x, text)); if (u) resolved.add(u); return !!u; };
        const linesBefore = fixed.audio.lines.length, elsBefore = fixed.elements.length;
        const removedLineIds = fixed.audio.lines.filter((l) => hit(l.text)).map((l) => l.id);
        fixed.audio.lines = fixed.audio.lines.filter((l) => !hit(l.text));
        fixed.elements = fixed.elements.filter((e) => !(e.type === 'bubble' && hit(e.text)));
        let says = 0;
        for (const st of fixed.steps) if (st.say) { const n0 = st.say.length; st.say = st.say.filter((l) => !hit(l.text)); says += n0 - st.say.length; }
        if (resolved.size) {
          const n = normalize(fixed);
          if (n.scene) {
            scene = n.scene; repaired = true;
            checks.push({ name: 'dialogue not on the page removed', method: 'faithfulness', pass: true, detail: `${linesBefore - fixed.audio.lines.length} line(s), ${elsBefore - fixed.elements.length} bubble(s), ${says} step line(s): ${[...resolved].join(' | ').slice(0, 160)}` });
            unsupported = unsupported.filter((u) => !resolved.has(u));
            const namesRemoved = (s: string) => removedLineIds.some((lid) => new RegExp(`(^|[^\\p{L}\\p{N}])${lid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^\\p{L}\\p{N}]|$)`, 'u').test(s));
            for (const c of checks) if (!c.pass && c.method === 'faithfulness' && (namesRemoved(`${c.name} ${c.detail}`) || [...resolved].some((u) => same(u, c.detail) || same(u, c.name) || normText(c.detail).includes(normText(u).slice(0, 40))))) { c.pass = true; c.detail = `${c.detail} (removed from the scene)`; }
          }
        }
      }
      // deterministic: every plain number a reader sees (label text outside {templates}, slider initial values) must appear on the page
      const pageNums = new Set<string>();
      const addNum = (v: unknown) => { const n = Number(v); if (Number.isFinite(n)) { pageNums.add(String(n)); pageNums.add(n.toFixed(1)); pageNums.add(n.toFixed(2)); } };
      for (const v of ex.values) addNum(v.value);
      for (const w of ex.worked) { addNum(w.answer); for (const i of w.inputs ?? []) addNum(i.value); }
      for (const m of `${ex.text} ${ex.claims.join(' ')} ${ex.equations.join(' ')}`.matchAll(/\d+(?:[.,]\d+)?/g)) addNum(m[0].replace(',', '.'));
      const invented: string[] = [];
      for (const el of scene.elements) {
        if (el.type !== 'label' && el.type !== 'bubble') continue;
        const plain = el.text.replace(/\{[^}]*\}/g, ' ');
        for (const m of plain.matchAll(/\d+(?:[.,]\d+)?/g)) { const n = Number(m[0].replace(',', '.')); if (!pageNums.has(String(n)) && !pageNums.has(n.toFixed(1)) && !pageNums.has(n.toFixed(2)) && n !== 0 && n !== 1) invented.push(`${el.id}: "${m[0]}"`); }
      }
      // a slider with a physical unit must start at a value printed on the page; unit-less "level" knobs (0..1, 0..100) are controls, not facts
      const inventedVars: string[] = [];
      for (const v of scene.vars) {
        // only a slider with a physical unit (m, s, kg, V, Ω, m/s², …) states a fact; multipliers (x, ×), levels and percentages are controls
        const unit = (v.unit ?? '').trim();
        const physical = unit.length > 0 && /[a-zA-ZΩ°]/.test(unit) && !/^(x|×|times|factor|level|%|percent|amount|strength|scale|speed level|rate)$/i.test(unit);
        const qualitative = !physical;
        if (v.role === 'param' && !qualitative && v.init !== 0 && v.init !== 1 && !pageNums.has(String(v.init)) && !pageNums.has(v.init.toFixed(1))) inventedVars.push(`${v.id} starts at ${v.init} ${v.unit ?? ''}`.trim());
      }
      if (invented.length) {
        // repair: numbers the reader would read as facts are removed from the scene, and the repair is reported
        const fixed = structuredClone(scene);
        const bad = new Set(invented.map((x) => x.split(':')[0]!));
        fixed.elements = fixed.elements.filter((e) => !(bad.has(e.id) && (e.type === 'label' || e.type === 'bubble')));
        const n = normalize(fixed);
        if (n.scene && fixed.elements.length < scene.elements.length) { scene = n.scene; repaired = true; checks.push({ name: 'numbers not on the page removed', method: 'faithfulness', pass: true, detail: invented.join('; ').slice(0, 200) }); }
        else unsupported.push(...invented.map((x) => `number not on the page: ${x}`));
      }
      if (inventedVars.length) unsupported.push(...inventedVars.map((x) => `slider value not on the page: ${x}`));
      const all = [...det, ...checks.filter((c) => c.method !== 'page-answer')];
      if (unsupported.length) all.push({ name: 'faithfulness', method: 'faithfulness', pass: false, detail: `not supported by the page: ${unsupported.slice(0, 3).join(' | ')}` });
      else if (!all.some((c) => c.method === 'faithfulness')) all.push({ name: 'faithfulness', method: 'faithfulness', pass: true, detail: 'labels, dialogue and narration are supported by the page text' });
      const failed = all.filter((c) => !c.pass);
      const status: Verification['status'] = failed.length ? 'failed' : det.length ? 'verified-page' : all.some((c) => c.method === 'independent') ? 'checked-independently' : all.length ? 'faithful' : 'unverified';
      const v: Verification = { status, checks: all, repaired, summary: String(r.json.summary ?? (failed.length ? `${failed.length} check(s) failed` : 'All checks passed')) };
      stage('verify', 'done', { ms: Date.now() - t, detail: `${all.filter((c) => c.pass).length}/${all.length} checks passed${repaired ? ', scene repaired' : ''}`, model: r.usage.model });
      if (repaired) send({ type: 'scene', data: scene, issues: [], version, t: T(), ...sceneMetrics(scene, []) });
      send({ type: 'verification', data: v, version, t: T() });
      return { v, scene };
    } catch (e: any) {
      stage('verify', 'error', { detail: String(e?.message || e) });
      const v: Verification = { status: 'unverified', checks: [], repaired: false, summary: 'Verification did not complete.' };
      send({ type: 'verification', data: v, version, t: T() });
      return { v, scene };
    }
  };
  let richScene: Scene | undefined;
  const verifyP = (async (): Promise<Verification | undefined> => {
    const ex = await extractionP;
    if (!ex) { const v: Verification = { status: 'unverified', checks: [], repaired: false, summary: 'The page could not be read in detail, so nothing was checked.' }; send({ type: 'verification', data: v, version: 1, t: T() }); return v; }
    const r1 = await verifyScene(ex, scene, 1);
    scene = r1.scene;
    timings.ready = T();
    send({ type: 'ready', t: T(), experienceId: id });
    const rich = await richP;
    if (!rich) return r1.v;
    const r2 = await verifyScene(ex, rich, 2);
    richScene = r2.scene;
    return r2.v;
  })();

  const [tracking, verification] = await Promise.all([trackingP, verifyP, openerP, voiceP, illustrateP, richVoiceP, richIllustrateP]);
  if (richScene) scene = richScene; // the saved experience opens straight into the richer version
  const costUsd = usages.reduce((a, u) => a + u.costUsd, 0);
  timings.total = T();
  stage('save', 'start');
  const record: ExperienceRecord = {
    id, createdAt: new Date(t0).toISOString(), ownerId: input.ownerId, bookId: input.bookId,
    page: { ...page, imageUrl: pageUrl, ink }, quick, extraction: await extractionP, scene, sceneVersion: richScene ? 2 : 1, audio: audioClips, assets, tracking, verification,
    timings, costUsd, events: [],
  };
  await store.putRecord({ ...record, events });
  stage('save', 'done', { ms: 0 });
  send({ type: 'done', t: T(), timings, costUsd, experienceId: id });
  console.log(`[pipeline] ${id} done in ${T()} ms, $${costUsd.toFixed(4)}, stages ${JSON.stringify(timings)}, usage ${usages.map((u) => `${u.model}:${u.inTokens}/${u.outTokens}`).join(' ')}`);
  return record;
}

export { SceneSchema };
