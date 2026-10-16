// The reviewer: a model that watches the whole film (picture and sound) next to the book's pages and the plan, scores
// it, and says what to fix in each shot. Its notes become the next version: a clip edited or filmed again, a line
// acted differently, a pause added, the music turned down.
import { generateJson, imagePart } from '../gemini.js';
import { VOICES } from './plan.js';
import type { FilmSegment } from './film.js';
import type { StoryDoc, StoryReview, StoryReviewShot } from './types.js';

const SYSTEM = `You are the director and a strict reviewer of short animated films made from children's books. A film was made from the book pages you are given: each shot is a 10-second generated clip, the narrator reads the book's sentences and each character speaks the book's dialogue in their own voice, with captions. Watch and listen to the whole film carefully, compare it with the pages, and review it as if it will be shown to children aged 6 to 12 and to judges. Be honest and specific; praise only what is really good.

Score each of these from 0 to 10:
- faithful: the film tells exactly the story on the pages, in order; narration and dialogue use the book's words; nothing invented (an imagined path is allowed when the narrator clearly says "Imagine" or "What if").
- characters: every character looks the same in every shot and like the book's pictures (face, clothes, colours, species, age); no extra or missing characters.
- art: the frames look like the book's own illustrations (style, line, colour), beautiful and clean; no drift to photographic or 3D looks; no garbled letters or stray text in the picture.
- motion: natural and expressive; no morphing, melting faces, extra limbs, flicker or sudden jumps; the action matches the words.
- sync: what is shown matches what is said at that moment.
- voices: each voice fits its character, the acting fits the moment, clear and pleasant; the narrator is warm; nothing robotic or mispronounced.
- sound: ambient sound and music support the voices and never cover them; no stray speech or singing from the clips.
- pacing: calm enough for a child to follow; no rushed lines and no dead stretches.
- captions: readable and the same as what is said.
- wonder: would a child be delighted and want to choose and to talk to the characters?
- safety: nothing frightening, violent or unsuitable for young children.

Then, for every shot and every choice card (use its id, such as "c1"), list the concrete problems you see or hear (with the time in seconds), and one fix:
- "edit": a local visual problem in an otherwise good clip (a wrong colour, an extra object, a glitch in a face or a hand). Give "edit": one short instruction for the video model, ending with "Keep everything else the same."
- "regenerate": the clip's action or composition is wrong, or the glitches are too many to edit. Give a new "picture" (the opening frame, one paragraph) and a new "motion" (what happens, with timecodes [0-3s] [3-7s] [7-10s]). If the wrong characters are in the shot (someone who should not be there, someone missing), also give "cast": the ids of the characters who belong in it.
- "revoice": a line is acted badly, sounds wrong for the character, or is mispronounced. Give "lines": [{"id": the line id, "style": a new acting style in a few words, "voice": a new voice only if the voice itself is wrong, "text": only if the words differ from the book}].
- "retime": the shot needs a longer pause after the speech; give "hold" in seconds (0.5 to 2).
- "none": the shot is good.
Fix only what matters most to the result: at most four shots with "edit" or "regenerate" in one review; choose the worst ones.
Voices you may choose from: ${VOICES.map(([v, d]) => `${v} (${d})`).join(', ')}.

Answer with JSON only:
{"overall": 0-10, "scores": {"faithful": 0, "characters": 0, "art": 0, "motion": 0, "sync": 0, "voices": 0, "sound": 0, "pacing": 0, "captions": 0, "wonder": 0, "safety": 0},
 "summary": "three sentences: what works, what does not, what to do next",
 "strengths": ["..."], "global": ["problems that affect the whole film"],
 "mix": {"music": -1 | 0 | 1, "ambient": -1 | 0 | 1},
 "shots": [{"id": "s1", "score": 0-10, "issues": ["at 3.5 s: ..."], "fix": {"kind": "none" | "edit" | "regenerate" | "revoice" | "retime", "edit": "...", "picture": "...", "motion": "...", "lines": [{"id": "...", "style": "...", "voice": "...", "text": "..."}], "hold": 1}}],
 "verdict": "ship" | "revise"}
"overall" is your honest judgement of the film as a whole (9 or more only if you would show it to children exactly as it is). "verdict" is "ship" only when no shot needs a visual fix.`;

export async function reviewFilm(opts: {
  doc: StoryDoc; film: Buffer; pages: Buffer[]; segments: FilmSegment[]; round: number; filmUrl: string; spend: (m: string, usd: number) => void;
}): Promise<StoryReview> {
  const { doc, segments } = opts;
  const names: Record<string, string> = Object.fromEntries(doc.characters.map((c) => [c.id, c.name]));
  const allShots = [...doc.shots, ...doc.choices.flatMap((c) => c.options.flatMap((o) => o.shots))];
  const timeline = segments.map((g) => {
    const s = allShots.find((x) => x.id === g.id);
    const head = `[${g.start.toFixed(1)}-${g.end.toFixed(1)} s] ${g.kind === 'choice' ? 'CHOICE CARD' : 'SHOT'} ${g.id}${s ? ` "${s.title}" (clip from ${s.fromPicture != null ? 'the printed picture' : 'a new frame'})` : ''}`;
    const lines = g.lines.map((l) => {
      const line = [...allShots.flatMap((x) => x.lines), ...doc.choices.flatMap((c) => [c.question, ...c.options.map((o) => o.rejoin).filter(Boolean)])].find((x) => x?.id === l.id);
      return `   ${l.start.toFixed(1)} s, line ${l.id}, ${l.speaker === 'narrator' ? 'Narrator' : names[l.speaker] ?? l.speaker}${line?.style ? ` (${line.style})` : ''}: "${line?.text ?? l.text}"`;
    }).join('\n');
    return `${head}${s ? `\n   intended picture: ${s.picture}\n   intended motion: ${s.motion}` : ''}\n${lines}`;
  }).join('\n');
  const cast = doc.characters.map((c) => `${c.id} = ${c.name}: ${c.look} (voice ${c.voice}, ${c.style})`).join('\n');
  const r = await generateJson<any>({
    model: 'storyReview', system: SYSTEM, label: 'story-review', maxTokens: 12000, thinking: 'medium', temperature: 0.3, mediaResolution: 'medium',
    parts: [
      ...opts.pages.map((b, i) => [{ text: `Book page ${i}:` }, imagePart(b)]).flat(),
      { text: `THE STORY: "${doc.title}"${doc.book ? ` from ${doc.book}` : ''}. Art style of the book: ${doc.artStyle}\nCAST:\n${cast}\nNarrator voice: ${doc.narrator.voice} (${doc.narrator.style})\n\nTIMELINE OF THE FILM (review round ${opts.round}):\n${timeline}\n\nThe film:` },
      { inlineData: { mimeType: 'video/mp4', data: opts.film.toString('base64') } },
      { text: 'Review this film now.' },
    ] as any,
  });
  opts.spend(r.usage.model, r.usage.costUsd);
  const j = r.json ?? {};
  const shots: StoryReviewShot[] = (Array.isArray(j.shots) ? j.shots : []).filter((s: any) => s?.id).map((s: any) => ({
    id: String(s.id), score: Number(s.score) || 0, issues: (Array.isArray(s.issues) ? s.issues : []).map(String),
    fix: s.fix && typeof s.fix === 'object' ? { kind: ['edit', 'regenerate', 'revoice', 'retime'].includes(s.fix.kind) ? s.fix.kind : 'none', edit: s.fix.edit, picture: s.fix.picture, motion: s.fix.motion, cast: Array.isArray(s.fix.cast) ? s.fix.cast.map(String) : undefined, lines: Array.isArray(s.fix.lines) ? s.fix.lines : undefined, hold: Number(s.fix.hold) || undefined } : undefined,
  }));
  return {
    round: opts.round, at: Date.now(), model: r.usage.model, filmUrl: opts.filmUrl,
    overall: Number(j.overall) || 0, scores: j.scores ?? {}, verdict: j.verdict === 'ship' ? 'ship' : 'revise',
    summary: String(j.summary ?? ''), strengths: (j.strengths ?? []).map(String), global: (j.global ?? []).map(String), shots,
    ...(j.mix ? { mix: j.mix } : {}),
  } as StoryReview & { mix?: { music?: number; ambient?: number } };
}
