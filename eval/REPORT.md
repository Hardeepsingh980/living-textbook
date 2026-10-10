# Evaluation report

Generated 2026-10-10T09:05:05.670Z against http://localhost:8080; 10 run(s) over 10 page(s). Events in `eval/output/2026-10-10T09-00-38-499Z/`.

## Summary

| Metric | Result | Target |
|---|---|---|
| Page kind correct | 7/10 | — |
| Language correct | 10/10 | — |
| Key values recalled (Q-1) | 20/27 (74 %) | ≥ 95 % |
| Worked answers extracted within 2 % (Q-2) | 7/7 | all |
| Page-answer checks passed (Q-2) | 3/3 | all |
| Scenes rendered (Q-3) | 10/10 | ≥ 95 % |
| Unsupported claims found (Q-4) | 0 | 0 |
| Story dialogue preserved | 5/5 | — |
| Cost per page | $0.095 | reasonable |

## Latency (p50 / p90, from capture confirm)

| Moment | p50 / p90 | Target | Hard limit |
|---|---|---|---|
| L-1 first understanding | 1.7 s / 2.3 s | 1.5 s | 3 s |
| L-2 first animated scene (awakening is client-side at L-1 + ~0.3 s; this row is the generated scene) | 7.9 s / 12.0 s | 5 s | 10 s |
| L-3 narration starts | 5.2 s / 6.5 s | 6 s | 12 s |
| L-4 complete with verification | 25.8 s / 41.4 s | 15 s | 30 s |

| Stage done | p50 / p90 |
|---|---|
| read | 2.4 s / 3.2 s |
| build | 7.9 s / 12.0 s |
| understand | 10.3 s / 31.4 s |
| verify | 13.7 s / 36.2 s |

## Per page

| Page | Kind | Lang | Conf | Elements | Steps | Values | Worked | Page-answer | Verification | Unsupported | L-2 | L-4 | Cost | Errors |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| synthetic-biology-photosynthesis.jpg | science | en | 1 | 6 | 4 | 0/0 | 0/0 | 0/0 | faithful | 0 | 9.1 s | 20.6 s | $0.095 |  |
| synthetic-geography-water-cycle.jpg | science ✗ | en | 1 | 10 | 4 | 1/1 | 0/0 | 0/0 | faithful | 0 | 7.9 s | 40.0 s | $0.095 |  |
| synthetic-hindi-free-fall.jpg | science | hi | 1 | 8 | 3 | 4/4 | 2/2 | 1/1 | verified-page | 0 | 7.0 s | 41.4 s | $0.062 |  |
| synthetic-history-timeline.jpg | other-subject | en | 1 | 12 | 4 | 0/7 | 0/0 | 0/0 | faithful | 0 | 7.2 s | 25.8 s | $0.064 |  |
| synthetic-maths-pythagoras.jpg | maths | en | 1 | 4 | 4 | 6/6 | 2/2 | 1/1 | verified-page | 0 | 12.0 s | 21.1 s | $0.100 |  |
| synthetic-nonfiction-rainbow.jpg | science ✗ | en | 1 | 7 | 3 | 0/0 | 0/0 | 0/0 | faithful | 0 | 7.8 s | 19.2 s | $0.125 |  |
| synthetic-physics-free-fall.jpg | science | en | 0.95 | 5 | 4 | 4/4 | 2/2 | 0/0 | checked-independently | 0 | 8.0 s | 17.9 s | $0.064 |  |
| synthetic-physics-ohms-law.jpg | science | en | 1 | 5 | 4 | 5/5 | 1/1 | 1/1 | verified-page | 0 | 7.6 s | 34.1 s | $0.060 |  |
| synthetic-picture-book-boat.jpg | story ✗ | en | 1 | 6 | 3 | -/0 | -/0 | 0/0 | faithful | 0 | 8.3 s | 28.9 s | $0.158 |  |
| synthetic-story-fox-crow.jpg | story | en | 1 | 7 | 4 | -/0 | -/0 | 0/0 | faithful | 0 | 7.7 s | 18.2 s | $0.132 |  |
