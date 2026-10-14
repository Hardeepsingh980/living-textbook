# Living Textbook SDK

Turn a photo of a textbook page into a living lesson: the page's own figures animate, a narrator explains them step by step, every value is checked against the page, a voice tutor answers questions, and a quiz comes from the page's own text.

Full guide: `/developers` on the Living Textbook site.

## On your server: the REST API

```bash
npm install https://living-book-945707801757.asia-south1.run.app/sdk/living-textbook-sdk.tgz
```

```ts
import { LivingTextbook } from '@living-textbook/sdk';
import { readFile } from 'node:fs/promises';

const lt = new LivingTextbook({ apiKey: process.env.LIVING_TEXTBOOK_SECRET_KEY! });

const lesson = await lt.lessons.create({
  image: await readFile('page.jpg'),
  externalUserId: 'student-42',
  metadata: { course: 'physics-10' },
  onProgress: (p) => console.log(p.stage, p.status),
});
console.log(lesson.title, lesson.embed_url);

const quiz = await lt.lessons.quiz(lesson.id);
for await (const l of lt.allLessons({ externalUserId: 'student-42' })) console.log(l.id);
```

Secret keys (`ltsk_...`) belong on your server only.

## In your web page: the embed

```html
<script src="https://living-book-945707801757.asia-south1.run.app/sdk/v1.js" data-key="ltpk_..."></script>

<div data-lt-lesson="LESSON_ID"></div>
<button data-lt-scanner>Scan a page</button>
```

Or from code:

```js
const lt = LivingTextbook({ publishableKey: 'ltpk_...' });
const player = lt.lesson('#lesson', { lessonId: 'LESSON_ID', onEvent: (e) => console.log(e.type) });
lt.scanner({ onLesson: (lesson) => save(lesson.id) });
```

Publishable keys (`ltpk_...`) only open the scanner, and only on the sites listed for the key.
