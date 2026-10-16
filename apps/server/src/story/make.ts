// Making a story alive, start to end: plan the film from the pages, draw the cast and an opening frame for every shot,
// film the clips while every line is voiced and the music is written, put the film together, then let the reviewer
// watch it and apply its notes (edit or re-film the worst clips, act lines again, add pauses, change the mix) until it
// is good or the rounds run out. Every round's film and review is kept, so the improvement can be seen.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { store } from '../store.js';
import { planStory } from './plan.js';
import { clipPrompt, cropPicture, drawCast, drawKeyframe } from './art.js';
import { clipHasSpeech, compose, editClip, filmClip, gate, speak } from './media.js';
import { DEFAULT_TUNING, renderFilm, type FilmTuning } from './film.js';
import { reviewFilm } from './review.js';
import type { StoryDoc, StoryLine, StoryReview, StoryShot } from './types.js';

export type MakeOptions = {
  pages: Buffer[]; owner: string; id?: string; work: string;
  /** films reviewed at most; between them the notes are applied */
  rounds?: number;
  /** stop early once the reviewer's overall score reaches this and no shot is below `shotFloor` */
  target?: number; shotFloor?: number;
  log?: (msg: string) => void;
  report?: (stage: string, detail: string) => void;
};

export async function makeStory(o: MakeOptions): Promise<StoryDoc> {
  const id = o.id ?? crypto.randomUUID();
  const log = o.log ?? ((m: string) => console.log(`[story ${id.slice(0, 8)}] ${m}`));
  const rounds = o.rounds ?? 3, target = o.target ?? 8.6, floor = o.shotFloor ?? 7.5;
  fs.mkdirSync(o.work, { recursive: true });
  const t0 = Date.now();
  const timings: Record<string, number> = {};
  const cost = { usd: 0, byModel: {} as Record<string, number> };
  const spend = (m: string, usd: number) => { cost.usd += usd; cost.byModel[m] = (cost.byModel[m] ?? 0) + usd; };
  const local = (name: string) => path.join(o.work, name);
  const save = async (name: string, bytes: Buffer, mime: string) => { fs.writeFileSync(local(name), bytes); return store.putFile(id, name, bytes, mime); };

  // the pages, upright and at a sensible size
  const pages = await Promise.all(o.pages.map((b) => sharp(b).rotate().resize({ width: 1800, height: 1800, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 90 }).toBuffer()));
  const pageMeta: StoryDoc['pages'] = [];
  for (const [i, b] of pages.entries()) { const m = await sharp(b).metadata(); pageMeta.push({ url: await save(`page-${i}.jpg`, b, 'image/jpeg'), w: m.width ?? 0, h: m.height ?? 0 }); }
  let doc: StoryDoc = {
    id, owner: o.owner, createdAt: new Date().toISOString(), updatedAt: Date.now(), status: 'making', stage: 'reading', detail: 'Reading the story',
    title: 'A story', language: 'en', pages: pageMeta, pictures: [], artStyle: '', setting: '', summary: '', narrator: { voice: 'Sulafat', style: '' },
    characters: [], shots: [], choices: [], talk: [], quiz: [], reviews: [], cost, timings,
  };
  await store.putStory(doc);
  const persist = async (patch: Partial<StoryDoc> = {}) => { doc = { ...doc, ...patch, updatedAt: Date.now(), cost, timings }; await store.putStory(doc); };
  const stage = async (s: string, d: string) => { log(`${s}: ${d}`); o.report?.(s, d); await persist({ stage: s, detail: d }); };
  const lap = (k: string, since: number) => { timings[k] = Date.now() - since; };

  try {
    // ---------------------------------------------------------------- plan
    await stage('reading', 'Reading the story and planning the film');
    let t = Date.now();
    const plan = await planStory(pages, spend); lap('plan', t);
    if (!plan.isStory) throw new Error('These pages do not look like a story.');
    log(`plan: "${plan.title}", ${plan.characters.length} characters, ${plan.shots.length} shots, ${plan.choices.length} choices, ${plan.pictures.length} pictures`);
    fs.writeFileSync(local('plan.json'), JSON.stringify(plan, null, 1));
    await persist({
      title: plan.title, book: plan.book, credit: plan.credit, language: plan.language, artStyle: plan.artStyle, setting: plan.setting, summary: plan.summary, text: plan.text,
      moral: plan.moral, narrator: plan.narrator, characters: plan.characters, shots: plan.shots, choices: plan.choices, talk: plan.talk, quiz: plan.quiz,
      think: plan.think, music: { prompt: plan.music }, pictures: plan.pictures,
    });
    const allShots = (): StoryShot[] => [...doc.shots, ...doc.choices.flatMap((c) => c.options.flatMap((op) => op.shots))];
    const allLines = (): StoryLine[] => [...allShots().flatMap((s) => s.lines), ...doc.choices.flatMap((c) => [c.question, ...c.options.map((op) => op.rejoin).filter((x): x is StoryLine => !!x)])];

    // ---------------------------------------------------------------- pictures, cast, opening frames
    await stage('drawing', 'Drawing the cast and the opening frames');
    t = Date.now();
    const printed: Buffer[] = [];
    for (const [i, p] of doc.pictures.entries()) {
      try { const b = await cropPicture(pages[p.page] ?? pages[0]!, p); printed[i] = b; p.url = await save(`pic-${i}.png`, b, 'image/png'); }
      catch (e: any) { log(`picture ${i} crop failed: ${e?.message}`); }
    }
    const cast = await drawCast(printed.filter(Boolean), doc.characters, doc.artStyle, spend);
    if (cast) doc.castUrl = await save('cast.png', cast, 'image/png');
    const refsFor = (s: StoryShot) => {
      const near = printed.filter(Boolean);
      return [...(cast ? [cast] : []), ...near].slice(0, 6);
    };
    const keyframes = new Map<string, string>(); // shot id → local file
    const drawGate = gate(2);
    const drawFrame = async (s: StoryShot, version = 1) => {
      const start = s.fromPicture != null ? printed[s.fromPicture] ?? null : null;
      const castOf = doc.characters.filter((c) => s.cast.includes(c.id));
      const b = await drawGate(() => drawKeyframe({ shot: s, printed: start, refs: refsFor(s), cast: castOf, artStyle: doc.artStyle, spend }));
      const png = await sharp(b).resize(1280, 720, { fit: 'cover' }).png().toBuffer();
      const name = `kf-${s.id}${version > 1 ? `-v${version}` : ''}.png`;
      s.keyframeUrl = await save(name, png, 'image/png');
      keyframes.set(s.id, local(name));
      return png;
    };
    await Promise.all(allShots().map((s) => drawFrame(s).catch((e) => log(`keyframe ${s.id} failed: ${String(e?.message).slice(0, 120)}`))));
    lap('draw', t);
    await persist();

    // ---------------------------------------------------------------- clips, voices and music at the same time
    await stage('filming', 'Filming every shot and recording the voices');
    t = Date.now();
    const clips = new Map<string, string>(); // shot id → local mp4
    const voices = new Map<string, string>(); // line id → local wav
    let music: string | null = null;
    const versions = new Map<string, number>();
    const nextVersion = (k: string) => { const v = (versions.get(k) ?? 0) + 1; versions.set(k, v); return v; };
    const film = async (s: StoryShot, round = 0) => {
      const kf = keyframes.get(s.id);
      if (!kf) return;
      const castOf = doc.characters.filter((c) => s.cast.includes(c.id));
      const clip = await filmClip({ images: [fs.readFileSync(kf)], prompt: clipPrompt(s, castOf, doc.artStyle, s.fromPicture != null), spend });
      const v = nextVersion(`clip-${s.id}`);
      const name = `clip-${s.id}${v > 1 ? `-v${v}` : ''}.mp4`;
      s.clipUrl = await save(name, clip.bytes, 'video/mp4');
      s.clipRef = clip.ref; s.clipModel = clip.model; s.clipMs = clip.ms;
      clips.set(s.id, local(name));
      await checkSound(s, local(name));
      (s.history ??= []).push({ round, action: round ? 'filmed again' : 'filmed', note: `${clip.model}, ${(clip.ms / 1000).toFixed(0)} s` });
      log(`clip ${s.id} (${clip.model}) in ${(clip.ms / 1000).toFixed(0)} s`);
    };
    async function checkSound(s: StoryShot, file: string) {
      try { const r = await clipHasSpeech(file, spend); s.clipMuted = r.speech || undefined; if (r.speech) log(`clip ${s.id} has speech in its sound ("${r.heard.slice(0, 60)}"); it plays without it`); }
      catch (e: any) { log(`sound check ${s.id} failed: ${String(e?.message).slice(0, 80)}`); }
    }
    const voiceOf = (l: StoryLine) => {
      const c = doc.characters.find((x) => x.id === l.speaker);
      return c ? { voice: c.voice, style: l.style || c.style } : { voice: doc.narrator.voice, style: l.style || doc.narrator.style };
    };
    const record = async (l: StoryLine) => {
      const { voice, style } = voiceOf(l);
      const r = await speak(l.text, voice, style, spend);
      const v = nextVersion(`v-${l.id}`);
      const name = `v-${l.id}${v > 1 ? `-v${v}` : ''}.wav`;
      l.audioUrl = await save(name, r.wav, 'audio/wav'); l.ms = r.ms;
      voices.set(l.id, local(name));
    };
    await Promise.all([
      ...allShots().map((s) => film(s).catch((e) => log(`clip ${s.id} failed: ${String(e?.message).slice(0, 160)}`))),
      ...allLines().map((l) => record(l).catch((e) => log(`voice ${l.id} failed: ${String(e?.message).slice(0, 120)}`))),
      (async () => {
        try { const m = await compose(doc.music?.prompt ?? 'gentle instrumental music for a children\'s story', spend); doc.music = { prompt: doc.music?.prompt ?? '', url: await save('music.wav', m, 'audio/wav') }; music = local('music.wav'); }
        catch (e: any) { log(`music failed: ${String(e?.message).slice(0, 120)}`); }
      })(),
    ]);
    lap('film', t);
    await persist();

    // ---------------------------------------------------------------- film, review, revise
    const tune: FilmTuning = { ...DEFAULT_TUNING };
    const holds: Record<string, number> = {};
    const assets = {
      clip: (sid: string) => clips.get(sid) ?? null,
      still: (sid: string) => keyframes.get(sid) ?? null,
      voice: (lid: string) => voices.get(lid) ?? null,
      quiet: (sid: string) => !!allShots().find((x) => x.id === sid)?.clipMuted,
      get music() { return music; },
    };
    let last: StoryReview | null = null;
    for (let round = 1; round <= rounds; round++) {
      await stage('reviewing', `Putting version ${round} together and reviewing it`);
      t = Date.now();
      const out = local(`film-r${round}.mp4`), preview = local(`film-r${round}-review.mp4`);
      const { seconds, segments } = await renderFilm(doc, assets, out, { work: path.join(o.work, `render-r${round}`), tune, preview, holds });
      fs.rmSync(path.join(o.work, `render-r${round}`), { recursive: true, force: true }); // the pieces (hundreds of MB) are not needed once the film exists
      lap(`render-r${round}`, t);
      const filmUrl = await store.putFile(id, `film-r${round}.mp4`, fs.readFileSync(out), 'video/mp4');
      await persist({ film: { url: filmUrl, ms: Math.round(seconds * 1000), poster: allShots()[0]?.keyframeUrl } });
      t = Date.now();
      let review: StoryReview;
      try { review = await reviewFilm({ doc, film: fs.readFileSync(preview), pages, segments, round, filmUrl, spend }); }
      catch (e: any) { log(`review failed: ${String(e?.message).slice(0, 160)}`); break; }
      lap(`review-r${round}`, t);
      fs.writeFileSync(local(`review-r${round}.json`), JSON.stringify(review, null, 1));
      const worst = Math.min(...review.shots.map((s) => s.score), 10);
      log(`review ${round}: overall ${review.overall}, worst shot ${worst}, ${review.verdict} | ${review.summary.slice(0, 200)}`);
      doc.reviews = [...doc.reviews, review];
      last = review;
      await persist();
      if (round === rounds || review.verdict === 'ship' || (review.overall >= target && worst >= floor)) break;
      await stage('revising', `Applying the review notes (version ${round + 1})`);
      t = Date.now();
      review.applied = await revise(review, round);
      lap(`revise-r${round}`, t);
      log(`applied: ${review.applied.join(' | ') || 'nothing'}`);
      await persist({ reviews: [...doc.reviews.slice(0, -1), review] });
    }

    timings.total = Date.now() - t0;
    await persist({ status: 'ready', stage: 'ready', detail: last ? `Ready. The reviewer's score: ${last.overall} out of 10` : 'Ready' });
    log(`ready in ${(timings.total / 1000).toFixed(0)} s, cost $${cost.usd.toFixed(2)}`);
    return doc;

    // ---------------------------------------------------------------- the reviewer's notes, applied
    async function revise(review: StoryReview, round: number): Promise<string[]> {
      const applied: string[] = [];
      const visual = review.shots.filter((s) => s.fix && (s.fix.kind === 'edit' || s.fix.kind === 'regenerate')).sort((a, b) => a.score - b.score).slice(0, 4);
      await Promise.all(visual.map(async (rs) => {
        const s = allShots().find((x) => x.id === rs.id);
        if (!s || !rs.fix) return;
        const castOf = doc.characters.filter((c) => s.cast.includes(c.id));
        if (rs.fix.kind === 'edit' && s.clipRef && rs.fix.edit) {
          try {
            const instruction = /keep everything else the same/i.test(rs.fix.edit) ? rs.fix.edit : `${rs.fix.edit} Keep everything else the same.`;
            const clip = await editClip(s.clipRef, instruction, spend);
            const v = nextVersion(`clip-${s.id}`);
            const name = `clip-${s.id}-v${v}.mp4`;
            s.clipUrl = await save(name, clip.bytes, 'video/mp4'); s.clipRef = clip.ref; clips.set(s.id, local(name));
            await checkSound(s, local(name));
            (s.history ??= []).push({ round, action: 'edited', note: instruction });
            applied.push(`${s.id}: edited the clip: ${instruction}`);
            return;
          } catch (e: any) { log(`edit ${s.id} failed (${String(e?.message).slice(0, 100)}); filming it again`); }
        }
        try {
          if (rs.fix.picture) s.picture = rs.fix.picture;
          if (rs.fix.motion) s.motion = rs.fix.motion;
          if (rs.fix.picture && s.fromPicture == null) await drawFrame(s, nextVersion(`kf-${s.id}`) + 1);
          await film(s, round);
          (s.history ??= []).push({ round, action: 'new plan', note: rs.issues.slice(0, 2).join('; ') });
          applied.push(`${s.id}: filmed again (${rs.issues[0] ?? 'the reviewer asked for it'})`);
        } catch (e: any) { log(`re-film ${s.id} failed: ${String(e?.message).slice(0, 120)}`); }
      }));
      // lines acted again (a new voice changes the character everywhere, so the character keeps one voice)
      const redo = new Set<string>();
      for (const rs of review.shots) for (const lf of rs.fix?.kind === 'revoice' || rs.fix?.lines ? rs.fix?.lines ?? [] : []) {
        const l = allLines().find((x) => x.id === lf.id);
        if (!l) continue;
        if (lf.style) l.style = String(lf.style);
        if (lf.text && String(lf.text).trim()) l.text = String(lf.text).trim();
        if (lf.voice) {
          const c = doc.characters.find((x) => x.id === l.speaker);
          const taken = new Set([doc.narrator.voice, ...doc.characters.map((x) => x.voice)]);
          if (!taken.has(lf.voice)) { if (c) { c.voice = lf.voice; allLines().filter((x) => x.speaker === c.id).forEach((x) => redo.add(x.id)); } else if (l.speaker === 'narrator') { doc.narrator.voice = lf.voice; allLines().filter((x) => x.speaker === 'narrator').forEach((x) => redo.add(x.id)); } }
        }
        redo.add(l.id);
      }
      await Promise.all([...redo].map(async (lid) => { const l = allLines().find((x) => x.id === lid); if (l) await record(l).catch((e) => log(`revoice ${lid} failed: ${e?.message}`)); }));
      if (redo.size) applied.push(`acted ${redo.size} line${redo.size > 1 ? 's' : ''} again`);
      for (const rs of review.shots) if (rs.fix?.kind === 'retime' && rs.fix.hold) { holds[rs.id] = Math.min(2, Math.max(0.3, rs.fix.hold)); applied.push(`${rs.id}: a ${holds[rs.id]!.toFixed(1)} s pause after the speech`); }
      const mix = (review as any).mix as { music?: number; ambient?: number } | undefined;
      if (mix?.music) { tune.music = Math.max(0.15, Math.min(0.9, tune.music * (mix.music < 0 ? 0.7 : 1.3))); applied.push(`music ${mix.music < 0 ? 'quieter' : 'louder'}`); }
      if (mix?.ambient) { tune.ambient = Math.max(0.08, Math.min(0.7, tune.ambient * (mix.ambient < 0 ? 0.65 : 1.35))); applied.push(`ambient sound ${mix.ambient < 0 ? 'quieter' : 'louder'}`); }
      await persist();
      return applied;
    }
  } catch (e: any) {
    const msg = String(e?.message ?? e).split('\n')[0]!.slice(0, 200);
    log(`failed: ${msg}`);
    await persist({ status: 'failed', stage: 'failed', detail: 'Something went wrong', error: msg });
    throw e;
  }
}
