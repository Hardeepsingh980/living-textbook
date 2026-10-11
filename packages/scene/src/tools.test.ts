import { describe, it, expect } from 'vitest';
import { SceneRuntime } from './runtime.js';
import { SceneSchema } from './schema.js';
import { executeTool, sceneState, TOOL_DECLARATIONS } from './tools.js';

const scene = SceneSchema.parse({
  v: 1, kind: 'simulation', page: { w: 1000, h: 1400 }, lang: 'en', title: 'Free fall',
  vars: [{ id: 't', label: 'time', min: 0, max: 3, init: 0, role: 'time', unit: 's' }, { id: 'g', label: 'gravity', min: 1, max: 20, init: 9.8, role: 'param', unit: 'm/s²' }, { id: 'h0', label: 'tower height', min: 5, max: 50, init: 20, role: 'param', unit: 'm' }],
  derived: [{ id: 'tland', expr: 'sqrt(2*h0/g)', unit: 's', label: 'fall time' }],
  anchors: { fig1: [100, 600, 900, 1000] },
  elements: [{ id: 'ball', type: 'shape', shape: 'circle', x: 10, y: 10, w: 30, h: 30 }, { id: 'lbl', type: 'label', text: 't = {t:0.1} s', x: 500, y: 100 }],
  steps: [{ id: 's1', title: 'Drop', narration: 'The stone is released.' }, { id: 's2', title: 'Landing', narration: 'It lands.' }],
});

describe('tutor tools', () => {
  it('declares every tool it can execute', () => {
    const rt = new SceneRuntime(scene);
    for (const d of TOOL_DECLARATIONS) expect(executeTool(rt, d.name, d.name === 'set_parameter' ? { parameter: 'g', value: 9.8 } : d.name === 'highlight_object' ? { target: 'ball' } : d.name === 'navigate_to_step' ? { step: '1' } : {}).ok).toBe(true);
  });
  it('changes a parameter within its range and reports derived values', () => {
    const rt = new SceneRuntime(scene);
    const r = executeTool(rt, 'set_parameter', { parameter: 'gravity', value: 40 });
    expect(r.ok).toBe(true); expect(r.value).toBe(20); expect(r.clamped).toBe(true);
    expect((r.derived as any[]).find((d) => d.id === 'tland').value).toBeCloseTo(Math.sqrt(2), 2);
    expect(rt.getVar('g')).toBe(20);
  });
  it('refuses what the scene does not support, naming what it does', () => {
    const rt = new SceneRuntime(scene);
    const r = executeTool(rt, 'set_parameter', { parameter: 'air resistance', value: 1 });
    expect(r.ok).toBe(false); expect((r.available as any[]).map((a) => a.id)).toEqual(['g', 'h0']);
    expect(executeTool(rt, 'highlight_object', { target: 'rocket' }).ok).toBe(false);
    expect(executeTool(rt, 'navigate_to_step', { step: '9' }).ok).toBe(false);
  });
  it('highlights, navigates and reports state', () => {
    const rt = new SceneRuntime(scene);
    expect(executeTool(rt, 'highlight_object', { target: 'figure fig1' })).toMatchObject({ ok: true, target: 'fig1' });
    expect(executeTool(rt, 'navigate_to_step', { step: 'Landing' })).toMatchObject({ ok: true, step: { number: 2 } });
    executeTool(rt, 'highlight_object', { target: 'lbl' });
    const st = sceneState(rt);
    expect(st.step?.number).toBe(2); expect(st.highlighted).toEqual(['lbl']); expect(st.parameters.map((p) => p.id)).toEqual(['g', 'h0']);
    expect(executeTool(rt, 'run_simulation', {})).toMatchObject({ ok: true, playing: true });
    expect(executeTool(rt, 'reset_simulation', {})).toMatchObject({ ok: true, playing: false });
    expect(rt.getVar('g')).toBe(9.8);
  });
});
