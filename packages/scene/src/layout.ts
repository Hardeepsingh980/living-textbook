// Deterministic layout: keeps the overlays a reader has to read (labels, readouts, plots, speech bubbles) off the
// printed ink. The model proposes positions; this pass measures what is actually printed under them (an ink map of
// the page photo) and nudges them to the nearest clean spot, moving stacked readouts together as one block.
import { compile } from './expr.js';
import { SceneRuntime } from './runtime.js';
import type { Scene, Element, BoxT } from './schema.js';

/** Fraction of dark pixels per cell of a coarse grid over the page (row-major), in page units. */
export type InkMap = { cols: number; rows: number; w: number; h: number; ink: number[] };
export type LayoutIssue = { level: 'warn' | 'error'; where: string; message: string };

/** Build an ink map from an 8-bit greyscale page image (w×h pixels, page units = pixels). */
export function inkMapFromGrey(grey: Uint8Array, w: number, h: number, cols = 64): InkMap {
  const cell = w / cols, rows = Math.max(1, Math.round(h / cell));
  // paper brightness: a high percentile of the pixels (photographed pages are rarely pure white)
  const hist = new Uint32Array(256);
  for (let i = 0; i < grey.length; i += 5) { const v = grey[i]!; hist[v] = (hist[v] ?? 0) + 1; }
  let total = 0; for (let v = 0; v < 256; v++) total += hist[v]!;
  let acc = 0, paper = 255;
  for (let v = 0; v < 256; v++) { acc += hist[v]!; if (acc >= total * 0.85) { paper = v; break; } }
  const thr = paper * 0.74;
  const dark = new Float64Array(cols * rows), count = new Float64Array(cols * rows);
  for (let y = 0; y < h; y++) {
    const r = Math.min(rows - 1, Math.floor(y / cell)), row = y * w;
    for (let x = 0; x < w; x++) { const k = r * cols + Math.min(cols - 1, Math.floor(x / cell)); count[k]!++; if (grey[row + x]! < thr) dark[k]!++; }
  }
  const ink = new Array<number>(cols * rows);
  for (let k = 0; k < ink.length; k++) ink[k] = count[k] ? Math.round((dark[k]! / count[k]!) * 1000) / 1000 : 0;
  return { cols, rows, w, h, ink };
}

/** Mean ink under a page-unit box, from a summed-area table (cell resolution). */
export class InkField {
  readonly cell: number;
  private sat: Float64Array;
  constructor(readonly map: InkMap) {
    const { cols, rows, ink } = map;
    this.cell = map.w / cols;
    this.sat = new Float64Array((cols + 1) * (rows + 1));
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      this.sat[(r + 1) * (cols + 1) + (c + 1)] = ink[r * cols + c]! + this.sat[r * (cols + 1) + (c + 1)]! + this.sat[(r + 1) * (cols + 1) + c]! - this.sat[r * (cols + 1) + c]!;
    }
  }
  /** The densest cell under the box: one line of small print is enough to make a spot unreadable. */
  max(box: BoxT): number {
    const { cols, rows, ink } = this.map;
    const c0 = Math.max(0, Math.min(cols - 1, Math.floor(box[0] / this.cell))), c1 = Math.max(c0, Math.min(cols - 1, Math.ceil(box[2] / this.cell) - 1));
    const r0 = Math.max(0, Math.min(rows - 1, Math.floor(box[1] / this.cell))), r1 = Math.max(r0, Math.min(rows - 1, Math.ceil(box[3] / this.cell) - 1));
    let m = 0;
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) { const v = ink[r * cols + c]!; if (v > m) m = v; }
    return m;
  }
  mean(box: BoxT): number {
    const { cols, rows } = this.map, s = (cols + 1);
    const c0 = Math.max(0, Math.min(cols - 1, Math.floor(box[0] / this.cell))), c1 = Math.max(c0, Math.min(cols - 1, Math.ceil(box[2] / this.cell) - 1));
    const r0 = Math.max(0, Math.min(rows - 1, Math.floor(box[1] / this.cell))), r1 = Math.max(r0, Math.min(rows - 1, Math.ceil(box[3] / this.cell) - 1));
    const sum = this.sat[(r1 + 1) * s + (c1 + 1)]! - this.sat[r0 * s + (c1 + 1)]! - this.sat[(r1 + 1) * s + c0]! + this.sat[r0 * s + c0]!;
    return sum / ((c1 - c0 + 1) * (r1 - r0 + 1));
  }
}

/** Page rectangles with (almost) no ink: full-width bands, and the columns beside the main figure. For the prompt. */
export function freeRegionsFromInk(ink: InkMap, mainFigure?: BoxT): BoxT[] {
  const field = new InkField(ink), cell = field.cell, out: BoxT[] = [];
  let bandStart: number | null = null;
  const flush = (yEnd: number) => { if (bandStart !== null && yEnd - bandStart >= 60) out.push([0, bandStart, ink.w, yEnd]); bandStart = null; };
  for (let r = 0; r < ink.rows; r++) {
    const y0 = r * cell, y1 = Math.min(ink.h, (r + 1) * cell);
    const free = field.mean([0, y0, ink.w, y1]) < 0.012;
    if (free && bandStart === null) bandStart = y0; else if (!free) flush(y0);
  }
  flush(ink.h);
  if (mainFigure) {
    const [fx0, fy0, fx1, fy1] = mainFigure;
    if (fx0 >= 90 && field.mean([0, fy0, fx0, fy1]) < 0.012) out.push([0, fy0, fx0, fy1]);
    if (ink.w - fx1 >= 90 && field.mean([fx1, fy0, ink.w, fy1]) < 0.012) out.push([fx1, fy0, ink.w, fy1]);
  }
  return out.map((b) => b.map(Math.round) as BoxT);
}

type Item = { ids: string[]; els: Element[]; box: BoxT; kind: 'plot' | 'label' | 'bubble' };

const CHAR_W = 0.56; // average glyph advance as a fraction of the font size (sans, Latin and Devanagari alike)

function labelBox(el: Extract<Element, { type: 'label' }>, x: number, y: number, pageW: number): BoxT {
  const text = el.text.replace(/\{[^}]*\}/g, '00.0');
  const maxW = el.maxW ?? pageW * 0.6;
  let width = 0, lines = 0;
  for (const ln of text.split('\n')) { const wdt = Math.max(1, ln.length) * el.size * CHAR_W; if (wdt <= maxW) { width = Math.max(width, wdt); lines++; } else { lines += Math.ceil(wdt / maxW); width = maxW; } }
  const height = lines * el.size * 1.25;
  const pad = el.bg ? el.size * 0.45 : el.size * 0.15;
  const left = el.align === 'left' ? x : el.align === 'right' ? x - width : x - width / 2;
  return [left - pad, y - height / 2 - pad * 0.6, left + width + pad, y + height / 2 + pad * 0.6];
}
function bubbleBox(el: Extract<Element, { type: 'bubble' }>, x: number, y: number, pageW: number): BoxT {
  const maxW = Math.min(pageW * 0.5, 420);
  const wdt = Math.max(1, el.text.length) * el.size * CHAR_W;
  const width = Math.min(wdt, maxW), lines = Math.ceil(wdt / maxW), pad = el.size * 0.6;
  const w = width + pad * 2, h = lines * el.size * 1.25 + pad * 1.4;
  return [x - w / 2, y - h / 2, x + w / 2, y + h / 2];
}

const union = (a: BoxT, b: BoxT): BoxT => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
const intersects = (a: BoxT, b: BoxT, pad = 0) => a[0] < b[2] + pad && b[0] < a[2] + pad && a[1] < b[3] + pad && b[1] < a[3] + pad;
const area = (b: BoxT) => Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1]);
function overlapFraction(box: BoxT, others: BoxT[]): number {
  const a = area(box); if (!a) return 0;
  let covered = 0;
  for (const o of others) covered += area([Math.max(box[0], o[0]), Math.max(box[1], o[1]), Math.min(box[2], o[2]), Math.min(box[3], o[3])]);
  return Math.min(1, covered / a);
}

export type LayoutReport = { moved: string[]; dropped: string[]; inkBefore: number; worstBefore: number; inkAfter: number; worstAfter: number };

/**
 * Move labels, readouts, plots and bubbles off printed ink. Mutates the scene (x/y offsets, keeping anchors) and
 * returns what changed. Elements whose position is an expression over scene values are left alone (they move).
 */
export function layoutScene(scene: Scene, ink: InkMap, issues: LayoutIssue[] = []): LayoutReport {
  const field = new InkField(ink);
  const report: LayoutReport = { moved: [], dropped: [], inkBefore: 0, worstBefore: 0, inkAfter: 0, worstAfter: 0 };
  const rt = new SceneRuntime(scene);
  const scope = rt.values();
  const STATIC_REFS = new Set(['W', 'H', 'pi', 'e', 'true', 'false']);
  const resolve = (v: number | string | undefined): number | null => {
    if (v === undefined) return null;
    if (typeof v === 'number') return v;
    if (/^\s*-?\d+(\.\d+)?\s*$/.test(v)) return Number(v);
    try { const c = compile(v); if (c.refs.some((r) => !STATIC_REFS.has(r))) return null; const n = c(scope); return Number.isFinite(n) ? n : null; } catch { return null; }
  };
  const origin = (el: Element): [number, number] => { const a = el.anchor ? scene.anchors[el.anchor] : undefined; return a ? [a[0], a[1]] : [0, 0]; };

  // what is already there: sprites (pictures the reader should see) count as occupied
  const occupied: BoxT[] = [];
  for (const el of scene.elements) {
    if (el.type !== 'sprite' && !(el.type === 'shape' && !el.anchor && el.fill && (el.shape === 'rect' || el.shape === 'ellipse'))) continue;
    const x = resolve(el.x), y = resolve(el.y), w = resolve(el.w), h = resolve(el.h);
    if (x === null || y === null || w === null || h === null) continue;
    const [ox, oy] = origin(el);
    occupied.push([ox + x, oy + y, ox + x + w, oy + y + h]);
  }

  // candidates: plots, labels (grouped when stacked), bubbles
  const items: Item[] = [];
  const labels: { el: Extract<Element, { type: 'label' }>; box: BoxT }[] = [];
  for (const el of scene.elements) {
    if (el.type !== 'label' && el.type !== 'plot' && el.type !== 'bubble') continue;
    const x = resolve(el.x), y = resolve(el.y);
    if (x === null || y === null) continue;
    const [ox, oy] = origin(el);
    if (el.type === 'plot') { const w = resolve(el.w) ?? 300, h = resolve(el.h) ?? 220; items.push({ ids: [el.id], els: [el], box: [ox + x - 6, oy + y - 30, ox + x + w + 6, oy + y + h + 30], kind: 'plot' }); }
    else if (el.type === 'bubble') items.push({ ids: [el.id], els: [el], box: bubbleBox(el, ox + x, oy + y, scene.page.w), kind: 'bubble' });
    else labels.push({ el, box: labelBox(el, ox + x, oy + y, scene.page.w) });
  }
  // stacked readouts move as one block: union-find on labels whose boxes touch
  const parent = labels.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  for (let i = 0; i < labels.length; i++) for (let j = i + 1; j < labels.length; j++) if (intersects(labels[i]!.box, labels[j]!.box, labels[i]!.el.size * 0.6)) parent[find(i)] = find(j);
  const groups = new Map<number, number[]>();
  labels.forEach((_, i) => { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r)!.push(i); });
  for (const members of groups.values()) items.push({ ids: members.map((i) => labels[i]!.el.id), els: members.map((i) => labels[i]!.el), box: members.map((i) => labels[i]!.box).reduce(union), kind: 'label' });
  items.sort((a, b) => (a.kind === b.kind ? area(b.box) - area(a.box) : a.kind === 'plot' ? -1 : b.kind === 'plot' ? 1 : a.kind === 'label' ? -1 : 1));

  const W = scene.page.w, H = scene.page.h, step = field.cell, margin = 6;
  const inside = (b: BoxT) => b[0] >= margin && b[1] >= margin && b[2] <= W - margin && b[3] <= H - margin;
  const inks: number[] = [];
  let before = 0;
  for (const it of items) {
    const b0 = it.box, bw = b0[2] - b0[0], bh = b0[3] - b0[1];
    const cx0 = (b0[0] + b0[2]) / 2, cy0 = (b0[1] + b0[3]) / 2;
    const at = (cx: number, cy: number): BoxT => [cx - bw / 2, cy - bh / 2, cx + bw / 2, cy + bh / 2];
    const figures = Object.values(scene.anchors) as BoxT[];
    const cost = (b: BoxT) => { const i = field.mean(b), mx = field.max(b), o = overlapFraction(b, occupied), f = it.kind === 'plot' ? overlapFraction(b, figures) : 0; return { i, mx, o, c: i * 3 + mx * 0.8 + o * 2.5 + f * 1.5 + (Math.hypot((b[0] + b[2]) / 2 - cx0, (b[1] + b[3]) / 2 - cy0) / W) * 1.2 }; };
    const here = cost(b0);
    before += here.i; report.worstBefore = Math.max(report.worstBefore, here.i);
    const tooDirty = it.kind === 'bubble' ? 0.05 : 0.035;
    const denseCell = it.kind === 'bubble' ? 0.3 : 0.22;
    if (inside(b0) && here.i < tooDirty && here.mx < denseCell && here.o < 0.03 && !(it.kind === 'plot' && overlapFraction(b0, figures) > 0.3)) { occupied.push(b0); inks.push(here.i); continue; }
    // search the neighbourhood on the ink grid, nearest clean spot wins; bubbles stay near their speaker
    const radius = it.kind === 'bubble' ? Math.min(320, W * 0.35) : Math.min(520, W * 0.6);
    let best: { b: BoxT; c: number; i: number; mx: number; o: number } | null = null;
    const consider = (b: BoxT) => { if (!inside(b)) return; const r = cost(b); if (r.i >= (it.kind === 'bubble' ? 0.1 : 0.06) || r.mx >= denseCell || r.o >= 0.05) return; if (!best || r.c < best.c) best = { b, ...r }; };
    for (let dy = -radius; dy <= radius; dy += step) for (let dx = -radius; dx <= radius; dx += step) consider(at(cx0 + dx, cy0 + dy));
    if (!best && it.kind !== 'bubble') { // anywhere on the page, then
      for (let cy = bh / 2 + margin; cy <= H - bh / 2 - margin; cy += step) for (let cx = bw / 2 + margin; cx <= W - bw / 2 - margin; cx += step) consider(at(cx, cy));
    }
    const chosen = best as { b: BoxT; c: number; i: number; mx: number; o: number } | null;
    if (!chosen) {
      if (it.kind === 'plot' && here.i >= 0.12) { scene.elements = scene.elements.filter((e) => e.id !== it.ids[0]); report.dropped.push(it.ids[0]!); issues.push({ level: 'warn', where: `elements.${it.ids[0]}`, message: 'plot dropped: no clean space for it on this page' }); continue; }
      occupied.push(b0); inks.push(here.i);
      issues.push({ level: 'warn', where: `elements.${it.ids.join(',')}`, message: `kept over printed ink (${Math.round(here.i * 100)}%): no clean spot found` });
      continue;
    }
    const dx = Math.round((chosen.b[0] + chosen.b[2]) / 2 - cx0), dy = Math.round((chosen.b[1] + chosen.b[3]) / 2 - cy0);
    for (const el of it.els) { (el as any).x = (resolve(el.x) ?? 0) + dx; (el as any).y = (resolve(el.y) ?? 0) + dy; if (el.type === 'bubble' && el.tail && resolve(el.tail[0]) !== null && resolve(el.tail[1]) !== null) { /* the tail keeps pointing at the speaker */ } }
    occupied.push(chosen.b); inks.push(chosen.i);
    report.moved.push(...it.ids);
    issues.push({ level: 'warn', where: `elements.${it.ids.join(',')}`, message: `moved off printed ink by (${dx}, ${dy})` });
  }
  report.inkBefore = items.length ? before / items.length : 0;
  report.inkAfter = inks.length ? inks.reduce((a, b) => a + b, 0) / inks.length : 0;
  report.worstAfter = inks.length ? Math.max(...inks) : 0;
  return report;
}

/** Measure without moving: mean and worst ink under the readable overlays at their initial positions. */
export function placementReport(scene: Scene, ink: InkMap): { mean: number; worst: number; n: number } {
  const copy = JSON.parse(JSON.stringify(scene)) as Scene;
  const r = layoutScene(copy, ink, []);
  return { mean: r.inkBefore, worst: r.worstBefore, n: r.moved.length + r.dropped.length };
}

/** How much of the scene actually moves: elements whose position or shape changes over time. */
export function motionReport(scene: Scene): { moving: string[]; total: number } {
  const moving: string[] = [];
  const dynamic = (v: unknown) => typeof v === 'string' && !/^\s*-?\d+(\.\d+)?\s*$/.test(v) && (() => { try { return compile(v).refs.some((r) => !['W', 'H', 'pi', 'e', 'true', 'false'].includes(r)); } catch { return false; } })();
  for (const el of scene.elements) {
    const props = ['x', 'y', 'rot', 'scale', 'w', 'h'] as const;
    const byExpr = props.some((p) => dynamic((el as any)[p])) || ('points' in el && Array.isArray(el.points) && el.points.some((pt: any) => dynamic(pt[0]) || dynamic(pt[1])));
    const byAnim = el.anim.some((a) => ['x', 'y', 'rot', 'scale', 'w', 'h'].includes(a.prop as string));
    const byNature = el.type === 'particles' || (el.type === 'path' && el.draw) || (el.type === 'plot' && el.marker !== undefined);
    if (byExpr || byAnim || byNature) moving.push(el.id);
  }
  return { moving, total: scene.elements.length };
}
