# Evaluation report

Generated 2026-10-10T08:22:55.050Z against http://localhost:8080; 3 run(s) over 3 page(s). Events in `eval/output/2026-10-10T08-22-11-374Z/`.

## Summary

| Metric | Result | Target |
|---|---|---|
| Page kind correct | 3/3 | — |
| Language correct | 3/3 | — |
| Key values recalled (Q-1) | 8/8 (100 %) | ≥ 95 % |
| Worked answers extracted within 2 % (Q-2) | 4/4 | all |
| Page-answer checks passed (Q-2) | 4/4 | all |
| Scenes rendered (Q-3) | 3/3 | ≥ 95 % |
| Unsupported claims found (Q-4) | 0 | 0 |
| Story dialogue preserved | 2/4 | — |
| Cost per page | $0.049 | reasonable |

## Latency (p50 / p90, from capture confirm)

| Moment | p50 / p90 | Target | Hard limit |
|---|---|---|---|
| L-1 first understanding | 1.7 s / 2.2 s | 1.5 s | 3 s |
| L-2 first animated scene (awakening is client-side at L-1 + ~0.3 s; this row is the generated scene) | 7.8 s / 8.3 s | 5 s | 10 s |
| L-3 narration starts | 6.4 s / 7.4 s | 6 s | 12 s |
| L-4 complete with verification | 14.6 s / 15.3 s | 15 s | 30 s |

| Stage done | p50 / p90 |
|---|---|
| read | 2.4 s / 3.1 s |
| build | 7.8 s / 8.3 s |
| understand | 9.4 s / 11.7 s |
| verify | 13.4 s / 15.0 s |

## Per page

| Page | Kind | Lang | Conf | Elements | Steps | Values | Worked | Page-answer | Verification | Unsupported | L-2 | L-4 | Cost | Errors |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| synthetic-hindi-free-fall.jpg | science | hi | 1 | 3 | 1 | 4/4 | 2/2 | 2/2 | verified-page | 0 | 8.3 s | 13.8 s | $0.013 |  |
| synthetic-physics-free-fall.jpg | science | en | 0.95 | 2 | 1 | 4/4 | 2/2 | 2/2 | verified-page | 0 | 6.6 s | 15.3 s | $0.016 |  |
| synthetic-story-fox-crow.jpg | story | en | 1 | 3 | 4 | -/0 | -/0 | 0/0 | faithful | 0 | 7.8 s | 14.6 s | $0.118 |  |
