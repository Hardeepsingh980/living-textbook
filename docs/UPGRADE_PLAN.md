# Upgrade plan: continuity, validated reveal, live tutor

Written 2026-10-11 after inspecting the code (see the findings below). Design reference: `docs/UI_PROMPT.md`. The AR anchoring (MindAR-based `PageTracker`), the LivingScene DSL, the PixiJS renderer, the pipeline and the SSE protocol stay; the lifecycle around them changes.

## What the inspection found

| Symptom | Root cause in the code | Fix |
|---|---|---|
| The captured frame sits enlarged and frozen for 2–3 s after "Bring it to life" | `ExperienceView` shows the photo presentation whenever the tracker has not yet reported page corners (`onPhoto = !(arAvailable && arLive)`), with the capture scaled to cover the screen and the camera dimmed to 20 %. Seeding the tracker from the capture takes 0.6–3 s on a phone, so the frozen capture is exactly that wait. | Show the live camera from the first frame. The photo presentation is used only when there is no camera at all, or when a page that was found is lost for longer than 1.8 s. |
| Floating fragments, early diagrams and early narration before the real experience | Three things play before the verified scene: (1) the store builds an "awakening" scene from the quick read (cut-outs bobbing, sparkles, a title); (2) the opener sentence is voiced at ~5 s; (3) scene v1 from Flash-Lite is shown at ~7 s before verification, then replaced by v2 with a hard canvas swap at the next loop. | An explicit lifecycle with a reveal gate: `analyzing → generating → validating → preparing → ready → live`. Nothing is drawn or spoken until the first verified scene has its narration clip and pictures loaded and the renderer has initialised. The awakening scene and the opener are removed. A richer version cross-fades in at a step boundary. |
| Narration feels fragmented; questions start a separate mode | Narration is a queue of TTS clips per step; "Ask" opens a Live session per question and pauses narration until it ends. | One persistent Gemini Live session per lesson with scene tools; narration pauses on barge-in and resumes; the tutor acts on the scene through typed tools and explains only after the app confirms the change. |

## Lifecycle (client state machine, `store.phase`)

```
idle → capturing → analyzing (upload + quick read) → generating (scene) → validating (verification)
     → preparing (clips, pictures, renderer) → ready → live (tutor session open)
errors: failed (retry) · cancelled (a new capture supersedes the request: the fetch is aborted)
```

A scene version is "validated" when: its verification event has arrived and is not `failed`, the narration clip of its first step exists, every generated picture it references has loaded, and the renderer initialised without error. Only then is it revealed (`ready`). Later versions wait in `pendingScene` and are swapped at a step boundary with a cross-fade.

## Increments

1. **Continuity and the validated reveal** (client + a small server change): camera stays live; `GenerationOverlay` inside the page layer (so it follows the page in AR) with a soft light sweep, a contour around the main figure and the current state in words; reveal transition (overlay out, scene in, found cue); cross-fade between scene versions; abort a superseded generation; no awakening, no opener.
2. **Gemini Live tutor with scene tools**: persistent session per lesson (connect at reveal, mic on tap, reconnect with backoff); typed tools `get_scene_state`, `get_available_interactions`, `set_parameter`, `highlight_object`, `navigate_to_step`, `run_simulation`, `reset_simulation`; tool calls are forwarded to the browser, executed on the runtime, and confirmed before the model speaks; barge-in stops narration and model audio; states ready / listening / thinking / acting / speaking / interrupted / reconnecting / unavailable.
3. **Quality, transitions and verification**: readiness checks before reveal, centralized motion tokens, reduced motion, UI screenshots at phone size, an evaluation round, and a device test on the Android phone and the iPad.

## Not changed

The server pipeline order, the SSE event protocol, Cloud Run deployment, the service account on the server (credentials never reach the browser), the scene DSL and the renderer's drawing code.
