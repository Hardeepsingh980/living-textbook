// A story made alive: the pages of a fiction story become a short interactive film. Each shot is a clip (Gemini Omni,
// started from the book's own picture or from a keyframe drawn in the book's style) with the book's sentences read by a
// narrator and the book's dialogue acted by each character's own voice. A choice lets the reader decide what a
// character does; a character can be talked to (Gemini Live); a short quiz closes the story. Every version of the film
// is watched by a reviewer model, and its notes are applied before the next version.

export type StoryLine = {
  id: string;
  /** 'narrator' or a character id */
  speaker: string;
  /** spoken exactly; may hold inline vocal tags such as <gasp> or <short pause> */
  text: string;
  /** how it is said (never spoken): "gentle, full of wonder" */
  style?: string;
  audioUrl?: string;
  ms?: number;
};

export type StoryShot = {
  id: string;
  title: string;
  /** the opening shot: the most beautiful printed picture gently comes alive while the title is read */
  titleShot?: boolean;
  lines: StoryLine[];
  /** the still frame the clip starts from */
  picture: string;
  /** what moves during the clip, in time order */
  motion: string;
  /** sound design for the clip (no speech, no music) */
  sound: string;
  /** character ids on screen */
  cast: string[];
  /** index into StoryDoc.pictures when this moment is printed on the page: the clip starts from the printed picture */
  fromPicture?: number | null;
  keyframeUrl?: string;
  clipUrl?: string;
  clipMs?: number;
  /** the video model's id for this clip, so a later round can edit it instead of starting again */
  clipRef?: string;
  clipModel?: string;
  /** the clip's own soundtrack has speech in it, so it plays without its sound */
  clipMuted?: boolean;
  /** versions of this shot, newest last: what changed and why */
  history?: { round: number; action: string; note: string }[];
};

export type StoryChoice = {
  id: string;
  /** the shot after which the reader chooses */
  afterShot: string;
  question: StoryLine;
  options: { id: string; label: string; canon: boolean; shots: StoryShot[]; rejoin?: StoryLine }[];
};

export type StoryCharacter = {
  id: string;
  name: string;
  /** what the character looks like in the book: species, age, clothes and colours, features */
  look: string;
  /** a prebuilt Gemini voice */
  voice: string;
  /** the character's usual way of speaking (TTS style) */
  style: string;
  /** who the character is, for talking with the reader in character */
  persona: string;
};

export type StoryPicture = { page: number; box: [number, number, number, number]; shows: string; url?: string };

export type StoryReviewShot = {
  id: string; score: number; issues: string[];
  fix?: { kind: 'none' | 'edit' | 'regenerate' | 'revoice' | 'retime'; edit?: string; picture?: string; motion?: string; lines?: { id: string; style?: string; text?: string; voice?: string }[]; hold?: number };
};

export type StoryReview = {
  round: number; at: number; model: string; filmUrl: string;
  overall: number; scores: Record<string, number>; verdict: 'ship' | 'revise';
  summary: string; strengths: string[]; global: string[];
  shots: StoryReviewShot[];
  /** what the engine did about it before the next round */
  applied?: string[];
};

export type StoryDoc = {
  id: string; owner: string; createdAt: string; updatedAt: number;
  status: 'making' | 'ready' | 'failed'; stage: string; detail: string; error?: string;
  title: string; book?: string; credit?: string; language: string;
  pages: { url: string; w: number; h: number }[];
  pictures: StoryPicture[];
  artStyle: string; setting: string; summary: string; moral?: string;
  /** the story's text on the pages, in reading order */
  text?: string;
  narrator: { voice: string; style: string };
  characters: StoryCharacter[];
  castUrl?: string;
  shots: StoryShot[];
  choices: StoryChoice[];
  talk: { characterId: string; opener: string; suggestions: string[] }[];
  quiz: { q: string; options: string[]; answer: number; explain?: string }[];
  think?: string;
  music?: { url?: string; prompt: string };
  film?: { url: string; ms: number; poster?: string };
  reviews: StoryReview[];
  cost: { usd: number; byModel: Record<string, number> };
  timings: Record<string, number>;
};
