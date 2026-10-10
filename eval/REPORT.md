# Evaluation report

Generated 2026-10-10T09:11:06.082Z against http://localhost:8080; 10 run(s) over 10 page(s). Events in `eval/output/2026-10-10T09-10-28-897Z/`.

## Summary

| Metric | Result | Target |
|---|---|---|
| Page kind correct | 1/1 | — |
| Language correct | 1/1 | — |
| Key values recalled (Q-1) | 0/0 (0 %) | ≥ 95 % |
| Worked answers extracted within 2 % (Q-2) | 0/0 | all |
| Page-answer checks passed (Q-2) | 0/0 | all |
| Scenes rendered (Q-3) | 1/1 | ≥ 95 % |
| Unsupported claims found (Q-4) | 0 | 0 |
| Story dialogue preserved | 0/0 | — |
| Cost per page | $0.164 | reasonable |

## Latency (p50 / p90, from capture confirm)

| Moment | p50 / p90 | Target | Hard limit |
|---|---|---|---|
| L-1 first understanding | 2.7 s / 2.7 s | 1.5 s | 3 s |
| L-2 first animated scene (awakening is client-side at L-1 + ~0.3 s; this row is the generated scene) | 15.3 s / 15.3 s | 5 s | 10 s |
| L-3 narration starts | 7.4 s / 7.4 s | 6 s | 12 s |
| L-4 complete with verification (scene v1) | 18.7 s / 18.7 s | 15 s | 30 s |
| Richer scene v2 voiced and verified (upgrade at the next loop) | 22.6 s / 22.6 s | — | — |

| Stage done | p50 / p90 |
|---|---|
| read | 4.0 s / 4.0 s |
| build | 15.3 s / 15.3 s |
| understand | 12.0 s / 12.0 s |
| verify | 18.7 s / 18.7 s |

## Per page

| Page | Kind | Lang | Conf | Elements | Steps | Values | Worked | Page-answer | Verification | Unsupported | L-2 | L-4 | Cost | Errors |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| synthetic-biology-photosynthesis.jpg | science | en | 1 | 8 | 4 | 0/0 | 0/0 | 0/0 | faithful | 0 | 15.3 s | 18.7 s | $0.164 |  |
| synthetic-geography-water-cycle.jpg | - | - | - | - | - | -/- | -/- | -/- | - | 0 | – | – | $0.000 | terminated |
| synthetic-hindi-free-fall.jpg | - | - | - | - | - | -/- | -/- | -/- | - | 0 | – | – | $0.000 | fetch failed |
| synthetic-history-timeline.jpg | - | - | - | - | - | -/- | -/- | -/- | - | 0 | – | – | $0.000 | fetch failed |
| synthetic-maths-pythagoras.jpg | - | - | - | - | - | -/- | -/- | -/- | - | 0 | – | – | $0.000 | fetch failed |
| synthetic-nonfiction-rainbow.jpg | - | - | - | - | - | -/- | -/- | -/- | - | 0 | – | – | $0.000 | fetch failed |
| synthetic-physics-free-fall.jpg | - | - | - | - | - | -/- | -/- | -/- | - | 0 | – | – | $0.000 | fetch failed |
| synthetic-physics-ohms-law.jpg | - | - | - | - | - | -/- | -/- | -/- | - | 0 | – | – | $0.000 | fetch failed |
| synthetic-picture-book-boat.jpg | - | - | - | - | - | -/- | -/- | -/- | - | 0 | – | – | $0.000 | fetch failed |
| synthetic-story-fox-crow.jpg | - | - | - | - | - | -/- | -/- | -/- | - | 0 | – | – | $0.000 | fetch failed |
