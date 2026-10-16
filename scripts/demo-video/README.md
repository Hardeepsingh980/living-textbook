# Demo video

The scripts in this folder make the demo video of Living Textbook: 2 min 41 s, 1920×1080, 30 frames a second. Every app shot is a recording of the real app. Gemini text-to-speech speaks for the narrator and for the student. Gemini Live is the tutor, as in the app. Lyria makes the music. All output goes to `eval/output/demo-video`, which git ignores.

## What you need

- Node 24, pnpm, ffmpeg, and gcloud signed in to a Google Cloud project that can use Vertex AI.
- Playwright, which the `eval` package installs (`pnpm install` in `eval/`).
- The local server with test readers. A test reader signs in without Google: the scripts set `lb.devUser` in the browser.

Start the local server from `apps/server`:

```bash
DEV_USERS=1 LB_USE_GCLOUD_TOKEN=1 PORT=8080 pnpm exec tsx src/index.ts
```

## Steps

1. Voice the script. Run this from `apps/server`. The lines are in `script.json`. A line that already has a voice file is not voiced again.

   ```bash
   LB_USE_GCLOUD_TOKEN=1 pnpm exec tsx ../../scripts/demo-video/tts.mts ../../eval/output/demo-video 26
   ```

2. Make the music.

   ```bash
   scripts/demo-video/music.sh eval/output/demo-video
   ```

3. Record the main take: a page photo goes in, Gemini makes the lesson, the tutor teaches, the student asks a question, the tutor shows a what-if, and the quiz opens. A simulated microphone plays the student's question 26 s after the microphone starts. Gemini Live hears it and answers it.

   ```bash
   node scripts/demo-video/take-lesson.mjs http://localhost:8080 page.jpg eval/output/demo-video/question-mic.wav eval/output/demo-video/take
   ```

4. Record the other takes. Before you record `progress`, run `warmup` once. It plays and quizzes two more lessons, so the progress page has real numbers. The `dev` take needs `partner.html` from this folder on another origin. Replace `SERVER`, the publishable key and `LESSON_ID` in it, then serve it (for example with `python3 -m http.server 5500`). The key must list that site.

   ```bash
   node scripts/demo-video/take-scenes.mjs http://localhost:8080 eval/output/demo-video warmup,quiz,progress,films,home,dev lesson=<lesson id> warm=<id>+<id> chapter=<chapter film job id> short=<short video job id> partner=http://localhost:5500/partner.html
   ```

5. Draw the still layers: the paper, the window, the labels, the captions, and the title and end cards.

   ```bash
   node scripts/demo-video/render-layers.mjs eval/output/demo-video https://living-book-945707801757.asia-south1.run.app
   ```

6. Put the video together.

   ```bash
   node scripts/demo-video/compose.mjs eval/output/demo-video eval/output/demo-video/living-textbook-demo.mp4
   ```

The shot list at the top of `compose.mjs` gives each shot its part of a take, in seconds, and the time of each voice line. If you record a take again, change these times to match the new take. To render some shots again and keep the others, set `SHOTS`, for example `SHOTS=quiz,dev`.

## How the sound stays in time

- The app keeps each piece of the tutor's voice with the time it played (`window.__liveAudio` when `window.__captureLive` is set). The screen frames have times on the same clock, so the tutor's voice goes back at the exact place.
- Each shot's sound is mixed in a pass of its own. Then the script measures each voice in the result and mixes again if one is silent.
- The shots keep their sound as PCM until the last step. The music goes under the whole video and is quieter while anyone speaks. The last step sets the loudness to −16 LUFS.
