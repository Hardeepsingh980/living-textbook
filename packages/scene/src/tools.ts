// Scene-control tools for the live tutor. Gemini chooses an action and explains its consequence; the app executes it
// on the running scene through this typed, validated interface and reports back what actually happened. The
// declarations are sent to the model by the server; `executeTool` runs in the browser on the live runtime.
import type { SceneRuntime } from './runtime.js';
import type { Scene } from './schema.js';

export type ToolResult = Record<string, unknown> & { ok: boolean };

export const TOOL_DECLARATIONS = [
  { name: 'get_scene_state', description: 'Read what the reader sees right now: the current step, whether the simulation is running, every parameter with its live value, the derived values computed from them, the scene objects and what is highlighted. Call this before answering about values, settings or what is on screen.', parameters: { type: 'OBJECT', properties: {} } },
  { name: 'get_available_interactions', description: 'List what can be changed: adjustable parameters with their ranges and units, the steps that can be shown, the objects that can be highlighted, and whether the simulation can be run.', parameters: { type: 'OBJECT', properties: {} } },
  { name: 'set_parameter', description: 'Change an adjustable parameter of the simulation (a "what if"). The value is clamped to the allowed range. Only parameters returned by get_available_interactions exist; the result says what value was actually applied and the new derived values. Explain the change only after the result arrives.', parameters: { type: 'OBJECT', properties: { parameter: { type: 'STRING', description: 'parameter id or label' }, value: { type: 'NUMBER', description: 'new value in the parameter\'s unit' } }, required: ['parameter', 'value'] } },
  { name: 'highlight_object', description: 'Draw the reader\'s attention to one scene object or figure region by id or label; clears the previous highlight.', parameters: { type: 'OBJECT', properties: { target: { type: 'STRING', description: 'object id, label or figure id' } }, required: ['target'] } },
  { name: 'navigate_to_step', description: 'Show a step of the lesson by its number (1-based), id or title.', parameters: { type: 'OBJECT', properties: { step: { type: 'STRING', description: 'step number, id or title' } }, required: ['step'] } },
  { name: 'run_simulation', description: 'Start (or restart from the beginning) the simulation\'s motion with the current parameters.', parameters: { type: 'OBJECT', properties: {} } },
  { name: 'reset_simulation', description: 'Stop the simulation and return every parameter to the page\'s own values.', parameters: { type: 'OBJECT', properties: {} } },
] as const;

export type ToolName = (typeof TOOL_DECLARATIONS)[number]['name'];

const norm = (s: unknown) => String(s ?? '').trim().toLowerCase();
const round = (v: number) => Math.round(v * 1000) / 1000;

function elementLabel(scene: Scene, id: string): string {
  const el = scene.elements.find((e) => e.id === id);
  if (!el) return id;
  if ('text' in el && typeof el.text === 'string') return el.text.replace(/\{[^}]*\}/g, '…').slice(0, 60);
  return id;
}

/** Everything the tutor may need to know about the scene right now, compact enough to send often. */
export function sceneState(runtime: SceneRuntime) {
  const sc = runtime.scene;
  const values = runtime.values();
  const step = runtime.stepIndex >= 0 ? sc.steps[runtime.stepIndex] : undefined;
  const timeVar = sc.vars.find((v) => v.role === 'time');
  return {
    title: sc.title ?? '',
    kind: sc.kind,
    step: step ? { number: runtime.stepIndex + 1, of: sc.steps.length, id: step.id, title: step.title ?? '', narration: step.narration ?? '' } : null,
    playing: runtime.playing,
    time: timeVar ? { id: timeVar.id, value: round(values[timeVar.id] ?? 0), max: timeVar.max, unit: timeVar.unit ?? 's' } : null,
    parameters: sc.vars.filter((v) => v.role === 'param').map((v) => ({ id: v.id, label: v.label ?? v.id, value: round(values[v.id] ?? v.init), unit: v.unit ?? '', min: v.min, max: v.max, pageValue: v.init })),
    derived: sc.derived.map((d) => ({ id: d.id, label: d.label ?? d.id, value: round(values[d.id] ?? 0), unit: d.unit ?? '', formula: d.expr })),
    objects: sc.elements.filter((e) => e.type !== 'particles').slice(0, 24).map((e) => ({ id: e.id, type: e.type, label: elementLabel(sc, e.id), highlighted: runtime.isHighlighted(e.id) })),
    figures: Object.keys(sc.anchors),
    highlighted: runtime.highlightedIds(),
  };
}

export function availableInteractions(runtime: SceneRuntime) {
  const sc = runtime.scene;
  return {
    parameters: sc.vars.filter((v) => v.role === 'param').map((v) => ({ id: v.id, label: v.label ?? v.id, unit: v.unit ?? '', min: v.min, max: v.max, step: v.step ?? null, pageValue: v.init })),
    steps: sc.steps.map((s, i) => ({ number: i + 1, id: s.id, title: s.title ?? '' })),
    highlightable: [...sc.elements.filter((e) => e.type !== 'particles').map((e) => ({ id: e.id, label: elementLabel(sc, e.id) })), ...Object.keys(sc.anchors).map((id) => ({ id, label: `figure ${id}` }))],
    simulation: sc.vars.some((v) => v.role === 'time'),
  };
}

/** Execute one tool on the live runtime. Never throws: an unsupported request comes back as { ok: false, reason }. */
export function executeTool(runtime: SceneRuntime, name: string, args: Record<string, unknown> = {}): ToolResult {
  const sc = runtime.scene;
  switch (name) {
    case 'get_scene_state': return { ok: true, ...sceneState(runtime) };
    case 'get_available_interactions': return { ok: true, ...availableInteractions(runtime) };
    case 'set_parameter': {
      const want = norm(args.parameter);
      const v = sc.vars.find((x) => x.role === 'param' && (norm(x.id) === want || norm(x.label) === want)) ?? sc.vars.find((x) => x.role === 'param' && (norm(x.id).includes(want) || norm(x.label).includes(want)));
      const raw = Number(args.value);
      if (!v) return { ok: false, reason: `no adjustable parameter called "${String(args.parameter)}"`, available: sc.vars.filter((x) => x.role === 'param').map((x) => ({ id: x.id, label: x.label ?? x.id, unit: x.unit ?? '' })) };
      if (!Number.isFinite(raw)) return { ok: false, reason: 'value must be a number', parameter: v.id, unit: v.unit ?? '', min: v.min, max: v.max };
      const value = Math.min(v.max, Math.max(v.min, raw));
      runtime.setVar(v.id, value);
      const values = runtime.values();
      return { ok: true, parameter: v.id, label: v.label ?? v.id, requested: raw, value: round(value), clamped: value !== raw, unit: v.unit ?? '', derived: sc.derived.map((d) => ({ id: d.id, label: d.label ?? d.id, value: round(values[d.id] ?? 0), unit: d.unit ?? '' })) };
    }
    case 'highlight_object': {
      const want = norm(args.target);
      const el = sc.elements.find((e) => norm(e.id) === want) ?? sc.elements.find((e) => norm(elementLabel(sc, e.id)) === want) ?? sc.elements.find((e) => e.type !== 'particles' && (norm(e.id).includes(want) || norm(elementLabel(sc, e.id)).includes(want)));
      const anchor = Object.keys(sc.anchors).find((id) => norm(id) === want || norm(`figure ${id}`) === want);
      const id = el?.id ?? anchor;
      if (!id) return { ok: false, reason: `nothing called "${String(args.target)}" in this scene`, highlightable: availableInteractions(runtime).highlightable.slice(0, 20) };
      runtime.setHighlights([id]);
      return { ok: true, target: id, label: el ? elementLabel(sc, id) : `figure ${id}` };
    }
    case 'navigate_to_step': {
      const want = norm(args.step);
      let index = sc.steps.findIndex((s) => norm(s.id) === want || norm(s.title) === want);
      if (index < 0 && /^\d+$/.test(want)) index = Number(want) - 1;
      if (index < 0) index = sc.steps.findIndex((s) => norm(s.title).includes(want));
      if (index < 0 || index >= sc.steps.length) return { ok: false, reason: `no step "${String(args.step)}"`, steps: availableInteractions(runtime).steps };
      runtime.goToStep(index);
      const s = sc.steps[index]!;
      return { ok: true, step: { number: index + 1, id: s.id, title: s.title ?? '', narration: s.narration ?? '' } };
    }
    case 'run_simulation': {
      if (!sc.vars.some((v) => v.role === 'time')) return { ok: false, reason: 'this scene has no simulation to run' };
      runtime.resetTime(); runtime.setPlaying(true);
      return { ok: true, playing: true };
    }
    case 'reset_simulation': {
      for (const v of sc.vars) if (v.role === 'param') runtime.setVar(v.id, v.init);
      runtime.resetTime(); runtime.setPlaying(false);
      if (sc.steps.length) runtime.goToStep(0);
      return { ok: true, playing: false, parameters: sc.vars.filter((v) => v.role === 'param').map((v) => ({ id: v.id, value: v.init, unit: v.unit ?? '' })) };
    }
    default: return { ok: false, reason: `unknown tool ${name}` };
  }
}
