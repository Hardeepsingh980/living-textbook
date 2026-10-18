# Living Textbook

Any page of a school book, alive on the paper, with a tutor you can talk to.

- **Live prototype:** https://living-book-945707801757.asia-south1.run.app
- **Scanner (open it on a phone):** https://living-book-945707801757.asia-south1.run.app/scan
- **Developer docs:** https://living-book-945707801757.asia-south1.run.app/developers

This is an entry for the Google Cloud AI Builder Cup 2026, Theme 4: Media, Content & Digital Experiences. Work started on 2026-10-10. All code and assets in this repository were made during the hackathon.

## What it does

A student points a phone at any page of a printed book. Nothing is prepared in advance: every experience is generated from the page that the camera sees.

- **Lessons.** In about 15 seconds, the drawing on the page starts to move on the paper (AR in the browser, nothing to install). A Gemini Live tutor explains it step by step and stops when the student asks a question by voice. Sliders answer "what if?", and a quiz comes from the text of the page. Every number in the lesson is checked against the page.
- **Story films.** A story page becomes a short film in the book's own art style, with a voice for every character. At the turning point, the reader chooses what happens. Then the reader can talk to the characters. A film is made once. Anyone who scans the same page, or another page of the same story, gets the same film in about 3 seconds.
- **For teachers.** A page becomes a short narrated video. A chapter PDF becomes a film for the class.
- **For other learning apps.** An embed SDK (one script tag), an embeddable scanner and a REST API, with publishable and secret keys.
- **For readers.** Google sign-in keeps every page, progress and quiz scores, with suggestions from Gemini on what to learn next. Readers who are not signed in can try three pages a day.

## How it uses Google Cloud

| Service | What it does here |
|---|---|
| Gemini 3.1 Flash-Lite, 3.6 Flash, 3.8 Flash (Vertex AI) | Read the page, build the lesson scene, check every number against the page, write the quiz and the progress suggestions |
| Gemini Live 3.8 | The voice tutor and the story characters: real-time voice with barge-in, acting on the lesson through typed tools |
| Gemini 3.8 TTS | Narration and character voices, each with its own acting style |
| Gemini 4 Argon | Plans each story film from the book's own words, then watches every version of the film and reviews it |
| Nano Banana 2.1 | Cast sheets and the first frame of every shot, in the book's art style |
| Gemini Omni Flash | A 10-second clip for every shot of a story film (image to video) |
| Gemini Embedding 2 | Recognises a scanned page: the same page, or another page of the same story |
| Lyria 2 | Music for the story films |
| Cloud Run (gen2) | One service: the web app, the REST API, the lesson pipeline, the story engine and the Gemini Live proxy (WebSocket); 1 to 5 instances |
| Firestore | Lessons, story films, the shared page index (page embeddings), background jobs, readers' progress, daily limits and developer keys |
| Firebase | Authentication for Google sign-in (the server checks every token with the Firebase Admin SDK) and Analytics |
| Cloud Storage | Page photos, clips, voices, music and tracking data |
| Cloud Tasks | Background jobs (videos, chapter films, story films) that continue when the page is closed |
| BigQuery | Learning events, for progress and suggestions |

## How it works

```text
Phone browser                       Cloud Run (one service)                     Vertex AI and data
-------------                       -----------------------                     ------------------
camera + page tracking (WebGL) ---> is it a page of a known story? ----------> Gemini Embedding 2 + Firestore page index
                                      yes: play the shared film on the page
                                      no:  lesson pipeline -------------------> Gemini Flash-Lite: read the page
                                           build scene + voice --------------> Gemini Flash, Gemini TTS
                                           check every number --------------> Gemini Flash
lesson drawn on the paper  <------- streamed events (NDJSON)
voice tutor (mic + speaker) <=====> Gemini Live proxy (WebSocket) ==========> Gemini Live
story player                        story engine (background job) ---------> Gemini 4 Argon, Nano Banana, Gemini Omni,
                                      plan, draw, film, voice, review          Gemini TTS, Lyria
Google sign-in (Firebase Auth) ---> Firebase Admin token check
                                    Firestore, Cloud Storage, Cloud Tasks, BigQuery
```

The lesson pipeline is in `apps/server/src/pipeline.ts`. The story engine is in `apps/server/src/story` (it has its own README). Page recognition is in `apps/server/src/story/pages.ts`.

## Repository layout

| Path | What is in it |
|---|---|
| `apps/web` | The web app (React, TypeScript): scanner, page tracking (`src/ar`), lesson screen, story player, dashboard, library, progress, developer pages |
| `apps/server` | The Cloud Run service (Hono, TypeScript): API, lesson pipeline, verification, story engine, page index, Gemini Live proxy, jobs, developer platform |
| `packages/scene` | The lesson scene format, its expression evaluator and the tutor's tool definitions, shared by the server and the web app |
| `packages/sdk` | The embed SDK (`@living-textbook/sdk`), served at `/sdk/v1.js` |
| `eval` | The evaluation harness: generate, record and judge lessons on a set of pages |
| `scripts/demo-video` | The scripts that record and assemble the demo video |
| `docs` | Product requirements (`PRD.md`), plan, a dated progress log with measurements (`PROGRESS.md`) and the demo video script |
| `spikes` | Day-0 feasibility tests (page tracking, latency, Live API) |

## Run it locally

You need Node 24, pnpm 9, ffmpeg, and the gcloud CLI signed in to a Google Cloud project that can use Vertex AI.

1. Install the packages and build the web app:

   ```bash
   pnpm install
   ```

   ```bash
   pnpm --filter @living-textbook/sdk build && pnpm --filter @living-book/web build
   ```

2. Start the server from `apps/server`. It serves the built web app on port 8080. `DEV_USERS=1` lets a local test reader sign in without Google, and `LB_USE_GCLOUD_TOKEN=1` uses your gcloud sign-in for Vertex AI.

   ```bash
   cd apps/server && GCP_PROJECT=<your project> DEV_USERS=1 LB_USE_GCLOUD_TOKEN=1 PORT=8080 pnpm exec tsx src/index.ts
   ```

3. Open http://localhost:8080. On a computer without a camera, `/scan?sim=0.3` shows a simulated camera.

By default the server keeps its data on the local disk (`.data`). To use Firestore and Cloud Storage, set `STORE=cloud`, `GCS_BUCKET` and `FIRESTORE_DB`. Google sign-in needs `FIREBASE_API_KEY` and `FIREBASE_APP_ID` from a Firebase web app.

## Deploy to Cloud Run

The `Dockerfile` builds the SDK, the web app and the server into one image (with ffmpeg and Chromium for the videos).

```bash
gcloud run deploy living-book --source . --region asia-south1 --allow-unauthenticated --execution-environment gen2 --cpu 4 --memory 4Gi --timeout 1800 --min-instances 1 --max-instances 5 --set-env-vars "GCP_PROJECT=<project>,STORE=cloud,GCS_BUCKET=<bucket>,FIRESTORE_DB=<database>,FIREBASE_API_KEY=<key>,FIREBASE_APP_ID=<app id>,JOBS_MODE=tasks,SELF_URL=<service url>"
```

## Measured results

The progress log (`docs/PROGRESS.md`) records every measurement with its date. Some of them:

- A page photo becomes a checked lesson in 12.6 to 14.3 seconds (median on Cloud Run). The first understanding of the page takes 1.7 seconds.
- 10 of 10 evaluation pages were verified against their text, with 27 of 27 printed values correct.
- The Gemini Live tutor's first audio arrives 0.84 seconds after it connects.
- A known story page opens its film in 2.9 to 3.1 seconds. Pages of other books matched no story.
- A lesson costs about $0.04 in Gemini. A story film costs $12 to $23 once, and nothing more for every next reader.

## Note on the evaluation pages

The NCERT textbook pages used to test the app are not in this repository, because NCERT does not allow its books to be republished. The chapter PDFs are free to download from https://ncert.nic.in/textbook.php. The synthetic test pages in `eval/pages` were made for this project.
