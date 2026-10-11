// Reading a whole chapter: which pages are worth bringing to life, and what the chapter is called.
import sharp from 'sharp';
import { generateJson, imagePart } from './gemini.js';

export type PageScore = { score: number; concept: string; subject: string; figure: string; why: string };
const SCORE_SYSTEM = `You judge one printed textbook page for an app that animates the page's own diagram on the page (a moving diagram, live values, a short spoken lesson). Return JSON: {"score": 0-10, "concept": "<the main concept on this page, 3-8 words>", "subject": "<physics|chemistry|biology|maths|other>", "figure": "<what the main diagram shows, or 'none'>", "why": "<one short line>"}. Score 9-10: a clear central diagram of a dynamic process or quantitative relation (a pendulum, a circuit, a ray diagram, a graph, forces on a body, a geometric construction with a theorem) with the numbers or steps to animate. Score 5-7: a figure but mostly static (apparatus photo, table). Score 0-3: text only, exercises, chapter openers, summaries, questions, or decorative pictures.`;

export async function scorePage(jpeg: Buffer): Promise<PageScore> {
  const small = await sharp(jpeg).resize({ width: 900, withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
  const r = await generateJson<PageScore>({ model: 'quick', system: SCORE_SYSTEM, parts: [imagePart(small)], maxTokens: 200, temperature: 0.1, label: 'page-score', mediaResolution: 'low' });
  return { score: Number(r.json.score) || 0, concept: String(r.json.concept ?? '').slice(0, 80), subject: String(r.json.subject ?? 'other'), figure: String(r.json.figure ?? ''), why: String(r.json.why ?? '') };
}

export type ChapterInfo = { title: string; subject: string; grade: string; language: string };
export async function chapterInfo(firstPages: Buffer[]): Promise<ChapterInfo> {
  const parts = await Promise.all(firstPages.slice(0, 2).map(async (b) => imagePart(await sharp(b).resize({ width: 900, withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer())));
  const r = await generateJson<ChapterInfo>({
    model: 'quick', label: 'chapter-info', maxTokens: 160, temperature: 0.1, mediaResolution: 'low', parts,
    system: 'These are the first pages of a textbook chapter. Return JSON {"title": "<the chapter title as printed, without the chapter number>", "subject": "<Science|Mathematics|Physics|...>", "grade": "<e.g. Class 10, or empty>", "language": "<BCP-47, e.g. en or hi>"}.',
  });
  return { title: String(r.json.title ?? 'This chapter').slice(0, 90), subject: String(r.json.subject ?? ''), grade: String(r.json.grade ?? ''), language: String(r.json.language ?? 'en') };
}
