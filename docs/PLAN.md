# Living Book — Technical Plan

Status: **v1.1 (2026-10-10, evening)** — approved 2026-10-10 14:20 and being executed. Changes after Hardeep's first phone test: the product is **AR-only** (the photo presentation is an internal fallback, no mode switcher), the UI follows one design language with a line-icon set and **no emoji**, playback is continuous (speech queue, looping steps, self-running simulations), the richer scene is swapped in at the next loop, and quality is measured by the evaluation loop in `eval/` (pipeline checks → headless screenshots → Gemini visual judge). Progress and measurements live in [PROGRESS.md](PROGRESS.md).

Companion document: [PRD.md](PRD.md).

---

## 0. Hackathon compliance (verified on the official site, 2026-10-10)

Source: aibuildercup.com (organised by Hack2skill, sponsored by Google Cloud); submission via the Hack2skill Vision team dashboard.

| Rule | What it means for us |
|---|---|
| **Teams of 2–4; solo submission is not allowed; roster locks 11 Oct 2026** | Hardeep must add at least one teammate by tomorrow. Eligibility: 21+, working professionals/entrepreneurs physically based in JAPAC; any student member disqualifies the team. |
| Prototype deadline 18 Oct 2026, timezone unpublished | Submit by the evening of 17 Oct IST; ask on the event Discord for the exact cutoff. |
| Deliverables | Working deployed URL on Cloud Run/Firebase; demo video **strictly under 3 minutes** on a public YouTube/Vimeo/Drive link; public GitHub repo; deck as PDF covering vision and impact, alignment with one problem statement, feasibility, scalability, architecture and business case. Everything in English. |
| Built primarily on Google Cloud; Google AI models or agentic platforms; Cloud Run/Firebase | Gemini, Nano Banana, Gemini TTS and Live, Cloud Run, Firestore, GCS. No non-Google AI services. |
| **Fresh code and assets only, created after the 7 Sep 2026 launch** | The repo starts empty (true today); no vendored prior code; README dated. |
| One of six themes | Recommended: **Theme 4, Media, Content & Digital Experiences** (its text names publishing and education). Fallback: Sustainability & Social Impact. |
| Judging 40 / 25 / 25 / 10 (confirmed) + side prizes | Side prizes: Best use of Google Cloud AI tools, Most Impactful Solution, Social Choice, Best UI/UX. Make Gemini visibly load-bearing; accessibility and graceful fallbacks count for UX. |
| IP | Participant keeps copyright; organiser gets a non-exclusive marketing licence and a 6-month right of first refusal. No Google Cloud credits are promised. |
| Name | "Living Book(s)" collides with Broderbund's 1990s "Living Books" and a Polish "Living Book" product (trademark status unverified). Decide on day 6 whether to keep it. |

---

## 1. Decisions already confirmed with Hardeep (2026-10-10)

| Topic | Decision |
|---|---|
| Team / time | Hardeep + Claude, near full-time, until 2026-10-18 |
| GCP | Existing project `cheerio-app` (production, project number 945707801757, billing enabled, Hardeep is Owner). Everything created under a `living-book-` prefix: own Cloud Run service in **asia-south1** (where the existing services run), GCS bucket, Firestore *named* database in **Native mode** (the `(default)` database is Datastore mode and cannot be used), service account. Already enabled: Vertex AI, Cloud Run, Firestore, Storage, Cloud TTS, Secret Manager, Artifact Registry, Cloud Build, Logging. To enable: Speech-to-Text (fallback STT only). Existing Firebase config/rules untouched. |
| Budget | Up to ~$500 for the week. Veo only as an optional async upgrade, never on the critical path. |
| Demo priority | Science simulation **and** storybook scene polished equally; Hindi **after** English works end-to-end. |
| Devices | Android phone (fps target) + iPad (WebKit/iOS Safari coverage). No iPhone. |
| Books | Science/maths textbook, English storybook, children's picture book. No Hindi book yet (printed free pages later). |
| Hindi QA | Hardeep reviews Hindi audio and labels himself. |
| Git | Local git only; Hardeep creates the GitHub repo later. |
| Deck / video | Owner decided on day 6 (2026-10-16). |

---

## 2. What the user experiences (with the latency budget)

```
t=0.0   User taps "Bring it to life" (audio unlocked by this gesture; tracker already pre-warmed while framing).
t≈0.5   Upload done (photo resized client-side to 1000 px wide, EXIF stripped). Theatre starts ticking.
t≈1.6-2.3 L-1 First streamed tokens: "Class 9 Physics · English · free fall" (measured first byte 1.1 s + image).
t≈2.5-3.5 L-2 Page "awakens" on the paper: figures glow, cut-outs of the printed diagrams lift and bob,
            title floats up, particles shimmer — anchored, animated, built only from the quick pass
            and the compiled target that arrives with it.
t≈3.5-4.5 L-3 Opener narration starts ("Let's bring this page to life…"), captions on (first audio ≈1 s).
t≈6-8       Scene v1 replaces the awakening in place: simulation with sliders, or story scene with
            characters, dialogue, ambience. Placeholder silhouettes where images are still generating.
t≈10-14 L-4 Sprites swap in (≈3 s each); verification badge turns green ("Verified against the page:
            19.6 m ✓"); theatre shows the final timing bar and cost.
Later       Tap the mic: "what if gravity were on the Moon?" → spoken answer in ≈1-2 s, grounded in
            the page and in the current slider values.
```

One presentation: **AR** (the page layer warped onto the physical page). When the page is out of view the same layer sits on the frozen capture until the page is found again; shared links and uploads without a camera use that photo presentation as well. There is no mode switcher.

---

## 3. The core bet: a scene language, not generated code

The PRD forbids templates and demands ≥95% first-render success, 60 fps on mid-range phones, page anchoring and sandboxed safety. Three options were weighed:

| Option | Pros | Cons |
|---|---|---|
| A. LLM writes HTML/JS per page | Unlimited expressiveness | 300-800 lines ⇒ 20-40 s of token output; runtime errors are common; must sandbox (iframe) which breaks anchoring and touch; 60 fps not guaranteed |
| B. LLM emits a compact **declarative scene spec** rendered by our engine | 1-2 k tokens ⇒ fast; schema-validated so it *always* renders; renderer owns anchoring, fps, accessibility, audio sync; same spec drives AR/overlay/flat/share | Expressiveness bounded by the schema |
| C. B as default + A as optional upgrade for simulations | Best of both | Extra surface area in 8 days |

**Decision: B now, with the schema designed so C can be added later without changing the pipeline.** The spec is a small reactive animation language ("LivingScene v1"):

- **Variables** with ranges/units (sliders), a built-in time variable, and **derived values** written as safe math expressions (`h = 0.5*g*t^2`). A tiny expression evaluator (no `eval`, shared by server and client) makes simulations deterministic and verifiable.
- **Elements**: sprite (generated image **or a cut-out of the captured page itself**), label, shape, arrow/path, particles, function plot, timeline, speech bubble. Any numeric property can be bound to an expression.
- **Steps**: an ordered sequence of states with narration lines, highlights and transitions (step-through, replay).
- **Interactions**: slider → var, tap element → action/voice line, play/pause/replay.
- **Audio**: narration segments, character lines with speaker + style, ambience and SFX chosen by name from a small CC0 library.
- **Anchors**: bounding boxes in page space (Gemini's 0-1000 normalised convention) so elements sit on their printed counterparts.

Why this is still "any page, no templates": the model composes freely from primitives, the same way it composes sentences from words. Page types only steer the prompt; nothing page-specific exists in code.

Reliability mechanics: Gemini structured output with a JSON schema → Zod validation → automatic repair (defaults, clamping, dropping only the offending element) → one model-side repair call if the spec is unusable → a guaranteed fallback scene (page cut-outs + narration) so a blank screen is impossible.

---

## 4. Pipeline (server) and progressive delivery

All stages stream events to the client over SSE; the **agent theatre** renders them live with timings.

```
capture ─► upload ─► [A] Quick read (small model, ~1.5 s): type, subject, language, title, gist,
                     main figure boxes, spread?, confidence, (story: character list + 1-line looks)
                     ├─► client builds the AWAKENING scene immediately (L-2)
                     ├─► [N] Narration opener → TTS → plays (L-3)
                     └─► in parallel from the image + A's result:
                         [S] Scene spec        (~5-8 s)  ─┐
                         [X] Deep extraction   (~5-8 s)  ─┼─► [V] Verify & repair (~2-4 s) ─► final badge + log
                         [G] Image generation  (~5-10 s) ─┘   (images swap in as they land)
                         [T] Full narration + character lines → TTS (segments stream in)
```

Key ideas:
- **Nothing waits for everything.** S, X, G and T run in parallel; each result upgrades the scene in place.
- **Small outputs.** Token output speed is the real bottleneck, so every schema is compact (short keys, defaults). Target ≤1.5 k tokens for S and ≤1.2 k for X.
- **Instant anchored content without AI output.** The awakening scene needs only figure boxes from A plus the photo itself.
- **Caching.** Perceptual hash of the page ⇒ instant reopen (L-5) and no double spend; per-book profile cached.
- **Low confidence ⇒ ask once.** If A reports low confidence or a two-page spread, the client asks one question (pick a page / confirm subject) before continuing (FR-8).

Model assignment per stage (details and measurements in section 11): A, S and T on `gemini-3.1-flash-lite` (fastest first byte and ~300 tok/s); X on `gemini-3.6-flash` (quality with `minimal` thinking); V on `gemini-3.8-flash` (`low`, best reasoning, off the critical path; code execution for independent recomputation); G on `gemini-3.1-flash-lite-image` first (≈3 s) with `gemini-nano-banana-2.1` for reference-consistent upgrades; speech on `gemini-3.8-flash-lite-tts` streamed per sentence; conversation on `gemini-3.8-live`.

Realistic budget from the measurements: upload 0.5 s → A first tokens at ~1.6–2.3 s (L-1, hard limit 3 s; the 1.5 s target needs an image-input measurement in the day-0 spike) → awakening scene at ~2.5 s (L-2) → opener narration at ~3.5–4 s (L-3) → scene v1 (≤1.2 k tokens on Flash-Lite) at ~6–7 s → extraction at ~7–8 s → sprites at ~6–9 s → verification at ~10–12 s (L-4).

---

## 5. Verification (FR-14…17, Q-2, Q-4)

| Content | Check | Status shown |
|---|---|---|
| Simulation with a worked answer on the page | Evaluate the scene's expressions deterministically with the page's inputs; compare with the printed answer (±2%). On mismatch → one repair call with the discrepancy, then re-check. | **Verified against the page** (shows the numbers) |
| Simulation without a worked answer | Independent recomputation: a separate model call with code execution derives the expected result from the page's stated formula and values; compare with the scene's expressions. | **Checked independently** |
| Explainer / non-fiction labels and narration | Faithfulness judge: each label/narration sentence must be supported by page text; unsupported strings are removed or rewritten. | **Faithful to the page** / **Unverified** |
| Story scenes | Same judge: no characters, events or dialogue absent from the page (paraphrase allowed, marked as narration). | **Faithful to the page** |

The verification log (what was checked, inputs, outputs, pass/fail, time) is stored with the experience and openable from the badge.

---

## 6. AR anchoring (researched on 2026-10-10; to be confirmed by the day-0 spike on real pages)

Facts that decide the design:

- **WebXR is out.** iOS Safari has no WebXR on iPhone/iPad through 27.x (caniuse, WebKit notes); Chrome's `image-tracking` is still behind a flag and unlikely to ship. App-Clip wrappers (Variant Launch, Needle Go) add a prompt, cost or branding, and it is unverified that they accept a runtime-captured image. Rejected.
- **MindAR 1.2.5 (MIT)** is the only verified option that compiles a runtime photo into a target (in the browser or in Node via its offline compiler), loads it from a buffer, and runs on iOS Safari and Android Chrome. Measured by the research agent on a Mac with 1000×1400 synthetic pages: ~1.2 s warm compile, but **20–30 s cold** per new input size (TensorFlow.js shader compilation); **text-only pages yield 2–4 tracking points** (detect but do not track), figure regions yield 20–48. Unmaintained since Jan 2024. Its three.js wrapper is optional; the core controller exposes the per-frame pose.
- **TraceAR 0.2.1 (MIT, Aug 2026)** claims 0.1 s compile and lower jitter, same unit convention; six weeks old with one star → fallback candidate only.
- **Custom OpenCV.js** (3.5 MB gzipped plus tuning time) → rejected for the hackathon.
- **iOS Safari constraints**: no `ImageCapture.takePhoto` (grab a frame from the 1920×1080 video or use a file-capture input for full resolution); audio needs a gesture and the AudioContext must be resumed after backgrounding; run in a Safari tab rather than home-screen mode (camera bugs on iOS/iPadOS 26); stop tracks and cap textures to avoid GPU-process kills.

Design:

1. **Target = the captured photo** resized to the canonical page size (1000 px wide). It is compiled **server-side** (MindAR offline compiler in Node, in parallel with the quick pass) and returned as a buffer with per-level feature counts, so the phone never pays the compile. Client-side compile stays as a fallback; both are timed in the spike.
2. **Tracker pre-warm**: the tracker is initialised with a bundled dummy target while the user frames the page, so shaders are compiled before capture.
3. **Per frame**: pose → 4 page corners → 2D homography → CSS `matrix3d` on the page layer that holds the PixiJS canvas and DOM labels. The compositor warps on the GPU, the renderer never re-uploads textures. Low-pass filtering and 60 fps interpolation between ~30 fps tracker updates. Taps are mapped through the inverse homography for hit-testing.
4. **Figure-first anchoring**: if the full page has too few tracking points, the main figure crop (bounding box from the quick pass) is compiled as a second target and used as the anchor.
5. **Three modes, one renderer**: **AR** (live tracking) → **Photo** (the experience warped onto the frozen capture; perfect alignment by construction, works on every device, used whenever tracking is unavailable or lost for more than ~2 s) → **Flat** (page-space canvas full-screen for projectors, desktops and share links). The user can switch at any time; nothing ever goes blank.
6. **Quality gate before upload**: Laplacian variance (blur) and luminance percentiles (darkness) on a downscaled frame, a framing rectangle, and plain hints ("hold still", "more light", "fit the whole page"). Page detection and any dewarping stay server-side.

---

## 7. Audio

- **Narration** per step as separate clips, synthesised per sentence with `gemini-3.8-flash-lite-tts` (streamed; measured 1.0–1.1 s to first audio for English and Hindi). No Google TTS returns word timestamps today, so captions are synced per sentence; for replays an optional second pass through `gemini-3.5-transcribe` (word timestamps, Hindi supported, ≈$0.003/min) upgrades captions to word level. Fallback voices: Cloud TTS Chirp 3 HD `en-IN` / `hi-IN` streaming.
- **Character voices**: distinct voices + style prompts per character, assigned once per book in the book profile so they persist across pages.
- **Sound design**: CC0 ambience/SFX library (rain, forest, classroom, lab hum, pop, whoosh, chime…) picked by name in the spec; Web Audio mixing with ducking under speech.
- **Controls**: global mute, replay, per-element replay (tap a character → its line), captions on by default, reduced-motion respected.
- **Autoplay**: AudioContext unlocked on the "Bring it to life" tap.

## 8. Conversation (FR-27/28)

`gemini-3.8-live` (GA, 99 languages including Hindi with automatic switching). **Measured on day 0 from the project**: the model is served only from `us-central1` for Live (not `global`, not `asia-south1`); connect 1.8 s, **first audio 840 ms after the question**, correct answer. Because the project uses Agent Platform (Vertex) credentials rather than a Developer API key, the browser does not talk to Google directly: a **WebSocket proxy on Cloud Run** holds the service-account credentials, injects the page extraction and scene summary as the system instruction, relays audio both ways, and answers the slider-state function tool from the client's last reported state. No keys ever reach the client (NFR-4). Output transcription provides captions. Connections last ~10 min with resumption handles, which the proxy handles. Fallback: text question → Flash-Lite → TTS.

## 9. Library, sharing, continuity

- Anonymous identity (random id in local storage) owns a library; no sign-in needed. Server enforces ownership. User can delete the library (NFR-3).
- Firestore named database `living-book`: `books`, `experiences` (spec, extraction, verification log, timings, cost), `assets` in GCS (page image, generated images, audio).
- **Book profile** per book: art-style guide, character sheet with reference images, voice assignments, glossary. Fed into every prompt and image generation for later pages (Q-5).
- Share link `/x/{id}` opens Flat mode without auth. Reopen ≤1 s: spec from Firestore, assets from GCS with long cache headers.

## 10. Architecture and stack

```
Phone browser (Safari tab / Chrome) ──HTTPS──► Cloud Run: living-book (Node 22 / TypeScript, asia-south1)
  Vite + React + TS                       ├─ serves the built SPA
  LivingScene renderer (PixiJS 8)         ├─ POST /api/experiences → pipeline (SSE stream of stage events)
  MindAR core tracker (TraceAR fallback)  ├─ GET  /api/x/:id       → saved experience (public read for share links)
  Homography → CSS matrix3d page layer    ├─ POST /api/live-token  → ephemeral Live API token
  Web Audio mixer, captions               ├─ @google/genai (Agent Platform / Vertex, global endpoint),
  Live API WebSocket (ephemeral token)    │  MindAR offline compiler, sharp, Firestore, GCS
                                          └─ structured logs: stage timings, tokens, cost → Cloud Logging
```

Why: TypeScript end to end (shared schema + expression evaluator between server and client), PixiJS for 2D at 60 fps with real font rendering (Devanagari works because text is rasterised by the browser; no three.js needed), one Cloud Run service (satisfies the deployment rule, no Firebase CLI needed, nothing touches cheerio-app's existing Firebase). Orchestration is plain typed async stages. `@google/adk` 2.2 (TypeScript) was checked on day 0: 10 MB unpacked with Express, MikroORM and OpenTelemetry peer dependencies, aimed at long-running agents rather than a latency-bound fan-out; not adopted. The pipeline's stage graph is explicit in code and rendered live in the agent theatre, which is the honest "agentic" story for the deck. Isolation in `cheerio-app`: dedicated service account with least privilege, named Firestore DB, prefixed bucket, budget alert.

Eval harness: `pnpm eval` runs the pipeline on `eval/pages/*.jpg` with ground-truth JSON and writes `eval/REPORT.md` with Q-1…Q-4 scores, render success (headless Playwright renders each spec), and p50/p90 per stage for L-1…L-5.

## 11. Models per capability (researched on official docs and measured from cheerio-app on 2026-10-10)

The landscape moved a lot in 2026: Gemini 2.5 is gated to prior users, 3.5/3.7 Flash were deprecated on 8 Oct, Imagen is shut down, Veo 3.1 shuts down on 22 Oct (replaced by `gemini-omni-1.1-flash`), and `gemini-3.8-flash` rejects `minimal` thinking. All models below are listed for the Agent Platform (ex-Vertex AI) and respond from `cheerio-app` via the **global endpoint** (regional endpoints cost +10% and were ~1 s slower from India).

| Capability | Primary | Fallback | Price (standard tier) | Measured here |
|---|---|---|---|---|
| Quick read (type, language, figure boxes, gist) | `gemini-3.1-flash-lite`, `minimal`, image resolution `low`/`medium`, streamed JSON | `gemini-3.5-flash-lite` | $0.25 / $1.50 per 1M in/out | first byte 1.1 s; ~306 tok/s; 3.2 s for 626 tokens |
| Deep extraction (OCR, values, worked answers, boxes) | `gemini-3.6-flash`, `minimal`, resolution `high` | `gemini-3.8-flash`, `low` | $0.75 / $3.75 (doubles 1 Jan 2027) | 3.6: first byte 1.3 s, ~220 tok/s; 3.8: 1.7 s, ~129 tok/s |
| Scene spec v1 (≤1.2 k tokens) and narration script | `gemini-3.1-flash-lite` streamed | `gemini-3.5-flash-lite` | as above | ≈1.1 s + 4 s |
| Verification, repair, faithfulness judge | `gemini-3.8-flash`, `low`, code-execution tool for independent recomputation | `gemini-3.6-flash` | as above | off the critical path |
| Sprites and backgrounds | `gemini-3.1-flash-lite-image` (1K, no reference images) | `gemini-nano-banana-2.1` (up to 4 character + 10 object references, used for cross-page consistency, async) | $0.034 per 1K image | 2.9 s; 8.9 s |
| Narration and character voices | `gemini-3.8-flash-lite-tts` streamed, 100+ languages incl. Hindi, style via prompt, 2 speakers | `gemini-3.8-flash-tts`; Cloud TTS Chirp 3 HD `en-IN`/`hi-IN` | $0.50 / $6 per 1M tokens (≈$0.005 per 10 s of audio) | first audio 1.0–1.1 s (EN and HI) |
| Word-level caption timing (optional) | `gemini-3.5-transcribe` | proportional estimate | $2 per 1M audio tokens | not measured |
| Voice Q&A | `gemini-3.8-live` with ephemeral tokens | `gemini-3.5-transcribe-live` → Flash-Lite → TTS | ≈$0.005/min in, $0.018/min out | not measured (independent benchmark ≈1.2 s) |
| Ambience/SFX | bundled CC0 library | `lyria-realtime-exp` (music only, experimental) | — | — |
| Video upgrade (optional, async) | `gemini-omni-1.1-flash` 360p, cached | none | ≈$0.034 per second at 360p | not measured |

Estimated cost per page: ≈$0.05–0.08 (one sprite dominates); a 2-minute voice Q&A ≈$0.05. Budget guard: Agent Platform pay-as-you-go uses dynamic shared quota, so the server retries 429s with jitter and the demo pages are pre-warmed and cached.

Caveats carried into the design: no alpha/transparent output from image models (use white backgrounds and client-side chroma/difference matting); no TTS timestamps; `thinking_level` and `thinking_budget` must not be mixed; segmentation masks are unreliable on 3.x, so anchoring uses bounding boxes only.

## 12. Evaluation set and scoring

25-30 real photos: 8 science/maths, 4 other subjects, 6 story, 4 picture book, 4 Hindi (printed), 4 deliberately hard (angled, dim, curved, spread). Each has a ground-truth JSON: page type, language, 5-10 key values, worked answers, characters/dialogue, and a "must-not-claim" list. Scores: Q-1 key-value accuracy, Q-2 numeric match, Q-3 render success, Q-4 unsupported claims (judge + manual), latency p50/p90 from logs. The report is regenerated by one command and committed.

## 13. Top risks and day-0 de-risking spikes

| # | Risk | Spike (today/tomorrow) | Fallback |
|---|---|---|---|
| 1 | Image tracking: text-only pages give ~no tracking points; cold TF.js compile costs 20–30 s; MindAR unmaintained; phone fps unknown | Track 3 real pages (diagram-rich, text-only, picture book) on Android + iPad; time server-side vs client compile; measure fps, jitter, drop-outs; try TraceAR if jitter is bad | Figure-crop targets; Photo mode (warp onto the frozen capture); Flat |
| 2 | Token output speed blows the 5/15 s budgets | Done without an image (section 11); repeat the quick pass with a real page photo at `low`/`medium` resolution | Smaller schema, Flash-Lite tier, more parallelism |
| 3 | Spec invalid or ugly on first render (Q-3) | 20 generations across page types → validation pass rate | Repair loop + guaranteed fallback scene |
| 4 | iOS Safari camera/autoplay/memory quirks (no takePhoto, audio interruption after backgrounding, home-screen camera bugs, GPU memory kills) | Capture + narration + AR on the iPad on day 2; run in a Safari tab; resume audio on visibilitychange | Photo/Flat on iOS |
| 5 | Image generation slow or inconsistent across pages | Flash-Lite image measured at 2.9 s; test Nano Banana 2.1 reference consistency on day 4 | Placeholders first; style-guide prompts; cut-outs of the page |
| 6 | Verification false confidence | Deterministic evaluation only; honest "Unverified" state | — |
| 7 | Scope | Hero paths first (science, story), Hindi after English, deck/video decided day 6 | — |
| 8 | Quota/429s or model deprecations during judging (19 Oct–6 Nov) | Retries with jitter, pre-warmed cached demo pages, model ids in config with fallbacks; avoid Veo (shuts down 22 Oct) | Cached experiences still open |
| 9 | Team eligibility (solo not allowed; roster locks 11 Oct) | Hardeep adds a teammate today/tomorrow | — |

## 14. Build plan (2026-10-10 → 2026-10-18)

| Day | Date | Deliverable (end of day) |
|---|---|---|
| 0 | Oct 10–11 | Plan approved. **Team roster locked on the Hack2skill dashboard (Hardeep, by 11 Oct).** Repo + project scaffold, service account, bucket, Firestore DB. Spikes: tracking on real pages (Android + iPad), quick-pass latency with a real photo, Live API ephemeral-token round trip, 1-hour evaluation of `@google/adk` 2.x for orchestration (adopt only if it streams events and fans out without added latency). |
| 1 | Oct 11 | LivingScene v1 schema + evaluator + PixiJS renderer (Flat). Capture flow with quality gate. Pipeline skeleton with SSE + agent theatre. **Science page end-to-end in Flat mode.** |
| 2 | Oct 12 | AR mode: server-side target compile, tracker pre-warm, homography → matrix3d, awakening scene, Photo/Flat fallbacks, figure-crop anchoring. Tested on Android + iPad. |
| 3 | Oct 13 | Deep extraction, verification + repair loop, verification badge and log. Sliders, taps, step-through, replay. |
| 4 | Oct 14 | Story / picture-book path: character + background generation with book profile, page cut-outs, multi-voice TTS, captions, SFX library, mute/replay. |
| 5 | Oct 15 | Live voice Q&A grounded in page + state. Library, share links, instant reopen. Cloud Run deploy with HTTPS. |
| 6 | Oct 16 | Eval set + harness + first report; fixes. Hindi pass (prompts, voices, fonts, printed pages). Decide deck/video split. |
| 7 | Oct 17 | Hardening (NFR-1, reduced motion, contrast), three consecutive live runs, README + architecture diagram, deck, video script/shoot. |
| 8 | Oct 18 | Buffer and submission. |

## 15. Answers to the PRD's open questions (section 13)

1. Models/APIs → section 11 (Flash-Lite 3.1 for the fast path, 3.6 Flash for extraction, 3.8 Flash for verification, Flash-Lite Image + Nano Banana 2.1 for visuals, 3.8 Flash-Lite TTS, 3.8 Live; all measured from the project).
2. Any page without templates → section 3 (scene language + validation + repair + fallback).
3. Cross-platform page-anchored AR → section 6 (MindAR core tracker on the captured photo, compiled server-side; homography to CSS; Photo and Flat fallbacks).
4. L-2 in ≤5 s → section 4 (quick pass + awakening scene from page cut-outs; everything else upgrades in place).
5. Consistency across pages → section 9 (book profile with reference images, style guide, voice map, glossary).
6. Verification without worked answers → section 5 (independent recomputation with code execution; faithfulness judge).
7. Honest evaluation → section 12.
8. Riskiest assumptions → section 13, tested on day 0.

## 16. Needed from Hardeep

1. **By 11 Oct: add at least one eligible teammate on the Hack2skill dashboard** (21+, professional, JAPAC-based, not a student). Solo entries cannot submit.
2. Pick the theme (recommended: Theme 4, Media, Content & Digital Experiences) and ask on the event Discord for the deadline timezone.
3. Photograph 3 pages today (one diagram-rich science page, one text-only page, one picture-book page) with the Android phone for the tracking spike.
4. Approve this plan (after the AR section is filled in) before any application code is written.

Done already: gcloud re-authenticated; billing and APIs on `cheerio-app` verified; Gemini, image and TTS models respond from the project.
