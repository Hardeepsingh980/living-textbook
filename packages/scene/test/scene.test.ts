import { describe, it, expect } from 'vitest';
import { normalizeScene, fallbackScene, SceneRuntime, animValue } from '../src/index.js';

const freeFall = {
  v: 1, kind: 'simulation', page: { w: 1000, h: 1414 }, lang: 'en', title: 'Free fall',
  vars: [
    { id: 't', label: 'time', min: 0, max: 3, init: 0, unit: 's', role: 'time' },
    { id: 'g', label: 'gravity', min: 1, max: 20, init: 9.8, unit: 'm/s²' },
    { id: 'h0', label: 'height', min: 1, max: 50, init: 20, unit: 'm' },
  ],
  derived: [
    { id: 'h', expr: '0.5 * g * t^2', unit: 'm', label: 'distance fallen' },
    { id: 'v', expr: 'g * t', unit: 'm/s' },
    { id: 'tland', expr: 'sqrt(2 * h0 / g)', unit: 's' },
    { id: 'bad', expr: 'nope * 2' },
    { id: 'cyc1', expr: 'cyc2 + 1' }, { id: 'cyc2', expr: 'cyc1 + 1' },
  ],
  anchors: { fig1: [100, 400, 500, 900] },
  assets: [{ id: 'ball', type: 'crop', box: [120, 400, 180, 460] }], // a cut-out starts on its printed box: anchor (100,400) + (20,0)
  elements: [
    { id: 'ball', type: 'sprite', asset: 'ball', anchor: 'fig1', x: 20, y: 'min(h, h0) * 10', w: 60, h: 60 },
    { id: 'lbl', type: 'label', text: 'h = {h:0.1} m', x: 500, y: 300, size: 30 },
    { id: 'ghost', type: 'sprite', asset: 'missing', x: 0, y: 0 },
    { id: 'broken', type: 'label', text: 'x', x: 'sin(', y: 0 },
    { id: 'plot', type: 'plot', fn: '0.5 * g * x^2', xdomain: [0, 3], marker: 't', x: 550, y: 900, w: 400, h: 300 },
    { id: 'arrow', type: 'shape', shape: 'arrow', points: [[0, 0], [0, 'h * 10']], anchor: 'fig1', stroke: '#e63946' },
    { id: 'noarrow', type: 'shape', shape: 'line' },
    42,
  ],
  steps: [
    { id: 's1', title: 'Release', narration: 'The ball is released from rest.', set: { t: 0 }, highlight: ['fig1', 'nothing'] },
    { id: 's2', title: 'Falling', narration: 'It speeds up as it falls.', play: true, show: ['lbl'], hide: ['ghost'] },
  ],
  interactions: [{ type: 'slider', var: 'g' }, { type: 'tap', el: 'ball', action: { say: 'l1' } }, { type: 'tap', el: 'zzz', action: {} }],
  audio: { lines: [{ id: 'l1', speaker: 'ball', text: 'Wheee!', el: 'ball' }], sfx: [{ on: 'step:s2', name: 'whoosh' }] },
};

describe('normalizeScene', () => {
  it('repairs a messy model output into a renderable scene and reports the issues', () => {
    const { scene, issues } = normalizeScene(freeFall);
    expect(scene).not.toBeNull();
    const ids = scene!.elements.map((e) => e.id);
    expect(ids).toEqual(['ball', 'lbl', 'broken', 'plot', 'arrow']);
    expect(scene!.elements.find((e) => e.id === 'broken')!.x).toBe(0);
    expect(scene!.derived.map((d) => d.id)).toEqual(['h', 'v', 'tland']);
    expect(scene!.steps[0]!.highlight).toEqual(['fig1']);
    expect(scene!.interactions.map((i) => i.type)).toEqual(['slider', 'tap']);
    const messages = issues.map((i) => i.where + ': ' + i.message).join('\n');
    expect(messages).toMatch(/unknown asset missing/);
    expect(messages).toMatch(/circular/);
    expect(messages).toMatch(/unknown name\(s\) nope/);
    expect(messages).toMatch(/invalid expression "sin\("/);
    expect(messages).toMatch(/elements\[7\]/);
  });
  it('accepts JSON text and rejects garbage', () => {
    expect(normalizeScene(JSON.stringify(freeFall)).scene).not.toBeNull();
    expect(normalizeScene('not json').scene).toBeNull();
    expect(normalizeScene({ v: 1, kind: 'story', page: { w: 1000, h: 1000 }, elements: [] }).scene).toBeNull();
  });
  it('adds a time variable and sliders to simulations that forgot them', () => {
    const { scene } = normalizeScene({ v: 1, kind: 'simulation', page: { w: 1000, h: 1000 }, vars: [{ id: 'k', min: 0, max: 5, init: 1 }], elements: [{ id: 'a', type: 'label', text: 'k={k}', x: 0, y: 0 }] });
    expect(scene!.vars.some((v) => v.role === 'time')).toBe(true);
    expect(scene!.interactions).toEqual([{ type: 'slider', var: 'k', label: undefined }]);
  });
  it('builds a fallback scene from figure boxes', () => {
    const s = fallbackScene({ page: { w: 1000, h: 1414 }, title: 'Motion under gravity', figures: [[100, 400, 500, 900], [600, 100, 900, 300]] });
    expect(s.elements.map((e) => e.type)).toEqual(['shape', 'sprite', 'shape', 'sprite', 'label']);
    expect(normalizeScene(s).issues).toEqual([]);
  });
});

describe('SceneRuntime', () => {
  it('computes derived values, animations, steps and verifier evaluation', () => {
    const { scene } = normalizeScene(freeFall);
    const rt = new SceneRuntime(scene!);
    expect(rt.stepIndex).toBe(0);
    expect(rt.values().tland).toBeCloseTo(2.02, 2);
    rt.setVar('g', 10);
    expect(rt.evaluateWith({ t: 2 }).h).toBeCloseTo(20);
    expect(rt.getVar('t')).toBe(0);
    const events: string[] = [];
    rt.on((e) => events.push(e.type + (e.type === 'say' ? ':' + e.lineId : e.type === 'sfx' ? ':' + e.name : '')));
    rt.nextStep();
    expect(rt.playing).toBe(true);
    rt.tick(1);
    expect(rt.getVar('t')).toBe(1);
    const frame = rt.frame();
    const ball = frame.find((f) => f.el.id === 'ball')!;
    expect(ball.x).toBe(120);              // anchored: 100 + 20
    expect(ball.y).toBeCloseTo(400 + 5 * 10); // 0.5*10*1^2 = 5 → *10 + anchor y
    const arrow = frame.find((f) => f.el.id === 'arrow')!;
    expect(arrow.points).toEqual([[100, 400], [100, 450]]);
    expect(frame.find((f) => f.el.id === 'plot')!.marker).toBe(1);
    rt.tick(5);
    expect(rt.getVar('t')).toBe(3);        // clamped to max and stopped
    expect(rt.playing).toBe(false);
    rt.tap('ball');
    expect(events).toContain('say:l1');
    expect(events).toContain('sfx:whoosh');
    expect(events).toContain('step');
  });
  it('evaluates animation curves', () => {
    const a = { prop: 'y', from: 0, to: 10, dur: 2, delay: 1, loop: false, ease: 'linear', relative: false } as const;
    expect(animValue(a, 0.5)).toBeUndefined();
    expect(animValue(a, 2)).toBe(5);
    expect(animValue(a, 10)).toBe(10);
    const pp = { ...a, loop: 'pingpong' as const };
    expect(animValue(pp, 1 + 3)).toBe(5);  // back down
    const keys = { ...a, keys: [{ t: 0, v: 0 }, { t: 0.5, v: 10 }, { t: 1, v: 0 }] };
    expect(animValue(keys, 2)).toBe(10);
  });
});
