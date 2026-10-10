# Evaluation report

Generated 2026-10-10T14:14:22.680Z against http://localhost:8080; 1 run(s) over 1 page(s). Events in `eval/output/2026-10-10T14-14-02-529Z/`.

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
| Story dialogue preserved | 4/4 | — |
| Overlays clear of printed ink (worst label < 10 % ink) | 1/1 | all |
| Scenes with ≥ 3 moving elements | 1/1 | all |
| Cost per page | $0.064 | reasonable |

## Latency (p50 / p90, from capture confirm)

| Moment | p50 / p90 | Target | Hard limit |
|---|---|---|---|
| L-1 first understanding | 2.1 s / 2.1 s | 1.5 s | 3 s |
| L-2 first animated scene (awakening is client-side at L-1 + ~0.3 s; this row is the generated scene) | 8.0 s / 8.0 s | 5 s | 10 s |
| L-3 narration starts | 5.8 s / 5.8 s | 6 s | 12 s |
| L-4 complete with verification (scene v1) | 11.1 s / 11.1 s | 15 s | 30 s |
| Richer scene v2 voiced and verified (upgrade at the next loop) | 20.1 s / 20.1 s | — | — |

| Stage done | p50 / p90 |
|---|---|
| read | 3.0 s / 3.0 s |
| build | 8.0 s / 8.0 s |
| understand | 7.7 s / 7.7 s |
| verify | 11.1 s / 11.1 s |

## Per page

| Page | Kind | Lang | Conf | Elements | Steps | Moving | Ink under labels mean/worst (moved) | Values | Worked | Page-answer | Verification | Unsupported | L-2 | L-4 | Cost | Errors |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| synthetic-story-fox-crow.jpg | story | en | 1 | 8 | 4 | 4/8 | 1 % / 1 % (2) | -/0 | -/0 | 0/0 | faithful | 0 | 8.0 s | 11.1 s | $0.064 |  |
