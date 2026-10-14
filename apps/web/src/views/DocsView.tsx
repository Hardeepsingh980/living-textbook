// The developer docs (/developers): how a learning app puts Living Textbook inside itself. The embed (lesson player
// and scanner), the REST API, the Node SDK, keys, limits, errors, security. Addresses use the site the docs are
// served from, so every example works as written.
import { useEffect, type ReactNode } from 'react';
import { Link } from '../lib/nav';
import { useReader } from '../lib/firebase';
import { CodeBlock } from '../components/CodeBlock';
import '../dev.css';

const SECTIONS: [string, string][] = [
  ['overview', 'Overview'], ['quickstart', 'Quick start'], ['keys', 'Keys'], ['embed', 'Show a lesson'], ['scanner', 'The scanner'],
  ['events', 'Events and commands'], ['api', 'REST API'], ['lesson-object', 'The lesson object'], ['errors', 'Errors'],
  ['limits', 'Limits'], ['node', 'Node SDK'], ['iframes', 'Plain iframes'], ['security', 'Security and privacy'],
];

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return <section id={id} className="doc-section"><h2><a href={`#${id}`}>{title}</a></h2>{children}</section>;
}
function Endpoint({ method, path, children }: { method: string; path: string; children: ReactNode }) {
  return <div className="endpoint"><div className="endpoint-head"><span className={`method ${method.toLowerCase()}`}>{method}</span><code>{path}</code></div>{children}</div>;
}

export function DocsView() {
  const reader = useReader();
  const H = location.origin;
  useEffect(() => {
    document.title = 'Developers · Living Textbook';
    const id = location.hash.slice(1);
    if (id) window.setTimeout(() => document.getElementById(id)?.scrollIntoView(), 50);
    return () => { document.title = 'Living Textbook'; };
  }, []);

  const lessonJson = `{
  "id": "8e55085a-7759-41b3-a566-62673912200a",
  "object": "lesson",
  "created_at": "2026-10-14T09:12:44.120Z",
  "status": "ready",
  "title": "Transfer of Heat",
  "subject": "Science",
  "kind": "science",
  "language": "en",
  "summary": "Heat flows along a metal rod from the hot end to the cold end.",
  "steps": [
    { "index": 0, "title": "Heating the rod", "narration": "When one end of a metal rod is heated..." },
    { "index": 1, "title": "Wax falls", "narration": "The wax pieces nearest the flame melt first..." }
  ],
  "verification": { "status": "faithful", "summary": "...", "checks": 4, "passed": 4 },
  "page": { "width": 1000, "height": 1341, "image_url": "${H}/api/files/8e55.../page.jpg" },
  "share_url": "${H}/x/8e55085a-7759-41b3-a566-62673912200a",
  "embed_url": "${H}/embed/lesson/8e55085a-7759-41b3-a566-62673912200a",
  "source": "api",
  "external_user_id": "student-42",
  "metadata": { "course": "physics-10" }
}`;

  return (
    <div className="docs paper">
      <header className="docs-top">
        <Link to="/" className="wordmark"><span className="mark" />Living Textbook</Link>
        <span className="docs-tag">Developers</span>
        <nav className="docs-top-links">
          <a href="/v1/openapi.json" target="_blank" rel="noreferrer">OpenAPI</a>
          <Link to="/app/developers" className="primary small-btn">{reader ? 'Your keys' : 'Get API keys'}</Link>
        </nav>
      </header>
      <div className="docs-body">
        <nav className="docs-toc" aria-label="On this page">
          {SECTIONS.map(([id, t]) => <a key={id} href={`#${id}`}>{t}</a>)}
        </nav>
        <main className="docs-main">
          <div className="docs-hero">
            <h1>Living lessons inside your learning app<span className="marker-dot">.</span></h1>
            <p className="lede">A learner photographs any textbook page; the page's own figures start to move, a narrator explains them step by step, every number is checked against the page, a voice tutor answers questions, and a quiz comes from the page's own text. Add it to your app with a script tag, or call it from your server.</p>
          </div>

          <Section id="overview" title="Overview">
            <p>There are three ways in. Use one or all of them:</p>
            <ul className="doc-cards">
              <li><b>The scanner</b><span>A button in your app opens the camera; the learner gets a living lesson on top of their page. Two lines of HTML and a publishable key.</span><a href="#scanner">The scanner</a></li>
              <li><b>The lesson player</b><span>Show any lesson inside your pages: one your server made, or one a learner made in the scanner.</span><a href="#embed">Show a lesson</a></li>
              <li><b>The REST API</b><span>Your server sends page images and gets lessons, lists them per learner, fetches quizzes, deletes them.</span><a href="#api">REST API</a></li>
            </ul>
            <p>Every lesson is made by Google Gemini from the page itself, at the moment it is asked for: there is no catalogue to integrate, and any book in English or Hindi works.</p>
          </Section>

          <Section id="quickstart" title="Quick start">
            <ol className="doc-steps">
              <li><b>Get your keys.</b> Sign in and open <Link to="/app/developers">Developers</Link> in the dashboard. Make a <i>publishable</i> key that lists your site (for example <code>https://your-school.app</code>, or <code>http://localhost:3000</code> while developing), and a <i>secret</i> key for your server if you will use the API.</li>
              <li><b>Add the script</b> to your page, with your publishable key:</li>
            </ol>
            <CodeBlock label="HTML" code={`<script src="${H}/sdk/v1.js" data-key="ltpk_YOUR_PUBLISHABLE_KEY"></script>`} />
            <ol className="doc-steps" start={3}>
              <li><b>Add a button.</b> The scanner opens full screen; when the lesson is ready the button receives it.</li>
            </ol>
            <CodeBlock label="HTML" code={`<button data-lt-scanner>Scan a page</button>

<script>
  document.addEventListener('livingtextbook:lesson', (e) => {
    const lesson = e.detail; // { id, title, share_url, embed_url }
    saveForTheLearner(lesson.id);
  });
</script>`} />
            <p>That is the whole integration for the scanner. To show a saved lesson later, add <code>{'<div data-lt-lesson="LESSON_ID"></div>'}</code>.</p>
          </Section>

          <Section id="keys" title="Keys">
            <table className="doc-table">
              <thead><tr><th>Key</th><th>Starts with</th><th>Where it goes</th><th>What it can do</th></tr></thead>
              <tbody>
                <tr><td><b>Publishable</b></td><td><code>ltpk_</code></td><td>Your web pages (it is public by design)</td><td>Opens the scanner, only on the sites listed for the key.</td></tr>
                <tr><td><b>Secret</b></td><td><code>ltsk_</code></td><td>Your server only, in an environment variable</td><td>Everything in the REST API: make, read, list and delete your lessons, quizzes, usage.</td></tr>
              </tbody>
            </table>
            <p><b>Sites.</b> A publishable key lists up to 10 sites: an exact site (<code>https://school.example</code>), all subdomains of one (<code>https://*.school.example</code>), or <code>http://localhost:&lt;port&gt;</code> for development. Anywhere else the browser refuses to show the scanner.</p>
            <p><b>Secret keys are shown once</b>, when they are made; store them right away. Only a hash is kept on our side. If a secret key leaks, revoke it in the dashboard: it stops working within a minute. Up to 10 active keys per account.</p>
          </Section>

          <Section id="embed" title="Show a lesson">
            <p>The lesson player takes the width of its container. It shows the page whole with the animation on top, captions beside it (below it on phones), and a voice tutor that narrates every step and that the learner can interrupt with a question. (In the <a href="#scanner">scanner</a>, a lesson made with the camera also stays on the printed page as the learner moves the phone: AR.)</p>
            <CodeBlock label="HTML" code={`<script src="${H}/sdk/v1.js" data-key="ltpk_YOUR_PUBLISHABLE_KEY"></script>

<div id="lesson"></div>
<script>
  const player = LivingTextbook().lesson('#lesson', {
    lessonId: 'LESSON_ID',
    height: 640,
    onEvent: (e) => console.log(e.type, e),
  });
  player.on('complete', (e) => markDone(e.lessonId));
</script>`} />
            <table className="doc-table">
              <thead><tr><th>Option</th><th>Default</th><th></th></tr></thead>
              <tbody>
                <tr><td><code>lessonId</code></td><td>required</td><td>The lesson's <code>id</code>.</td></tr>
                <tr><td><code>height</code></td><td><code>640px</code></td><td>A number (pixels) or any CSS length.</td></tr>
                <tr><td><code>title</code></td><td>"Living Textbook lesson"</td><td>The frame's accessible name.</td></tr>
                <tr><td><code>onEvent</code></td><td></td><td>Called for every event (see <a href="#events">Events</a>).</td></tr>
              </tbody>
            </table>
            <p>Without code: <code>{'<div data-lt-lesson="LESSON_ID" data-lt-height="640"></div>'}</code>. Its events arrive as DOM events named <code>livingtextbook:ready</code>, <code>livingtextbook:step</code>, <code>livingtextbook:complete</code> and so on, with the event in <code>detail</code>.</p>
            <p>Sound needs one tap inside the player first (a rule of every browser). The tutor listens for questions, so the browser asks for the microphone when the lesson starts (the frames the SDK makes are allowed to ask); if the learner says no, the lesson still plays, without spoken questions.</p>
          </Section>

          <Section id="scanner" title="The scanner">
            <p>The scanner opens the camera (or lets the learner choose a photo), makes the lesson in 10 to 30 seconds, and shows it on the page; with the camera, the lesson stays on the printed page as the phone moves (AR). It needs your publishable key and works only on the key's sites.</p>
            <CodeBlock label="JavaScript" code={`const scanner = LivingTextbook().scanner({
  onLesson: (lesson) => {
    // { id, title, share_url, embed_url }: keep it with the learner
    api.post('/my/lessons', { id: lesson.id, title: lesson.title });
  },
  onClose: () => console.log('scanner closed'),
});

// later, if you want to close it yourself:
scanner.close();`} />
            <p>By default it opens full screen over your page (a sheet on large screens). To place it in your layout instead, pass <code>target</code>: <code>{"LivingTextbook().scanner({ target: '#slot', height: 720 })"}</code>.</p>
            <p>Lessons made in the scanner belong to your account: they count against your daily allowance, appear in <code>GET /v1/lessons</code> with <code>"source": "embed"</code>, and each visitor can make up to 15 a day on your key.</p>
          </Section>

          <Section id="events" title="Events and commands">
            <table className="doc-table">
              <thead><tr><th>Event</th><th>When</th><th>With</th></tr></thead>
              <tbody>
                <tr><td><code>ready</code></td><td>The lesson is showing.</td><td><code>lessonId</code>, <code>title</code>, <code>step</code>, <code>steps</code></td></tr>
                <tr><td><code>step</code></td><td>A new step starts.</td><td><code>lessonId</code>, <code>step</code> (from 0), <code>steps</code></td></tr>
                <tr><td><code>complete</code></td><td>The learner reached the last step.</td><td><code>lessonId</code></td></tr>
                <tr><td><code>quiz.completed</code></td><td>The learner finished the quiz.</td><td><code>lessonId</code>, <code>score</code>, <code>total</code></td></tr>
                <tr><td><code>lesson.created</code></td><td>The scanner made a lesson.</td><td><code>lesson</code>: <code>id</code>, <code>title</code>, <code>share_url</code>, <code>embed_url</code></td></tr>
                <tr><td><code>close</code></td><td>The learner closed the scanner.</td><td></td></tr>
                <tr><td><code>error</code></td><td>Something failed (an invalid key, a daily limit, a missing lesson).</td><td><code>code</code>, <code>message</code></td></tr>
              </tbody>
            </table>
            <p>Commands on a player: <code>player.play()</code>, <code>player.pause()</code>, <code>player.goTo(index)</code> (the tutor explains that step), <code>player.setMuted(true)</code>, <code>player.destroy()</code>. <code>player.on(type, fn)</code> returns a function that stops listening; <code>"*"</code> listens to everything.</p>
          </Section>

          <Section id="api" title="REST API">
            <p>Base address <code>{H}/v1</code>. Authenticate every call with your secret key: <code>Authorization: Bearer ltsk_...</code>. Responses are JSON with snake_case fields. A machine-readable description is at <a href="/v1/openapi.json" target="_blank" rel="noreferrer"><code>/v1/openapi.json</code></a>.</p>

            <Endpoint method="POST" path="/v1/lessons">
              <p>Makes a lesson from a page image: reads the page, builds the animation, voices it and checks it against the page. It takes 10 to 30 seconds and answers <code>201</code> with the <a href="#lesson-object">lesson</a> when it is ready.</p>
              <p>Send the image in any of these ways (JPEG, PNG or WebP, up to 15 MB):</p>
              <ul>
                <li><code>multipart/form-data</code> with the file in <code>image</code>, plus optional <code>external_user_id</code> and <code>metadata</code> (a JSON object as text);</li>
                <li>JSON: <code>{'{ "image_url": "https://..." }'}</code> (a public https address) or <code>{'{ "image_base64": "..." }'}</code>, with optional <code>external_user_id</code> and <code>metadata</code>;</li>
                <li>the raw image as the body (<code>Content-Type: image/jpeg</code>), with <code>?external_user_id=</code>.</li>
              </ul>
              <CodeBlock label="shell" code={`curl ${H}/v1/lessons \\
  -H "Authorization: Bearer $LIVING_TEXTBOOK_SECRET_KEY" \\
  -F image=@page.jpg \\
  -F external_user_id=student-42 \\
  -F 'metadata={"course":"physics-10"}'`} />
              <CodeBlock label="shell" code={`curl ${H}/v1/lessons \\
  -H "Authorization: Bearer $LIVING_TEXTBOOK_SECRET_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"image_url":"https://cdn.your-school.app/pages/ch3-p29.jpg","external_user_id":"student-42"}'`} />
              <p><b>Progress as it happens:</b> add <code>?stream=true</code> to receive server-sent events: <code>progress</code> for each stage (<code>{'{ "stage": "read", "status": "done", "detail": "..." }'}</code>), then <code>lesson</code> with the lesson, or <code>error</code>.</p>
              <p><code>external_user_id</code> is your own id for the learner (up to 128 characters, opaque to us); <code>metadata</code> holds up to 20 short values. Both come back with the lesson, and lists can be filtered by the first.</p>
            </Endpoint>

            <Endpoint method="GET" path="/v1/lessons/{id}"><p>One of your lessons.</p></Endpoint>
            <Endpoint method="GET" path="/v1/lessons">
              <p>Your lessons, newest first: <code>{'{ "object": "list", "data": [...], "has_more": true }'}</code>. Parameters: <code>limit</code> (1 to 100, default 20), <code>starting_after</code> (the last id of the previous page), <code>external_user_id</code>.</p>
              <CodeBlock label="shell" code={`curl "${H}/v1/lessons?external_user_id=student-42&limit=10" \\
  -H "Authorization: Bearer $LIVING_TEXTBOOK_SECRET_KEY"`} />
            </Endpoint>
            <Endpoint method="DELETE" path="/v1/lessons/{id}"><p>Deletes the lesson with its page image, voice and pictures: <code>{'{ "id": "...", "object": "lesson", "deleted": true }'}</code>.</p></Endpoint>
            <Endpoint method="GET" path="/v1/lessons/{id}/quiz">
              <p>Four questions from the page's own text, made on the first request (a few seconds) and kept: <code>{'{ "object": "quiz", "questions": [{ "question", "options", "answer_index", "explanation" }] }'}</code>.</p>
            </Endpoint>
            <Endpoint method="GET" path="/v1/usage"><p>Lessons made today and on each of the last 14 days, in total and per key, with your daily allowance.</p></Endpoint>
          </Section>

          <Section id="lesson-object" title="The lesson object">
            <CodeBlock label="JSON" code={lessonJson} />
            <table className="doc-table">
              <tbody>
                <tr><td><code>status</code></td><td><code>ready</code>, or <code>processing</code> for a moment while a lesson is still being finished.</td></tr>
                <tr><td><code>language</code></td><td>The page's language, detected (<code>en</code>, <code>hi</code>, ...). Narration and the tutor use it.</td></tr>
                <tr><td><code>steps</code></td><td>What the narrator explains, in order.</td></tr>
                <tr><td><code>verification</code></td><td>How the lesson was checked against the page: <code>verified-page</code> (its numbers match the page's own worked answers), <code>checked-independently</code>, <code>faithful</code> (everything it says is on the page), or <code>failed</code> (a check did not pass; the lesson says so to the learner).</td></tr>
                <tr><td><code>share_url</code></td><td>The lesson in Living Textbook, for anyone with the link.</td></tr>
                <tr><td><code>embed_url</code></td><td>For an iframe, or use the player.</td></tr>
                <tr><td><code>source</code></td><td><code>api</code> (made with a secret key) or <code>embed</code> (made in your scanner).</td></tr>
              </tbody>
            </table>
          </Section>

          <Section id="errors" title="Errors">
            <p>Errors have one shape, with a stable <code>code</code> to act on and a <code>message</code> to read:</p>
            <CodeBlock label="JSON" code={`{ "error": { "type": "rate_limit_error", "code": "daily_limit", "message": "Your account has made its 50 lessons for today..." } }`} />
            <table className="doc-table">
              <thead><tr><th>Status</th><th>type</th><th>Common codes</th></tr></thead>
              <tbody>
                <tr><td>400</td><td><code>invalid_request_error</code></td><td><code>image_missing</code>, <code>image_too_small</code>, <code>metadata_invalid</code>, <code>image_url_invalid</code>, <code>image_url_blocked</code>, <code>image_url_unreachable</code></td></tr>
                <tr><td>401</td><td><code>authentication_error</code></td><td><code>missing_api_key</code>, <code>invalid_api_key</code> (also revoked keys)</td></tr>
                <tr><td>403</td><td><code>permission_error</code></td><td><code>publishable_key</code> (the REST API needs a secret key)</td></tr>
                <tr><td>404</td><td><code>not_found_error</code></td><td><code>lesson_not_found</code>, <code>quiz_unavailable</code>, <code>route_not_found</code></td></tr>
                <tr><td>413 / 415</td><td><code>invalid_request_error</code></td><td><code>image_too_large</code>, <code>unsupported_media_type</code>, <code>image_type_unsupported</code></td></tr>
                <tr><td>422</td><td><code>invalid_request_error</code></td><td><code>page_not_supported</code>: the image is not a page of a book</td></tr>
                <tr><td>429</td><td><code>rate_limit_error</code></td><td><code>rate_limited</code> (wait <code>Retry-After</code> seconds), <code>daily_limit</code></td></tr>
                <tr><td>502</td><td><code>api_error</code></td><td><code>generation_failed</code>: try again</td></tr>
              </tbody>
            </table>
          </Section>

          <Section id="limits" title="Limits">
            <table className="doc-table">
              <tbody>
                <tr><td>Lessons per account</td><td>50 a day (UTC), all keys and the scanner together, during the preview</td></tr>
                <tr><td>Lessons per key</td><td>6 a minute; <code>X-RateLimit-Limit</code>, <code>X-RateLimit-Remaining</code> and <code>X-RateLimit-Reset</code> report it</td></tr>
                <tr><td>Scanner, per visitor</td><td>15 lessons a day on one key</td></tr>
                <tr><td>Images</td><td>JPEG, PNG or WebP, 1 KB to 15 MB, one page each</td></tr>
                <tr><td>Your references</td><td><code>external_user_id</code> up to 128 characters; <code>metadata</code> up to 20 keys of up to 500 characters</td></tr>
                <tr><td>Keys</td><td>10 active keys; 10 sites per publishable key</td></tr>
              </tbody>
            </table>
            <p>Reading, listing and deleting lessons are not counted against the daily allowance.</p>
          </Section>

          <Section id="node" title="Node SDK">
            <p>A typed client for Node 18 and later (also Deno, Bun and edge runtimes). Install it from this site:</p>
            <CodeBlock label="shell" code={`npm install ${H}/sdk/living-textbook-sdk.tgz`} />
            <CodeBlock label="TypeScript" code={`import { LivingTextbook, LivingTextbookError } from '@living-textbook/sdk';
import { readFile } from 'node:fs/promises';

const lt = new LivingTextbook({ apiKey: process.env.LIVING_TEXTBOOK_SECRET_KEY!, baseUrl: '${H}' });

const lesson = await lt.lessons.create({
  image: await readFile('page.jpg'),         // or { imageUrl: 'https://...' }
  externalUserId: 'student-42',
  metadata: { course: 'physics-10' },
  onProgress: (p) => console.log(p.stage, p.status),
});

const quiz = await lt.lessons.quiz(lesson.id);
for await (const l of lt.allLessons({ externalUserId: 'student-42' })) console.log(l.title);
await lt.lessons.del(lesson.id);

try { await lt.lessons.retrieve('nope'); }
catch (e) { if (e instanceof LivingTextbookError) console.log(e.status, e.code, e.message); }`} />
            <p>The same package carries the embed for bundlers: <code>{"import { createEmbed } from '@living-textbook/sdk/embed'"}</code>, then <code>{"createEmbed({ publishableKey, host: '" + H + "' }).scanner(...)"}</code>.</p>
          </Section>

          <Section id="iframes" title="Plain iframes">
            <p>The SDK is a thin layer over two frames; you can use them directly. Keep <code>allow</code> (camera and microphone) and <code>referrerpolicy="origin"</code> (the scanner uses it to check it is on one of your sites).</p>
            <CodeBlock label="HTML" code={`<iframe src="${H}/embed/lesson/LESSON_ID"
  allow="camera; microphone; autoplay; fullscreen" referrerpolicy="origin"
  style="width:100%;height:640px;border:0"></iframe>

<iframe src="${H}/embed/scan?key=ltpk_YOUR_PUBLISHABLE_KEY"
  allow="camera; microphone; autoplay; fullscreen" referrerpolicy="origin"
  style="width:100%;height:720px;border:0"></iframe>`} />
            <p>The frames post messages to your page as <code>{"{ source: 'living-textbook', type, ...fields }"}</code> (the events above) and take commands as <code>{"{ target: 'living-textbook', type: 'play' | 'pause' | 'goTo' | 'mute', step, muted }"}</code>, sent to the frame's window with <code>{`postMessage(message, '${H}')`}</code>. Check <code>event.origin</code> before trusting a message.</p>
            <p>If your site sends a Content-Security-Policy, allow <code>frame-src {H}</code> and <code>script-src {H}</code>.</p>
          </Section>

          <Section id="security" title="Security and privacy">
            <ul>
              <li><b>Secret keys never leave your server.</b> The SDK refuses to run in a page with one. If one leaks, revoke it.</li>
              <li><b>Publishable keys are meant to be seen.</b> What they can do is narrow: open the scanner on your sites, within your daily allowance and a per-visitor cap.</li>
              <li><b>No learner accounts.</b> Learners do not sign in inside your app. <code>external_user_id</code> is your opaque id: do not send names, emails or other personal details.</li>
              <li><b>What is kept:</b> the page image and the lesson made from it (with its voice clips and pictures), until you delete it. A lesson's <code>share_url</code> opens it for anyone with the link; ids are random and unguessable.</li>
              <li><b>Image URLs</b> are fetched over https from public addresses only, with a size and time limit.</li>
            </ul>
          </Section>

          <footer className="docs-foot">
            <span className="muted">Living Textbook API v1 · made with Google Gemini</span>
            <Link to="/app/developers" className="primary small-btn">{reader ? 'Your keys' : 'Get API keys'}</Link>
          </footer>
        </main>
      </div>
    </div>
  );
}
