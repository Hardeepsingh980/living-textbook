// Events streamed from the server pipeline to the client (and rendered by the agent theatre).
import type { Scene, BoxT } from './schema.js';
import type { Issue } from './normalize.js';

export type PageKind = 'science' | 'maths' | 'other-subject' | 'story' | 'picture-book' | 'non-fiction' | 'mixed' | 'unsupported';

export type QuickRead = {
  kind: PageKind;
  subject: string;
  language: string;        // BCP-47 primary language of the page text
  title: string;
  gist: string;            // one sentence
  figures: { id: string; label: string; box: BoxT; kind: 'diagram' | 'illustration' | 'photo' | 'table' | 'equation' | 'map' | 'other' }[];
  characters: { name: string; look: string }[];
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
  | { type: 'scene'; data: Scene; issues: Issue[]; version: number; t: number }
  | { type: 'extraction'; data: Extraction; t: number }
  | { type: 'audio'; id: string; url: string; kind: AudioClipKind; text: string; stepId?: string; lineId?: string; speaker?: string; durationMs: number; t: number }
  | { type: 'asset'; id: string; url: string; t: number }
  | { type: 'tracking'; url: string; width: number; height: number; trackPts: number[]; t: number }
  | { type: 'verification'; data: Verification; t: number }
  | { type: 'done'; t: number; timings: Record<string, number>; costUsd: number; experienceId: string }
  | { type: 'error'; message: string; recoverable: boolean; t: number };

export type ExperienceRecord = {
  id: string;
  createdAt: string;
  ownerId: string;
  bookId?: string;
  page: { w: number; h: number; imageUrl: string };
  quick: QuickRead;
  extraction?: Extraction;
  scene: Scene;
  audio: { id: string; url: string; kind: AudioClipKind; text: string; stepId?: string; lineId?: string; speaker?: string; durationMs: number }[];
  assets: { id: string; url: string }[];
  tracking?: { url: string; width: number; height: number; trackPts: number[] };
  verification?: Verification;
  timings: Record<string, number>;
  costUsd: number;
  events: PipelineEvent[];
};
