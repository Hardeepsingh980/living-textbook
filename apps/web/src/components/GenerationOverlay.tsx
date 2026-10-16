// While a page is being brought to life: a pencil sketches a frame around the figure the system is working on,
// dashed skeleton boxes appear where overlays will go, a post-it says what is happening, and a soft light sweeps
// the page. It lives inside the page layer, so in AR it follows the physical page; `floating` is the version shown
// on the camera before the page has been found.
import { useMemo } from 'react';
import { GeminiSpark } from './GeminiSpark';
import type { Phase } from '../lib/store';

export const PHASE_WORDS: Record<Phase, string> = {
  idle: '', capturing: 'Looking at the page', analyzing: 'Reading the page', generating: 'Drawing on the page', validating: 'Checking it against the page',
  preparing: 'Bringing it to life', ready: '', live: '', failed: '', cancelled: '',
};

type Box = [number, number, number, number];
type Props = { phase: Phase; page: { w: number; h: number }; figure?: Box; title?: string; floating?: boolean };

/** A hand-drawn rectangle path: bowed sides, corners that overshoot a little, like a quick pencil frame. */
export function sketchRect([x0, y0, x1, y1]: Box, seed = 1): string {
  const w = x1 - x0, h = y1 - y0, j = (k: number) => Math.sin(seed * 12.9898 + k * 78.233) * 0.5; // deterministic wobble in -0.5..0.5
  const bx = w * 0.03, by = h * 0.03;
  return [
    `M ${x0 + bx * j(1)} ${y0 + by * j(2)}`,
    `C ${x0 + w * 0.3} ${y0 - by * (1 + j(3))}, ${x0 + w * 0.7} ${y0 + by * j(4)}, ${x1 + bx * j(5)} ${y0 + by * j(6)}`,
    `C ${x1 + bx * (1 + j(7))} ${y0 + h * 0.35}, ${x1 - bx * j(8)} ${y0 + h * 0.7}, ${x1 + bx * j(9)} ${y1 + by * j(10)}`,
    `C ${x0 + w * 0.65} ${y1 + by * (1 + j(11))}, ${x0 + w * 0.3} ${y1 - by * j(12)}, ${x0 + bx * j(13)} ${y1 + by * j(14)}`,
    `C ${x0 - bx * (1 + j(15))} ${y0 + h * 0.7}, ${x0 + bx * j(16)} ${y0 + h * 0.3}, ${x0 + bx * j(17)} ${y0 + by * j(18)}`,
    'Z',
  ].join(' ');
}

export function GenerationOverlay({ phase, page, figure, title, floating = false }: Props) {
  const words = PHASE_WORDS[phase];
  const geometry = useMemo(() => {
    const box: Box = figure ?? [page.w * 0.1, page.h * 0.3, page.w * 0.9, page.h * 0.7];
    const pad = Math.max(12, Math.min(page.w, page.h) * 0.025);
    const outer: Box = [box[0] - pad, box[1] - pad, box[2] + pad, box[3] + pad];
    const bw = outer[2] - outer[0], bh = outer[3] - outer[1];
    // where overlays tend to go: a readout beside the figure, a label under it, a small card at a corner
    const skeletons: Box[] = [
      [outer[2] - bw * 0.42, outer[1] + bh * 0.08, outer[2] - bw * 0.06, outer[1] + bh * 0.2],
      [outer[0] + bw * 0.08, outer[3] - bh * 0.22, outer[0] + bw * 0.46, outer[3] - bh * 0.1],
      [outer[0] + bw * 0.3, outer[1] + bh * 0.42, outer[0] + bw * 0.7, outer[1] + bh * 0.56],
    ];
    return { outer, skeletons, labelX: (outer[0] + outer[2]) / 2, labelY: Math.min(page.h - 60, outer[3] + pad * 1.6) };
  }, [figure, page.w, page.h]);
  if (floating) {
    return (
      <div className="gen-floating enter" aria-live="polite">
        <GeminiSpark state="thinking" size={28} />
        <div className="gen-words">{words}</div>
        {title && <div className="gen-title">{title}</div>}
      </div>
    );
  }
  const outline = sketchRect(geometry.outer, 3);
  return (
    <div className="gen-overlay" aria-live="polite">
      <div className="gen-sweep" />
      <svg className="gen-contour" viewBox={`0 0 ${page.w} ${page.h}`} width={page.w} height={page.h} aria-hidden="true">
        <path className="outline" d={outline} pathLength={100} />
        <path className="outline second" d={sketchRect(geometry.outer, 7)} pathLength={100} />
        {geometry.skeletons.map((b, i) => <path key={i} className={`skeleton ${['a', 'b', 'c'][i]}`} d={sketchRect(b, 11 + i)} />)}
        <circle className="pencil" r={7} style={{ offsetPath: `path("${outline}")`, offsetRotate: '0deg' } as React.CSSProperties} />
      </svg>
      <div className="gen-label" style={{ left: geometry.labelX, top: geometry.labelY }}>
        <GeminiSpark state="thinking" size={22} />
        <span>{words}</span>
      </div>
    </div>
  );
}
