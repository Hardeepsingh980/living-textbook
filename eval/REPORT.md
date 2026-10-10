# Evaluation report

Generated 2026-10-10T09:16:00.759Z against http://localhost:8080; 10 run(s) over 10 page(s). Events in `eval/output/2026-10-10T09-11-29-448Z/`.

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
| Story dialogue preserved | 2/5 | — |
| Cost per page | $0.102 | reasonable |

## Latency (p50 / p90, from capture confirm)

| Moment | p50 / p90 | Target | Hard limit |
|---|---|---|---|
| L-1 first understanding | 1.8 s / 2.3 s | 1.5 s | 3 s |
| L-2 first animated scene (awakening is client-side at L-1 + ~0.3 s; this row is the generated scene) | 8.9 s / 14.0 s | 5 s | 10 s |
| L-3 narration starts | 5.1 s / 6.7 s | 6 s | 12 s |
| L-4 complete with verification (scene v1) | 16.2 s / 19.4 s | 15 s | 30 s |
| Richer scene v2 voiced and verified (upgrade at the next loop) | 21.9 s / 43.9 s | — | — |

| Stage done | p50 / p90 |
|---|---|
| read | 2.6 s / 3.1 s |
| build | 8.9 s / 14.0 s |
| understand | 10.0 s / 14.5 s |
| verify | 16.2 s / 19.4 s |

## Per page

| Page | Kind | Lang | Conf | Elements | Steps | Values | Worked | Page-answer | Verification | Unsupported | L-2 | L-4 | Cost | Errors |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| synthetic-biology-photosynthesis.jpg | science | en | 1 | 3 | 4 | 0/0 | 0/0 | 0/0 | faithful | 0 | 8.1 s | 13.5 s | $0.194 |  |
| synthetic-geography-water-cycle.jpg | science ✗ | en | 1 | 10 | 4 | 1/1 | 0/0 | 0/0 | faithful | 0 | 12.8 s | 16.2 s | $0.096 |  |
| synthetic-hindi-free-fall.jpg | science | hi | 1 | 4 | 1 | 4/4 | 2/2 | 1/1 | verified-page | 0 | 7.0 s | 19.4 s | $0.046 |  |
| synthetic-history-timeline.jpg | other-subject | en | 1 | 10 | 5 | 7/7 | 0/0 | 0/0 | faithful | 0 | 8.3 s | 12.0 s | $0.033 |  |
| synthetic-maths-pythagoras.jpg | maths | en | 1 | 5 | 1 | 6/6 | 2/2 | 1/1 | verified-page | 0 | 11.6 s | 16.3 s | $0.134 |  |
| synthetic-nonfiction-rainbow.jpg | science ✗ | en | 1 | 5 | 3 | 0/0 | 0/0 | 0/0 | faithful | 0 | 14.0 s | 16.5 s | $0.080 |  |
| synthetic-physics-free-fall.jpg | science | en | 0.95 | 4 | 2 | 4/4 | 2/2 | 1/1 | verified-page | 0 | 13.4 s | 18.7 s | $0.103 |  |
| synthetic-physics-ohms-law.jpg | science | en | 1 | 5 | 3 | 5/5 | 1/1 | 1/1 | verified-page | 0 | 7.5 s | 15.2 s | $0.060 |  |
| synthetic-picture-book-boat.jpg | story ✗ | en | 1 | 6 | 2 | -/0 | -/0 | 0/0 | faithful | 0 | 7.2 s | 14.0 s | $0.158 |  |
| synthetic-story-fox-crow.jpg | story | en | 1 | 4 | 4 | -/0 | -/0 | 0/0 | faithful | 0 | 8.9 s | 12.1 s | $0.113 |  |
