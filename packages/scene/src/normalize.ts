// Validation and repair: turn whatever the model produced into a Scene that is guaranteed to render,
// dropping only the offending parts and reporting every change as an issue.
import { z } from 'zod';
import { compile, isNumeric, ExprError } from './expr.js';
import { layoutScene, motionReport, type InkMap } from './layout.js';
import { SceneRuntime } from './runtime.js';
import {
  SceneSchema, ElementSchema, VarSchema, DerivedSchema, AssetSchema, StepSchema, InteractionSchema,
  BUILTIN_SCOPE_NAMES, type Scene, type Element, type BoxT,
} from './schema.js';

export type Issue = { level: 'warn' | 'error'; where: string; message: string };
export type NormalizeResult = { scene: Scene | null; issues: Issue[] };

const EXPR_PROPS = ['x', 'y', 'w', 'h', 'rot', 'opacity', 'scale', 'visible', 'speed', 'marker', 'rate'] as const;

function salvageArray<T>(raw: unknown, schema: z.ZodType<T>, where: string, issues: Issue[]): T[] {
  if (!Array.isArray(raw)) { if (raw !== undefined) issues.push({ level: 'warn', where, message: 'not an array; ignored' }); return []; }
  const out: T[] = [];
  raw.forEach((item, i) => {
    const r = schema.safeParse(item);
    if (r.success) out.push(r.data);
    else issues.push({ level: 'warn', where: `${where}[${i}]`, message: r.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).slice(0, 3).join('; ') });
  });
  return out;
}

export type NormalizeContext = {
  ink?: InkMap;                              // overlays are moved off printed text
  dropTexts?: string[];                      // labels that merely repeat these (the page title) are dropped
  characterCrops?: Record<string, BoxT>;     // printed characters (name → box): generated look-alikes become cut-outs of the printed drawing
};

/** Validate and repair a scene. Returns scene=null only if nothing usable remains. */
export function normalizeScene(input: unknown, ctx: NormalizeContext = {}): NormalizeResult {
  const issues: Issue[] = [];
  let raw: any = input;
  if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch { return { scene: null, issues: [{ level: 'error', where: 'scene', message: 'not valid JSON' }] }; } }
  if (!raw || typeof raw !== 'object') return { scene: null, issues: [{ level: 'error', where: 'scene', message: 'not an object' }] };

  // 1. structural: salvage each array element-wise, then parse the whole
  const candidate = {
    ...raw,
    v: 1,
    vars: salvageArray(raw.vars, VarSchema, 'vars', issues),
    derived: salvageArray(raw.derived, DerivedSchema, 'derived', issues),
    assets: salvageArray(raw.assets, AssetSchema, 'assets', issues),
    elements: salvageArray(raw.elements, ElementSchema, 'elements', issues),
    steps: salvageArray(raw.steps, StepSchema, 'steps', issues),
    interactions: salvageArray(raw.interactions, InteractionSchema, 'interactions', issues),
  };
  if (!candidate.page || typeof candidate.page.w !== 'number' || typeof candidate.page.h !== 'number') {
    candidate.page = { w: 1000, h: 1414 };
    issues.push({ level: 'warn', where: 'page', message: 'missing page size; assumed 1000x1414' });
  }
  if (candidate.audio && typeof candidate.audio === 'object') {
    const a = candidate.audio;
    if (a.lines && !Array.isArray(a.lines)) delete a.lines;
    if (a.sfx && !Array.isArray(a.sfx)) delete a.sfx;
    if (Array.isArray(a.lines)) a.lines = a.lines.filter((l: any) => l && typeof l === 'object' && typeof l.text === 'string' && typeof l.speaker === 'string' && typeof l.id === 'string');
    if (Array.isArray(a.sfx)) a.sfx = a.sfx.filter((x: any) => x && typeof x.on === 'string' && typeof x.name === 'string');
    if (a.speakers && typeof a.speakers !== 'object') delete a.speakers;
    if (a.narrator && typeof a.narrator !== 'object') delete a.narrator;
  } else delete candidate.audio;
  // anchors: keep every valid box, drop the rest (a single bad entry must not unanchor the whole scene)
  if (candidate.anchors && typeof candidate.anchors === 'object' && !Array.isArray(candidate.anchors)) {
    const clean: Record<string, number[]> = {};
    for (const [k, v] of Object.entries(candidate.anchors)) { const b = Array.isArray(v) ? v.map(Number) : null; if (b && b.length === 4 && b.every(Number.isFinite)) clean[k] = b; else issues.push({ level: 'warn', where: `anchors.${k}`, message: 'invalid box dropped' }); }
    candidate.anchors = clean;
  } else delete candidate.anchors;
  if (candidate.style && typeof candidate.style === 'object') { const st = candidate.style; if (st.palette && !Array.isArray(st.palette)) delete st.palette; if (Array.isArray(st.palette)) st.palette = st.palette.filter((c: any) => typeof c === 'string').slice(0, 8); if (st.font && !['serif', 'sans', 'rounded', 'mono'].includes(st.font)) delete st.font; } else delete candidate.style;
  let parsed = SceneSchema.safeParse(candidate);
  if (!parsed.success) {
    // last resort: strip optional sections one by one
    for (const key of ['audio', 'style', 'anchors', 'interactions', 'steps'] as const) {
      delete (candidate as any)[key];
      parsed = SceneSchema.safeParse(candidate);
      issues.push({ level: 'warn', where: key, message: 'dropped (invalid)' });
      if (parsed.success) break;
    }
    if (!parsed.success) {
      return { scene: null, issues: [...issues, { level: 'error', where: 'scene', message: parsed.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).slice(0, 5).join('; ') }] };
    }
  }
  const scene = parsed.data;

  // 2. semantic repairs
  const dedupe = <T extends { id: string }>(arr: T[], where: string) => {
    const seen = new Set<string>(); // ids are unique within a collection (an asset and an element may share a name)
    return arr.filter((item) => {
      if (seen.has(item.id)) { issues.push({ level: 'warn', where: `${where}.${item.id}`, message: 'duplicate id dropped' }); return false; }
      seen.add(item.id); return true;
    });
  };
  scene.vars = dedupe(scene.vars, 'vars');
  scene.derived = dedupe(scene.derived, 'derived');
  scene.assets = dedupe(scene.assets, 'assets');
  scene.elements = dedupe(scene.elements, 'elements');
  scene.steps = dedupe(scene.steps, 'steps');

  for (const v of scene.vars) {
    if (v.min > v.max) { [v.min, v.max] = [v.max, v.min]; issues.push({ level: 'warn', where: `vars.${v.id}`, message: 'min/max swapped' }); }
    if (v.min === v.max) { v.max = v.min + 1; issues.push({ level: 'warn', where: `vars.${v.id}`, message: 'empty range widened' }); }
    if (v.init < v.min || v.init > v.max) { v.init = Math.min(Math.max(v.init, v.min), v.max); issues.push({ level: 'warn', where: `vars.${v.id}`, message: 'init clamped into range' }); }
  }
  if (!scene.vars.some((v) => v.role === 'time') && scene.kind === 'simulation') {
    scene.vars.push({ id: 't', label: 'time', min: 0, max: 10, init: 0, role: 'time', unit: 's' });
    issues.push({ level: 'warn', where: 'vars', message: 'simulation had no time variable; added t (0..10 s)' });
  }

  // known names for expressions
  const known = new Set<string>([...BUILTIN_SCOPE_NAMES, ...scene.vars.map((v) => v.id)]);
  // derived: compile, check refs, order by dependencies, drop cycles/unknowns
  const derivedOk: typeof scene.derived = [];
  const pending = [...scene.derived];
  const derivedIds = new Set(scene.derived.map((d) => d.id));
  let progress = true;
  while (pending.length && progress) {
    progress = false;
    for (let i = 0; i < pending.length; i++) {
      const d = pending[i]!;
      let refs: string[];
      try { refs = compile(d.expr).refs; } catch (e) { issues.push({ level: 'warn', where: `derived.${d.id}`, message: `dropped: ${(e as ExprError).message}` }); pending.splice(i, 1); i--; progress = true; continue; }
      const unknown = refs.filter((r) => !known.has(r) && !derivedIds.has(r));
      if (unknown.length) { issues.push({ level: 'warn', where: `derived.${d.id}`, message: `dropped: unknown name(s) ${unknown.join(', ')}` }); pending.splice(i, 1); i--; derivedIds.delete(d.id); progress = true; continue; }
      if (refs.every((r) => known.has(r))) { derivedOk.push(d); known.add(d.id); pending.splice(i, 1); i--; progress = true; }
    }
  }
  for (const d of pending) issues.push({ level: 'warn', where: `derived.${d.id}`, message: 'dropped: circular dependency' });
  scene.derived = derivedOk;

  const checkExpr = (value: unknown, where: string): number | string => {
    if (isNumeric(value)) return value;
    if (typeof value !== 'string') return 0;
    if (/^\s*-?\d+(\.\d+)?\s*$/.test(value)) return Number(value);
    try {
      const c = compile(value);
      const unknown = c.refs.filter((r) => !known.has(r));
      if (unknown.length) { issues.push({ level: 'warn', where, message: `unknown name(s) ${unknown.join(', ')} in "${value}"; using 0` }); return 0; }
      return value;
    } catch (e) { issues.push({ level: 'warn', where, message: `invalid expression "${value}": ${(e as Error).message}; using 0` }); return 0; }
  };

  // crop boxes: resolve figure-relative boxes to page units, clamp to the page, drop empty ones
  scene.assets = scene.assets.filter((a) => {
    if (a.type !== 'crop') return true;
    if (a.anchor) { const an = scene.anchors[a.anchor]; if (an) a.box = [a.box[0] + an[0], a.box[1] + an[1], a.box[2] + an[0], a.box[3] + an[1]]; a.anchor = undefined; }
    const [x0, y0, x1, y1] = a.box;
    const bx0 = Math.max(0, Math.min(x0, x1)), by0 = Math.max(0, Math.min(y0, y1)), bx1 = Math.min(scene.page.w, Math.max(x0, x1)), by1 = Math.min(scene.page.h, Math.max(y0, y1));
    if (bx1 - bx0 < 8 || by1 - by0 < 8) { issues.push({ level: 'warn', where: `assets.${a.id}`, message: 'crop box outside the page or empty; dropped' }); return false; }
    a.box = [bx0, by0, bx1, by1];
    return true;
  });
  // a picture book's characters are already drawn on the page: a generated look-alike becomes a cut-out of the printed drawing
  const cropsFor = ctx.characterCrops ?? {};
  const normName = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const cropKeys = Object.keys(cropsFor).map((k) => [normName(k), k] as const);
  const swapped = new Map<string, BoxT>();
  let initScope: Record<string, number> | undefined;
  scene.assets = scene.assets.map((a) => {
    if (a.type !== 'gen' || !a.character) return a;
    const key = cropKeys.find(([n]) => n && (n === normName(a.character!) || normName(a.character!).includes(n) || n.includes(normName(a.character!))))?.[1];
    if (!key) return a;
    const box = cropsFor[key]!;
    swapped.set(a.id, box);
    issues.push({ level: 'warn', where: `assets.${a.id}`, message: `generated ${a.character} replaced by the printed drawing` });
    return { id: a.id, type: 'crop', box: [...box] as BoxT, feather: 0.04 };
  });
  const assetIds = new Set(scene.assets.map((a) => a.id));
  const anchorIds = new Set(Object.keys(scene.anchors));
  scene.elements = scene.elements.filter((el) => {
    const where = `elements.${el.id}`;
    if (el.visible === 0 || el.visible === 'false' || el.visible === '0') { el.visible = 1; el.hidden = true; }
    for (const p of EXPR_PROPS) if (p in el) (el as any)[p] = checkExpr((el as any)[p], `${where}.${p}`);
    if ('points' in el && Array.isArray(el.points)) {
      (el as any).points = el.points.map((pt: [unknown, unknown], i: number) => [checkExpr(pt[0], `${where}.points[${i}].x`), checkExpr(pt[1], `${where}.points[${i}].y`)]);
    }
    if (el.type === 'plot') {
      try { const c = compile(el.fn); const unknown = c.refs.filter((r) => r !== 'x' && !known.has(r)); if (unknown.length) throw new ExprError(`unknown name(s) ${unknown.join(', ')}`); }
      catch (e) { issues.push({ level: 'warn', where, message: `plot dropped: ${(e as Error).message}` }); return false; }
      if (el.xdomain[0] >= el.xdomain[1]) { issues.push({ level: 'warn', where, message: 'plot dropped: empty x domain' }); return false; }
    }
    if (el.type === 'sprite' && !assetIds.has(el.asset)) { issues.push({ level: 'warn', where, message: `sprite dropped: unknown asset ${el.asset}` }); return false; }
    const cropAsset = el.type === 'sprite' ? scene.assets.find((a) => a.id === el.asset && a.type === 'crop') : undefined;
    if (el.type === 'sprite' && cropAsset && cropAsset.type === 'crop') {
      // a cut-out starts exactly on the printed drawing it was cut from, at its printed size (the model tends to give the
      // box's centre, or a guess); its motion is kept as offsets from there
      const box = swapped.get(el.asset) ?? cropAsset.box, an = el.anchor ? scene.anchors[el.anchor] : undefined, ox = an ? an[0] : 0, oy = an ? an[1] : 0;
      const bw = box[2] - box[0], bh = box[3] - box[1];
      for (const a of el.anim) if ((a.prop === 'x' || a.prop === 'y') && !a.relative) { const base = a.prop === 'x' ? el.x : el.y; if (typeof base !== 'number') continue; if (typeof a.from === 'number') a.from -= base; if (typeof a.to === 'number') a.to -= base; if (a.keys) for (const k of a.keys) k.v -= base; a.relative = true; }
      const target = [box[0] - ox, box[1] - oy] as const;
      for (const axis of ['x', 'y'] as const) {
        const v = el[axis];
        if (typeof v === 'number') { el[axis] = target[axis === 'x' ? 0 : 1]; continue; }
        // an expression keeps its motion but starts on the drawing: shift it by the difference at the initial state
        try { initScope ??= new SceneRuntime(scene).values(); const start = compile(String(v))(initScope); const delta = target[axis === 'x' ? 0 : 1] - start; if (Number.isFinite(delta) && Math.abs(delta) > 0.5) el[axis] = `(${v}) + ${Math.round(delta)}`; } catch { el[axis] = target[axis === 'x' ? 0 : 1]; }
      }
      const rw = typeof el.w === 'number' ? el.w : null, rh = typeof el.h === 'number' ? el.h : null;
      if (!(rw && rh && Math.abs(rw / rh - bw / bh) < 0.12 && rw >= bw * 0.9)) { el.w = bw; el.h = bh; } // keep a deliberate enlargement with the right proportions
    }
    if (el.type === 'particles' && el.region && el.anchor && scene.anchors[el.anchor]) {
      const an = scene.anchors[el.anchor]!; const [rx0, ry0, rx1, ry1] = el.region;
      if (rx1 <= an[2] - an[0] + 1 && ry1 <= an[3] - an[1] + 1) { el.region = [rx0 + an[0], ry0 + an[1], rx1 + an[0], ry1 + an[1]]; }
      el.anchor = undefined;
    }
    if (el.type === 'particles' && !el.region) {
      const box = el.anchor ? scene.anchors[el.anchor] : Object.values(scene.anchors)[0];
      if (box && !['rain', 'snow'].includes(el.preset)) { el.region = [...box] as typeof box; el.anchor = undefined; }
    }
    if (el.anchor && !anchorIds.has(el.anchor)) { issues.push({ level: 'warn', where, message: `unknown anchor ${el.anchor}; using page origin` }); el.anchor = undefined; }
    // a sprite or bubble with plain-number coordinates that fit inside the main figure's box but no anchor was almost
    // certainly written in figure units: adopt the figure as its anchor (the common mistake seen in evaluation)
    if (!el.anchor && (el.type === 'sprite' || el.type === 'bubble') && typeof el.x === 'number' && typeof el.y === 'number') {
      const main = Object.entries(scene.anchors)[0];
      if (main) { const [id, b] = main; const bw = b[2] - b[0], bh = b[3] - b[1]; const inFigure = el.x >= b[0] && el.x <= b[2] && el.y >= b[1] && el.y <= b[3]; if (!inFigure && el.x >= 0 && el.x <= bw && el.y >= 0 && el.y <= bh) { el.anchor = id; issues.push({ level: 'warn', where, message: `coordinates looked figure-relative; anchored to ${id}` }); } }
    }
    if (el.type === 'shape' && ['line', 'arrow', 'polygon', 'square'].includes(el.shape) && (!el.points || el.points.length < 2)) { issues.push({ level: 'warn', where, message: `${el.shape} needs points; dropped` }); return false; }
    if (el.type === 'shape' && el.away) el.away = [checkExpr(el.away[0], `${where}.away.x`), checkExpr(el.away[1], `${where}.away.y`)];
    // "none"/"transparent" are not colours the renderer can use: they mean no fill or stroke
    const noColor = (c: unknown) => typeof c === 'string' && /^(none|transparent|null|undefined|)$/i.test(c.trim());
    if (el.type === 'shape') { if (noColor(el.fill)) el.fill = undefined; if (noColor(el.stroke)) el.stroke = undefined; if (!el.fill && !el.stroke) el.stroke = '#7fd3ff'; }
    if (el.type === 'label') { if (noColor(el.bg)) el.bg = undefined; if (noColor(el.color)) el.color = '#1a1a1a'; }
    if (el.type === 'label' || el.type === 'bubble') {
      // a {template} must be a numeric expression the renderer can evaluate; anything else would print as code
      for (const m of el.text.matchAll(/\{([^}]*)\}/g)) {
        const expr = m[1]!.split(':')[0]!.trim();
        let ok = !/['"]/.test(expr);
        if (ok) { try { const c = compile(expr); ok = c.refs.every((r) => known.has(r)); } catch { ok = false; } }
        if (!ok) { issues.push({ level: 'warn', where, message: `dropped: template {${expr.slice(0, 30)}} is not a numeric expression` }); return false; }
      }
    }
    if (el.type === 'label' && el.bg) {
      // readable contrast: light text on a light badge (or dark on dark) is corrected
      const lum = (c: string) => { const m = c.replace('#', '').match(/^([0-9a-f]{6})/i); if (!m) return null; const n = parseInt(m[1]!, 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };
      const lb = lum(el.bg), lc = lum(el.color);
      if (lb !== null && lc !== null && Math.abs(lb - lc) < 0.35) el.color = lb > 0.5 ? '#1a1a1a' : '#ffffff';
    }
    if (el.type === 'path' && noColor(el.stroke)) el.stroke = '#e63946';
    if (el.type === 'particles' && noColor(el.color)) el.color = undefined;
    return true;
  });

  // electrons that were given no path follow the wire the scene draws (the first path, preferring the same figure)
  for (const el of scene.elements) {
    if (el.type !== 'particles' || el.preset !== 'electrons' || el.path) continue;
    const wire = scene.elements.find((p) => p.type === 'path' && p.points.length >= 2 && p.points.every((pt) => typeof pt[0] === 'number' && typeof pt[1] === 'number'));
    if (!wire || wire.type !== 'path') continue;
    const an = wire.anchor ? scene.anchors[wire.anchor] : undefined, ox = an ? an[0] : 0, oy = an ? an[1] : 0;
    el.path = wire.points.map((pt) => [Number(pt[0]) + ox, Number(pt[1]) + oy] as [number, number]);
    if (wire.closed || (el.path.length > 2 && Math.hypot(el.path[0]![0] - el.path[el.path.length - 1]![0], el.path[0]![1] - el.path[el.path.length - 1]![1]) > 4)) el.path.push([...el.path[0]!] as [number, number]);
    issues.push({ level: 'warn', where: `elements.${el.id}`, message: `electrons follow the drawn wire ${wire.id}` });
  }
  const elementIds = new Set(scene.elements.map((e) => e.id));
  const lineIds = new Set(scene.audio.lines.map((l) => l.id));
  const stepIds = new Set(scene.steps.map((s) => s.id));
  const cleanAction = (a: any, where: string) => {
    if (!a) return;
    if (a.say && !lineIds.has(a.say)) { issues.push({ level: 'warn', where, message: `unknown line ${a.say} removed` }); delete a.say; }
    if (a.step && !stepIds.has(a.step)) { issues.push({ level: 'warn', where, message: `unknown step ${a.step} removed` }); delete a.step; }
    if (a.toggle) a.toggle = a.toggle.filter((id: string) => elementIds.has(id));
    if (a.anim) a.anim = a.anim.filter((x: any) => elementIds.has(x.el));
    if (a.set) for (const k of Object.keys(a.set)) if (!scene.vars.some((v) => v.id === k)) { delete a.set[k]; issues.push({ level: 'warn', where, message: `set of unknown var ${k} removed` }); }
  };
  for (const el of scene.elements) cleanAction(el.tap, `elements.${el.id}.tap`);
  for (const s of scene.steps) {
    if (s.show) s.show = s.show.filter((id) => elementIds.has(id));
    if (s.hide) s.hide = s.hide.filter((id) => elementIds.has(id));
    if (s.highlight) s.highlight = s.highlight.filter((id) => elementIds.has(id) || anchorIds.has(id));
    if (s.set) for (const k of Object.keys(s.set)) if (!scene.vars.some((v) => v.id === k)) { delete s.set[k]; issues.push({ level: 'warn', where: `steps.${s.id}`, message: `set of unknown var ${k} removed` }); }
    if (s.say) s.say = s.say.filter((l) => !l.el || elementIds.has(l.el));
  }
  scene.interactions = scene.interactions.filter((it) => {
    if (it.type === 'slider' && !scene.vars.some((v) => v.id === it.var && v.role !== 'time')) { issues.push({ level: 'warn', where: 'interactions', message: `slider for unknown var ${it.var} dropped` }); return false; }
    if (it.type === 'tap' && !elementIds.has(it.el)) { issues.push({ level: 'warn', where: 'interactions', message: `tap on unknown element ${it.el} dropped` }); return false; }
    if (it.type === 'tap' || it.type === 'button') cleanAction(it.action, 'interactions');
    return true;
  });
  // every adjustable param gets a slider unless the model said otherwise
  if (scene.kind === 'simulation' && !scene.interactions.some((i) => i.type === 'slider')) {
    for (const v of scene.vars.filter((v) => v.role === 'param').slice(0, 4)) scene.interactions.push({ type: 'slider', var: v.id, label: v.label });
  }
  scene.audio.lines = scene.audio.lines.filter((l) => !l.el || elementIds.has(l.el));
  for (const sp of Object.keys(scene.audio.speakers)) if (sp.length > 64) delete scene.audio.speakers[sp];

  if (scene.elements.length === 0) return { scene: null, issues: [...issues, { level: 'error', where: 'elements', message: 'no renderable elements remain' }] };
  // 3. presentation repairs
  // a label that only repeats the printed title adds nothing (the page already says it)
  if (ctx.dropTexts?.length) {
    const norm = (s: string) => s.toLowerCase().replace(/^[\s\d.:()-]+/, '').replace(/[^\p{L}]+/gu, ' ').trim(); // "4.5 The water cycle" and "The Water Cycle" are the same title
    const avoid = new Set(ctx.dropTexts.map(norm).filter((s) => s.length > 2));
    scene.elements = scene.elements.filter((el) => { if (el.type === 'label' && avoid.has(norm(el.text))) { issues.push({ level: 'warn', where: `elements.${el.id}`, message: 'label dropped: it only repeats the printed title' }); return false; } return true; });
    if (scene.elements.length === 0) return { scene: null, issues: [...issues, { level: 'error', where: 'elements', message: 'no renderable elements remain' }] };
  }
  // a scene with little motion gets its still highlights breathing, so nothing on the page looks frozen
  if (motionReport(scene).moving.length < 3) {
    for (const el of scene.elements) {
      if (el.type === 'shape' && !el.anim.length && (el.glow || el.stroke || el.fill)) el.anim.push({ prop: 'opacity', from: 0.55, to: 1, dur: 1.6, delay: 0, loop: 'pingpong', ease: 'inout', relative: false } as (typeof el.anim)[number]);
    }
  }
  // layout: what the reader must read never sits on printed ink
  if (ctx.ink) { try { layoutScene(scene, ctx.ink, issues); } catch (e) { issues.push({ level: 'warn', where: 'layout', message: `layout skipped: ${(e as Error).message}` }); } }
  return { scene, issues };
}

/** A guaranteed-renderable scene built only from the quick pass: page cut-outs that lift and bob, a title, sparkle. */
export function fallbackScene(opts: { page: { w: number; h: number }; title?: string; figures?: BoxT[]; lang?: string; kind?: Scene['kind'] }): Scene {
  const { page } = opts;
  const figures = (opts.figures ?? []).slice(0, 6);
  const assets: Scene['assets'] = figures.map((box, i) => ({ id: `fig${i}`, type: 'crop', box, feather: 0.06 }));
  const elements: Element[] = [];
  figures.forEach((box, i) => {
    const [x0, y0, x1, y1] = box;
    elements.push({
      id: `glow${i}`, type: 'shape', shape: 'rect', x: x0 - 8, y: y0 - 8, w: x1 - x0 + 16, h: y1 - y0 + 16, rot: 0, opacity: 0.0, scale: 1, z: 0, visible: 1, hidden: false,
      layer: 'under', fill: 'rgba(120,200,255,0.25)', stroke: '#7fd3ff', strokeW: 3, radius: 14, glow: true,
      anim: [{ prop: 'opacity', from: 0, to: 1, dur: 1.2, delay: 0.3 + i * 0.15, loop: false, ease: 'out', relative: false }],
    } as Element);
    elements.push({
      id: `cut${i}`, type: 'sprite', asset: `fig${i}`, x: x0, y: y0, w: x1 - x0, h: y1 - y0, rot: 0, opacity: 1, scale: 1, z: 2, visible: 1, layer: 'over', flip: false,
      anim: [
        { prop: 'y', from: 0, to: -14, dur: 1.8, delay: 0.6 + i * 0.2, loop: 'pingpong', ease: 'inout', relative: true },
        { prop: 'scale', from: 1, to: 1.04, dur: 1.8, delay: 0.6 + i * 0.2, loop: 'pingpong', ease: 'inout', relative: false },
      ],
    } as Element);
  });
  elements.push({
    id: 'spark', type: 'particles', preset: 'sparkle', x: 0, y: 0, rot: 0, opacity: 1, scale: 1, z: 3, visible: 1, hidden: false, layer: 'over', rate: 25, speed: 1,
    region: [0, 0, page.w, page.h], anim: [],
  } as Element);
  if (opts.title) {
    elements.push({
      id: 'title', type: 'label', text: opts.title, x: page.w / 2, y: 70, rot: 0, opacity: 0, scale: 1, z: 4, visible: 1, hidden: false, layer: 'over',
      size: 40, color: '#ffffff', bg: 'rgba(20,24,48,0.78)', align: 'center', maxW: page.w * 0.9, weight: 'bold',
      anim: [{ prop: 'opacity', from: 0, to: 1, dur: 0.8, delay: 0.2, loop: false, ease: 'out', relative: false }, { prop: 'y', from: 90, to: 70, dur: 0.8, delay: 0.2, loop: false, ease: 'out', relative: false }],
    } as Element);
  }
  return SceneSchema.parse({ v: 1, kind: opts.kind ?? 'summary', page, lang: opts.lang ?? 'en', title: opts.title, assets, elements });
}
