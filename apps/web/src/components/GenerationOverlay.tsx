// The quiet loading treatment while a page is being brought to life: a soft light sweep across the page, a contour
// drawing itself around the figure the system is working on, and the current step in plain words. It lives inside
// the page layer, so in AR it follows the physical page; `floating` is the version shown before the page is found.
import { GeminiSpark } from './GeminiSpark';
import type { Phase } from '../lib/store';

export const PHASE_WORDS: Record<Phase, string> = {
  idle: '', capturing: 'Looking at the page', analyzing: 'Understanding the page', generating: 'Preparing the scene', validating: 'Checking it against the page',
  preparing: 'Bringing it to life', ready: '', live: '', failed: '', cancelled: '',
};

type Props = { phase: Phase; page: { w: number; h: number }; figure?: [number, number, number, number]; title?: string; floating?: boolean };

export function GenerationOverlay({ phase, page, figure, title, floating = false }: Props) {
  const words = PHASE_WORDS[phase];
  if (floating) {
    return (
      <div className="gen-floating enter" aria-live="polite">
        <GeminiSpark state="thinking" size={26} />
        <div className="gen-words">{words}</div>
        {title && <div className="gen-title">{title}</div>}
      </div>
    );
  }
  const [x0, y0, x1, y1] = figure ?? [page.w * 0.1, page.h * 0.3, page.w * 0.9, page.h * 0.7];
  const pad = Math.max(10, Math.min(page.w, page.h) * 0.02);
  return (
    <div className="gen-overlay" aria-live="polite">
      <div className="gen-sweep" />
      <svg className="gen-contour" viewBox={`0 0 ${page.w} ${page.h}`} width={page.w} height={page.h} aria-hidden="true">
        <rect x={x0 - pad} y={y0 - pad} width={x1 - x0 + pad * 2} height={y1 - y0 + pad * 2} rx={pad * 1.5} pathLength={100} />
      </svg>
      <div className="gen-label" style={{ left: (x0 + x1) / 2, top: Math.min(page.h - 40, y1 + pad * 2.2) }}>
        <GeminiSpark state="thinking" size={18} />
        <span>{words}</span>
      </div>
    </div>
  );
}
