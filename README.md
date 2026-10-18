# Living Textbook

Point your phone at a page of a school book, and the page comes alive on the paper.

**Try it:** https://living-book-945707801757.asia-south1.run.app (on a phone, open `/scan`)

We built this for the Google Cloud AI Builder Cup 2026, Theme 4: Media, Content & Digital Experiences.

## What it does

**Textbook pages become lessons.** Scan a science page, and in about 15 seconds its diagram starts to move on the paper. A voice tutor explains it step by step. You can stop the tutor at any time and ask a question out loud. You can also change a number to see what happens, and take a short quiz made from the page.

**Story pages become films.** Scan a page of a story, and its picture turns into a short film in the same art style as the book. At the turning point, you choose what happens next. Then you can talk to the characters. A film is made once and shared, so the next person who scans that story gets it in a few seconds.

**Teachers and other apps can use it too.** A teacher can turn a page into a short video, or a whole chapter into a film for the class. Other learning apps can add it with one script tag or a REST API.

Nothing is made in advance. Every lesson and every film comes from the page that the camera sees.

## How it is built

- **Gemini** does the AI work. It reads the page, builds the lesson and checks every number against the page. Gemini Live is the tutor you talk to. For stories, Gemini plans the film, Nano Banana draws it, Gemini Omni animates it, and Gemini watches the result and asks for weak shots to be made again.
- **Cloud Run** runs the whole app as one service.
- **Firestore** keeps the lessons, the films, each reader's progress, and the page index that lets everyone share a film.
- **Firebase** handles Google sign-in.

Cloud Storage keeps the images, audio and video. BigQuery holds the learning data for the progress page.

## Run it on your computer

You need Node 24, pnpm, and a Google Cloud project with Vertex AI turned on.

```bash
pnpm install
pnpm --filter @living-textbook/sdk build && pnpm --filter @living-book/web build
cd apps/server && GCP_PROJECT=<your project> LB_USE_GCLOUD_TOKEN=1 DEV_USERS=1 pnpm exec tsx src/index.ts
```

Then open http://localhost:8080. If your computer has no camera, open `/scan?sim=0.3` to use a simulated one.

## Where things are

- `apps/web`: the web app (scanner, AR, lessons, story player)
- `apps/server`: the Cloud Run service (the lesson pipeline is in `src/pipeline.ts`, the story engine in `src/story`)
- `packages/scene`: the lesson format that the server and the app share
- `docs`: the product brief, the plan, and a dated log of what we built and measured

## A note about test pages

We tested with pages from NCERT textbooks, but they are not in this repository because NCERT books may not be republished. You can download the chapters for free from https://ncert.nic.in/textbook.php.
