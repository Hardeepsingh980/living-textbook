/** What a progress event says about the page it belongs to. */
export type LessonMeta = { title: string; subject: string; kind: string; language: string; pageImageUrl: string };

/** A background generation: a short video (a page in) or a chapter film (a chapter PDF in). */
export type JobSection = { page: number; concept: string; score: number; status: 'waiting' | 'making' | 'recording' | 'done' | 'skipped'; experienceId?: string; thumb?: string; title?: string };
export type Job = {
  id: string; kind: 'short' | 'chapter'; owner: string; createdAt: string; updatedAt: number;
  status: 'queued' | 'running' | 'ready' | 'failed'; stage: string; detail: string; attempts: number;
  input: { url: string; mime: string; name?: string }; options: { seconds?: number; sections?: number };
  title?: string; subject?: string; grade?: string; pages?: number; sections?: JobSection[]; questions?: string[];
  experienceId?: string; url?: string; poster?: string; seconds?: number; error?: string;
};
