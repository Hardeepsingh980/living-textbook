import { describe, it, expect } from 'vitest';
import { inkMapFromGrey, layoutScene, freeRegionsFromInk, motionReport, InkField } from './layout.js';
import { SceneSchema } from './schema.js';

// a 1000×1400 page: paper everywhere, dense text in y 100..500, a figure (box drawn) in 600..1000
function syntheticPage() {
  const w = 1000, h = 1400, g = new Uint8Array(w * h).fill(240);
  for (let y = 100; y < 500; y++) for (let x = 60; x < 940; x++) if ((y % 28) < 14 && ((x * 7 + y) % 3) !== 0) g[y * w + x] = 20; // text lines
  for (let y = 600; y < 1000; y++) for (let x = 200; x < 800; x++) if (y < 604 || y > 995 || x < 204 || x > 795) g[y * w + x] = 30; // figure frame
  return { grey: g, w, h };
}
const scene = (elements: any[]) => SceneSchema.parse({ v: 1, kind: 'explainer', page: { w: 1000, h: 1400 }, lang: 'en', anchors: { fig1: [200, 600, 800, 1000] }, elements });

describe('ink map', () => {
  it('sees text as ink and paper as free', () => {
    const { grey, w, h } = syntheticPage();
    const ink = inkMapFromGrey(grey, w, h);
    const f = new InkField(ink);
    expect(f.mean([100, 150, 900, 450])).toBeGreaterThan(0.25);
    expect(f.mean([100, 1050, 900, 1350])).toBeLessThan(0.01);
    const free = freeRegionsFromInk(ink, [200, 600, 800, 1000]);
    expect(free.some((b) => b[1] >= 1000 && b[3] - b[1] >= 300)).toBe(true); // the bottom band
  });
});

describe('layout', () => {
  const { grey, w, h } = syntheticPage();
  const ink = inkMapFromGrey(grey, w, h);
  it('moves a readout off body text and keeps one on clean paper', () => {
    const sc = scene([
      { id: 'onText', type: 'label', text: 'V = {v:0.1} V', x: 500, y: 300, size: 28, bg: '#ffd166' },
      { id: 'clean', type: 'label', text: 'answer', x: 500, y: 1200, size: 28, bg: '#ffd166' },
    ]);
    const issues: any[] = [];
    const r = layoutScene(sc, ink, issues);
    expect(r.moved).toEqual(['onText']);
    const moved = sc.elements.find((e) => e.id === 'onText')!;
    expect(Number(moved.y) < 100 || Number(moved.y) > 500).toBe(true);
    expect(sc.elements.find((e) => e.id === 'clean')!.y).toBe(1200);
    expect(r.worstAfter).toBeLessThan(0.06);
  });
  it('moves stacked readouts together and keeps anchors', () => {
    const sc = scene([
      { id: 'a', type: 'label', text: 't = {t:0.1} s', x: 300, y: -300, size: 26, bg: '#fff', anchor: 'fig1' },
      { id: 'b', type: 'label', text: 'v = {v:0.1} m/s', x: 300, y: -265, size: 26, bg: '#fff', anchor: 'fig1' },
    ]);
    layoutScene(sc, ink, []);
    const a = sc.elements[0]!, b = sc.elements[1]!;
    expect(a.anchor).toBe('fig1');
    expect(Number(b.y) - Number(a.y)).toBeGreaterThanOrEqual(35); // the lower one slides down so the notes do not overlap
    expect(Number(b.y) - Number(a.y)).toBeLessThan(90);
    expect(Number(a.x)).toBe(Number(b.x));
  });
  it('drops a plot that has no clean space', () => {
    const { grey: g2 } = syntheticPage();
    for (let i = 0; i < g2.length; i++) if (i % 3) g2[i] = 10; // ink everywhere
    const sc = scene([{ id: 'pl', type: 'plot', fn: 'x', xdomain: [0, 1], x: 100, y: 100, w: 300, h: 200 }, { id: 'keep', type: 'shape', shape: 'rect', x: 0, y: 0, w: 10, h: 10 }]);
    const r = layoutScene(sc, inkMapFromGrey(g2, w, h), []);
    expect(r.dropped).toEqual(['pl']);
    expect(sc.elements.map((e) => e.id)).toEqual(['keep']);
  });
  it('leaves moving labels alone', () => {
    const sc = scene([{ id: 'follow', type: 'label', text: 'h', x: 500, y: '300 + t * 10', size: 28 }]);
    const r = layoutScene(sc, ink, []);
    expect(r.moved).toEqual([]);
  });
  it('counts motion', () => {
    const sc = scene([
      { id: 's', type: 'shape', shape: 'circle', x: 'sin(t)*10', y: 0, w: 10, h: 10 },
      { id: 'l', type: 'label', text: 'static', x: 0, y: 0 },
      { id: 'p', type: 'particles', preset: 'sparkle' },
    ]);
    expect(motionReport(sc).moving).toEqual(['s', 'p']);
  });
});

describe('layout: a stack with no shared home', () => {
  // text everywhere except two blank pockets, each tall enough for one readout but not for two stacked ones
  const w = 1000, h = 1400, g = new Uint8Array(w * h).fill(240);
  const pocket = (x: number, y: number) => (x >= 600 && x < 900 && y >= 620 && y < 710) || (x >= 100 && x < 400 && y >= 900 && y < 990);
  for (let y = 20; y < 1380; y++) for (let x = 60; x < 940; x++) if (!pocket(x, y) && (y % 28) < 14 && ((x * 7 + y) % 3) !== 0) g[y * w + x] = 20;
  const ink = inkMapFromGrey(g, w, h);
  it('places the readouts one by one when the block fits nowhere', () => {
    const sc = scene([
      { id: 'v', type: 'label', text: 'V = {v:0.1} V', x: 500, y: 300, size: 28, bg: '#ffd166' },
      { id: 'i', type: 'label', text: 'I = {i:0.2} A', x: 500, y: 350, size: 28, bg: '#ffd166' },
    ]);
    const issues: any[] = [];
    const r = layoutScene(sc, ink, issues);
    expect(issues.some((x) => /placed one by one/.test(x.message))).toBe(true);
    expect(r.moved.sort()).toEqual(['i', 'v']);
    expect(r.worstAfter).toBeLessThan(0.02);
    const v = sc.elements.find((e) => e.id === 'v')!, i = sc.elements.find((e) => e.id === 'i')!;
    expect(Math.abs(Number(v.y) - Number(i.y))).toBeGreaterThan(100); // one pocket each
  });
});

describe('layout: stacked readouts that overlap', () => {
  const { grey, w, h } = syntheticPage();
  const ink = inkMapFromGrey(grey, w, h);
  it('slides the lower one down so both can be read', () => {
    const sc = scene([
      { id: 'd', type: 'label', text: 'Distance: {d:0.1} km', x: 500, y: 1150, size: 28, bg: '#ffd166' },
      { id: 't', type: 'label', text: 'Time: {t:0.1} h', x: 500, y: 1170, size: 28, bg: '#ffd166' },
    ]);
    const issues: any[] = [];
    layoutScene(sc, ink, issues);
    const d = sc.elements.find((e) => e.id === 'd')!, t = sc.elements.find((e) => e.id === 't')!;
    expect(Number(t.y) - Number(d.y)).toBeGreaterThan(50);
    expect(issues.some((x) => /moved down/.test(x.message))).toBe(true);
  });
});
