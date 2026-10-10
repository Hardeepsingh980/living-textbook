# Research notes: Google AI models and APIs for Living Book (2026-10-10)

> Compiled by an automated research agent from official Google documentation on 2026-10-10, then spot-checked by live calls from the `cheerio-app` project (see "Measured" below). Treat as notes: verify any figure before relying on it in the deck. Items marked UNVERIFIED could not be confirmed on an official page.

## Landscape changes a mid-2026 engineer might not know

- Text family now: `gemini-3.8-flash` (GA Sep 2), `gemini-3.6-flash`, `gemini-3.5-flash-lite` (GA Jul 21), `gemini-3.1-flash-lite` (GA May 7, shutdown May 7 2027), `gemini-3.1-pro-preview`, `gemini-3-flash-preview`. `gemini-3.5-flash` and `gemini-3.7-flash` deprecated Oct 8 (auto-routed to 3.6/3.8). Gemini 2.5 gated to users who used it recently since Sep 18. (https://ai.google.dev/gemini-api/docs/changelog, https://ai.google.dev/gemini-api/docs/models)
- Imagen shut down Aug 17 2026. All Veo 3.1 variants shut down Oct 22 2026, replaced by `gemini-omni-1.1-flash`. (https://ai.google.dev/gemini-api/docs/deprecations)
- Interactions API (`POST /v1beta/interactions`, GA June 2026) is the recommended surface; `generateContent` remains supported. `thinking_level` replaces `thinking_budget` (mixing them → 400). `temperature/top_p/top_k` deprecated Jul 21. (https://ai.google.dev/gemini-api/docs/interactions, https://ai.google.dev/gemini-api/docs/thinking)
- Vertex AI is now "Gemini Enterprise Agent Platform"; Agent Engine is "Agent Runtime". (https://docs.cloud.google.com/gemini-enterprise-agent-platform/overview)
- Intro pricing for 3.8/3.6 Flash and 3.8 TTS doubles on Jan 1 2027.
- Firebase AI Logic requires App Check from Nov 2 2026.

## Vision / page understanding

| Model | Price per 1M in/out | Notes | Source |
|---|---|---|---|
| `gemini-3.5-flash-lite` | $0.30 / $2.50 | thinking minimal/low/medium/high; 1M context; positioned for document parsing | https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite |
| `gemini-3.1-flash-lite` | $0.25 / $1.50 | `minimal` default; shutdown May 7 2027 | https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-lite |
| `gemini-3.8-flash` | $0.75 / $3.75 intro → $1.50 / $7.50 from Jan 1 2027 | **no `minimal` level** (confirmed: returns 400); best quality | https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash |
| `gemini-3.6-flash` | same as 3.8 | supports `minimal` | https://ai.google.dev/gemini-api/docs/thinking |
| `gemini-3.1-pro-preview` | $2 / $12 (≤200k) | overkill for this product | https://ai.google.dev/gemini-api/docs/pricing |

- Bounding boxes: `box_2d` = `[ymin, xmin, ymax, xmax]`, normalised 0–1000, requested via JSON schema. Segmentation on 3.x is reported unsupported by some docs (conflict) — use boxes only. (https://ai.google.dev/gemini-api/docs/image-understanding)
- Media resolution (Gemini 3): image low 280 / medium 560 / high 1120 (default) / ultra_high 2240 tokens, set per media part as `resolution`. (https://ai.google.dev/gemini-api/docs/media-resolution)
- Structured output: `response_format` with JSON schema; streaming yields partial JSON strings to concatenate; very deep schemas may be rejected. (https://ai.google.dev/gemini-api/docs/structured-output)
- Hindi OCR: no 3.x Devanagari benchmark; a June 2026 paper puts Gemini 2.5 Flash top on printed Devanagari scans with conjunct/matra/nukta as error classes (https://arxiv.org/abs/2606.29213v1). NFC-normalise and test on our own pages.
- Rate limits page no longer lists per-model RPM/RPD; Tier 1 has a $10 per rolling 10-minute spend cap on the Developer API. (https://ai.google.dev/gemini-api/docs/rate-limits)

## Image generation

| Model | Price | Notes | Source |
|---|---|---|---|
| `gemini-3.1-flash-lite-image` (Nano Banana 2 Lite) | $0.034 per 1K image | 1K only; no multi-reference; thinking minimal (default)/high; GA Jun 30 | https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-lite-image |
| `gemini-nano-banana-2.1` | $0.034 (1K) / $0.050 (2K) / $0.113 (4K) | GA Oct 6; up to 4 character + 10 object references; mask editing | https://ai.google.dev/gemini-api/docs/image-generation |
| `gemini-3.1-flash-image` (NB2) | $0.045 (0.5K) / $0.067 (1K) | deprecated Oct 6 | deprecations |
| `gemini-3-pro-image` (NB Pro) | $0.134 (1K/2K), $0.24 (4K) | ~20–30 s (community); best typography | pricing |
| Imagen 4 | — | **shut down Aug 17 2026** | https://ai.google.dev/gemini-api/docs/imagen |

All carry SynthID. No transparent/alpha output on any Nano Banana (community consensus) — use white backgrounds and client-side matting.

## Video

| Model | Price | Notes | Source |
|---|---|---|---|
| `veo-3.1-generate-preview` / `-fast-` / `-lite-` | $0.40 / $0.10 / $0.05 per s | async; "min 11 s, max 6 min"; **shutdown Oct 22 2026** | https://ai.google.dev/gemini-api/docs/veo |
| `gemini-omni-1.1-flash` | ≈$0.034/s at 360p, $0.10/s 720p | 3–10 s clips with audio; community 25–38 s per 5 s clip | https://ai.google.dev/gemini-api/docs/omni |

Nothing fits a 15 s budget; only viable as a cached asynchronous upgrade.

## Text-to-speech

| Model / voice | Price | Notes | Source |
|---|---|---|---|
| `gemini-3.8-flash-tts` | $0.50 in / $9 per 1M audio tokens (≈$0.0054 per 10 s) | GA Sep 22; 130+ languages incl. Hindi, auto-detect; 30 prebuilt + 2,000+ library voices; voice design; max 2 speakers; style via prompt; **no timestamps**; voice replication not available in India | https://ai.google.dev/gemini-api/docs/speech-generation |
| `gemini-3.8-flash-lite-tts` | $0.50 / $6 | low-latency tier; 100+ languages incl. Hindi | models page |
| 2.5 TTS previews, `gemini-3.1-flash-tts-preview` | — | shutdown Nov 17 2026 | deprecations |
| Cloud TTS Chirp 3 HD (`hi-IN-Chirp3-HD-*`, `en-IN-*`) | $30 per 1M chars; 1M chars/month free | bidirectional streaming; `[pause]` markup; SSML `<mark>` timepoints UNVERIFIED | https://docs.cloud.google.com/text-to-speech/docs/chirp3-hd |
| Chirp 3 Instant Custom Voice | $60 per 1M chars | allow-list only | https://docs.cloud.google.com/text-to-speech/docs/chirp3-instant-custom-voice |

No Google TTS returns word timestamps. Caption sync: per-sentence synthesis; optional alignment with `gemini-3.5-transcribe` (word timestamps, Hindi, $2 per 1M audio tokens ≈ $0.003/min). (https://ai.google.dev/gemini-api/docs/models/gemini-3.5-transcribe)

## Real-time voice

| Model | Price | Notes | Source |
|---|---|---|---|
| `gemini-3.8-live` | audio in $3/1M (≈$0.005/min), out $12/1M (≈$0.018/min); text $0.75/$4.50 | GA Sep 15; 99 languages incl. Hindi (auto-switch); 16 kHz PCM in / 24 kHz out; audio-only session 15 min, connection ~10 min with resumption handles; async `NON_BLOCKING` tools by default; independent benchmark ≈1.18 s to first audio | https://ai.google.dev/gemini-api/docs/live-api/capabilities, https://ai.google.dev/gemini-api/docs/models/gemini-3.8-live |
| `gemini-3.8-live-extended-thinking` | same | thinking low/medium/high | same |
| 2.5 native audio, `gemini-3.1-flash-live-preview` | — | shutdown Nov 17 2026 | deprecations |

Ephemeral tokens (Live only, `v1beta`): `auth_tokens.create` with `uses`, `expire_time` (default 30 min), `new_session_expire_time` (default 1 min); lock the system instruction via `live_connect_constraints`. (https://ai.google.dev/gemini-api/docs/ephemeral-tokens)

Cascade alternative: Chirp 3 STT streaming ($0.016/min, us/eu regions only) or `gemini-3.5-transcribe-live` ($0.005/min) → Flash-Lite → TTS.

## Agent platforms

- Gemini Enterprise Agent Platform (Apr 22 2026) absorbed Vertex AI gen-AI, Agent Builder and Agentspace: Agent Runtime, Sessions, Memory Bank, Agent Gateway. (https://docs.cloud.google.com/gemini-enterprise-agent-platform/build/runtime)
- ADK: Python `google-adk`; TypeScript `@google/adk` 2.0 GA Aug 20 2026 (v2.2.0 Sep 30) with `LlmAgent`, `FunctionTool` (zod), sequential/parallel/loop and graph workflows, MCP, `adk deploy cloud_run`. Live/bidi is Python and Java only. (https://adk.dev/, https://github.com/google/adk-js)
- Antigravity: the IDE/CLI/SDK (Antigravity 2.0), plus a managed agent in the Gemini API (`antigravity-preview-09-2026`, Interactions API, sandboxed code execution). (https://ai.google.dev/gemini-api/docs/antigravity-agent)

## Sound / music

- `lyria-realtime-exp` (WebSocket, instrumental music only, experimental), `lyria-3-clip-preview` ($0.04 per 30 s clip). No Google API generates sound effects. (https://ai.google.dev/gemini-api/docs/realtime-music-generation)

## Regions and quotas

- Developer API: global pool only. Agent Platform `asia-south1` lists 3.8/3.6 Flash, 3.5/3.1 Flash-Lite, Nano Banana 2.1, 3.1 Flash(-Lite) Image, 3 Pro Image, 3.8 Live, 3.8 TTS (preview), Omni; regional +10%. (https://docs.cloud.google.com/vertex-ai/generative-ai/docs/learn/locations)
- Agent Platform pay-as-you-go uses Dynamic Shared Quota (429 "Resource exhausted" under load); Provisioned Throughput is the fix. (https://docs.cloud.google.com/vertex-ai/generative-ai/docs/dynamic-shared-quota)

## Measured from `cheerio-app` on 2026-10-10 (global endpoint, from India)

Streamed JSON of ~600 output tokens, no image input:

| Model | Thinking | First byte | Total | Output tok/s |
|---|---|---|---|---|
| gemini-3.1-flash-lite | minimal | 1.13 s | 3.18 s | ~306 |
| gemini-3.5-flash-lite | minimal | 1.76 s | 3.73 s | ~322 |
| gemini-3.6-flash | minimal | 1.32 s | 4.23 s | ~220 |
| gemini-3.8-flash | low | 1.68 s | 5.82 s | ~129 |
| gemini-3.8-flash | minimal | HTTP 400 "Thinking level is unsupported" | | |
| gemini-2.5-flash-lite | budget 0 | 1.10 s | 2.84 s | ~351 |
| gemini-2.5-flash | budget 0 | 1.28 s | 3.83 s | ~261 |

| Model | Call | Result |
|---|---|---|
| gemini-3.1-flash-lite-image | one 1:1 image | 2.87 s |
| gemini-nano-banana-2.1 | one 1:1 image | 8.88 s |
| gemini-3.8-flash-lite-tts | English sentence, streamed | first audio 1.14 s, total 3.5 s |
| gemini-3.8-flash-lite-tts | Hindi sentence, streamed | first audio 1.02 s, total 3.95 s |
| gemini-3.8-flash-tts | English sentence, streamed | first audio 1.18 s, total 3.65 s |

A 5-token non-streamed prompt to `gemini-2.5-flash` took 1.0–1.3 s via the global endpoint and 2.1 s via `us-central1`.

## UNVERIFIED (measure before the demo)

Flash-Lite first-token latency with an image input; Live API concurrency on the Developer API; Chirp 3 HD `<mark>` timepoints; segmentation on 3.x; Omni per-clip time; Lyria RealTime access; free-tier RPD figures.
