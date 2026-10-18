// The stills a story's clips start from, all in the book's own style: the pictures printed on the pages (cropped), a
// cast sheet drawn from them, and one opening frame per shot. A shot whose moment is printed on the page starts from
// that picture, extended to 16:9; any other shot gets a new frame drawn with the printed pictures and the cast sheet as
// references.
import sharp from 'sharp';
import { generateImage } from '../gemini.js';

/** Nano Banana with references, asked twice before the call falls back to a model that ignores references. */
async function drawWithRefs(prompt: string, refs: Buffer[]) {
  // under load the model answers "OTHER" without an image; waiting a little longer each time beats a model without references
  for (let attempt = 0; attempt < 5; attempt++) {
    try { return await generateImage({ prompt, model: 'imageRef', aspect: '16:9', refs, noFallback: true }); }
    catch (e: any) { console.warn(`[story] drawing attempt ${attempt + 1} failed: ${String(e?.message).slice(0, 160)}`); await new Promise((r) => setTimeout(r, 3000 * 2 ** attempt * (0.7 + Math.random() * 0.6))); }
  }
  return generateImage({ prompt, model: 'imageRef', aspect: '16:9', refs });
}
import type { StoryCharacter, StoryPicture, StoryShot } from './types.js';

const NO_TEXT = 'No text, no letters, no captions, no speech bubbles, no panel borders, no page edges, no watermark.';

/** Cut a printed picture out of its page (box is [ymin, xmin, ymax, xmax] in 0-1000), as PNG. */
export async function cropPicture(page: Buffer, pic: StoryPicture): Promise<Buffer> {
  const img = sharp(page).rotate();
  const { width = 1000, height = 1000 } = await img.metadata();
  const [y0, x0, y1, x1] = pic.box;
  const pad = 0.006;
  const left = Math.max(0, Math.floor((x0 / 1000 - pad) * width)), top = Math.max(0, Math.floor((y0 / 1000 - pad) * height));
  const w = Math.min(width - left, Math.ceil(((x1 - x0) / 1000 + 2 * pad) * width)), h = Math.min(height - top, Math.ceil(((y1 - y0) / 1000 + 2 * pad) * height));
  return sharp(page).rotate().extract({ left, top, width: Math.max(8, w), height: Math.max(8, h) }).png().toBuffer();
}

/** A reference sheet of the cast, in the book's style, drawn from the printed pictures. */
export async function drawCast(pictures: Buffer[], characters: StoryCharacter[], artStyle: string, spend: (m: string, usd: number) => void): Promise<Buffer | null> {
  if (!characters.length) return null;
  const prompt = `A character reference sheet for an animated film of this children's story. Draw each of these characters once, full body, standing side by side and facing the viewer, evenly spaced, on a plain warm paper-white background:
${characters.map((c) => `- ${c.name}: ${c.look}`).join('\n')}
Draw them exactly as they appear in the reference illustrations (same faces, clothes, colours, proportions), in the same art style: ${artStyle}. ${NO_TEXT}`;
  try {
    const r = await drawWithRefs(prompt, pictures.slice(0, 6));
    spend(r.usage.model, r.usage.costUsd);
    return r.bytes;
  } catch (e: any) { console.warn('[story] cast sheet failed:', String(e?.message ?? e).slice(0, 120)); return null; }
}

/** The frame a shot's clip starts from (16:9). */
export async function drawKeyframe(opts: {
  shot: StoryShot; printed: Buffer | null; refs: Buffer[]; cast: StoryCharacter[]; artStyle: string; spend: (m: string, usd: number) => void;
}): Promise<Buffer> {
  const { shot, printed, refs, cast, artStyle } = opts;
  const lookOf = (c: StoryCharacter) => shot.looks?.[c.id] ? `${shot.looks[c.id]} (in this scene; otherwise as in the references)` : c.look;
  const who = cast.length ? `Characters (draw them exactly as in the references): ${cast.map((c) => `${c.name}: ${lookOf(c)}`).join('; ')}. Only these characters appear; anyone else in the references stays out of this frame.` : 'No story characters appear in this frame.';
  const prompt = printed
    ? `Extend this book illustration into a 16:9 landscape frame for an animated film. Keep the original drawing exactly as it is, same size, in the middle of the frame, and continue the scene naturally to the left and right in exactly the same style (${artStyle}). Remove any speech bubbles, captions and printed text from the drawing and fill those spots with the scene. ${who} ${NO_TEXT}`
    : `A single frame from an animated film of a children's book, 16:9 landscape, drawn in exactly the art style of the reference illustrations: ${artStyle}. ${shot.picture} ${who} The composition leaves room for the characters to move. ${NO_TEXT}${shot.avoid?.length ? ` An earlier frame had these mistakes; do not repeat them: ${shot.avoid.slice(-4).join('; ')}.` : ''}`;
  const r = await drawWithRefs(prompt, printed ? [printed, ...refs.slice(0, 2)] : refs.slice(0, 6));
  opts.spend(r.usage.model, r.usage.costUsd);
  return r.bytes;
}

/** The plan's motion as plain steps in order. Timecodes make the video model cut between shots inside a clip, so
 *  "[0-3s] A [3-7s] B" is filmed as "First, A. Then, B." */
export function stepsOf(motion: string): string {
  const parts = motion.split(/\[\s*\d+(?:\.\d+)?\s*-\s*\d+(?:\.\d+)?\s*s?\s*\]/i).map((p) => p.trim().replace(/[.\s]+$/, '')).filter(Boolean);
  if (parts.length <= 1) return motion.replace(/\[[^\]]*\]/g, '').trim();
  return parts.map((p, i) => `${i === 0 ? 'First' : i === parts.length - 1 ? 'Finally' : 'Then'}, ${p.charAt(0).toLowerCase()}${p.slice(1)}.`).join(' ');
}

/** The prompt a clip is filmed from. */
export function clipPrompt(shot: StoryShot, cast: StoryCharacter[], artStyle: string, startsFromPrint: boolean): string {
  const looks = cast.map((c) => `${c.name} (${shot.looks?.[c.id] ?? c.look})`).join('; ');
  return `${startsFromPrint ? 'Bring this children\'s book illustration to life' : 'Animate this frame from a children\'s book film'} for 10 seconds. Keep exactly the art style of the image (${artStyle}): the same line, colours and texture in every frame, never photographic, never 3D.${looks ? ` Keep every character exactly as drawn: ${looks}.` : ''}
${stepsOf(shot.motion)}
Each character appears exactly once, and stays where the frame shows them unless the motion moves them. Objects keep their shape. Expressive faces and bodies, natural movement.
Continuous, unbroken shot from the first frame to the last: no cuts, no dissolves, no change of camera angle; the camera only moves slowly.${shot.avoid?.length ? `\nAn earlier version had these mistakes; do not repeat them: ${shot.avoid.slice(-4).join('; ')}.` : ''}
Sound design: ${shot.sound || 'quiet ambient sound that fits the place'}. No dialogue, no voices, no singing, no music.
No text, no subtitles, no speech bubbles, no frame borders.`;
}
