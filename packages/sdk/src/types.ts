// The shapes the Living Textbook API returns. Field names are snake_case, exactly as they arrive over HTTP.

export type LessonStatus = 'ready' | 'processing';
export type VerificationStatus = 'verified-page' | 'checked-independently' | 'faithful' | 'unverified' | 'failed';

export interface LessonStep {
  index: number;
  title: string;
  /** What the narrator says in this step, checked against the page. */
  narration: string;
}

export interface Lesson {
  id: string;
  object: 'lesson';
  created_at: string;
  status: LessonStatus;
  title: string;
  subject: string;
  kind: string;
  /** The language of the page, detected (BCP-47, for example "en" or "hi"). */
  language: string;
  /** One sentence about the page. */
  summary: string;
  steps: LessonStep[];
  /** How the lesson was checked against the page. "failed" means a check did not pass. */
  verification: { status: VerificationStatus; summary: string; checks: number; passed: number } | null;
  page: { width: number; height: number; image_url: string | null };
  /** Opens the lesson in Living Textbook (AR on phones, the whole page on desktops). */
  share_url: string;
  /** Show the lesson inside your app: put it in an iframe, or use the embed SDK. */
  embed_url: string;
  /** "api" for lessons made with your secret key, "embed" for lessons made in the scanner on your site. */
  source: 'api' | 'embed';
  external_user_id: string | null;
  metadata: Record<string, string>;
}

export interface LessonList { object: 'list'; data: Lesson[]; has_more: boolean }

export interface QuizQuestion { question: string; options: string[]; answer_index: number; explanation: string }
export interface Quiz { object: 'quiz'; lesson_id: string; language: string; questions: QuizQuestion[] }

export interface UsageDay { day: string; lessons: number; by_key: Record<string, number> }
export interface Usage { object: 'usage'; daily_limit: number; per_minute_limit: number; today: UsageDay; days: UsageDay[] }

/** A step of making a lesson, reported while it is made (`onProgress`). */
export interface Progress { stage: string; status: 'start' | 'done' | 'error'; detail: string }

export type ErrorType = 'invalid_request_error' | 'authentication_error' | 'permission_error' | 'not_found_error' | 'rate_limit_error' | 'api_error';
