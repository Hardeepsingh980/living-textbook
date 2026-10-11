// Exercise the live tutor proxy end to end without a browser: connect, ask in text, execute forwarded tool calls on a
// real SceneRuntime (as the browser would), and print transcripts.  pnpm exec tsx scripts/live-test.mts <experienceId> "<question>" ...
import { SceneRuntime, executeTool } from '../../../packages/scene/src/index.ts';
const [id, ...questions] = process.argv.slice(2);
const rec = await fetch(`http://localhost:8080/api/experiences/${id}`).then((r) => r.json());
const rt = new SceneRuntime(rec.scene);
const ws = new WebSocket('ws://localhost:8080/api/live');
const log = (...a: unknown[]) => console.log(`${String(((performance.now() - t0) / 1000).toFixed(1)).padStart(5)}s`, ...a);
const t0 = performance.now();
let audioChunks = 0, modelText = '', ready = false, turns = 0, qi = 0;
const ask = () => { if (qi < questions.length) { const q = questions[qi++]!; log('YOU:', q); ws.send(JSON.stringify({ type: 'text', text: q })); } else { log('done'); ws.send(JSON.stringify({ type: 'end' })); setTimeout(() => process.exit(0), 300); } };
ws.onopen = () => ws.send(JSON.stringify({ type: 'start', experienceId: id, state: rt.values() }));
ws.onmessage = (e) => {
  const m = JSON.parse(String(e.data));
  if (m.type === 'ready') { ready = true; log('ready'); ask(); }
  else if (m.type === 'audio') audioChunks++;
  else if (m.type === 'transcript' && m.role === 'model') modelText += m.text;
  else if (m.type === 'tool') { const result = executeTool(rt, m.name, m.args); log('TOOL', m.name, JSON.stringify(m.args), '->', JSON.stringify(result).slice(0, 160)); ws.send(JSON.stringify({ type: 'tool-result', id: m.id, result })); }
  else if (m.type === 'turnComplete') { turns++; log(`TUTOR: ${modelText.trim() || '(tool turn)'} [${audioChunks} audio chunks]`); const spoke = audioChunks > 0; modelText = ''; audioChunks = 0; if (spoke) setTimeout(ask, 600); }
  else if (m.type === 'interrupted') log('interrupted');
  else if (m.type === 'reconnecting') log('reconnecting');
  else if (m.type === 'error' || m.type === 'closed') log(m.type, m.message ?? m.reason ?? '');
};
ws.onclose = () => { log('socket closed'); process.exit(0); };
setTimeout(() => { log('timeout; ready =', ready, 'turns =', turns); process.exit(1); }, 90000);
