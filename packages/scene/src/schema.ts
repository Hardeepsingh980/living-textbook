// LivingScene v1 — the declarative scene language that Gemini composes and Living Book renders.
// Coordinates are in page units: x across 0..page.w, y down 0..page.h (page.w is normally 1000).
// Any numeric property may be a number or an expression string over the scene's variables (see expr.ts).
import { z } from 'zod';

export const Id = z.string().min(1).max(64).regex(/^[A-Za-z_][A-Za-z0-9_-]*$/, 'ids are identifier-like');
// a number, an expression string, or a JSON boolean (models write true/false for visibility and flags)
export const NumOrExpr = z.union([z.number(), z.string().max(400), z.boolean().transform((b) => (b ? 1 : 0))]);
const LoopValue = z.preprocess((v) => {
  if (typeof v === 'string') { const t = v.trim().toLowerCase(); if (['pingpong', 'ping-pong', 'yoyo', 'alternate', 'bounce'].includes(t)) return 'pingpong'; if (['true', 'loop', 'infinite', 'forever', 'repeat', 'yes', 'always'].includes(t)) return true; if (['false', 'once', 'no', 'none', '0'].includes(t)) return false; }
  if (typeof v === 'number') return v !== 0;
  return v;
}, z.union([z.boolean(), z.literal('pingpong')]));
export const Box = z.tuple([z.number(), z.number(), z.number(), z.number()]); // x0, y0, x1, y1 in page units
export const Color = z.string().max(40);

export const VarSchema = z.object({
  id: Id,
  label: z.string().max(80).optional(),
  min: z.number(),
  max: z.number(),
  init: z.number(),
  step: z.number().positive().optional(),
  unit: z.string().max(24).optional(),
  role: z.enum(['param', 'time']).default('param'),
});

export const DerivedSchema = z.object({
  id: Id,
  expr: z.string().min(1).max(400),
  label: z.string().max(80).optional(),
  unit: z.string().max(24).optional(),
});

export const AssetSchema = z.discriminatedUnion('type', [
  z.object({ id: Id, type: z.literal('crop'), box: Box, anchor: z.string().max(64).optional(), feather: z.number().min(0).max(1).optional() }),
  z.object({
    id: Id, type: z.literal('gen'),
    prompt: z.string().min(3).max(600),
    character: z.string().max(64).optional(),
    w: z.number().positive().optional(), h: z.number().positive().optional(),
    transparent: z.boolean().default(true),
  }),
  z.object({ id: Id, type: z.literal('builtin'), name: z.string().max(64) }),
]);

export const Ease = z.enum(['linear', 'in', 'out', 'inout', 'bounce', 'elastic', 'back']);
export const AnimProp = z.enum(['x', 'y', 'w', 'h', 'rot', 'opacity', 'scale']);

export const AnimSchema = z.object({
  prop: AnimProp,
  from: z.number().optional(),
  to: z.number().optional(),
  keys: z.array(z.object({ t: z.number().min(0).max(1), v: z.number() })).min(2).optional(),
  dur: z.coerce.number().positive().max(120).default(1),
  delay: z.coerce.number().min(0).max(120).default(0),
  loop: LoopValue.default(false),
  ease: Ease.default('inout'),
  relative: z.boolean().default(false), // from/to are offsets from the element's base value
});

export const ActionSchema = z.object({
  say: Id.optional(),
  set: z.record(z.string(), z.number()).optional(),
  step: Id.optional(),
  anim: z.array(z.object({ el: Id, anim: z.array(AnimSchema).min(1) })).optional(),
  toggle: z.array(Id).optional(),
  play: z.boolean().optional(),
});

const ElementBase = {
  id: Id,
  x: NumOrExpr.default(0),
  y: NumOrExpr.default(0),
  w: NumOrExpr.optional(),
  h: NumOrExpr.optional(),
  rot: NumOrExpr.default(0),       // degrees
  opacity: NumOrExpr.default(1),
  scale: NumOrExpr.default(1),
  z: z.coerce.number().default(0),
  anchor: z.string().max(64).optional(), // anchor id: x/y become offsets from that box's top-left
  visible: NumOrExpr.default(1),
  hidden: z.boolean().default(false),   // start hidden; a step's "show" reveals it
  anim: z.array(AnimSchema).max(8).default([]),
  tap: ActionSchema.optional(),
  layer: z.enum(['under', 'over']).default('over'), // 'under' sits beneath page cut-outs
};

export const SpriteEl = z.object({ ...ElementBase, type: z.literal('sprite'), asset: Id, flip: z.boolean().default(false), tint: Color.optional() });
export const LabelEl = z.object({
  ...ElementBase, type: z.literal('label'),
  text: z.string().max(400),
  size: z.coerce.number().min(8).max(200).default(28),
  color: Color.default('#1a1a1a'),
  bg: Color.optional(),
  align: z.enum(['left', 'center', 'right']).default('center'),
  maxW: z.coerce.number().positive().optional(),
  weight: z.enum(['normal', 'bold']).default('normal'),
});
export const ShapeEl = z.object({
  ...ElementBase, type: z.literal('shape'),
  shape: z.enum(['rect', 'circle', 'ellipse', 'line', 'arrow', 'polygon', 'star']),
  points: z.array(z.tuple([NumOrExpr, NumOrExpr])).max(64).optional(),
  fill: Color.optional(),
  stroke: Color.optional(),
  strokeW: z.coerce.number().min(0).max(60).default(3),
  radius: z.coerce.number().min(0).optional(),
  glow: z.boolean().default(false),
});
export const PathEl = z.object({
  ...ElementBase, type: z.literal('path'),
  points: z.array(z.tuple([NumOrExpr, NumOrExpr])).min(2).max(200),
  stroke: Color.default('#e63946'),
  strokeW: z.coerce.number().min(1).max(60).default(4),
  draw: z.boolean().default(true),   // animate the stroke being drawn
  dashed: z.boolean().default(false),
  closed: z.boolean().default(false),
});
export const ParticlesEl = z.object({
  ...ElementBase, type: z.literal('particles'),
  preset: z.enum(['sparkle', 'rain', 'snow', 'bubbles', 'smoke', 'confetti', 'fire', 'leaves', 'stars', 'dust', 'electrons']),
  region: Box.optional(),
  rate: NumOrExpr.default(40),
  color: Color.optional(),
  speed: NumOrExpr.default(1),
  path: z.array(z.tuple([z.number(), z.number()])).min(2).optional(), // for presets that flow along a path (e.g. electrons)
});
export const PlotEl = z.object({
  ...ElementBase, type: z.literal('plot'),
  fn: z.string().min(1).max(400),      // expression in x (plus scene vars)
  xdomain: z.tuple([z.number(), z.number()]),
  ydomain: z.tuple([z.number(), z.number()]).optional(),
  marker: NumOrExpr.optional(),        // x position of a moving marker on the curve
  stroke: Color.default('#2a6cdf'),
  grid: z.boolean().default(true),
  xlabel: z.string().max(40).optional(),
  ylabel: z.string().max(40).optional(),
});
export const BubbleEl = z.object({
  ...ElementBase, type: z.literal('bubble'),
  text: z.string().max(300),
  speaker: z.string().max(64).optional(),
  tail: z.tuple([NumOrExpr, NumOrExpr]).optional(),
  style: z.enum(['speech', 'thought', 'shout', 'caption']).default('speech'),
  size: z.coerce.number().min(10).max(120).default(26),
});
export const TimelineEl = z.object({
  ...ElementBase, type: z.literal('timeline'),
  events: z.array(z.object({ at: z.string().max(40), label: z.string().max(120), detail: z.string().max(240).optional() })).min(2).max(12),
  orient: z.enum(['h', 'v']).default('h'),
  color: Color.default('#2a6cdf'),
});

export const ElementSchema = z.discriminatedUnion('type', [SpriteEl, LabelEl, ShapeEl, PathEl, ParticlesEl, PlotEl, BubbleEl, TimelineEl]);

export const StepSchema = z.object({
  id: Id,
  title: z.string().max(120).optional(),
  narration: z.string().max(600).optional(),
  say: z.array(z.object({ speaker: z.string().max(64), text: z.string().max(300), el: Id.optional() })).max(6).optional(),
  set: z.record(z.string(), z.number()).optional(),
  show: z.array(Id).optional(),
  hide: z.array(Id).optional(),
  highlight: z.array(z.string().max(64)).optional(), // element or anchor ids
  focus: Box.optional(),
  dur: z.number().positive().max(120).optional(),      // auto-advance after this many seconds (else after narration)
  play: z.boolean().optional(),                        // start/stop the time variable
});

export const InteractionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('slider'), var: Id, label: z.string().max(80).optional() }),
  z.object({ type: z.literal('button'), label: z.string().max(40), action: ActionSchema }),
  z.object({ type: z.literal('tap'), el: Id, action: ActionSchema }),
  z.object({ type: z.literal('play') }),
]);

export const AudioSchema = z.object({
  narrator: z.object({ voice: z.string().max(64).optional(), style: z.string().max(160).optional() }).optional(),
  speakers: z.record(z.string(), z.object({ voice: z.string().max(64).optional(), style: z.string().max(160).optional(), desc: z.string().max(200).optional() })).default({}),
  lines: z.array(z.object({ id: Id, speaker: z.string().max(64), text: z.string().max(300), el: Id.optional() })).max(40).default([]),
  ambience: z.string().max(40).optional(),
  sfx: z.array(z.object({ on: z.string().max(80), name: z.string().max(40) })).max(20).default([]),
});

export const StyleSchema = z.object({
  palette: z.array(Color).max(8).optional(),
  font: z.enum(['serif', 'sans', 'rounded', 'mono']).default('sans'),
  mood: z.string().max(80).optional(),
  bg: Color.optional(),
});

export const SceneSchema = z.object({
  v: z.literal(1),
  kind: z.enum(['simulation', 'explainer', 'story', 'picture', 'timeline', 'summary']),
  page: z.object({ w: z.number().positive(), h: z.number().positive() }),
  lang: z.string().max(16).default('en'),
  title: z.string().max(160).optional(),
  style: StyleSchema.default({ font: 'sans' }),
  vars: z.array(VarSchema).max(12).default([]),
  derived: z.array(DerivedSchema).max(24).default([]),
  assets: z.array(AssetSchema).max(24).default([]),
  elements: z.array(ElementSchema).max(80),
  steps: z.array(StepSchema).max(24).default([]),
  interactions: z.array(InteractionSchema).max(12).default([]),
  audio: AudioSchema.default({ speakers: {}, lines: [], sfx: [] }),
  anchors: z.record(z.string(), Box).default({}),
});

export type Scene = z.infer<typeof SceneSchema>;
export type SceneInput = z.input<typeof SceneSchema>;
export type Var = z.infer<typeof VarSchema>;
export type Derived = z.infer<typeof DerivedSchema>;
export type Asset = z.infer<typeof AssetSchema>;
export type Anim = z.infer<typeof AnimSchema>;
export type Action = z.infer<typeof ActionSchema>;
export type Element = z.infer<typeof ElementSchema>;
export type ElementType = Element['type'];
export type Step = z.infer<typeof StepSchema>;
export type Interaction = z.infer<typeof InteractionSchema>;
export type Audio = z.infer<typeof AudioSchema>;
export type BoxT = z.infer<typeof Box>;

/** Names always available to expressions besides vars and derived values. */
export const BUILTIN_SCOPE_NAMES = ['t', 'W', 'H', 'dt'] as const;
