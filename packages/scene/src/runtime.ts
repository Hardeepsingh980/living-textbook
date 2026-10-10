// Scene runtime: variables, derived values, animations and steps, resolved into plain per-frame element props.
// Pure TypeScript with no DOM, so the renderer (browser) and the verifier (server) share it.
import { compile, type Compiled, type Scope } from './expr.js';
import type { Scene, Element, Anim, Action } from './schema.js';

export type ResolvedElement = {
  el: Element;
  x: number; y: number; w: number | undefined; h: number | undefined;
  rot: number; opacity: number; scale: number; visible: boolean;
  points?: [number, number][];
  marker?: number;
  speed?: number;
  rate?: number;
  highlighted: boolean;
};

export type RuntimeEvent =
  | { type: 'say'; lineId: string }
  | { type: 'step'; index: number; stepId: string }
  | { type: 'sfx'; name: string }
  | { type: 'play'; playing: boolean };

const EASES: Record<string, (t: number) => number> = {
  linear: (t) => t,
  in: (t) => t * t,
  out: (t) => 1 - (1 - t) * (1 - t),
  inout: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  bounce: (t) => { const n1 = 7.5625, d1 = 2.75; if (t < 1 / d1) return n1 * t * t; if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75; if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375; return n1 * (t -= 2.625 / d1) * t + 0.984375; },
  elastic: (t) => (t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1),
  back: (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
};

/** Value of an animation at time `now` (seconds since the element was shown), or undefined before its delay. */
export function animValue(a: Anim, now: number): number | undefined {
  const local = now - a.delay;
  if (local < 0) return undefined;
  let p: number;
  if (a.loop === 'pingpong') { const cyc = (local / a.dur) % 2; p = cyc <= 1 ? cyc : 2 - cyc; }
  else if (a.loop === true) p = (local / a.dur) % 1;
  else p = Math.min(local / a.dur, 1);
  const e = EASES[a.ease] ?? EASES.inout!;
  if (a.keys && a.keys.length >= 2) {
    const keys = a.keys;
    if (p <= keys[0]!.t) return keys[0]!.v;
    for (let i = 1; i < keys.length; i++) {
      const k0 = keys[i - 1]!, k1 = keys[i]!;
      if (p <= k1.t) { const seg = (p - k0.t) / Math.max(k1.t - k0.t, 1e-6); return k0.v + (k1.v - k0.v) * e(seg); }
    }
    return keys[keys.length - 1]!.v;
  }
  const from = a.from ?? 0, to = a.to ?? 1;
  return from + (to - from) * e(p);
}

export class SceneRuntime {
  readonly scene: Scene;
  private vars: Scope = {};
  private derivedFns: { id: string; fn: Compiled }[] = [];
  private exprCache = new Map<string, Compiled>();
  private hidden = new Set<string>();
  private highlighted = new Set<string>();
  private shownAt = new Map<string, number>();
  private extraAnims = new Map<string, { anim: Anim; start: number }[]>();
  clock = 0;              // seconds since start (drives animations)
  playing = false;        // whether the time variable advances
  stepIndex = -1;
  private timeVar: string | null = null;
  private listeners: ((e: RuntimeEvent) => void)[] = [];

  constructor(scene: Scene) {
    this.scene = scene;
    for (const v of scene.vars) { this.vars[v.id] = v.init; if (v.role === 'time' && !this.timeVar) this.timeVar = v.id; }
    for (const d of scene.derived) { try { this.derivedFns.push({ id: d.id, fn: compile(d.expr) }); } catch { /* normalize() already dropped invalid ones */ } }
    const now = 0;
    for (const el of scene.elements) { this.shownAt.set(el.id, now); if (el.hidden) this.hidden.add(el.id); }
    if (scene.steps.length) this.goToStep(0, true);
  }

  on(fn: (e: RuntimeEvent) => void) { this.listeners.push(fn); return () => { this.listeners = this.listeners.filter((f) => f !== fn); }; }
  private emit(e: RuntimeEvent) { for (const l of this.listeners) l(e); }

  /** Current scope: vars + derived + builtins. */
  values(): Scope {
    const s: Scope = { ...this.vars, t: this.timeVar ? this.vars[this.timeVar]! : this.clock, W: this.scene.page.w, H: this.scene.page.h, dt: 0 };
    for (const d of this.derivedFns) s[d.id] = d.fn(s);
    return s;
  }

  getVar(id: string) { return this.vars[id]; }
  setVar(id: string, value: number) {
    const v = this.scene.vars.find((x) => x.id === id);
    if (!v) return;
    this.vars[id] = Math.min(Math.max(value, v.min), v.max);
  }
  setPlaying(p: boolean) { if (this.playing !== p) { this.playing = p; this.emit({ type: 'play', playing: p }); } }
  resetTime() { if (this.timeVar) this.vars[this.timeVar] = this.scene.vars.find((v) => v.id === this.timeVar)!.init; }

  /** Advance the clock (and the time variable when playing). */
  tick(dt: number) {
    this.clock += dt;
    if (this.playing && this.timeVar) {
      const v = this.scene.vars.find((x) => x.id === this.timeVar)!;
      const next = this.vars[this.timeVar]! + dt;
      if (next >= v.max) { this.vars[this.timeVar] = v.max; this.setPlaying(false); } else this.vars[this.timeVar] = next;
    }
  }

  private expr(src: number | string | undefined, scope: Scope, fallback = 0): number {
    if (src === undefined) return fallback;
    if (typeof src === 'number') return src;
    let c = this.exprCache.get(src);
    if (!c) { try { c = compile(src); } catch { return fallback; } this.exprCache.set(src, c); }
    return c(scope);
  }

  /** Resolve every element's props for this frame. Hidden elements are omitted; sorted by z then declaration order. */
  frame(): ResolvedElement[] {
    const scope = this.values();
    const out: ResolvedElement[] = [];
    for (const el of this.scene.elements) {
      if (this.hidden.has(el.id)) continue;
      const visible = this.expr(el.visible, scope, 1) !== 0;
      if (!visible) continue;
      const anchor = el.anchor ? this.scene.anchors[el.anchor] : undefined;
      const base = {
        x: this.expr(el.x, scope) + (anchor ? anchor[0] : 0),
        y: this.expr(el.y, scope) + (anchor ? anchor[1] : 0),
        w: el.w === undefined ? undefined : this.expr(el.w, scope),
        h: el.h === undefined ? undefined : this.expr(el.h, scope),
        rot: this.expr(el.rot, scope), opacity: this.expr(el.opacity, scope, 1), scale: this.expr(el.scale, scope, 1),
      };
      const since = this.clock - (this.shownAt.get(el.id) ?? 0);
      const anims: { anim: Anim; start: number }[] = [...el.anim.map((anim) => ({ anim, start: this.shownAt.get(el.id) ?? 0 })), ...(this.extraAnims.get(el.id) ?? [])];
      for (const { anim, start } of anims) {
        const v = animValue(anim, this.clock - start);
        if (v === undefined) continue;
        const key = anim.prop as keyof typeof base;
        const cur = base[key];
        if (anim.relative) { if (cur !== undefined) (base as any)[key] = cur + v; }
        else (base as any)[key] = v;
      }
      void since;
      const r: ResolvedElement = { el, ...base, visible: true, highlighted: this.highlighted.has(el.id) };
      if ('points' in el && Array.isArray(el.points)) r.points = el.points.map((p: any) => [this.expr(p[0], scope) + (anchor ? anchor[0] : 0), this.expr(p[1], scope) + (anchor ? anchor[1] : 0)] as [number, number]);
      if (el.type === 'plot' && el.marker !== undefined) r.marker = this.expr(el.marker, scope);
      if (el.type === 'particles') { r.speed = this.expr(el.speed, scope, 1); r.rate = this.expr(el.rate, scope, 40); }
      out.push(r);
    }
    out.sort((a, b) => (a.el.z - b.el.z));
    return out;
  }

  isHighlighted(id: string) { return this.highlighted.has(id); }
  highlightedAnchors(): string[] { return [...this.highlighted].filter((id) => id in this.scene.anchors); }

  show(id: string) { if (this.hidden.delete(id)) this.shownAt.set(id, this.clock); }
  hide(id: string) { this.hidden.add(id); }
  toggle(id: string) { if (this.hidden.has(id)) this.show(id); else this.hide(id); }

  /** Evaluate the derived values for an arbitrary assignment of variables (used by the verifier). */
  evaluateWith(assign: Scope): Scope {
    const saved = { ...this.vars };
    for (const [k, v] of Object.entries(assign)) if (k in this.vars) this.vars[k] = v;
    const out = this.values();
    this.vars = saved;
    return out;
  }

  runAction(a: Action | undefined) {
    if (!a) return;
    if (a.set) for (const [k, v] of Object.entries(a.set)) this.setVar(k, v);
    if (a.toggle) for (const id of a.toggle) this.toggle(id);
    if (a.anim) for (const { el, anim } of a.anim) { const list = this.extraAnims.get(el) ?? []; for (const an of anim) list.push({ anim: an, start: this.clock }); this.extraAnims.set(el, list); }
    if (a.play !== undefined) this.setPlaying(a.play);
    if (a.say) this.emit({ type: 'say', lineId: a.say });
    if (a.step) { const i = this.scene.steps.findIndex((s) => s.id === a.step); if (i >= 0) this.goToStep(i); }
  }

  tap(elementId: string) {
    const el = this.scene.elements.find((e) => e.id === elementId);
    if (el?.tap) this.runAction(el.tap);
    for (const it of this.scene.interactions) if (it.type === 'tap' && it.el === elementId) this.runAction(it.action);
    const line = this.scene.audio.lines.find((l) => l.el === elementId);
    if (line && !el?.tap?.say) this.emit({ type: 'say', lineId: line.id });
  }

  goToStep(index: number, silent = false) {
    const step = this.scene.steps[index];
    if (!step) return;
    this.stepIndex = index;
    if (step.set) for (const [k, v] of Object.entries(step.set)) this.setVar(k, v);
    if (step.show) for (const id of step.show) this.show(id);
    if (step.hide) for (const id of step.hide) this.hide(id);
    this.highlighted = new Set(step.highlight ?? []);
    if (step.play !== undefined) this.setPlaying(step.play);
    for (const s of this.scene.audio.sfx) if (s.on === `step:${step.id}`) this.emit({ type: 'sfx', name: s.name });
    if (!silent) this.emit({ type: 'step', index, stepId: step.id });
  }
  nextStep() { if (this.stepIndex + 1 < this.scene.steps.length) this.goToStep(this.stepIndex + 1); }
  prevStep() { if (this.stepIndex > 0) this.goToStep(this.stepIndex - 1); }
}
