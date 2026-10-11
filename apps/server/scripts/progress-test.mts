// Exercise the progress path without a browser sign-in: a test reader's events go to Firestore and BigQuery, then the
// insights are computed from both. The test reader's documents are removed afterwards.
import { recordEvent, insights, me } from '../src/progress.js';
import { store } from '../src/store.js';
const user = { uid: 'test-progress-reader', name: 'Test Reader', email: 'test@example.com' };
const pages = [
  { experienceId: '9aee2e9b-606b-4086-bb15-1f872b687149', title: 'Motion and Time', subject: 'science', kind: 'science', totalSteps: 3 },
  { experienceId: '26361c93-7794-401c-99a7-9c4c6c9d30c9', title: 'Resistors in Series', subject: 'science', kind: 'science', totalSteps: 3 },
  { experienceId: 'd9f920c7-a321-43dd-9410-57ae8c618b15', title: 'Triangles', subject: 'maths', kind: 'maths', totalSteps: 1 },
];
for (const p of pages) {
  await recordEvent(user, user.uid, { ...p, event: 'lesson_open' }, 'test');
  for (let s = 0; s < p.totalSteps; s++) await recordEvent(user, user.uid, { ...p, event: 'step', step: s }, 'test');
  await recordEvent(user, user.uid, { ...p, event: 'time', durationMs: 95000 }, 'test');
  await recordEvent(user, user.uid, { ...p, event: 'question', detail: 'why does it slow down?' }, 'test');
  const right = p.subject === 'maths' ? [1, 0, 0, 1] : [1, 1, 0, 1];
  right.forEach((r, k) => void recordEvent(user, user.uid, { ...p, event: 'quiz_answer', value: r, step: k, detail: `Question ${k + 1} about ${p.title} | chose: x | right: y` }, 'test'));
  await recordEvent(user, user.uid, { ...p, event: 'quiz', value: right.reduce((a, b) => a + b, 0), detail: `${right.reduce((a, b) => a + b, 0)} of 4` }, 'test');
}
console.log('events sent; waiting for BigQuery to take them');
await new Promise((r) => setTimeout(r, 9000));
const m = await me(user);
console.log('lessons:', m.lessons.map((l) => `${l.title} steps ${l.steps}/${l.totalSteps} done ${l.completed} ${Math.round(l.seconds)}s q${l.questions} quiz ${l.quiz?.best}/${l.quiz?.total}`).join(' | '));
const ins = await insights(user, true);
console.log('stats:', JSON.stringify(ins.stats));
console.log('source:', ins.source, '| days:', JSON.stringify(ins.daily), '| missed:', ins.missed.length);
console.log('bySubject:', JSON.stringify(ins.bySubject));
console.log('summary:', ins.summary);
for (const s of ins.suggestions) console.log('-', s.title, ':', s.line, s.experienceId ? `(${s.experienceId.slice(0, 8)})` : '');
process.exit(0);
