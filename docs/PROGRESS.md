# Progress log

Running record of what works, what was measured, and what changed in the plan. Newest first. Times are IST.

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
