# Living Book

Point your phone at any page of any book and watch it come alive: concepts become interactive simulations, stories become voiced animated scenes, diagrams move, and everything is anchored to the paper in augmented reality. Every experience is generated at runtime from the page you capture, by Google AI models, and checked for correctness before you see it.

Entry for the Google Cloud AI Builder Cup 2026 (Theme 4: Media, Content & Digital Experiences). Work started 2026-10-10; all code and assets in this repository were created during the hackathon window.

- Product requirements: [docs/PRD.md](docs/PRD.md)
- Technical plan: [docs/PLAN.md](docs/PLAN.md)
- Research notes: [docs/research/](docs/research/)

## Layout

| Path | What |
|---|---|
| `apps/web` | Mobile-first web app: capture, AR/photo/flat presentation, renderer, audio, voice Q&A |
| `apps/server` | Cloud Run service: generation pipeline, verification, library, share links |
| `packages/scene` | LivingScene schema, expression evaluator and types shared by server and client |
| `spikes/` | Day-0 feasibility spikes (page tracking, latency, Live API) |
| `eval/` | Evaluation set and scoring harness |

## Google Cloud services used

Gemini (Agent Platform / Vertex AI), Gemini image models, Gemini TTS, Gemini Live API, Cloud Run, Firestore, Cloud Storage, Cloud Logging.
