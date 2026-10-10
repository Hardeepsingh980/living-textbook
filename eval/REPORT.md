# Evaluation report

Generated 2026-10-10T12:57:25.949Z against http://localhost:8080; 10 run(s) over 10 page(s). Events in `eval/output/2026-10-10T12-54-09-146Z/`.

## Summary

| Metric | Result | Target |
|---|---|---|
| Page kind correct | 7/10 | — |
| Language correct | 10/10 | — |
| Key values recalled (Q-1) | 27/27 (100 %) | ≥ 95 % |
| Worked answers extracted within 2 % (Q-2) | 7/7 | all |
| Page-answer checks passed (Q-2) | 4/4 | all |
| Scenes rendered (Q-3) | 10/10 | ≥ 95 % |
| Unsupported claims found (Q-4) | 0 | 0 |
| Story dialogue preserved | 5/5 | — |
| Cost per page | $0.097 | reasonable |

## Latency (p50 / p90, from capture confirm)

| Moment | p50 / p90 | Target | Hard limit |
|---|---|---|---|
| L-1 first understanding | 1.7 s / 2.1 s | 1.5 s | 3 s |
| L-2 first animated scene (awakening is client-side at L-1 + ~0.3 s; this row is the generated scene) | 7.9 s / 14.3 s | 5 s | 10 s |
| L-3 narration starts | 5.3 s / 6.5 s | 6 s | 12 s |
| L-4 complete with verification (scene v1) | 12.6 s / 18.7 s | 15 s | 30 s |
| Richer scene v2 voiced and verified (upgrade at the next loop) | 18.8 s / 28.6 s | — | — |

| Stage done | p50 / p90 |
|---|---|
| read | 2.7 s / 3.5 s |
| build | 7.9 s / 14.3 s |
| understand | 7.9 s / 11.7 s |
| verify | 12.6 s / 18.7 s |

## Per page

| Page | Kind | Lang | Conf | Elements | Steps | Values | Worked | Page-answer | Verification | Unsupported | L-2 | L-4 | Cost | Errors |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| synthetic-biology-photosynthesis.jpg | science | en | 0.98 | 9 | 3 | 0/0 | 0/0 | 0/0 | failed | 0 | 9.3 s | 16.0 s | $0.193 |  |
| synthetic-geography-water-cycle.jpg | science ✗ | en | 1 | 7 | 4 | 1/1 | 0/0 | 0/0 | failed | 0 | 7.9 s | 11.4 s | $0.127 |  |
| synthetic-hindi-free-fall.jpg | science | hi | 0.98 | 6 | 4 | 4/4 | 2/2 | 1/1 | verified-page | 0 | 6.9 s | 10.2 s | $0.064 |  |
| synthetic-history-timeline.jpg | other-subject | en | 1 | 7 | 6 | 7/7 | 0/0 | 0/0 | faithful | 0 | 7.1 s | 10.0 s | $0.100 |  |
| synthetic-maths-pythagoras.jpg | maths | en | 1 | 10 | 3 | 6/6 | 2/2 | 1/1 | verified-page | 0 | 12.0 s | 15.5 s | $0.035 |  |
| synthetic-nonfiction-rainbow.jpg | science ✗ | en | 1 | 12 | 3 | 0/0 | 0/0 | 0/0 | faithful | 0 | 14.3 s | 18.7 s | $0.100 |  |
| synthetic-physics-free-fall.jpg | science | en | 0.95 | 7 | 3 | 4/4 | 2/2 | 1/1 | verified-page | 0 | 7.9 s | 15.3 s | $0.064 |  |
| synthetic-physics-ohms-law.jpg | science | en | 1 | 7 | 4 | 5/5 | 1/1 | 1/1 | verified-page | 0 | 7.2 s | 12.2 s | $0.030 |  |
| synthetic-picture-book-boat.jpg | story ✗ | en | 1 | 6 | 3 | -/0 | -/0 | 0/0 | faithful | 0 | 6.8 s | 9.9 s | $0.124 |  |
| synthetic-story-fox-crow.jpg | story | en | 1 | 7 | 4 | -/0 | -/0 | 0/0 | faithful | 0 | 8.5 s | 12.6 s | $0.134 |  |
