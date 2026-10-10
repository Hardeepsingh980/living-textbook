# Progress log

Running record of what works, what was measured, and what changed in the plan. Newest first. Times are IST.

## 2026-10-10 (night): round 5 result and the layout engine (round 6)

**Round 5 (visual judge):** overall 3.1 → 2.8 (placement 2.5, liveliness 2.8, correctness 4.0, narration 3.8); Hindi free fall 4.0 "ship", everything else "improve". Looking at the screenshots rather than the scores: the quick read's text-block boxes under-estimate paragraphs by 20–40 units, so readouts the builder put "in the gap" below a paragraph sat on its last lines (Ohm's law, photosynthesis); a moving cut-out was drawn beside its printed original and squashed to the model's w×h (boat); a sprite that "flies away" left the illustration and landed on the story text (fox); Pythagoras drew thin strips instead of squares; twelve-element scenes had two moving elements.
**Round 6 changes (deterministic where the model keeps failing):**
- *Ink map + layout pass* (`packages/scene/src/layout.ts`): the server rasterises the page photo into a 40-column map of dark-pixel density; after normalisation every label, readout, plot and bubble is measured against it and nudged to the nearest clean spot (stacked readouts move as one block, bubbles stay within reach of their speaker, a plot with no clean space is dropped). Free regions for the prompt now come from the same map. The harness reports mean/worst ink under overlays and how many were moved.
- *Renderer*: sprites are fitted inside their box without distortion; a page cut-out that moves away from where it was printed leaves a paper-coloured, feathered cover behind; a figure-anchored sprite that began inside its figure fades out when it leaves it; particles are 1.5× larger, electrons orbit their region when no path is given, and are capped at 40.
- *Faithfulness repairs*: a character line the verifier cannot find on the page is removed (and reported) instead of failing the whole scene; labels that only repeat the page title are dropped; sliders with multiplier units ("x", "level", "%") are controls, not facts.
- *Liveliness*: still highlight shapes breathe when fewer than three elements move; the harness counts moving elements (position/shape bound to time or animated, particles, drawing paths, plot markers).
- *Prompt*: Pythagoras squares are specified as polygons with the perpendicular construction; printed timelines get a travelling marker.

**Round 6 result (visual judge):** overall 2.8 → 2.8, placement 2.5 → 2.8, liveliness 2.8 → 2.5; Ohm's law 3 → 4 "ship"; every page verified or faithful (the boat's invented line was removed as a repair instead of failing the scene); worst ink under any readable overlay 2 % (the harness now measures it). The screenshots explained the rest: (1) **an absolute animation value on a figure-anchored sprite dropped the anchor offset** in the runtime, so the fox jumped from the illustration into the paragraph and the boat's generated sprite sat "in the sky" — the bug behind the "sprites over the text" complaint since round 2; (2) the rich model shrank Pythagoras' squares to fit inside the figure box because the prompt demanded it; (3) particles were too small to see at phone scale; (4) a picture-book character was generated instead of cut out of the page; (5) a third of rich scenes had fewer than three moving elements.
**Round 7 changes:** runtime keeps the anchor frame for absolute animation values; a "square" shape primitive (segment + the point to build away from) replaces hand-computed polygons and constructions may extend beyond the figure box; on picture-book pages the quick read locates each drawn character and generated look-alikes are swapped for cut-outs of the printed drawing (motion kept as offsets); electrons with no path follow the wire the scene draws; particles are 2.2× larger with heavier strokes; keyed textures are trimmed to the drawing; the rich builder thinks at "low", retries once on malformed JSON, and gets a motion pass when fewer than three elements move; scene kinds named after subjects ("science", "fable") map to scene kinds instead of costing a repair call; "none" colours are honoured; plots avoid the printed diagram.

**Round 7 result:** every page has at least three moving elements (the harness now counts them: 3–12 per scene), L-2 p50 back to ~7.6 s, all ten verified or faithful; visual judge overall 2.8 → 2.8 with liveliness 2.5 → 2.9 and Pythagoras "redo" → "improve" (true squares drawn with the new primitive). New faults the screenshots showed: a story page's boat was a generated sprite placed at the box centre (the model reads x,y as a centre; the renderer uses top-left), so it hung below the illustration; the fox crops carried a bit of caption; a timeline label printed its own conditional expression as text; the Hindi readouts lacked contrast; sparse small print under a label was invisible to the 25-unit ink cells.
**Round 8 changes (commit a0ce1db, deploy 9):** every cut-out starts exactly on the box it was cut from, at its printed size, with its motion kept as offsets (expression positions are shifted by their initial-state difference); drawn characters become cut-outs on story pages too (the quick read now locates each character); the scene language states what x,y mean per element type; keying floods from every border pixel with its own colour so a cut-out spanning sky and sea loses both, and covers are only painted on paper-like backgrounds; label templates must compile to numeric expressions; light-on-light label colours are corrected; the ink map has 64 columns and a single dense cell under a label disqualifies the spot; a verifier check that names a character line counts as a complaint about that line (removed as a repair); pictures are reused across scene versions (fox page cost $0.23 → $0.10, boat $0.09 → $0.025).

**Round 8 result (deploy 9):** visual judge overall 2.8 → **3.4** (clarity 3.6, placement 3.2, readability 3.4, liveliness 3.2, correctness 4.0, narration 3.9); three pages rated "ship" (Hindi free fall 5, Ohm's law 4, timeline 4); every scene has ≥ 3 moving elements except Ohm's law (2); worst ink under a readable overlay 1 %; L-2 p50 ≈ 7 s; cost per page $0.02–0.13.
**Round 9 changes (deploy 10):** the verifier may rewrite a step's narration that states something the page does not (the rainbow page's "water slows down light"), the step is voiced again and the stale clip is replaced; a verifier check that names a removed line is settled by the removal; character cut-outs keep only the drawing (caption pieces below it are cleared); particle regions written in figure units are moved onto the figure; speech-bubble tails of anchored bubbles point at the speaker (they used page coordinates).

## 2026-10-10 (late): rounds 4–5

**Round 4 (schema leniency, entry-wise salvage, crop anchors, border-colour keying):** numeric checks all green, L-1 1.7 s, L-3 5.3 s, L-2 7.9 s, L-4 (first verified scene) 12.6 s p50. Visual judge overall 2.7 → **3.1** (clarity 3.2, placement 2.6, readability 3.1, liveliness 2.9, correctness 4.0, narration 3.7); Ohm's law 4.3 and Hindi free fall 4.0 rated "ship"; free fall 2 (readouts and plot crowd the figure on a page with no margins). Remaining faults: figure-relative coordinates written without an anchor, particle regions in figure units, rectangular cut-outs carrying their background.
**Round 5 changes:** unanchored sprites/bubbles whose coordinates fit inside the main figure adopt it as anchor; anchored particle regions resolve to page units; cut-outs are keyed by their border colour; when free regions are scarce the builder uses at most two compact labels and no plot; qualitative knobs are not treated as invented numbers while invented numeric labels are stripped and reported as a repair.

## 2026-10-10 (night): evaluation rounds 2–3 and the root cause of thin scenes

**Round 2 (gridded figure crop):** numeric checks all green (values 27/27, worked 7/7, page-answer 4/4, rendered 10/10, 0 unsupported) but the visual judge averaged 2.7/5; the grid fixed structural alignment (timeline markers now sit on the printed dots) while labels still covered text, one label carried invented numbers, and the boat showed a white placeholder.
**Round 3 (free regions, no re-printed labels, animate on the printed structure, numeric-faithfulness check, geometry constructions):** clarity 2.8→3.1, correctness 3.6→3.8, placement 2.3→2.4, overall 2.7. Story dialogue preserved 5/5.

**Root causes found while reading the per-element validation issues:** (1) strict schema fields silently dropped most elements — JSON booleans for `visible`, loop values like "true"/"infinite", particle `rate` written as an expression, string booleans for `flip`; (2) a single malformed `anchors` entry made the whole-scene parse fail and the salvage path deleted the anchors section, unanchoring every element; (3) crop boxes were written in figure-relative units while the schema expected page units (the "white placeholder boat" was a crop of the sky); (4) generated PNGs have near-white, not pure white, backgrounds. All four are fixed: tolerant coercions, entry-wise salvage, crop assets accept an `anchor`, and the renderer keys by the border's median colour. Round 4 measures the effect.

## 2026-10-10 (evening): feedback round and the evaluation loop

**Hardeep's phone test** found: unstable tracking, visuals not matching the page, narration reading its style directive aloud and getting cut off, a cluttered UI, and an experience that stopped after one pass. Decisions: AR-only (no Photo/Flat toggles), no emoji, a consistent design language, continuous playback, ten example experiences evaluated as a whole.

**Fixed:** both Gemini 3.8 TTS models speak a leading directive verbatim (proved by transcribing the clips), so narration text now goes to TTS unchanged; a speech queue plays opener → step narration → character lines in order, auto-advances steps and loops; simulations keep running and restart at the end of their time range; the richer scene (Gemini 3.6 Flash, v2) is generated in parallel with the fast one (Flash-Lite, v1) and swapped in at the next loop with its own narration clips; the UI is AR-only with a line-icon set, a progress pill while generating, knob chips for variables, a caption card and three round controls; the tracker runs on a 720 px input, searches a pose grid around the seed, keeps smoothing across short dropouts, re-validates against the detector every 1.5 s and upgrades its templates (14 → 49 points) in the background.

**Evaluation loop (eval/):** `run.mjs` (pipeline + numeric checks + latency) → `shoot.mjs` (headless Chromium renders each experience in review mode, 3 moments) → `judge.mjs` (Gemini 3.8 Flash scores page + overlay screenshots + scene JSON on clarity, placement, readability, liveliness, correctness, narration).

**Round 1 (10 synthetic pages, before the placement fixes):** kind 7/10 (geography and non-fiction were called "science"), language 10/10, worked answers 7/7, page-answer checks 3/3, scenes rendered 10/10, unsupported claims 0, p50 first understanding 1.7 s, narration 5.2 s, generated scene 7.9 s. Visual judge overall (1–5): Ohm's law 4 (ship), Fox and the Crow 4, Little Red Boat 3, Hindi free fall 3, timeline 3, rainbow 3, free fall 3, water cycle 2.8, Pythagoras 2 (redo). Seven of nine "most important fixes" were placement: overlays not aligned with the printed figure or covering printed labels.

**Changes for round 2:** the scene builder now receives a crop of the main figure overlaid with a labelled coordinate grid (anchor-relative units) and is told to read positions from it; particles default to the figure region; labels and bubbles are clamped inside the page; story lines must be printed on the page word for word.

## 2026-10-10 (day 1, afternoon)

**Deployed:** https://living-book-945707801757.asia-south1.run.app (Cloud Run, asia-south1, 4 vCPU / 4 GiB, one warm instance, service account `living-book-sa`). Durable store: Cloud Storage bucket `cheerio-app-living-book` + Firestore database `living-book` (Native mode). A full pipeline run against the deployed service took 17.3 s with verification passing; the tracking compile is slower there (9 s on 4 vCPUs) but off the critical path.

**Story path works:** a synthetic "Fox and the Crow" page → kind=story (confidence 1), two generated character sprites (Gemini 3.1 Flash-Lite Image, 4.2 s, white background keyed out client-side), four steps with per-character lines (distinct voices), speech bubbles beside the speaker, forest ambience, verdict "faithful". $0.088 per page (images + ten voice clips).

**Voice Q&A works:** browser → WebSocket proxy on the server → Gemini 3.8 Live (us-central1). The tutor is grounded in the extraction and the scene, calls a `get_current_state` tool for live slider values, and answered a "what if gravity were 20" question with first audio 1.5 s after the question.

**AR in the real app:** camera session persists from framing to experience; tracker pre-warm 0.3 s, seeded tracking 0.6 s after capture (simulated camera), server detection data → re-acquisition 30–100 ms; AR falls back to photo mode after 2 s lost and returns when the page is found. Real-device numbers still pending.

**Fixes worth remembering:** Firestore rejects `undefined` (ignoreUndefinedProperties); SSE writes must be chained and awaited before the stream closes; Vite dev server cannot serve MindAR sources (CJS `long`), so the web app is built with `vite build --watch` and served by the API server; the verifier must map worked answers to *derived* ids (the scene builder now adds a derived value per worked answer); figure ids are normalised to `fig1…` so anchors line up.

## 2026-10-10 (day 0 → day 1)

**Working end to end (desktop, simulated page):** capture/upload → quick read → awakening → scene v1 → narration → extraction → verification → saved experience with a share URL. Pipeline p50 on the simulated free-fall page: ~16 s total, $0.017 per page; best run 13.0 s.

| Stage | Model | Typical | Notes |
|---|---|---|---|
| Quick read (type, language, title, gist, figure boxes, opener) | gemini-3.1-flash-lite, minimal, 768 px @ low media resolution | first token 1.4–1.6 s, done 2.0–2.3 s | first run in a fresh process is ~1 s slower (token fetch + TLS) |
| Opener narration | gemini-3.8-flash-lite-tts | playing at 6–7 s | ~3–4 s for a 10 s clip |
| Scene v1 (≤1.2k tokens) | gemini-3.1-flash-lite | done at 8–9 s | one 429 observed → retry with jitter, then fall back to 3.5-flash-lite |
| Extraction | gemini-3.6-flash, high media resolution | 8–14 s (varies with load) | 1.5k output tokens; candidate for Flash-Lite after the OCR eval |
| Verification | gemini-3.8-flash, low | 3–4 s after extraction | page-answer check computed deterministically from the model's variable mapping |
| Tracking compile (server) | MindAR detection pyramid capped at 640 px, 6 worker threads | 3.2–3.5 s, off the critical path | started after the quick read to avoid starving the event loop |

**Verification in practice:** the simulated page's worked example (stone dropped from 20 m: t = 2.02 s, v = 19.8 m/s) was mapped onto the scene's variables and the scene's own formula reproduced 19.796 m/s (0.0 % off) → "Verified against the page". One run produced a scene whose formula could not be mapped and was reported as "Check failed" rather than hidden.

**AR tracking (spike, `spikes/tracking`):** WebXR is unavailable on iOS Safari and Chrome image tracking is flag-only, so tracking uses MindAR's tracker and matcher directly:
- *Capture-seeded tracking*: the captured frame is the target; its tracking templates are extracted on-device in ~0.2–0.6 s of pure JS (worker) and the tracker starts from the known capture pose. Nothing waits for the server.
- *Server detection data* (for re-acquisition after loss) compiles in 2.1 s at 640 px / 3.0 s at 800 px across worker threads; re-acquisition then takes 20–100 ms.
- *Pre-warm*: WebGL kernel compilation costs ~6 s cold on desktop Chrome and is done while the user frames the page (0.2 s when warm).
- *Template resolution*: MindAR's default 128 px keyframe gave 3–15 templates on a text page; 256 px gave 15–50 and stable tracking in simulation; the `kf` parameter lets us compare on phones.
- *Photo mode* fallback (experience warped onto the frozen capture) is in place and aligned by construction.
- Real-device numbers (Android phone, iPad) are still pending Hardeep's test of the spike URL.

**Models verified from the project (cheerio-app, global endpoint):** gemini-3.1-flash-lite, gemini-3.5-flash-lite, gemini-3.6-flash, gemini-3.8-flash (no `minimal`), gemini-3.1-flash-lite-image (2.9 s), gemini-nano-banana-2.1 (8.9 s), gemini-3.8-flash-lite-tts and gemini-3.8-flash-tts (first audio ~1.1 s, Hindi OK), gemini-3.8-live (us-central1 only: connect 1.8 s, first audio 0.84 s).

**Decisions:**
- Voice Q&A goes through a Cloud Run WebSocket proxy (service-account credentials never reach the browser; Live is served from us-central1 for this project).
- `@google/adk` not adopted (heavy, aimed at long-running agents); the pipeline's stage graph is explicit and rendered live in the theatre.
- Procedural ambience/SFX (Web Audio) instead of licensed sound files.
- Theme 4 (Media, Content & Digital Experiences). Team roster must be completed by 11 Oct (solo entries cannot submit).

**Open items:** real-device tracking numbers; Hindi pass; story/picture-book path with generated sprites (image stage is wired but untested on a real story page); Live proxy; Firestore/GCS store; Cloud Run deploy; eval set.
