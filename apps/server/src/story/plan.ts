// Reading a story's pages and planning its film in one pass: the book's text, its cast and their voices, the pictures
// printed on the pages, and 5 to 8 shots whose lines are the book's own sentences and dialogue.
import { generateJson, imagePart } from '../gemini.js';
import type { StoryCharacter, StoryChoice, StoryLine, StoryPicture, StoryShot } from './types.js';

/** Prebuilt Gemini voices with how they sound, so the planner can cast each character. */
export const VOICES = [
  ['Sulafat', 'warm, female'], ['Vindemiatrix', 'gentle, female'], ['Achernar', 'soft, female'], ['Kore', 'firm, female'], ['Leda', 'youthful, female'],
  ['Aoede', 'breezy, female'], ['Autonoe', 'bright, female'], ['Laomedeia', 'upbeat, female'], ['Gacrux', 'mature, older female'], ['Despina', 'smooth, female'],
  ['Erinome', 'clear, female'], ['Callirrhoe', 'easy-going, female'], ['Zephyr', 'bright, female'], ['Pulcherrima', 'forward, female'],
  ['Charon', 'informative, male'], ['Puck', 'upbeat, playful male'], ['Fenrir', 'excitable, male'], ['Orus', 'firm, male'], ['Algenib', 'gravelly, deep male'],
  ['Enceladus', 'breathy, male'], ['Iapetus', 'clear, male'], ['Umbriel', 'easy-going, male'], ['Algieba', 'smooth, male'], ['Rasalgethi', 'informative, older male'],
  ['Alnilam', 'firm, male'], ['Schedar', 'even, male'], ['Achird', 'friendly, male'], ['Zubenelgenubi', 'casual, male'], ['Sadachbia', 'lively, young male'],
  ['Sadaltager', 'knowledgeable, older male'],
] as const;

export type StoryPlan = {
  title: string; book?: string; credit?: string; language: string;
  isStory: boolean; text: string;
  artStyle: string; setting: string; summary: string; moral?: string;
  pictures: StoryPicture[];
  narrator: { voice: string; style: string };
  characters: StoryCharacter[];
  shots: StoryShot[];
  choices: StoryChoice[];
  talk: { characterId: string; opener: string; suggestions: string[] }[];
  quiz: { q: string; options: string[]; answer: number; explain?: string }[];
  think?: string;
  music: string;
};

const SYSTEM = `You turn the pages of a fiction story (a picture book, a story in a school reader, a comic or a fable) into a short animated film that a child aged 6 to 12 watches and plays with. Each shot of the film is one 10-second clip from a video model, with the book's words read over it. You plan the whole film in one JSON answer.

FAITHFUL TO THE BOOK. The film tells the story ON THESE PAGES, in order, and nothing else happens in it. It covers ALL the story on the pages you are given, from its first sentence (or picture) to its last: every page's part of the story appears in the shots, and the film ends where the story on the last page ends. A page that holds no part of this story (an exercise, questions, a different story, notes for teachers) goes in "notStory" and is left out. Ignore page numbers, headers, exercises, questions, word lists and notes for teachers.
- Narrator lines are the book's own sentences, copied exactly. You may leave sentences out, and you may cut a long sentence down by leaving out a clause, but you must not add words, change words, or summarise in your own words. Never invent events, names or facts.
- Dialogue lines are the book's own dialogue (in a comic, the speech bubbles), copied exactly, spoken by the character who says them. Do not speak the "he said" part as dialogue; leave it out or keep it in the narrator line.
- Each shot has at most about 22 spoken words in total (about 9 seconds), so the speech fits the 10-second clip. Use more shots rather than longer lines. The film has 5 to 8 shots.
- For a comic or a picture story with little text, the narrator may describe each panel in one short plain sentence; still, keep every bubble's words exact.

ACTING. Every line has a "style": how it is said, in a few words ("gentle and slow, full of wonder", "gruff and impatient", "trembling, frightened", "sly and sweet"). The narrator is a warm storyteller for children. You may put a few vocal tags inside a character's line where the book's moment calls for it: <gasp>, <laugh>, <giggle>, <sigh>, <growl>, <whimper>, <cry>, <chuckle>, <short pause>. Use them rarely. Never put tags in narrator lines except <short pause>.

VOICES. Give the narrator and each speaking character a different voice from this list (name: how it sounds):
${VOICES.map(([v, d]) => `${v}: ${d}`).join('; ')}.
Match age and kind: a giant or a tiger sounds deep, a child sounds young, an old woman sounds mature. Never give two characters the same voice.

PICTURES. List every picture printed on the pages (an illustration, or each comic panel), with "page" (0-based, in the order the pages were given), "box" [ymin, xmin, ymax, xmax] in 0-1000 of that page image, tight around the drawing only (not the text), and "shows". A shot whose moment is printed on the page sets "fromPicture" to that picture's index, and its clip starts from the printed drawing.

ORDER. The shots follow the story exactly in the book's order. Never move a later moment earlier to start from a picture. If the pages have a printed picture, you may begin with ONE title shot ("titleShot": true) that starts from the most beautiful printed picture: the picture only gently comes alive (wind, light, breathing, falling petals, a slow camera move; no event from the story happens), and the narrator says only the story's title. The story's shots come after it, in order, and the printed moment plays again in its own place.

LOOK. "artStyle" describes the book's illustrations precisely, so new frames can match them: the medium (watercolour, pen and ink, flat colour, pencil), the line, the palette, the texture, the faces. Each character's "look" fixes what they wear and their colours as the pictures show them (or as the text says), so every shot draws them the same way.

SHOTS. For each shot:
- "picture": the opening frame, as a still: where we are, who is there, what each is doing, the light. One paragraph.
- "motion": what happens during the 10 seconds, in time order with timecodes, for example "[0-3s] ... [3-7s] ... [7-10s] ...". The action matches what the lines say at that moment. Expressive faces and bodies, gentle camera. One continuous shot, no cuts.
- "sound": ambient sound effects only (wind, birds, footsteps, a market crowd). No speech, no music.
- "page": the index of the page this moment is on.
- "cast": the ids of the characters on screen. Every character who is seen, even one who never speaks, is in "characters" with a look, so all shots draw them the same way.
- "looks": only when a character looks different in this shot than their usual look (a disguise, new clothes, a wound, wet or muddy), a map from the character's id to their look in this shot. Once a change happens, repeat it in every later shot until the story changes it back.

INTERACTION. Add one choice (two if the story has two real decisions) at a moment where a character decides something: "question" is one line the narrator asks the child (style "curious, inviting"). Give two options with short labels (at most 5 words): one is what the character does in the book ("canon": true, no shots), the other is imagined ("canon": false) with exactly one shot whose narrator line starts with "Imagine" or "What if" and shows a gentle, safe outcome, and a "rejoin" narrator line that starts with "But in the story," and leads back to the book. Add "talk": one or two characters the child can talk to, each with an "opener" (one short line the character says first, in character) and three short questions a child might ask. Add a three-question "quiz" answered by the text of these pages (four options each, "answer" is the index), a one-line "moral" if the story has one, and a "think" question for the child.

SAFETY. The film is for young children. Keep the plot, but nothing frightening is shown up close: no blood, no wounds, no weapons used on anyone, no death on screen (it can happen off screen and be told by the narrator), no cruelty to animals shown. Danger is shown by tension and reactions, not by harm.

MUSIC. "music": a prompt for instrumental background music that fits the story's mood, place and culture (instruments, tempo, feeling), no vocals.

Answer with JSON only:
{"isStory": true, "notStory": [], "title": "...", "book": "the book or collection, if printed", "credit": "author or reteller, if printed", "language": "en",
 "text": "the story text on these pages, in reading order",
 "artStyle": "...", "setting": "...", "summary": "two sentences", "moral": "...",
 "pictures": [{"page": 0, "box": [ymin, xmin, ymax, xmax], "shows": "..."}],
 "narrator": {"voice": "...", "style": "..."},
 "characters": [{"id": "short-id", "name": "...", "look": "...", "voice": "...", "style": "...", "persona": "who they are and how they talk, in two sentences"}],
 "shots": [{"id": "s1", "title": "...", "titleShot": false, "page": 0, "fromPicture": 0, "picture": "...", "motion": "...", "sound": "...", "cast": ["..."], "lines": [{"speaker": "narrator", "text": "...", "style": "..."}]}],
 "choices": [{"afterShot": "s3", "question": {"text": "...", "style": "curious, inviting"}, "options": [{"label": "...", "canon": true}, {"label": "...", "canon": false, "shots": [{"title": "...", "picture": "...", "motion": "...", "sound": "...", "cast": ["..."], "lines": [{"speaker": "narrator", "text": "Imagine ...", "style": "..."}]}], "rejoin": {"text": "But in the story, ...", "style": "..."}}]}],
 "talk": [{"characterId": "...", "opener": "...", "suggestions": ["...", "...", "..."]}],
 "quiz": [{"q": "...", "options": ["...", "...", "...", "..."], "answer": 0, "explain": "..."}],
 "think": "...", "music": "..."}
If the pages are not a fiction story, answer {"isStory": false}.`;

export async function planStory(pages: Buffer[], spend: (model: string, usd: number) => void): Promise<StoryPlan> {
  let note = '';
  for (let attempt = 0; ; attempt++) {
    const r = await generateJson<any>({
      model: 'storyPlan', system: SYSTEM, label: 'story-plan', maxTokens: 16000, thinking: 'medium', temperature: 0.6, mediaResolution: 'high',
      parts: [...pages.map((b, i) => [{ text: `Page ${i} of ${pages.length}:` }, imagePart(b)]).flat(), { text: `Plan the film for these ${pages.length} pages.${note}` }] as any,
    });
    spend(r.usage.model, r.usage.costUsd);
    const plan = normalizePlan(r.json);
    // every page must be in the film: a page no shot comes from is a part of the story left out
    const covered = new Set((Array.isArray(r.json?.shots) ? r.json.shots : []).map((s: any) => Number(s?.page)).filter((n: number) => Number.isInteger(n)));
    const skip = new Set((Array.isArray(r.json?.notStory) ? r.json.notStory : []).map(Number));
    const missing = plan.isStory ? pages.map((_, i) => i).filter((i) => !covered.has(i) && !skip.has(i)) : [];
    if (!missing.length || attempt >= 1) return plan;
    note = ` Your last plan left out page ${missing.join(' and page ')}. The film must tell the story of every page, to the end of the last page; plan it again.`;
    console.warn(`[story] plan left out page ${missing.join(', ')}; planning again`);
  }
}

const voiceNames = new Set<string>(VOICES.map(([v]) => v));

/** Give every shot, line and option an id, keep voices valid and distinct, and drop anything malformed. */
export function normalizePlan(j: any): StoryPlan {
  if (!j || j.isStory === false) return { isStory: false } as StoryPlan;
  const used = new Set<string>();
  const pickVoice = (want: string | undefined, fallback: string) => {
    let v = want && voiceNames.has(want) && !used.has(want) ? want : '';
    if (!v) v = [fallback, ...VOICES.map(([x]) => x)].find((x) => voiceNames.has(x) && !used.has(x)) ?? fallback;
    used.add(v); return v;
  };
  const narrator = { voice: pickVoice(j.narrator?.voice, 'Sulafat'), style: String(j.narrator?.style || 'a warm storyteller for children, gentle and clear') };
  const characters: StoryCharacter[] = (Array.isArray(j.characters) ? j.characters : []).filter((c: any) => c?.id && c?.name).map((c: any) => ({
    id: String(c.id).toLowerCase().replace(/[^a-z0-9-]/g, '-'), name: String(c.name), look: String(c.look ?? ''),
    voice: pickVoice(c.voice, 'Charon'), style: String(c.style ?? ''), persona: String(c.persona ?? ''),
  }));
  const ids = new Set(characters.map((c) => c.id));
  const speakerOf = (s: any) => { const k = String(s ?? 'narrator').toLowerCase().replace(/[^a-z0-9-]/g, '-'); return ids.has(k) ? k : 'narrator'; };
  let n = 0;
  const line = (l: any, prefix: string): StoryLine | null => {
    const text = String(l?.text ?? '').trim();
    if (!text) return null;
    return { id: `${prefix}-l${++n}`, speaker: speakerOf(l.speaker), text, style: l.style ? String(l.style) : undefined };
  };
  const shot = (s: any, id: string): StoryShot => ({
    id, title: String(s?.title ?? id), titleShot: s?.titleShot === true || undefined, picture: String(s?.picture ?? ''), motion: String(s?.motion ?? ''), sound: String(s?.sound ?? ''),
    cast: (Array.isArray(s?.cast) ? s.cast : []).map((c: any) => String(c).toLowerCase()).filter((c: string) => ids.has(c)),
    looks: s?.looks && typeof s.looks === 'object' ? Object.fromEntries(Object.entries(s.looks as Record<string, unknown>).map(([k, v]): [string, string] => [String(k).toLowerCase(), String(v)]).filter(([k]) => ids.has(k))) : undefined,
    fromPicture: Number.isInteger(s?.fromPicture) ? s.fromPicture : null,
    lines: (Array.isArray(s?.lines) ? s.lines : []).map((l: any) => line(l, id)).filter(Boolean) as StoryLine[],
  });
  const pictures: StoryPicture[] = (Array.isArray(j.pictures) ? j.pictures : []).filter((p: any) => Array.isArray(p?.box) && p.box.length === 4)
    .map((p: any) => ({ page: Number(p.page) || 0, box: p.box.map((v: any) => Math.max(0, Math.min(1000, Number(v) || 0))) as [number, number, number, number], shows: String(p.shows ?? '') }));
  const shots = (Array.isArray(j.shots) ? j.shots : []).map((s: any, i: number) => shot(s, `s${i + 1}`)).filter((s: StoryShot) => s.lines.length || s.motion);
  for (const s of shots) if (s.fromPicture != null && !pictures[s.fromPicture]) s.fromPicture = null;
  const choices: StoryChoice[] = (Array.isArray(j.choices) ? j.choices : []).slice(0, 2).map((c: any, ci: number) => {
    const after = shots.find((s: StoryShot) => s.id === c?.afterShot) ? String(c.afterShot) : shots[Math.min(shots.length - 2, 2)]?.id;
    const question = line(c?.question, `c${ci + 1}`);
    const options = (Array.isArray(c?.options) ? c.options : []).slice(0, 2).map((o: any, oi: number) => ({
      id: `c${ci + 1}o${oi + 1}`, label: String(o?.label ?? ''), canon: !!o?.canon,
      shots: o?.canon ? [] : (Array.isArray(o?.shots) ? o.shots : []).slice(0, 1).map((s: any, si: number) => shot(s, `c${ci + 1}o${oi + 1}s${si + 1}`)),
      rejoin: o?.canon ? undefined : line(o?.rejoin, `c${ci + 1}o${oi + 1}`) ?? undefined,
    }));
    return question && after && options.length === 2 && options.some((o: any) => o.canon) ? { id: `c${ci + 1}`, afterShot: after, question, options } : null;
  }).filter(Boolean) as StoryChoice[];
  return {
    isStory: true, title: String(j.title ?? 'A story'), book: j.book ? String(j.book) : undefined, credit: j.credit ? String(j.credit) : undefined,
    language: String(j.language ?? 'en'), text: String(j.text ?? ''), artStyle: String(j.artStyle ?? ''), setting: String(j.setting ?? ''),
    summary: String(j.summary ?? ''), moral: j.moral ? String(j.moral) : undefined, pictures, narrator, characters, shots, choices,
    talk: (Array.isArray(j.talk) ? j.talk : []).filter((t: any) => ids.has(String(t?.characterId).toLowerCase())).slice(0, 2)
      .map((t: any) => ({ characterId: String(t.characterId).toLowerCase(), opener: String(t.opener ?? ''), suggestions: (Array.isArray(t.suggestions) ? t.suggestions : []).slice(0, 3).map(String) })),
    quiz: (Array.isArray(j.quiz) ? j.quiz : []).filter((q: any) => q?.q && Array.isArray(q.options) && q.options.length >= 2).slice(0, 3)
      .map((q: any) => ({ q: String(q.q), options: q.options.map(String), answer: Math.max(0, Math.min(q.options.length - 1, Number(q.answer) || 0)), explain: q.explain ? String(q.explain) : undefined })),
    think: j.think ? String(j.think) : undefined, music: String(j.music ?? 'gentle, warm instrumental music for a children\'s story'),
  };
}
