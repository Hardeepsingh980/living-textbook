// Stories made alive: the shapes the player reads (the server's StoryDoc), and the calls that read and make them.
import { authHeaders, ApiError } from './api';
import type { Job } from './types';
import type { CameraSession } from '../ar/camera';

export type StoryLine = { id: string; speaker: string; text: string; style?: string; audioUrl?: string; ms?: number };
export type StoryShot = { id: string; title: string; lines: StoryLine[]; picture: string; cast: string[]; fromPicture?: number | null; keyframeUrl?: string; clipUrl?: string; history?: { round: number; action: string; note: string }[] };
export type StoryChoice = { id: string; afterShot: string; question: StoryLine; options: { id: string; label: string; canon: boolean; shots: StoryShot[]; rejoin?: StoryLine }[] };
export type StoryCharacter = { id: string; name: string; look: string; voice: string; style: string; persona: string };
export type StoryReview = {
  round: number; at: number; model: string; filmUrl: string; overall: number; scores: Record<string, number>; verdict: string;
  summary: string; strengths: string[]; global: string[]; shots: { id: string; score: number; issues: string[] }[]; applied?: string[];
};
export type Story = {
  id: string; owner: string; createdAt: string; status: 'making' | 'ready' | 'failed'; stage: string; detail: string; error?: string;
  title: string; book?: string; credit?: string; language: string;
  pages: { url: string; w: number; h: number }[];
  pictures: { page: number; box: [number, number, number, number]; shows: string; url?: string }[];
  artStyle: string; setting: string; summary: string; moral?: string;
  narrator: { voice: string; style: string };
  characters: StoryCharacter[]; castUrl?: string;
  shots: StoryShot[]; choices: StoryChoice[];
  talk: { characterId: string; opener: string; suggestions: string[] }[];
  quiz: { q: string; options: string[]; answer: number; explain?: string }[];
  think?: string;
  music?: { url?: string; prompt: string };
  film?: { url: string; ms: number; poster?: string };
  reviews: StoryReview[];
  cost: { usd: number };
};

async function json<T>(res: Response): Promise<T> {
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError((j as any).error || `server error ${res.status}`, (j as any).code || String(res.status));
  return j as T;
}

export async function getStory(id: string): Promise<Story> { return json(await fetch(`/api/stories/${encodeURIComponent(id)}`)); }
export async function listStories(): Promise<Story[]> { const r = await fetch('/api/stories', { headers: await authHeaders() }); return r.ok ? r.json() : []; }
/** A page that already has a story opens that story (the same film for everyone) instead of starting a new one. */
export type Reused = { reused: true; storyId: string; status: string; title: string };
/** Start making a story from photos of its pages (in reading order). */
export async function startStory(files: File[]): Promise<Job | Reused> {
  const form = new FormData();
  files.forEach((f, i) => form.append('pages', f, f.name || `page-${i + 1}.jpg`));
  return json(await fetch('/api/stories', { method: 'POST', body: form, headers: await authHeaders() }));
}
/** Turn a lesson's page (a story page scanned in the app) into a story film. */
export async function storyFromLesson(experienceId: string): Promise<Job | Reused> { return json(await fetch(`/api/stories/from-lesson/${encodeURIComponent(experienceId)}`, { method: 'POST', headers: await authHeaders() })); }
export async function deleteStory(id: string): Promise<void> { await json(await fetch(`/api/stories/${encodeURIComponent(id)}`, { method: 'DELETE', headers: await authHeaders() })); }

/** The line as it is shown: the vocal tags (<gasp>, <short pause>) are performed, not read. */
export const shown = (text: string) => text.replace(/<[^>]+>/g, ' ').replace(/\|[^|]*\|/g, ' ').replace(/\s+/g, ' ').trim();

/** Where a scanned page matched: the story, and where its printed picture is in the photo ([ymin, xmin, ymax, xmax]
 *  in 0-1000, null when the page has no picture the film can sit on). */
export type PageMatch = { storyId: string; page: number; score: number; exact: boolean; title: string; status: string; box: [number, number, number, number] | null; picture: number | null };
/** Is this photo a page of a story someone has already brought to life? About a second when it is not. */
export async function matchStoryPage(photo: Blob, timeoutMs = 9000): Promise<PageMatch | null> {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch('/api/pages/match', { method: 'POST', body: photo, headers: { 'content-type': photo.type || 'image/jpeg' }, signal: ctl.signal });
    return r.ok ? ((await r.json()).match ?? null) : null;
  } catch { return null; } finally { clearTimeout(t); }
}

/** A story page the scanner found: the camera keeps running and the film plays on the page itself. */
export type StoryScan = { match: PageMatch; story: Story | null; session: CameraSession; previewUrl: string; size: { w: number; h: number } };
export const scannedStory: { current: StoryScan | null } = { current: null };

/** On a phone, sound starts only from a tap. The scanner's tap readies the two players a story found a few seconds
 *  later speaks and plays music with. */
export const storyAudio: { voice: HTMLAudioElement | null; music: HTMLAudioElement | null } = { voice: null, music: null };
export const SILENT_WAV = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=';
export function readyStoryAudio() {
  storyAudio.voice ??= new Audio(); storyAudio.music ??= new Audio();
  for (const a of [storyAudio.voice, storyAudio.music]) { a.src = SILENT_WAV; void a.play().catch(() => {}); }
}
