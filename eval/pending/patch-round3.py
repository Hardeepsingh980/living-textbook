# Applied only after the running evaluation completes (server edits restart the dev server).
import re
root='/Users/hardeepsingh/Documents/Development/living_books/'
# ---- quick read: text block boxes too, so free regions for labels can be computed ----
p=root+'apps/server/src/prompts.ts'; s=open(p).read()
old="""- "figures": the key visual elements (diagrams, illustrations, photos, tables, maps, equations) with box_2d as [ymin, xmin, ymax, xmax] normalized to 0-1000. Up to 6, largest first. Short labels. Skip body text blocks."""
new="""- "figures": the key visual elements (diagrams, illustrations, photos, tables, maps, equations) with box_2d as [ymin, xmin, ymax, xmax] normalized to 0-1000. Up to 6, largest first. Short labels. Skip body text blocks.
- "textBlocks": the body text blocks (paragraph groups, headings) as box_2d, up to 6, so labels can avoid them."""
assert old in s; s=s.replace(old,new)
old="""    figures: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, label: { type: 'string' }, kind: { type: 'string', enum: ['diagram', 'illustration', 'photo', 'table', 'equation', 'map', 'other'] }, box_2d: { type: 'array', items: { type: 'integer' } } }, required: ['id', 'label', 'kind', 'box_2d'] } },"""
new="""    figures: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, label: { type: 'string' }, kind: { type: 'string', enum: ['diagram', 'illustration', 'photo', 'table', 'equation', 'map', 'other'] }, box_2d: { type: 'array', items: { type: 'integer' } } }, required: ['id', 'label', 'kind', 'box_2d'] } },
    textBlocks: { type: 'array', items: { type: 'object', properties: { box_2d: { type: 'array', items: { type: 'integer' } } }, required: ['box_2d'] } },"""
assert old in s; s=s.replace(old,new)
s=s.replace("  required: ['kind', 'subject', 'language', 'title', 'gist', 'figures', 'characters', 'spread', 'confidence', 'opener'],\n  propertyOrdering: ['kind', 'subject', 'language', 'title', 'gist', 'opener', 'figures', 'characters', 'spread', 'confidence', 'bookTitle'],",
            "  required: ['kind', 'subject', 'language', 'title', 'gist', 'figures', 'textBlocks', 'characters', 'spread', 'confidence', 'opener'],\n  propertyOrdering: ['kind', 'subject', 'language', 'title', 'gist', 'opener', 'figures', 'textBlocks', 'characters', 'spread', 'confidence', 'bookTitle'],")
# scene prompt: free regions + rules
old="""export function sceneSystem(quick: QuickRead, page: { w: number; h: number }): string {"""
new="""export function sceneSystem(quick: QuickRead, page: { w: number; h: number }, freeRegions: number[][] = []): string {"""
assert old in s; s=s.replace(old,new)
old="""Characters: ${JSON.stringify(quick.characters)}"""
new="""Characters: ${JSON.stringify(quick.characters)}
Free regions with no printed text (page units [x0,y0,x1,y1]) — put labels, readouts and plots here or inside empty parts of the figure, never elsewhere: ${JSON.stringify(freeRegions.map((r) => r.map(Math.round)))}"""
assert old in s; s=s.replace(old,new)
old="""5. READABLE: labels size ≥ 26 with a "bg" colour, ≤ 6 words, live values via {expr:fmt}; at most one label per idea."""
new="""5. READABLE: labels size ≥ 26 with a "bg" colour, ≤ 6 words, live values via {expr:fmt}; at most one label per idea. Never re-print a label or caption that is already printed in the figure; your labels add NEW information (a live value, the answer, the name of the step). Explain with MOTION, not text: particles that flow along a path (CO₂ into a leaf, water up a stem, electrons round a circuit), arrows that draw themselves, objects that travel; one motion per idea.
5b. When the printed figure already has the structure (a timeline, a circuit, a map, a graph), animate ON it: place markers, highlights and moving objects exactly on the printed lines and points (read them from the grid); never draw a second copy beside it."""
assert old in s; s=s.replace(old,new)
open(p,'w').write(s)

# ---- protocol: textBlocks on QuickRead ----
p=root+'packages/scene/src/protocol.ts'; s=open(p).read()
s=s.replace("  figures: { id: string; label: string; box: BoxT; kind: 'diagram' | 'illustration' | 'photo' | 'table' | 'equation' | 'map' | 'other' }[];",
            "  figures: { id: string; label: string; box: BoxT; kind: 'diagram' | 'illustration' | 'photo' | 'table' | 'equation' | 'map' | 'other' }[];\n  textBlocks?: BoxT[];")
open(p,'w').write(s)

# ---- pipeline: parse textBlocks, compute free regions, pass to sceneSystem; tracking gate after scene parts; log v1 issues ----
p=root+'apps/server/src/pipeline.ts'; s=open(p).read()
old="""    characters: (Array.isArray(q.characters) ? q.characters : []).slice(0, 8).map((c: any) => ({ name: String(c.name ?? ''), look: String(c.look ?? '') })),"""
new="""    textBlocks: (Array.isArray(q.textBlocks) ? q.textBlocks : []).slice(0, 8).map((b: any) => toPageBox(b.box_2d ?? [0, 0, 0, 0], page.w, page.h)),
    characters: (Array.isArray(q.characters) ? q.characters : []).slice(0, 8).map((c: any) => ({ name: String(c.name ?? ''), look: String(c.look ?? '') })),"""
assert old in s; s=s.replace(old,new)
old="""  send({ type: 'quick', data: quick, t: T() });
  releaseTracking();"""
new="""  send({ type: 'quick', data: quick, t: T() });"""
assert old in s; s=s.replace(old,new)
old="""  const system = sceneSystem(quick, page);
  // the main figure, cropped and overlaid with a labelled grid"""
new="""  const system = sceneSystem(quick, page, freeRegions(page, quick));
  // the main figure, cropped and overlaid with a labelled grid"""
assert old in s; s=s.replace(old,new)
old="""  const sceneParts = [imagePart(pageJpeg), ...gridParts, { text: `Quick read of the page: ${JSON.stringify({ kind: quick.kind, subject: quick.subject, title: quick.title, gist: quick.gist })}\\nCompose the LivingScene JSON now.` }];"""
new="""  const sceneParts = [imagePart(pageJpeg), ...gridParts, { text: `Quick read of the page: ${JSON.stringify({ kind: quick.kind, subject: quick.subject, title: quick.title, gist: quick.gist })}\\nCompose the LivingScene JSON now.` }];
  releaseTracking(); // the compile is CPU-heavy; it starts once the scene requests are on their way"""
assert old in s; s=s.replace(old,new)
old="""      const n1 = normalizeScene({ ...r1.json, page, v: 1, anchors: { ...anchorsFromQuick, ...(r1.json.anchors ?? {}) } });
      issues = n1.issues;"""
new="""      const n1 = normalizeScene({ ...r1.json, page, v: 1, anchors: { ...anchorsFromQuick, ...(r1.json.anchors ?? {}) } });
      issues = n1.issues;
      if (!n1.scene) console.warn('[build] v1 invalid:', issues.slice(0, 4).map((i) => `${i.where}: ${i.message}`).join(' | ').slice(0, 300));"""
assert old in s; s=s.replace(old,new)
# free regions helper at end of file
s=s.replace("export { SceneSchema };","""/** Rectangles of the page that hold neither body text nor figures: the margins and the gaps between blocks. */
function freeRegions(page: { w: number; h: number }, quick: QuickRead): number[][] {
  const blocks = [...(quick.textBlocks ?? []), ...quick.figures.map((f) => f.box)].filter((b) => b[2] > b[0] && b[3] > b[1]);
  if (!blocks.length) return [[0, 0, page.w, page.h]];
  const out: number[][] = [];
  // horizontal bands between stacked blocks (sorted by top), plus the bands above the first and below the last
  const sorted = [...blocks].sort((a, b) => a[1] - b[1]);
  let y = 0;
  for (const b of sorted) { if (b[1] - y >= 70) out.push([0, y, page.w, b[1]]); y = Math.max(y, b[3]); }
  if (page.h - y >= 70) out.push([0, y, page.w, page.h]);
  // side margins next to the main figure
  const f = quick.figures[0]?.box;
  if (f) { if (f[0] >= 90) out.push([0, f[1], f[0], f[3]]); if (page.w - f[2] >= 90) out.push([f[2], f[1], page.w, f[3]]); }
  return out.slice(0, 6);
}

export { SceneSchema };""")
open(p,'w').write(s)
print('round-3 patch applied')
