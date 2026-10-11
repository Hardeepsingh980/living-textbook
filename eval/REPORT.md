# Evaluation report

Generated 2026-10-11T11:33:34.434Z against http://localhost:8080; 10 run(s) over 10 page(s). Events in `eval/output/2026-10-11T11-29-16-188Z/`.

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
| Overlays clear of printed ink (worst label < 10 % ink) | 10/10 | all |
| Scenes with ≥ 3 moving elements | 10/10 | all |
| Cost per page | $0.044 | reasonable |

## Latency (p50 / p90, from capture confirm)

| Moment | p50 / p90 | Target | Hard limit |
|---|---|---|---|
| L-1 first understanding | 1.6 s / 2.4 s | 1.5 s | 3 s |
| L-2 first animated scene (awakening is client-side at L-1 + ~0.3 s; this row is the generated scene) | 7.2 s / 14.8 s | 5 s | 10 s |
| L-3 narration starts | 9.2 s / 16.6 s | 6 s | 12 s |
| L-4 complete with verification (scene v1) | 14.3 s / 17.9 s | 15 s | 30 s |
| Richer scene v2 voiced and verified (upgrade at the next loop) | 25.9 s / 32.6 s | — | — |

| Stage done | p50 / p90 |
|---|---|
| read | 2.5 s / 5.5 s |
| build | 7.2 s / 14.8 s |
| understand | 10.3 s / 13.3 s |
| verify | 14.3 s / 17.9 s |

## Per page

| Page | Kind | Lang | Conf | Elements | Steps | Moving | Ink under labels mean/worst (moved) | Values | Worked | Page-answer | Verification | Unsupported | L-2 | L-4 | Cost | Errors |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| synthetic-biology-photosynthesis.jpg | science | en | 1 | 8 | 3 | 4/8 | 0 % / 0 % (0) | 0/0 | 0/0 | 0/0 | faithful | 0 | 8.3 s | 17.3 s | $0.023 |  |
| synthetic-geography-water-cycle.jpg | science ✗ | en | 1 | 6 | 4 | 4/6 | 0 % / 0 % (0) | 1/1 | 0/0 | 0/0 | faithful | 0 | 6.8 s | 9.3 s | $0.058 |  |
| synthetic-hindi-free-fall.jpg | science | hi | 1 | 8 | 4 | 4/8 | 0 % / 0 % (1) | 4/4 | 2/2 | 1/1 | verified-page | 0 | 6.9 s | 14.8 s | $0.063 |  |
| synthetic-history-timeline.jpg | other-subject | en | 1 | 7 | 5 | 5/7 | 0 % / 0 % (0) | 7/7 | 0/0 | 0/0 | faithful | 0 | 6.1 s | 10.1 s | $0.037 |  |
| synthetic-maths-pythagoras.jpg | maths | en | 1 | 11 | 4 | 4/11 | 0 % / 0 % (2) | 6/6 | 2/2 | 1/1 | verified-page | 0 | 7.4 s | 12.9 s | $0.047 |  |
| synthetic-nonfiction-rainbow.jpg | science ✗ | en | 1 | 11 | 3 | 9/11 | 1 % / 1 % (1) | 0/0 | 0/0 | 0/0 | faithful | 0 | 7.2 s | 11.9 s | $0.026 |  |
| synthetic-physics-free-fall.jpg | science | en | 0.95 | 6 | 3 | 3/6 | 1 % / 1 % (0) | 4/4 | 2/2 | 1/1 | verified-page | 0 | 6.9 s | 16.0 s | $0.063 |  |
| synthetic-physics-ohms-law.jpg | science | en | 1 | 9 | 3 | 5/9 | 0 % / 0 % (2) | 5/5 | 1/1 | 1/1 | verified-page | 0 | 6.7 s | 14.3 s | $0.037 |  |
| synthetic-picture-book-boat.jpg | story ✗ | en | 1 | 5 | 3 | 4/5 | 0 % / 0 % (0) | -/0 | -/0 | 0/0 | faithful | 0 | 14.8 s | 17.9 s | $0.024 |  |
| synthetic-story-fox-crow.jpg | story | en | 1 | 8 | 4 | 4/8 | 0 % / 1 % (2) | -/0 | -/0 | 0/0 | faithful | 0 | 10.4 s | 13.1 s | $0.065 |  |
