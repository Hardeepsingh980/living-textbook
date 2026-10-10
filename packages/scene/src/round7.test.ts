import { describe, it, expect } from 'vitest';
import { SceneRuntime } from './runtime.js';
import { normalizeScene } from './normalize.js';
import { SceneSchema } from './schema.js';

const base = { v: 1, page: { w: 1000, h: 1400 }, lang: 'en', anchors: { fig1: [100, 600, 900, 1000] } };

describe('anchored animation', () => {
  it('keeps the figure offset for absolute animation values', () => {
    const scene = SceneSchema.parse({ ...base, kind: 'story', assets: [{ id: 'a', type: 'builtin', name: 'tree' }], elements: [
      { id: 's', type: 'sprite', asset: 'a', anchor: 'fig1', x: 200, y: 300, w: 50, h: 50, anim: [{ prop: 'y', from: 300, to: 310, dur: 2, loop: 'pingpong' }] },
    ] });
    const rt = new SceneRuntime(scene);
    rt.clock = 0.5;
    const r = rt.frame()[0]!;
    expect(r.x).toBe(300);
    expect(r.y).toBeGreaterThanOrEqual(900);
    expect(r.y).toBeLessThanOrEqual(910);
  });
});

describe('normalize round 7', () => {
  it('maps subject-like kinds to scene kinds', () => {
    expect(normalizeScene({ ...base, kind: 'science', elements: [{ id: 'l', type: 'label', text: 'hi', x: 1, y: 1 }] }).scene?.kind).toBe('simulation');
    expect(normalizeScene({ ...base, kind: 'fable', elements: [{ id: 'l', type: 'label', text: 'hi', x: 1, y: 1 }] }).scene?.kind).toBe('story');
    expect(normalizeScene({ ...base, kind: 'whatever', elements: [{ id: 'l', type: 'label', text: 'hi', x: 1, y: 1 }] }).scene?.kind).toBe('explainer');
  });
  it('sends electrons along the drawn wire', () => {
    const n = normalizeScene({ ...base, kind: 'simulation', elements: [
      { id: 'wire', type: 'path', anchor: 'fig1', points: [[10, 10], [200, 10], [200, 100]] },
      { id: 'e', type: 'particles', preset: 'electrons' },
    ] });
    const e = n.scene!.elements.find((x) => x.id === 'e') as any;
    expect(e.path[0]).toEqual([110, 610]);
    expect(e.path[e.path.length - 1]).toEqual([110, 610]);
  });
  it('replaces a generated character by the printed drawing and keeps its motion as offsets', () => {
    const n = normalizeScene({ ...base, kind: 'picture', assets: [{ id: 'bobo', type: 'gen', prompt: 'a red boat', character: 'Bobo' }], elements: [
      { id: 'b', type: 'sprite', asset: 'bobo', anchor: 'fig1', x: 50, y: 20, w: 250, h: 150, anim: [{ prop: 'y', from: 20, to: 34, dur: 2, loop: 'pingpong' }] },
    ] }, { characterCrops: { Bobo: [400, 700, 700, 900] } });
    const a = n.scene!.assets[0] as any, s = n.scene!.elements[0] as any;
    expect(a.type).toBe('crop'); expect(a.box).toEqual([400, 700, 700, 900]);
    expect([s.x, s.y, s.w, s.h]).toEqual([300, 100, 300, 200]);
    expect(s.anim[0].relative).toBe(true); expect(s.anim[0].from).toBe(0); expect(s.anim[0].to).toBe(14);
  });
  it('treats "none" as no colour and validates squares', () => {
    const n = normalizeScene({ ...base, kind: 'explainer', elements: [
      { id: 'sq', type: 'shape', shape: 'square', points: [[0, 0], [100, 0]], away: [50, 50], fill: 'none', stroke: '#e63946' },
      { id: 'bad', type: 'shape', shape: 'square', points: [[0, 0]] },
    ] });
    expect(n.scene!.elements.map((e) => e.id)).toEqual(['sq']);
    expect((n.scene!.elements[0] as any).fill).toBeUndefined();
  });
});
