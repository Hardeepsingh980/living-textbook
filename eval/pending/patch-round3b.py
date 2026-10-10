root='/Users/hardeepsingh/Documents/Development/living_books/'
# ---- deterministic numeric faithfulness: numbers shown in labels or used as initial values must be on the page ----
p=root+'apps/server/src/pipeline.ts'; s=open(p).read()
old="""      const unsupported: string[] = Array.isArray(r.json.unsupported) ? r.json.unsupported.filter((s: any) => typeof s === 'string') : [];"""
new="""      const unsupported: string[] = Array.isArray(r.json.unsupported) ? r.json.unsupported.filter((s: any) => typeof s === 'string') : [];
      // deterministic: every plain number a reader sees (label text outside {templates}, slider initial values) must appear on the page
      const pageNums = new Set<string>();
      const addNum = (v: unknown) => { const n = Number(v); if (Number.isFinite(n)) { pageNums.add(String(n)); pageNums.add(n.toFixed(1)); pageNums.add(n.toFixed(2)); } };
      for (const v of ex.values) addNum(v.value);
      for (const w of ex.worked) { addNum(w.answer); for (const i of w.inputs ?? []) addNum(i.value); }
      for (const m of `${ex.text} ${ex.claims.join(' ')} ${ex.equations.join(' ')}`.matchAll(/\\d+(?:[.,]\\d+)?/g)) addNum(m[0].replace(',', '.'));
      const invented: string[] = [];
      for (const el of scene.elements) {
        if (el.type !== 'label' && el.type !== 'bubble') continue;
        const plain = el.text.replace(/\\{[^}]*\\}/g, ' ');
        for (const m of plain.matchAll(/\\d+(?:[.,]\\d+)?/g)) { const n = Number(m[0].replace(',', '.')); if (!pageNums.has(String(n)) && !pageNums.has(n.toFixed(1)) && !pageNums.has(n.toFixed(2)) && n !== 0 && n !== 1) invented.push(`${el.id}: "${m[0]}"`); }
      }
      for (const v of scene.vars) if (v.role === 'param' && v.init !== 0 && v.init !== 1 && !pageNums.has(String(v.init)) && !pageNums.has(v.init.toFixed(1))) invented.push(`${v.id} starts at ${v.init}`);
      if (invented.length) {
        // repair: strip the offending labels and let the verdict say why
        const fixed = structuredClone(scene);
        const bad = new Set(invented.map((x) => x.split(':')[0]!));
        fixed.elements = fixed.elements.filter((e) => !(bad.has(e.id) && (e.type === 'label' || e.type === 'bubble')));
        const n = normalizeScene(fixed); if (n.scene && fixed.elements.length < scene.elements.length) { scene = n.scene; repaired = true; }
        unsupported.push(...invented.map((x) => `number not on the page: ${x}`));
      }"""
assert old in s; s=s.replace(old,new); open(p,'w').write(s)
# ---- prompt: number formats and the no-invented-numbers rule in the readable section ----
p=root+'apps/server/src/prompts.ts'; s=open(p).read()
old="""4. FAITHFUL: every number, formula, name, event and line of dialogue must come from the page. Invent nothing. If the page has no numbers, do not add any."""
new="""4. FAITHFUL: every number, formula, name, event and line of dialogue must come from the page. Invent nothing: no made-up rates, percentages, masses or counts; a page without numbers gets no numeric labels and no sliders. Use fmt "0" for counts and years ({year:0}), "0.1" or "0.01" for measured values."""
assert old in s; s=s.replace(old,new); open(p,'w').write(s)
print('round-3b patch applied')
# ---- richer scene: tighter token budget, longer timeout (3 of 10 timed out at 40 s under load) ----
p=root+'apps/server/src/pipeline.ts'; s=open(p).read()
old="""parts: sceneParts, maxTokens: 3800, thinking: 'minimal', mediaResolution: 'medium', temperature: 0.5, label: 'scene-rich' }), 40000, 'scene rich');"""
new="""parts: sceneParts, maxTokens: 3200, thinking: 'minimal', mediaResolution: 'medium', temperature: 0.5, label: 'scene-rich' }), 60000, 'scene rich');"""
assert old in s; s=s.replace(old,new); open(p,'w').write(s)
print('rich scene budget patched')
