// Why did a label land where it did? Measure the ink under each readable overlay of a saved experience with its own ink map.
import { InkField, layoutScene, SceneRuntime } from '../../../packages/scene/src/index.ts';
const BASE = process.env.LB_SERVER || 'http://localhost:8080';
const rec = await fetch(`${BASE}/api/experiences/${process.argv[2]}`).then((r) => r.json());
const ink = rec.page.ink; const field = new InkField(ink);
console.log('page', rec.page.w, rec.page.h, 'ink cols', ink.cols, 'cell', (rec.page.w / ink.cols).toFixed(1));
const rt = new SceneRuntime(rec.scene); const scope = rt.values();
for (const el of rec.scene.elements) {
  if (el.type !== 'label' && el.type !== 'bubble') continue;
  const an = el.anchor ? rec.scene.anchors[el.anchor] : [0, 0];
  const x = typeof el.x === 'number' ? el.x + an[0] : `expr(${el.x})`, y = typeof el.y === 'number' ? el.y + an[1] : `expr(${el.y})`;
  if (typeof x !== 'number' || typeof y !== 'number') { console.log(el.id, 'position is an expression:', x, y); continue; }
  const w = Math.max(1, el.text.replace(/\{[^}]*\}/g, '00.0').length) * (el.size ?? 28) * 0.56, h = (el.size ?? 28) * 1.6;
  const box: [number, number, number, number] = [x - w / 2, y - h / 2, x + w / 2, y + h / 2];
  console.log(el.id.padEnd(14), JSON.stringify(el.text).slice(0, 36).padEnd(38), 'at', Math.round(x), Math.round(y), 'ink mean', field.mean(box).toFixed(3), 'max', field.max(box).toFixed(3), 'anchor', el.anchor ?? '-');
}
const copy = JSON.parse(JSON.stringify(rec.scene)); const issues: any[] = [];
const r = layoutScene(copy, ink, issues); console.log('layout now:', JSON.stringify(r), issues.map((i) => i.message).join(' | '));
