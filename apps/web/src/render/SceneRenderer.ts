// PixiJS renderer for LivingScene. Draws resolved elements each frame into a page-sized canvas (page units = pixels),
// which the presentation layer then warps onto the physical page (AR), the frozen capture (photo) or the screen (flat).
import { Application, Container, Sprite, Texture, Graphics, Text, TextStyle, Rectangle, Assets, BlurFilter } from 'pixi.js';
import { SceneRuntime, renderTemplate, compile, type Scene, type Element, type ResolvedElement, type BoxT } from '@living-book/scene';

export type RendererOptions = {
  scene: Scene;
  pageImage: HTMLImageElement | ImageBitmap | null; // for crop assets
  assetUrls: Record<string, string>;                // generated assets by id
  onTap?: (elementId: string) => void;
  resolution?: number;                              // backing store scale (default 0.75; previews use less)
  maxFps?: number;                                  // previews draw at 30 to leave room for the rest of a page
};

const SKETCH = '"Kalam", "Patrick Hand", "Noto Sans Devanagari", system-ui, sans-serif';
const FONT: Record<string, string> = { sans: SKETCH, serif: SKETCH, rounded: SKETCH, mono: 'ui-monospace, Menlo, monospace', sketch: SKETCH };
const PENCIL = 0x2d2d2d, MARKER = 0xff4d4d, PAPER = 0xffffff;
/** A hand-drawn rectangle: bowed sides and corners that overshoot a little, deterministic per seed. */
function roughRect(g: Graphics, x: number, y: number, w: number, h: number, seed = 1) {
  const j = (k: number) => Math.sin(seed * 12.9898 + k * 78.233) * 0.5;
  const bx = Math.min(10, w * 0.03), by = Math.min(10, h * 0.03);
  g.moveTo(x + bx * j(1), y + by * j(2));
  g.bezierCurveTo(x + w * 0.3, y - by * (1 + j(3)), x + w * 0.7, y + by * j(4), x + w + bx * j(5), y + by * j(6));
  g.bezierCurveTo(x + w + bx * (1 + j(7)), y + h * 0.35, x + w - bx * j(8), y + h * 0.7, x + w + bx * j(9), y + h + by * j(10));
  g.bezierCurveTo(x + w * 0.65, y + h + by * (1 + j(11)), x + w * 0.3, y + h - by * j(12), x + bx * j(13), y + h + by * j(14));
  g.bezierCurveTo(x - bx * (1 + j(15)), y + h * 0.7, x + bx * j(16), y + h * 0.3, x + bx * j(17), y + by * j(18));
  g.closePath();
}
/** A paper card with a pencil border and a hard offset shadow, the way every note in the app is drawn. */
function paperCard(g: Graphics, x: number, y: number, w: number, h: number, fill: number | string, seed = 1, border = 2.5) {
  roughRect(g, x + 4, y + 4, w, h, seed + 5); g.fill({ color: PENCIL });
  roughRect(g, x, y, w, h, seed); g.fill({ color: fill }).stroke({ color: PENCIL, width: border, join: 'round' });
}

const REDUCED_MOTION = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

type Particle = { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; spin: number; g: Graphics; pathT?: number };

export class SceneRenderer {
  app!: Application;
  runtime: SceneRuntime;
  root = new Container();
  private layers = { under: new Container(), over: new Container(), fx: new Container() };
  private cropInfo = new Map<string, { box: [number, number, number, number]; color: number }>(); // crop assets: where they came from, and the paper colour there
  private covers = new Map<string, Sprite>();          // paper-coloured patches that hide a cut-out's printed original once it has moved away
  private startedInside = new Map<string, boolean>();  // figure-anchored sprites that began inside their figure fade out when they leave it
  private nodes = new Map<string, Container>();
  private textures = new Map<string, Texture>();
  private particles = new Map<string, { list: Particle[]; acc: number }>();
  private highlights = new Map<string, Graphics>();
  private drawProgress = new Map<string, number>();
  private pageTexture: Texture | null = null;
  private destroyed = false;
  private lastTime = 0;
  private hitAreas = new Map<string, Rectangle>();
  opts: RendererOptions;
  fps = 0;
  private frames = 0; private fpsT = 0;

  constructor(opts: RendererOptions) {
    this.opts = opts;
    this.runtime = new SceneRuntime(opts.scene);
  }

  get scene() { return this.opts.scene; }

  async init(canvas: HTMLCanvasElement) {
    const { w, h } = this.scene.page;
    this.app = new Application();
    // backing store at 0.75× page units keeps fill-rate reasonable on mid-range phones; CSS scales the canvas
    await this.app.init({ canvas, width: w, height: h, backgroundAlpha: 0, antialias: true, resolution: this.opts.resolution ?? 0.75, autoDensity: false, preference: 'webgl' });
    this.app.stage.addChild(this.root);
    this.root.addChild(this.layers.under, this.layers.over, this.layers.fx);
    if (this.opts.pageImage) this.pageTexture = Texture.from(this.opts.pageImage as any);
    await this.loadAssets();
    if (this.opts.maxFps) this.app.ticker.maxFPS = this.opts.maxFps;
    this.app.ticker.add(() => this.frame());
    this.app.stage.eventMode = 'static';
    this.app.stage.hitArea = new Rectangle(0, 0, w, h);
    this.app.stage.on('pointertap', (ev) => this.handleTap(ev.global.x, ev.global.y));
  }

  private lineBubble: { node: Container; until: number } | null = null;
  /** Show a transient speech bubble next to an element while its line is spoken. */
  sayBubble(elementId: string | undefined, text: string, durationMs: number) {
    if (this.lineBubble) { this.lineBubble.node.destroy({ children: true }); this.lineBubble = null; }
    if (!text) return;
    const el = elementId ? this.scene.elements.find((e) => e.id === elementId) : undefined;
    const node = new Container();
    const t = new Text({ text, style: new TextStyle({ fontFamily: SKETCH, fontSize: 30, fill: '#2d2d2d', wordWrap: true, wordWrapWidth: Math.min(this.scene.page.w * 0.55, 460), align: 'center', lineHeight: 36 }) });
    t.resolution = 2; t.anchor.set(0.5);
    const pad = 18, w = t.width + pad * 2, h = t.height + pad * 1.4;
    const g = new Graphics().roundRect(-w / 2, -h / 2, w, h, 18).fill({ color: 0xffffff }).stroke({ color: 0x333333, width: 3 });
    node.addChild(g, t);
    let x = this.scene.page.w / 2, y = 120;
    const target = el ? this.nodes.get(el.id) : undefined;
    if (target) {
      const b = target.getBounds();
      x = Math.min(Math.max(b.x + b.width / 2, w / 2 + 10), this.scene.page.w - w / 2 - 10);
      y = b.y - h / 2 - 16; if (y < h / 2 + 10) y = b.y + b.height + h / 2 + 16;
      g.poly([-14, h / 2 - 2, 14, h / 2 - 2, 0, h / 2 + 22]).fill({ color: 0xffffff }).stroke({ color: 0x333333, width: 2 });
    }
    node.position.set(x, y); node.zIndex = 10000;
    this.layers.fx.addChild(node);
    this.lineBubble = { node, until: performance.now() + Math.max(2500, durationMs + 400) };
  }

  /** Map a tap in page coordinates to the topmost tappable element. */
  handleTap(x: number, y: number) {
    let hit: string | null = null;
    for (const [id, r] of this.hitAreas) if (r.contains(x, y)) hit = id;
    if (hit) { this.runtime.tap(hit); this.opts.onTap?.(hit); }
  }

  pendingAssets = 0;
  private async loadAssets() {
    this.pendingAssets = this.scene.assets.filter((a) => a.type === 'gen' && this.opts.assetUrls[a.id]).length;
    for (const a of this.scene.assets) {
      try {
        if (a.type === 'crop' && this.opts.pageImage) {
          // a cut-out of the printed page: the region is copied and its border colour (paper, sky, water) keyed out,
          // so the printed object lifts off the page without carrying a rectangle of background with it
          const [x0, y0, x1, y1] = a.box;
          const fx = Math.max(0, x0), fy = Math.max(0, y0), fw = Math.max(1, Math.min(this.scene.page.w, x1) - fx), fh = Math.max(1, Math.min(this.scene.page.h, y1) - fy);
          const img = this.opts.pageImage as HTMLImageElement | ImageBitmap;
          const iw = 'naturalWidth' in img ? img.naturalWidth : img.width, ih = 'naturalHeight' in img ? img.naturalHeight : img.height;
          const sx = iw / this.scene.page.w, sy = ih / this.scene.page.h;
          const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(fw * sx)); c.height = Math.max(1, Math.round(fh * sy));
          c.getContext('2d')!.drawImage(img as CanvasImageSource, fx * sx, fy * sy, fw * sx, fh * sy, 0, 0, c.width, c.height);
          const keyed = keyCanvas(c, a.feather === 0 ? 0 : 1, !!a.tight);
          this.textures.set(a.id, keyed.texture);
          this.cropInfo.set(a.id, { box: [fx, fy, fx + fw, fy + fh], color: keyed.color });
        } else if (a.type === 'gen') {
          const url = this.opts.assetUrls[a.id];
          if (url) { try { this.textures.set(a.id, await loadKeyedTexture(url, a.transparent)); } finally { this.pendingAssets--; } }
        } else if (a.type === 'builtin') {
          this.textures.set(a.id, builtinTexture(this.app, a.name));
        }
      } catch (e) { console.warn('asset failed', a.id, e); }
    }
  }

  /** Swap in a generated asset that arrived after init. */
  async addAsset(id: string, url: string) {
    try {
      const a = this.scene.assets.find((x) => x.id === id);
      const tex = await loadKeyedTexture(url, a?.type === 'gen' ? a.transparent : false);
      this.textures.set(id, tex);
      for (const el of this.scene.elements) if (el.type === 'sprite' && el.asset === id) { const n = this.nodes.get(el.id); if (n) { n.destroy({ children: true }); this.nodes.delete(el.id); } }
    } catch (e) { console.warn('asset load failed', id, e); }
  }

  private frame() {
    if (this.destroyed) return;
    const now = performance.now() / 1000;
    const dt = this.lastTime ? Math.min(now - this.lastTime, 0.1) : 0;
    this.lastTime = now;
    this.runtime.tick(dt);
    const resolved = this.runtime.frame();
    const seen = new Set<string>();
    this.hitAreas.clear();
    for (let i = 0; i < resolved.length; i++) {
      const r = resolved[i]!;
      seen.add(r.el.id);
      let node = this.nodes.get(r.el.id);
      if (!node) { node = this.build(r.el); this.nodes.set(r.el.id, node); (r.el.layer === 'under' ? this.layers.under : this.layers.over).addChild(node); }
      node.zIndex = i;
      this.update(node, r, dt);
      if (r.el.tap || this.scene.audio.lines.some((l) => l.el === r.el.id) || this.scene.interactions.some((it) => it.type === 'tap' && it.el === r.el.id)) {
        const b = node.getBounds();
        this.hitAreas.set(r.el.id, new Rectangle(b.x - 10, b.y - 10, b.width + 20, b.height + 20));
      }
    }
    for (const [id, node] of this.nodes) if (!seen.has(id)) node.visible = false; else node.visible = true;
    this.layers.under.sortableChildren = this.layers.over.sortableChildren = true;
    this.updateHighlights(now);
    if (this.lineBubble && performance.now() > this.lineBubble.until) { this.lineBubble.node.destroy({ children: true }); this.lineBubble = null; }
    this.frames++; if (now - this.fpsT >= 1) { this.fps = Math.round(this.frames / (now - this.fpsT)); this.frames = 0; this.fpsT = now; }
  }

  private build(el: Element): Container {
    const c = new Container();
    c.label = el.id;
    switch (el.type) {
      case 'sprite': {
        const tex = this.textures.get(el.asset);
        const s = new Sprite(tex ?? Texture.WHITE);
        const asset = this.scene.assets.find((a) => a.id === el.asset);
        if (!tex) { if (asset?.type === 'gen') { s.tint = 0xdddddd; s.alpha = 0.35; } else s.visible = false; } // gen: soft placeholder until it arrives; anything else: nothing to show
        s.anchor.set(0.5);
        s.label = 'sprite';
        c.addChild(s);
        break;
      }
      case 'label': case 'bubble': { c.addChild(new Graphics(), this.makeText(el)); break; }
      case 'shape': case 'path': case 'plot': case 'timeline': { c.addChild(new Graphics()); if (el.type === 'plot' || el.type === 'timeline') c.addChild(new Container()); break; }
      case 'particles': { this.particles.set(el.id, { list: [], acc: 0 }); break; }
    }
    return c;
  }

  private makeText(el: Extract<Element, { type: 'label' | 'bubble' }>) {
    const size = Math.max(30, el.size * 1.12); // readable at phone size: nothing smaller than 30 page units
    const style = new TextStyle({
      fontFamily: FONT[this.scene.style.font] ?? SKETCH, fontSize: size, fill: el.type === 'label' ? el.color : '#2d2d2d', fontWeight: el.type === 'label' && el.weight === 'bold' ? 'bold' : 'normal',
      wordWrap: true, wordWrapWidth: el.type === 'label' ? (el.maxW ?? this.scene.page.w * 0.6) : Math.min(this.scene.page.w * 0.5, 420), align: el.type === 'label' ? el.align : 'center', lineHeight: size * 1.25,
    });
    const t = new Text({ text: '', style });
    t.label = 'text';
    t.resolution = 2;
    return t;
  }

  private update(node: Container, r: ResolvedElement, dt: number) {
    const el = r.el;
    node.alpha = Math.max(0, Math.min(1, r.opacity));
    node.rotation = (r.rot * Math.PI) / 180;
    switch (el.type) {
      case 'sprite': {
        const s = node.getChildByLabel('sprite') as Sprite;
        const tex = this.textures.get(el.asset);
        if (tex && s.texture !== tex) { s.texture = tex; s.tint = 0xffffff; s.alpha = 1; s.visible = true; }
        // the box the model asked for; the picture is fitted inside it without distortion
        const w = r.w ?? s.texture.width, h = r.h ?? (r.w ? (r.w * s.texture.height) / Math.max(1, s.texture.width) : s.texture.height);
        const tw = Math.max(1, s.texture.width), th = Math.max(1, s.texture.height), fit = Math.min(w / tw, h / th);
        s.width = tw * fit * r.scale * (el.flip ? -1 : 1); s.height = th * fit * r.scale;
        if (el.tint) s.tint = el.tint;
        // liveliness: a sprite with no animation of its own still breathes a little
        let bobY = 0, bobR = 0;
        if (!el.anim.length && !REDUCED_MOTION) { const ph = hashId(el.id); const t = performance.now() / 1000; bobY = Math.sin(t * 1.4 + ph) * Math.min(10, h * 0.05); bobR = Math.sin(t * 0.9 + ph) * 0.02; }
        node.position.set(r.x + w / 2, r.y + h / 2 + bobY);
        node.rotation += bobR;
        // a cut-out that has moved away from where it was printed leaves a paper-coloured patch behind, so the
        // reader sees one object moving rather than a copy beside the original
        const info = this.cropInfo.get(el.asset);
        if (info) {
          const [bx0, by0, bx1, by1] = info.box, bw = bx1 - bx0, bh = by1 - by0;
          const away = Math.hypot(r.x + w / 2 - (bx0 + bw / 2), r.y + h / 2 + bobY - (by0 + bh / 2)) / Math.max(1, Math.max(bw, bh));
          const grown = (w * r.scale) / Math.max(1, bw);
          let cover = this.covers.get(el.asset);
          if (!cover) { cover = new Sprite(coverTexture(bw, bh, info.color)); cover.position.set(bx0, by0); cover.width = bw; cover.height = bh; cover.zIndex = -1; this.layers.under.addChild(cover); this.covers.set(el.asset, cover); }
          // only paper-like backgrounds get a patch: on an illustration a flat patch would look like a hole
          const paper = ((info.color >> 16) * 0.299 + ((info.color >> 8) & 255) * 0.587 + (info.color & 255) * 0.114) / 255 > 0.82;
          cover.visible = paper && (away > 0.12 || grown < 0.7);
          cover.alpha = Math.min(1, Math.max(0, (away - 0.12) / 0.15) + (grown < 0.7 ? 1 : 0));
        }
        // a character that began inside its figure and now flies out of it fades away instead of landing on the text
        const anchorBox = el.anchor ? this.scene.anchors[el.anchor] : undefined;
        if (anchorBox) {
          const [ax0, ay0, ax1, ay1] = anchorBox, cx = r.x + w / 2, cy = r.y + h / 2 + bobY;
          const outside = Math.max(ax0 - cx, cx - ax1, ay0 - cy, cy - ay1, 0);
          if (!this.startedInside.has(el.id)) this.startedInside.set(el.id, outside === 0);
          if (this.startedInside.get(el.id)) node.alpha *= 1 - Math.min(1, outside / (Math.max(w, h) * 0.6));
        }
        break;
      }
      case 'label': {
        const t = node.getChildByLabel('text') as Text;
        const text = renderTemplate(el.text, this.runtime.values());
        if (t.text !== text) t.text = text;
        const g = node.getChildAt(0) as Graphics;
        g.clear();
        { const pad = el.size * 0.45; const bg = el.bg && !/^(none|transparent)$/i.test(el.bg) ? el.bg : PAPER; paperCard(g, -t.width / 2 - pad, -t.height / 2 - pad * 0.6, t.width + pad * 2, t.height + pad * 1.2, bg, hashId(el.id) * 10); }
        t.anchor.set(el.align === 'left' ? 0 : el.align === 'right' ? 1 : 0.5, 0.5);
        t.scale.set(r.scale);
        // keep the whole label on the page
        const halfW = (t.width * r.scale) / 2 + el.size * 0.5, halfH = (t.height * r.scale) / 2 + el.size * 0.3;
        const cx = el.align === 'left' ? r.x + halfW - el.size * 0.5 : el.align === 'right' ? r.x - halfW + el.size * 0.5 : r.x;
        const px = Math.min(Math.max(cx, halfW), this.scene.page.w - halfW), py = Math.min(Math.max(r.y, halfH), this.scene.page.h - halfH);
        node.position.set(px - (cx - r.x), py);
        break;
      }
      case 'bubble': {
        const t = node.getChildByLabel('text') as Text;
        if (t.text !== el.text) t.text = el.text;
        const g = node.getChildAt(0) as Graphics;
        const pad = el.size * 0.6, w = t.width + pad * 2, h = t.height + pad * 1.4;
        g.clear();
        if (el.style === 'thought') { g.ellipse(4, 4, w / 2 + 6, h / 2 + 6).fill({ color: PENCIL }); g.ellipse(0, 0, w / 2 + 6, h / 2 + 6).fill({ color: PAPER }).stroke({ color: PENCIL, width: 2.5 }); }
        else if (el.style === 'caption') { paperCard(g, -w / 2, -h / 2, w, h, 0xfff9c4, hashId(el.id) * 10); }
        else { paperCard(g, -w / 2, -h / 2, w, h, PAPER, hashId(el.id) * 10, el.style === 'shout' ? 3.5 : 2.5); }
        if (r.points === undefined && el.tail) {
          const scope = this.runtime.values();
          const an = el.anchor ? this.scene.anchors[el.anchor] : undefined; // the tail target is in the bubble's own frame
          let tx = (typeof el.tail[0] === 'number' ? el.tail[0] : compile(String(el.tail[0]))(scope)) + (an ? an[0] : 0) - r.x;
          let ty = (typeof el.tail[1] === 'number' ? el.tail[1] : compile(String(el.tail[1]))(scope)) + (an ? an[1] : 0) - r.y;
          if (Number.isFinite(tx) && Number.isFinite(ty)) {
            // keep the tail short: point towards the target but never further than 1.2× the bubble height
            const len = Math.hypot(tx, ty), max = h * 1.2;
            if (len > max) { tx *= max / len; ty *= max / len; }
            g.poly([-14, h / 2 - 2, 14, h / 2 - 2, tx, ty]).fill({ color: PAPER }).stroke({ color: PENCIL, width: 2.5 });
          }
        }
        t.anchor.set(0.5); t.style.fill = '#2d2d2d';
        node.position.set(Math.min(Math.max(r.x, (w * r.scale) / 2 + 8), this.scene.page.w - (w * r.scale) / 2 - 8), Math.min(Math.max(r.y, (h * r.scale) / 2 + 8), this.scene.page.h - (h * r.scale) / 2 - 8)); node.scale.set(r.scale);
        break;
      }
      case 'shape': this.drawShape(node.getChildAt(0) as Graphics, el, r); node.position.set(0, 0); break;
      case 'path': this.drawPath(node.getChildAt(0) as Graphics, el, r, dt); break;
      case 'plot': this.drawPlot(node, el, r); break;
      case 'timeline': this.drawTimeline(node, el, r); break;
      case 'particles': this.updateParticles(node, el, r, dt); break;
    }
  }

  private drawShape(g: Graphics, el: Extract<Element, { type: 'shape' }>, r: ResolvedElement) {
    g.clear();
    const fill = el.fill ? { color: el.fill } : undefined;
    const stroke = el.stroke ? { color: el.stroke, width: Math.max(3.5, el.strokeW) } : undefined;
    const w = (r.w ?? 100) * r.scale, h = (r.h ?? w) * r.scale;
    const pts0 = r.points ?? [];
    // a quick sketch: the outline is traced twice, the second pass a touch off and lighter
    for (const pass of [0, 1]) {
    const dx = pass ? 1.6 : 0, dy = pass ? -1.2 : 0;
    const pts = pts0.map((p) => [p[0] + dx, p[1] + dy] as [number, number]);
    const rx = r.x + dx, ry = r.y + dy;
    switch (el.shape) {
      case 'rect': roughRect(g, rx, ry, w, h, hashId(el.id) * 10 + pass); break;
      case 'circle': g.circle(rx + w / 2, ry + w / 2, w / 2); break;
      case 'ellipse': g.ellipse(rx + w / 2, ry + h / 2, w / 2, h / 2); break;
      case 'star': g.star(rx + w / 2, ry + w / 2, 5, w / 2, w / 4); break;
      case 'polygon': if (pts.length >= 3) g.poly(pts.flat()); break;
      case 'square': {
        // the square built on the segment P→Q, on the side away from `away` (default: to the left of the direction of travel)
        if (pts.length >= 2) {
          const p = pts[0]!, q = pts[1]!;
          let nx = q[1] - p[1], ny = -(q[0] - p[0]);
          if (r.away) { const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2; if ((r.away[0] - mx) * nx + (r.away[1] - my) * ny > 0) { nx = -nx; ny = -ny; } }
          g.poly([p[0], p[1], q[0], q[1], q[0] + nx, q[1] + ny, p[0] + nx, p[1] + ny]);
        }
        break;
      }
      case 'line': case 'arrow': {
        if (pts.length >= 2) {
          g.moveTo(pts[0]![0], pts[0]![1]); for (const p of pts.slice(1)) g.lineTo(p[0], p[1]);
          if (el.shape === 'arrow') {
            const [ax, ay] = pts[pts.length - 2]!, [bx, by] = pts[pts.length - 1]!;
            const ang = Math.atan2(by - ay, bx - ax), len = Math.max(10, el.strokeW * 4);
            g.moveTo(bx, by).lineTo(bx - len * Math.cos(ang - 0.5), by - len * Math.sin(ang - 0.5)).moveTo(bx, by).lineTo(bx - len * Math.cos(ang + 0.5), by - len * Math.sin(ang + 0.5));
          }
        }
        break;
      }
    }
    if (pass === 0 && fill && el.shape !== 'line' && el.shape !== 'arrow') g.fill(fill);
    const sw = stroke ?? ((el.shape === 'line' || el.shape === 'arrow') ? { color: el.fill ?? '#e63946', width: Math.max(3.5, el.strokeW) } : undefined);
    if (sw) g.stroke({ ...sw, width: pass ? sw.width * 0.7 : sw.width, alpha: pass ? 0.4 : 1, cap: 'round', join: 'round' });
    }
    if (el.glow) { if (!(g as any).__glow) { (g as any).__glow = new BlurFilter({ strength: 6 }); g.filters = [(g as any).__glow]; } } else if (g.filters && (g.filters as any).length) g.filters = [];
  }

  private drawPath(g: Graphics, el: Extract<Element, { type: 'path' }>, r: ResolvedElement, dt: number) {
    const pts = r.points ?? [];
    if (pts.length < 2) return;
    let p = this.drawProgress.get(el.id) ?? (el.draw ? 0 : 1);
    if (el.draw && p < 1) { p = Math.min(1, p + dt / 1.5); this.drawProgress.set(el.id, p); }
    const total = pts.length - 1 + (el.closed ? 1 : 0);
    const segs = Math.max(0, Math.floor(p * total)), frac = p * total - segs;
    g.clear();
    g.moveTo(pts[0]![0], pts[0]![1]);
    const all = el.closed ? [...pts, pts[0]!] : pts;
    for (let i = 1; i <= segs && i < all.length; i++) g.lineTo(all[i]![0], all[i]![1]);
    if (segs + 1 < all.length && frac > 0) { const a = all[segs]!, b = all[segs + 1]!; g.lineTo(a[0] + (b[0] - a[0]) * frac, a[1] + (b[1] - a[1]) * frac); }
    g.stroke({ color: el.stroke, width: Math.max(3.5, el.strokeW), cap: 'round', join: 'round', alpha: 1 });
    g.moveTo(pts[0]![0] + 1.5, pts[0]![1] - 1.2);
    for (let i = 1; i <= segs && i < all.length; i++) g.lineTo(all[i]![0] + 1.5, all[i]![1] - 1.2);
    if (segs + 1 < all.length && frac > 0) { const a = all[segs]!, b = all[segs + 1]!; g.lineTo(a[0] + (b[0] - a[0]) * frac + 1.5, a[1] + (b[1] - a[1]) * frac - 1.2); }
    g.stroke({ color: el.stroke, width: Math.max(2.5, el.strokeW * 0.7), cap: 'round', join: 'round', alpha: 0.4 });
    if (el.dashed) g.alpha = 0.7;
  }

  private drawPlot(node: Container, el: Extract<Element, { type: 'plot' }>, r: ResolvedElement) {
    const g = node.getChildAt(0) as Graphics;
    const labels = node.getChildAt(1) as Container;
    const w = r.w ?? 400, h = r.h ?? 300;
    const [x0, x1] = el.xdomain;
    const scope = this.runtime.values();
    let fn: ((s: any) => number) | null = null;
    try { fn = compile(el.fn); } catch { return; }
    const N = 80; const ys: number[] = [];
    for (let i = 0; i <= N; i++) ys.push(fn({ ...scope, x: x0 + ((x1 - x0) * i) / N }));
    const finite = ys.filter((v) => Number.isFinite(v));
    const [y0, y1] = el.ydomain ?? [Math.min(0, ...finite), Math.max(...finite, 1e-6)];
    const sx = (x: number) => r.x + ((x - x0) / (x1 - x0)) * w;
    const sy = (y: number) => r.y + h - ((y - y0) / (y1 - y0 || 1)) * h;
    g.clear();
    g.roundRect(r.x - 8, r.y - 8, w + 16, h + 16, 10).fill({ color: 0xffffff, alpha: 0.85 }).stroke({ color: 0xcccccc, width: 1 });
    if (el.grid) { for (let i = 0; i <= 4; i++) { g.moveTo(r.x, r.y + (h * i) / 4).lineTo(r.x + w, r.y + (h * i) / 4); g.moveTo(r.x + (w * i) / 4, r.y).lineTo(r.x + (w * i) / 4, r.y + h); } g.stroke({ color: 0xdddddd, width: 1 }); }
    g.moveTo(r.x, sy(0)).lineTo(r.x + w, sy(0)).moveTo(sx(0), r.y).lineTo(sx(0), r.y + h).stroke({ color: 0x888888, width: 1.5 });
    let started = false;
    for (let i = 0; i <= N; i++) { const y = ys[i]!; if (!Number.isFinite(y)) { started = false; continue; } const X = sx(x0 + ((x1 - x0) * i) / N), Y = Math.max(r.y, Math.min(r.y + h, sy(y))); if (!started) { g.moveTo(X, Y); started = true; } else g.lineTo(X, Y); }
    g.stroke({ color: el.stroke, width: 4, cap: 'round', join: 'round' });
    if (r.marker !== undefined && Number.isFinite(r.marker)) { const my = fn({ ...scope, x: r.marker }); if (Number.isFinite(my)) { g.circle(sx(r.marker), Math.max(r.y, Math.min(r.y + h, sy(my))), 9).fill({ color: 0xe63946 }).stroke({ color: 0xffffff, width: 3 }); } }
    if (labels.children.length === 0 && (el.xlabel || el.ylabel)) {
      const st = new TextStyle({ fontFamily: FONT.sans, fontSize: 18, fill: '#555' });
      if (el.xlabel) { const t = new Text({ text: el.xlabel, style: st }); t.anchor.set(1, 0); t.position.set(r.x + w, r.y + h + 4); labels.addChild(t); }
      if (el.ylabel) { const t = new Text({ text: el.ylabel, style: st }); t.position.set(r.x + 4, r.y - 26); labels.addChild(t); }
    }
  }

  private drawTimeline(node: Container, el: Extract<Element, { type: 'timeline' }>, r: ResolvedElement) {
    const g = node.getChildAt(0) as Graphics;
    const labels = node.getChildAt(1) as Container;
    const w = r.w ?? 800, n = el.events.length;
    g.clear();
    const horiz = el.orient === 'h';
    const len = horiz ? w : (r.h ?? 600);
    if (horiz) g.moveTo(r.x, r.y).lineTo(r.x + len, r.y); else g.moveTo(r.x, r.y).lineTo(r.x, r.y + len);
    g.stroke({ color: el.color, width: 6, cap: 'round' });
    el.events.forEach((ev, i) => {
      const p = n === 1 ? 0.5 : i / (n - 1);
      const cx = horiz ? r.x + p * len : r.x, cy = horiz ? r.y : r.y + p * len;
      g.circle(cx, cy, 12).fill({ color: 0xffffff }).stroke({ color: el.color, width: 4 });
      if (labels.children.length < n * 2) {
        const at = new Text({ text: ev.at, style: new TextStyle({ fontFamily: FONT.sans, fontSize: 20, fontWeight: 'bold', fill: el.color }) });
        const lb = new Text({ text: ev.label, style: new TextStyle({ fontFamily: FONT.sans, fontSize: 18, fill: '#222', wordWrap: true, wordWrapWidth: horiz ? Math.max(90, len / n - 10) : 360, align: horiz ? 'center' : 'left' }) });
        if (horiz) { at.anchor.set(0.5, 1); at.position.set(cx, cy - 18); lb.anchor.set(0.5, 0); lb.position.set(cx, cy + 20); }
        else { at.anchor.set(0, 0.5); at.position.set(cx + 22, cy - 14); lb.anchor.set(0, 0); lb.position.set(cx + 22, cy + 2); }
        labels.addChild(at, lb);
      }
    });
  }

  private updateParticles(node: Container, el: Extract<Element, { type: 'particles' }>, r: ResolvedElement, dt: number) {
    const st = this.particles.get(el.id)!;
    const region: BoxT = el.region ?? [0, 0, this.scene.page.w, this.scene.page.h];
    const [x0, y0, x1, y1] = region;
    const speed = (r.speed ?? 1) * r.scale;
    const preset = el.preset;
    const color = el.color ? Number(`0x${el.color.replace('#', '')}`) || 0xffffff : undefined;
    // a particle element with a path is a flow along that printed line (current, heat, light, blood, water), whatever
    // its preset; weather presets keep falling through their region
    const flow = preset === 'electrons' || (!!el.path && el.path.length >= 2 && !['rain', 'snow', 'confetti', 'leaves'].includes(preset));
    // electrons with no path of their own run round the border of their region (a circuit's loop, roughly)
    let path = el.path ?? (preset === 'electrons' ? [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]] as [number, number][] : undefined);
    // a path drawn in figure units (saved before the normaliser moved flows to page units): it fits the region's size
    // but lies outside the region, so it is moved onto the figure
    if (el.path && el.region) {
      const rw = x1 - x0, rh = y1 - y0;
      const inside = el.path.every(([x, y]) => x >= x0 - 4 && x <= x1 + 4 && y >= y0 - 4 && y <= y1 + 4);
      const figureUnits = el.path.every(([x, y]) => x >= -4 && x <= rw + 4 && y >= -4 && y <= rh + 4);
      if (!inside && figureUnits) path = el.path.map(([x, y]) => [x + x0, y + y0] as [number, number]);
    }
    // flows move at an even pace along the whole line (by length, not by segment), about 140 page units a second, with
    // one bead every 90 units or so: separate beads read as movement, a solid chain reads as a thick line
    let cum: number[] | null = null, total = 0;
    if (flow && path && path.length >= 2) { cum = [0]; for (let k = 1; k < path.length; k++) { total += Math.hypot(path[k]![0] - path[k - 1]![0], path[k]![1] - path[k - 1]![1]); cum.push(total); } }
    const beads = flow ? Math.max(6, Math.min(26, Math.round(total / 90) || 12)) : 0;
    st.acc += (r.rate ?? 40) * dt * (REDUCED_MOTION ? 0.3 : 1);
    while (st.acc >= 1 && st.list.length < (flow ? beads : 400)) {
      st.acc -= 1;
      const g = new Graphics();
      const size = (3 + Math.random() * 6) * 2.2;
      const p: Particle = { x: x0 + Math.random() * (x1 - x0), y: y0 + Math.random() * (y1 - y0), vx: 0, vy: 0, life: 0, max: 1.5 + Math.random() * 1.5, size, spin: (Math.random() - 0.5) * 4, g };
      if (flow) { p.pathT = st.list.length ? (st.list[st.list.length - 1]!.pathT ?? 0) + 1 / beads : Math.random(); p.max = 1e9; flowDot(g, preset, color); node.addChild(g); st.list.push(p); continue; }
      switch (preset) {
        case 'rain': p.y = y0 - 10; p.vy = 500 + Math.random() * 200; p.vx = -40; p.max = (y1 - y0) / p.vy + 0.2; g.rect(-2, -14, 4, 28).fill({ color: color ?? 0x5aa9ff, alpha: 0.85 }); break;
        case 'snow': p.y = y0 - 10; p.vy = 40 + Math.random() * 40; p.vx = 0; p.max = (y1 - y0) / p.vy; g.circle(0, 0, size * 0.6).fill({ color: color ?? 0xffffff, alpha: 0.9 }); break;
        case 'bubbles': p.y = y1; p.vy = -(40 + Math.random() * 60); p.max = (y1 - y0) / -p.vy; g.circle(0, 0, size).fill({ color: color ?? 0xbfe6ff, alpha: 0.35 }).stroke({ color: color ?? 0xffffff, width: 3, alpha: 0.95 }); break;
        case 'smoke': p.vy = -(30 + Math.random() * 30); p.vx = (Math.random() - 0.5) * 20; p.max = 3; g.circle(0, 0, size * 2).fill({ color: color ?? 0x999999, alpha: 0.25 }); break;
        case 'fire': p.vy = -(80 + Math.random() * 80); p.vx = (Math.random() - 0.5) * 30; p.max = 0.8; g.circle(0, 0, size).fill({ color: color ?? (Math.random() < 0.5 ? 0xff7b00 : 0xffd166), alpha: 0.9 }); break;
        case 'confetti': p.y = y0; p.vy = 120 + Math.random() * 120; p.vx = (Math.random() - 0.5) * 120; p.max = 3; g.rect(-size / 2, -size / 4, size, size / 2).fill({ color: color ?? [0xe63946, 0xffd166, 0x2a9d8f, 0x457b9d][Math.floor(Math.random() * 4)]! }); break;
        case 'leaves': p.y = y0; p.vy = 50 + Math.random() * 40; p.vx = (Math.random() - 0.5) * 60; p.max = (y1 - y0) / p.vy; g.ellipse(0, 0, size, size * 0.5).fill({ color: color ?? 0x6a994e, alpha: 0.9 }); break;
        case 'stars': p.vx = 0; p.vy = 0; p.max = 1 + Math.random() * 2; g.star(0, 0, 5, size, size / 2).fill({ color: color ?? 0xfff3b0 }); break;
        case 'dust': p.vx = (Math.random() - 0.5) * 20; p.vy = (Math.random() - 0.5) * 20; p.max = 3; g.circle(0, 0, 3.5).fill({ color: color ?? 0xffffff, alpha: 0.75 }); break;
        case 'sparkle': default: p.vx = (Math.random() - 0.5) * 30; p.vy = -20 - Math.random() * 30; p.max = 1 + Math.random(); g.star(0, 0, 4, size, size / 3).fill({ color: color ?? 0xfff3b0, alpha: 0.95 }); break;
      }
      node.addChild(g); st.list.push(p);
    }
    for (let i = st.list.length - 1; i >= 0; i--) {
      const p = st.list[i]!;
      p.life += dt;
      if (flow && path && cum && total > 0) {
        p.pathT = ((p.pathT ?? 0) + (dt * 140 * Math.max(0.2, speed)) / total) % 1;
        const d = p.pathT * total; let k = 1; while (k < cum.length - 1 && cum[k]! < d) k++;
        const a = path[k - 1]!, b = path[k]!, segLen = Math.max(1e-6, cum[k]! - cum[k - 1]!), f = (d - cum[k - 1]!) / segLen;
        p.x = a[0] + (b[0] - a[0]) * f; p.y = a[1] + (b[1] - a[1]) * f;
      } else {
        p.x += p.vx * dt * speed; p.y += p.vy * dt * speed;
        if (preset === 'snow' || preset === 'leaves') p.x += Math.sin(p.life * 3 + p.size) * 30 * dt;
        if (preset === 'confetti') p.vy += 100 * dt;
      }
      const t = p.life / p.max;
      p.g.position.set(p.x, p.y); p.g.rotation += p.spin * dt;
      p.g.alpha = preset === 'rain' ? 0.7 : flow ? 1 : t < 0.2 ? t / 0.2 : 1 - Math.max(0, (t - 0.6) / 0.4);
      if (preset === 'stars') p.g.scale.set(0.6 + 0.4 * Math.sin(p.life * 6));
      if (p.life >= p.max || p.y > y1 + 20 || p.y < y0 - 40 || p.x < x0 - 30 || p.x > x1 + 30) { node.removeChild(p.g); p.g.destroy(); st.list.splice(i, 1); }
    }
  }

  private updateHighlights(now: number) {
    const want = new Set(this.runtime.highlightedAnchors());
    for (const id of want) {
      let g = this.highlights.get(id);
      if (!g) { g = new Graphics(); this.layers.under.addChild(g); this.highlights.set(id, g); }
      const box = this.scene.anchors[id]; if (!box) continue;
      const [x0, y0, x1, y1] = box;
      const pulse = 0.55 + 0.25 * Math.sin(now * 4);
      g.clear(); roughRect(g, x0 - 12, y0 - 12, x1 - x0 + 24, y1 - y0 + 24, 3); g.stroke({ color: MARKER, width: 6, alpha: pulse }).fill({ color: 0xfff9c4, alpha: 0.12 });
      g.visible = true;
    }
    // elements the tutor or a step points at: a ring around what is drawn
    for (const id of this.runtime.highlightedIds()) {
      if (id in this.scene.anchors) continue;
      const node = this.nodes.get(id); if (!node || !node.visible) continue;
      want.add(id);
      let g = this.highlights.get(id);
      if (!g) { g = new Graphics(); this.layers.under.addChild(g); this.highlights.set(id, g); }
      const b = node.getLocalBounds(); const pad = 12;
      const x0 = node.position.x + b.x * node.scale.x, y0 = node.position.y + b.y * node.scale.y, w = b.width * node.scale.x, h = b.height * node.scale.y;
      if (!(w > 0 && h > 0)) continue;
      const pulse = 0.55 + 0.25 * Math.sin(now * 4);
      g.clear(); roughRect(g, x0 - pad, y0 - pad, w + pad * 2, h + pad * 2, 5); g.stroke({ color: MARKER, width: 6, alpha: pulse }).fill({ color: 0xfff9c4, alpha: 0.12 });
      g.visible = true;
    }
    for (const [id, g] of this.highlights) if (!want.has(id)) g.visible = false;
  }

  /** Stop drawing (and the simulation clock) while the scene is off screen; resume() picks up where it left off. */
  pause() { if (!this.destroyed && this.app?.ticker.started) this.app.ticker.stop(); }
  resume() { if (!this.destroyed && this.app && !this.app.ticker.started) this.app.ticker.start(); }
  get paused() { return !!this.app && !this.app.ticker.started; }

  destroy() {
    this.destroyed = true;
    try { this.app?.destroy(false, { children: true }); } catch { /* already gone */ }
  }
}

/** One bead of a flow: bold enough to read across a room, with a soft halo; its look follows the preset. */
function flowDot(g: Graphics, preset: string, color: number | undefined) {
  const c = color ?? ({ electrons: 0x00c2ff, fire: 0xff7b00, bubbles: 0x4aa8ff, smoke: 0x8a8a8a, stars: 0xffc23d, sparkle: 0xffc23d, dust: 0x8a6d3b } as Record<string, number>)[preset] ?? 0xff4d4d;
  g.circle(0, 0, 17).fill({ color: c, alpha: 0.16 });
  if (preset === 'stars' || preset === 'sparkle') g.star(0, 0, 5, 12, 5).fill({ color: c }).stroke({ color: 0xffffff, width: 2.5 });
  else if (preset === 'bubbles') g.circle(0, 0, 9).fill({ color: c, alpha: 0.35 }).stroke({ color: c, width: 3 });
  else g.circle(0, 0, 9).fill({ color: c }).stroke({ color: 0xffffff, width: 2.5 });
}

function hashId(id: string) { let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 1000; return h / 1000 * Math.PI * 2; }

/** Generated images arrive on a plain white background (no alpha from the image models); key the white out with a
 *  soft threshold so sprites sit on the page without a box. */
async function loadKeyedTexture(url: string, key: boolean): Promise<Texture> {
  if (!key) return Assets.load(url);
  const img = new Image(); img.crossOrigin = 'anonymous';
  await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error('image load failed')); img.src = url; });
  const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
  c.getContext('2d', { willReadFrequently: true })!.drawImage(img, 0, 0);
  return keyCanvas(c, 1).texture;
}

/** Key out the background of a canvas: flood from the edges over pixels close to the border's median colour. `strength` 0 = off. */
function keyCanvas(c: HTMLCanvasElement, strength: number, tight = false): { texture: Texture; color: number } {
  if (!strength || c.width < 4 || c.height < 4) return { texture: Texture.from(c), color: 0xffffff };
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  const d = ctx.getImageData(0, 0, c.width, c.height); const p = d.data;
  // the background is whatever colour the border is (white, off-white, a flat tint); key it by distance from the
  // border's median colour, flooding from the edges so similar colours inside the subject stay opaque
  const w = c.width, h = c.height, seen = new Uint8Array(w * h), stack: number[] = [];
  const samples: number[][] = [];
  for (let x = 0; x < w; x += 3) { samples.push([p[x * 4]!, p[x * 4 + 1]!, p[x * 4 + 2]!], [p[((h - 1) * w + x) * 4]!, p[((h - 1) * w + x) * 4 + 1]!, p[((h - 1) * w + x) * 4 + 2]!]); }
  for (let y = 0; y < h; y += 3) { samples.push([p[(y * w) * 4]!, p[(y * w) * 4 + 1]!, p[(y * w) * 4 + 2]!], [p[(y * w + w - 1) * 4]!, p[(y * w + w - 1) * 4 + 1]!, p[(y * w + w - 1) * 4 + 2]!]); }
  const med = (k: number) => samples.map((s) => s[k]!).sort((a, b) => a - b)[Math.floor(samples.length / 2)]!;
  const bg = [med(0), med(1), med(2)];
  const TOL = 34;
  const near = (i: number, c: number[]) => Math.abs(p[i * 4]! - c[0]!) < TOL && Math.abs(p[i * 4 + 1]! - c[1]!) < TOL && Math.abs(p[i * 4 + 2]! - c[2]!) < TOL;
  // flood from every border pixel with that pixel's own colour as the reference, so a cut-out that spans sky and
  // sea loses both; the subject survives because its colours differ from whatever surrounds it
  const seeds: number[] = [];
  for (let x = 0; x < w; x++) { seeds.push(x, (h - 1) * w + x); } for (let y = 0; y < h; y++) { seeds.push(y * w, y * w + w - 1); }
  for (const s0 of seeds) {
    if (seen[s0]) continue;
    const ref = [p[s0 * 4]!, p[s0 * 4 + 1]!, p[s0 * 4 + 2]!];
    if (!near(s0, bg) && Math.max(Math.abs(ref[0]! - bg[0]!), Math.abs(ref[1]! - bg[1]!), Math.abs(ref[2]! - bg[2]!)) < 12) continue; // same as the median: handled by the main flood below
    stack.push(s0);
    while (stack.length) { const i = stack.pop()!; if (seen[i] || !near(i, ref)) continue; seen[i] = 1; const x = i % w, y = (i / w) | 0; if (x > 0) stack.push(i - 1); if (x < w - 1) stack.push(i + 1); if (y > 0) stack.push(i - w); if (y < h - 1) stack.push(i + w); }
  }
  for (let i = 0; i < w * h; i++) {
    if (seen[i]) { p[i * 4 + 3] = 0; continue; }
    // soften the edge: pixels next to background get partial alpha based on brightness
    const x = i % w, y = (i / w) | 0;
    const nb = (x > 0 && seen[i - 1]) || (x < w - 1 && seen[i + 1]) || (y > 0 && seen[i - w]) || (y < h - 1 && seen[i + w]);
    if (nb) { const dist = Math.max(Math.abs(p[i * 4]! - bg[0]!), Math.abs(p[i * 4 + 1]! - bg[1]!), Math.abs(p[i * 4 + 2]! - bg[2]!)); p[i * 4 + 3] = Math.round(255 * Math.min(1, Math.max(0.35, dist / 80))); }
  }
  if (tight) {
    // keep the main drawing only: the largest opaque component, plus whatever overlaps its neighbourhood (an eye, a beak,
    // a dropped piece of cheese); stray print such as a caption beside the character is cleared
    const comp = new Int32Array(w * h).fill(-1);
    const boxes: { n: number; x0: number; y0: number; x1: number; y1: number }[] = [];
    const q: number[] = [];
    for (let s0 = 0; s0 < w * h; s0++) {
      if (comp[s0] !== -1 || p[s0 * 4 + 3]! <= 8) continue;
      const k = boxes.length; boxes.push({ n: 0, x0: w, y0: h, x1: -1, y1: -1 }); q.push(s0); comp[s0] = k;
      while (q.length) { const i = q.pop()!; const b = boxes[k]!; const x = i % w, y = (i / w) | 0; b.n++; if (x < b.x0) b.x0 = x; if (x > b.x1) b.x1 = x; if (y < b.y0) b.y0 = y; if (y > b.y1) b.y1 = y;
        for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) if (j >= 0 && comp[j] === -1 && p[j * 4 + 3]! > 8) { comp[j] = k; q.push(j); } }
    }
    if (boxes.length > 1) {
      const main = boxes.reduce((a, b) => (b.n > a.n ? b : a));
      const mx = (main.x1 - main.x0) * 0.1 + 4, my = (main.y1 - main.y0) * 0.1 + 4;
      // small pieces entirely below the drawing are a caption, not part of the character
      const keep = boxes.map((b) => b === main || (b.x0 < main.x1 + mx && b.x1 > main.x0 - mx && b.y0 < main.y1 + my && b.y1 > main.y0 - my && !(b.n < main.n * 0.05 && b.y0 >= main.y1 - 2)));
      for (let i = 0; i < w * h; i++) if (comp[i]! >= 0 && keep[comp[i]!] !== true) p[i * 4 + 3] = 0;
    }
  }
  ctx.putImageData(d, 0, 0);
  // trim the transparent margins so the drawing fills the box the scene gives it
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let i = 0; i < w * h; i++) if (p[i * 4 + 3]! > 8) { const x = i % w, y = (i / w) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const color = (bg[0]! << 16) | (bg[1]! << 8) | bg[2]!;
  if (x1 < 0) return { texture: Texture.from(c), color };
  const pad = 2, tx = Math.max(0, x0 - pad), ty = Math.max(0, y0 - pad), tw = Math.min(w, x1 + pad + 1) - tx, th = Math.min(h, y1 + pad + 1) - ty;
  if (tw < w * 0.92 || th < h * 0.92) {
    const t = document.createElement('canvas'); t.width = tw; t.height = th;
    t.getContext('2d')!.drawImage(c, tx, ty, tw, th, 0, 0, tw, th);
    return { texture: Texture.from(t), color };
  }
  return { texture: Texture.from(c), color };
}

/** A paper-coloured patch with soft edges, sized like the cut-out it hides. */
function coverTexture(w: number, h: number, color: number): Texture {
  const c = document.createElement('canvas'); c.width = Math.max(2, Math.round(w)); c.height = Math.max(2, Math.round(h));
  const ctx = c.getContext('2d')!;
  const hex = `#${color.toString(16).padStart(6, '0')}`;
  ctx.fillStyle = hex; ctx.fillRect(0, 0, c.width, c.height);
  // feather the edge: erase a soft frame so the patch blends into the surrounding print
  const f = Math.max(2, Math.round(Math.min(c.width, c.height) * 0.08));
  ctx.globalCompositeOperation = 'destination-in';
  const g = ctx.createLinearGradient(0, 0, 0, c.height); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(f / c.height, 'rgba(0,0,0,1)'); g.addColorStop(1 - f / c.height, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, c.width, c.height);
  const g2 = ctx.createLinearGradient(0, 0, c.width, 0); g2.addColorStop(0, 'rgba(0,0,0,0)'); g2.addColorStop(f / c.width, 'rgba(0,0,0,1)'); g2.addColorStop(1 - f / c.width, 'rgba(0,0,0,1)'); g2.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g2; ctx.fillRect(0, 0, c.width, c.height);
  return Texture.from(c);
}

/** Simple procedural textures for builtin assets so a missing library never breaks a scene. */
function builtinTexture(app: Application, name: string): Texture {
  const g = new Graphics();
  switch (name) {
    case 'tree': g.rect(-8, 0, 16, 40).fill(0x8d5a2b).circle(0, -10, 34).fill(0x3a7d44); break;
    case 'sun': g.circle(0, 0, 30).fill(0xffd166); for (let i = 0; i < 8; i++) g.moveTo(Math.cos(i * Math.PI / 4) * 38, Math.sin(i * Math.PI / 4) * 38).lineTo(Math.cos(i * Math.PI / 4) * 52, Math.sin(i * Math.PI / 4) * 52).stroke({ color: 0xffd166, width: 5 }); break;
    case 'cloud': g.circle(-20, 0, 18).circle(0, -10, 24).circle(22, 2, 18).rect(-24, 0, 48, 18).fill(0xffffff); break;
    case 'drop': g.moveTo(0, -24).quadraticCurveTo(22, 10, 0, 22).quadraticCurveTo(-22, 10, 0, -24).fill(0x4cc9f0); break;
    case 'ball': g.circle(0, 0, 28).fill(0xe63946); break;
    case 'arrow-up': g.poly([0, -30, 20, 0, 8, 0, 8, 30, -8, 30, -8, 0, -20, 0]).fill(0x2a9d8f); break;
    case 'heart': g.moveTo(0, 20).bezierCurveTo(-40, -10, -10, -40, 0, -18).bezierCurveTo(10, -40, 40, -10, 0, 20).fill(0xe63946); break;
    default: g.roundRect(-30, -30, 60, 60, 12).fill(0x457b9d); break;
  }
  return app.renderer.generateTexture({ target: g, resolution: 2 });
}
