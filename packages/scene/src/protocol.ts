// Events streamed from the server pipeline to the client (and rendered by the agent theatre).
import type { Scene, BoxT } from './schema.js';
import type { Issue } from './normalize.js';
import type { InkMap } from './layout.js';

export type PageKind = 'science' | 'maths' | 'other-subject' | 'story' | 'picture-book' | 'non-fiction' | 'mixed' | 'unsupported';

export type QuickRead = {
  kind: PageKind;
  subject: string;
  language: string;        // BCP-47 primary language of the page text
  title: string;
  gist: string;            // one sentence
  figures: { id: string; label: string; box: BoxT; kind: 'diagram' | 'illustration' | 'photo' | 'table' | 'equation' | 'map' | 'other' }[];
  textBlocks?: BoxT[];
  characters: { name: string; look: string; box?: BoxT }[];   // box: where the character is drawn on the page, if it is
  spread: boolean;         // two-page spread detected
  confidence: number;      // 0..1
  opener: string;          // first narration sentence, in the page language
  bookTitle?: string;
};

export type Extraction = {
  text: string;                       // full page text (reading order)
  headings: string[];
  values: { name: string; value: number; unit: string; where: string }[];
  worked: { question: string; inputs: { name: string; value: number; unit: string }[]; answer: number; unit: string; formula?: string }[];
  equations: string[];
  entities: string[];
  setting?: string;
  dialogue: { speaker: string; text: string }[];
  steps: string[];                    // for processes
  claims: string[];                   // short factual statements the page supports
  language: string;
};

export type VerificationCheck = {
  name: string;
  method: 'page-answer' | 'independent' | 'faithfulness';
  expected?: number | string;
  got?: number | string;
  pass: boolean;
  detail: string;
  /** a claim that is correct and agrees with the page, but that the page itself does not state: a note, not a failure */
  beyond?: boolean;
};
export type Verification = {
  status: 'verified-page' | 'checked-independently' | 'faithful' | 'unverified' | 'failed';
  checks: VerificationCheck[];
  repaired: boolean;
  summary: string;
};

export type StageName = 'upload' | 'read' | 'understand' | 'build' | 'narrate' | 'voice' | 'illustrate' | 'verify' | 'track' | 'save';

export type AudioClipKind = 'opener' | 'narration' | 'line';

export type PipelineEvent =
  | { type: 'stage'; stage: StageName; status: 'start' | 'done' | 'error'; t: number; detail?: string; model?: string; ms?: number }
  | { type: 'quick-partial'; data: Partial<QuickRead>; t: number }
  | { type: 'quick'; data: QuickRead; t: number }
  | { type: 'scene'; data: Scene; issues: Issue[]; version: number; t: number; layout?: { mean: number; worst: number; moved: number; dropped: number }; motion?: { moving: number; total: number } }
  | { type: 'extraction'; data: Extraction; t: number }
  | { type: 'audio'; id: string; url: string; kind: AudioClipKind; text: string; stepId?: string; lineId?: string; speaker?: string; durationMs: number; version?: number; t: number }
  | { type: 'asset'; id: string; url: string; t: number }
  | { type: 'tracking'; url: string; width: number; height: number; trackPts: number[]; t: number }
  | { type: 'verification'; data: Verification; version?: number; t: number }
  | { type: 'ready'; t: number; experienceId: string }   // scene v1 + narration + verification are in; upgrades may follow
  | { type: 'done'; t: number; timings: Record<string, number>; costUsd: number; experienceId: string }
  | { type: 'error'; message: string; recoverable: boolean; t: number };

export type QuizQuestion = { q: string; options: string[]; answer: number; why: string };
export type Quiz = { questions: QuizQuestion[]; language: string; createdAt: string; model?: string };

export type ExperienceRecord = {
  id: string;
  createdAt: string;
  ownerId: string;
  quiz?: Quiz;                    // made on first request from the page's own text (see server quiz.ts)
  bookId?: string;
  page: { w: number; h: number; imageUrl: string; ink?: InkMap };
  quick: QuickRead;
  extraction?: Extraction;
  scene: Scene;
  sceneVersion?: number;          // which version the saved scene is (its clips carry the same version)
  audio: { id: string; url: string; kind: AudioClipKind; text: string; stepId?: string; lineId?: string; speaker?: string; durationMs: number; version?: number }[];
  assets: { id: string; url: string }[];
  tracking?: { url: string; width: number; height: number; trackPts: number[] };
  verification?: Verification;
  timings: Record<string, number>;
  costUsd: number;
  events: PipelineEvent[];
};
