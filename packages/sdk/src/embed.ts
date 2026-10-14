// Living Textbook inside your web app.
//  - The lesson player shows a lesson (one you made with your secret key, or one a learner made in the scanner).
//  - The scanner lets learners photograph (or upload) a page inside your app and get a living lesson. It needs your
//    publishable key (ltpk_...) and opens only on the sites that key lists.
// Both are iframes served by Living Textbook; they talk to your page with postMessage, and this module turns those
// messages into events and your calls (play, pause, goTo) into messages. Nothing here runs until you call it, so it is
// safe to import during server-side rendering.
import { DEFAULT_BASE_URL } from './constants.js';

export type EmbedEventType = 'ready' | 'step' | 'complete' | 'quiz.completed' | 'lesson.created' | 'close' | 'error';

/** A lesson the scanner made, as your page receives it. */
export interface EmbeddedLesson { id: string; title: string; share_url: string; embed_url: string }

export interface EmbedEvent {
  type: EmbedEventType;
  /** The lesson the event is about. */
  lessonId?: string;
  title?: string;
  /** For "ready" and "step": the step now showing (from 0) and how many there are. */
  step?: number;
  steps?: number;
  /** For "quiz.completed". */
  score?: number;
  total?: number;
  /** For "lesson.created". */
  lesson?: EmbeddedLesson;
  /** For "error". */
  code?: string;
  message?: string;
}
export type EmbedListener = (e: EmbedEvent) => void;

export interface EmbedOptions {
  /** Your publishable key (ltpk_...). The scanner needs it; the lesson player works without it. */
  publishableKey?: string;
  /** The Living Textbook address; the script tag sets it from where it was loaded. */
  host?: string;
}

export interface LessonPlayerOptions {
  lessonId: string;
  /** CSS height of the player (default 640px). Its width is the container's. */
  height?: number | string;
  /** The iframe's accessible title. */
  title?: string;
  onEvent?: EmbedListener;
}

export interface ScannerOptions {
  /** Where to show the scanner. Without it the scanner opens full screen over your page. */
  target?: string | Element;
  /** CSS height when shown inside `target` (default 720px). */
  height?: number | string;
  /** A learner's lesson is ready. The scanner keeps showing it; call close() to finish. */
  onLesson?: (lesson: EmbeddedLesson) => void;
  /** The learner closed the scanner (or you called close()). */
  onClose?: () => void;
  onEvent?: EmbedListener;
}

export interface LessonPlayer {
  readonly iframe: HTMLIFrameElement;
  /** Listen to one event type, or "*" for all; returns a function that stops listening. */
  on(type: EmbedEventType | '*', fn: EmbedListener): () => void;
  /** Start or resume the lesson (browsers need one tap inside the player before sound can play). */
  play(): void;
  pause(): void;
  /** Show step `index` (from 0); the tutor explains it. */
  goTo(index: number): void;
  setMuted(muted: boolean): void;
  /** Remove the player from the page. */
  destroy(): void;
}

export interface Scanner {
  readonly iframe: HTMLIFrameElement;
  on(type: EmbedEventType | '*', fn: EmbedListener): () => void;
  close(): void;
}

const ALLOW = 'camera; microphone; autoplay; fullscreen; clipboard-write; web-share';
const css = (v: number | string | undefined, d: string) => (v === undefined ? d : typeof v === 'number' ? `${v}px` : v);

function element(t: string | Element): HTMLElement {
  const el = typeof t === 'string' ? document.querySelector(t) : t;
  if (!el) throw new Error(`LivingTextbook: no element matches ${String(t)}.`);
  return el as HTMLElement;
}

function frame(src: string, title: string, height: string, rounded = true): HTMLIFrameElement {
  const f = document.createElement('iframe');
  f.src = src;
  f.title = title;
  f.allow = ALLOW;
  f.setAttribute('allowfullscreen', '');
  // the frame learns which site it is on from the referrer; "origin" sends only scheme, host and port
  f.referrerPolicy = 'origin';
  f.style.cssText = `display:block;width:100%;height:${height};border:0;${rounded ? 'border-radius:16px;' : ''}background:#141210;color-scheme:normal;`;
  return f;
}

/** Messages from one frame (checked by origin and window), as events. */
function channel(iframe: HTMLIFrameElement, origin: string, first?: EmbedListener) {
  const listeners = new Map<string, Set<EmbedListener>>();
  const on = (type: string, fn: EmbedListener) => {
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type)!.add(fn);
    return () => { listeners.get(type)?.delete(fn); };
  };
  if (first) on('*', first);
  const handler = (e: MessageEvent) => {
    if (e.origin !== origin || e.source !== iframe.contentWindow) return;
    const d = e.data;
    if (!d || typeof d !== 'object' || d.source !== 'living-textbook' || typeof d.type !== 'string') return;
    const ev: EmbedEvent = { type: d.type, lessonId: d.lessonId, title: d.title, step: d.step, steps: d.steps, score: d.score, total: d.total, lesson: d.lesson, code: d.code, message: d.message };
    for (const fn of [...(listeners.get(d.type) ?? []), ...(listeners.get('*') ?? [])]) { try { fn(ev); } catch (err) { console.error('[LivingTextbook] listener failed', err); } }
  };
  window.addEventListener('message', handler);
  const send = (type: string, extra: Record<string, unknown> = {}) => iframe.contentWindow?.postMessage({ target: 'living-textbook', type, ...extra }, origin);
  const dispose = () => { window.removeEventListener('message', handler); listeners.clear(); };
  return { on, send, dispose };
}

export function createEmbed(options: EmbedOptions = {}) {
  const host = (options.host ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
  const origin = new URL(host).origin;
  const key = options.publishableKey;
  if (key?.startsWith('ltsk_')) throw new Error('LivingTextbook: a secret key (ltsk_) must never be in a web page. Use your publishable key (ltpk_) here, and revoke the secret key you exposed.');
  const keyQuery = key ? `?key=${encodeURIComponent(key)}` : '';

  return {
    /** Show a lesson inside `target` (an element or a CSS selector). */
    lesson(target: string | Element, opts: LessonPlayerOptions): LessonPlayer {
      if (!opts?.lessonId) throw new Error('LivingTextbook: lesson() needs { lessonId }.');
      const host_ = element(target);
      const iframe = frame(`${host}/embed/lesson/${encodeURIComponent(opts.lessonId)}${keyQuery}`, opts.title ?? 'Living Textbook lesson', css(opts.height, '640px'));
      host_.appendChild(iframe);
      const ch = channel(iframe, origin, opts.onEvent);
      return {
        iframe,
        on: ch.on,
        play: () => ch.send('play'),
        pause: () => ch.send('pause'),
        goTo: (index: number) => ch.send('goTo', { step: index }),
        setMuted: (muted: boolean) => ch.send('mute', { muted }),
        destroy: () => { ch.dispose(); iframe.remove(); },
      };
    },

    /** Open the page scanner: full screen over your page, or inside `target`. Needs your publishable key. */
    scanner(opts: ScannerOptions = {}): Scanner {
      if (!key) throw new Error('LivingTextbook: the scanner needs your publishable key: LivingTextbook({ publishableKey: "ltpk_..." }).');
      const src = `${host}/embed/scan${keyQuery}`;
      let overlay: HTMLDivElement | null = null, restoreOverflow = '', onKey: ((e: KeyboardEvent) => void) | null = null;
      let iframe: HTMLIFrameElement;
      if (opts.target) {
        iframe = frame(src, 'Living Textbook page scanner', css(opts.height, '720px'));
        element(opts.target).appendChild(iframe);
      } else {
        // full screen over the page: a sheet on large screens, the whole screen on phones
        const small = window.matchMedia('(max-width: 700px)').matches;
        overlay = document.createElement('div');
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-label', 'Living Textbook page scanner');
        overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:rgba(20,18,16,0.72);display:flex;align-items:center;justify-content:center;';
        const box = document.createElement('div');
        box.style.cssText = small ? 'position:relative;width:100vw;height:100dvh;' : 'position:relative;width:min(1100px,94vw);height:min(840px,90dvh);';
        iframe = frame(src, 'Living Textbook page scanner', '100%', !small);
        box.appendChild(iframe);
        if (!small) {
          const x = document.createElement('button');
          x.type = 'button';
          x.setAttribute('aria-label', 'Close the scanner');
          x.textContent = '×';
          x.style.cssText = 'position:absolute;top:-14px;right:-14px;width:40px;height:40px;border-radius:50%;border:2.5px solid #2d2d2d;background:#fff;color:#2d2d2d;font:28px/1 system-ui,sans-serif;cursor:pointer;box-shadow:3px 3px 0 #2d2d2d;';
          x.onclick = () => api.close();
          box.appendChild(x);
        }
        overlay.appendChild(box);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) api.close(); });
        onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') api.close(); };
        window.addEventListener('keydown', onKey);
        restoreOverflow = document.documentElement.style.overflow;
        document.documentElement.style.overflow = 'hidden';
        document.body.appendChild(overlay);
      }
      const ch = channel(iframe, origin, opts.onEvent);
      let closed = false;
      const api: Scanner = {
        iframe,
        on: ch.on,
        close: () => {
          if (closed) return; closed = true;
          ch.dispose();
          if (overlay) { overlay.remove(); document.documentElement.style.overflow = restoreOverflow; }
          else iframe.remove();
          if (onKey) window.removeEventListener('keydown', onKey);
          opts.onClose?.();
        },
      };
      ch.on('lesson.created', (e) => { if (e.lesson) opts.onLesson?.(e.lesson); });
      ch.on('close', () => api.close());
      return api;
    },
  };
}
