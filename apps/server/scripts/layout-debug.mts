// Re-run the layout on a saved experience and explain each label's fate. pnpm exec tsx scripts/layout-debug.mts <id>
import { InkField, layoutScene, SceneRuntime } from '../../../packages/scene/src/index.ts';
const BASE = process.env.LB_SERVER || 'http://localhost:8080';
const rec = await fetch(`${BASE}/api/experiences/${process.argv[2]}`).then((r) => r.json());
const ink = rec.page.ink; const field = new InkField(ink);
for (const el of rec.scene.elements) if (el.type === 'label') console.log('label', el.id, JSON.stringify(el.text).slice(0, 50), 'at', el.x, el.y, 'size', el.size, 'maxW', el.maxW ?? '-', 'anchor', el.anchor ?? '-');
const probe: [number, number, number, number][] = [[80, 560, 380, 700], [60, 540, 420, 780], [700, 1150, 980, 1290]];
for (const b of probe) console.log('probe', JSON.stringify(b), 'mean', field.mean(b).toFixed(3), 'max', field.max(b).toFixed(3));
const copy = JSON.parse(JSON.stringify(rec.scene)); const issues: any[] = [];
const r = layoutScene(copy, ink, issues);
console.log('layout again:', JSON.stringify(r), '|', issues.map((i) => `${i.where}: ${i.message}`).join(' | '));
for (const el of copy.elements) if (el.type === 'label') console.log('  now', el.id, 'at', el.x, el.y, 'maxW', el.maxW ?? '-');
