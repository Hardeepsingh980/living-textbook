# Evaluation report

Generated 2026-10-10T14:00:25.409Z against http://localhost:8080; 1 run(s) over 1 page(s). Events in `eval/output/2026-10-10T14-00-06-125Z/`.

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
| Cost per page | $0.099 | reasonable |

## Latency (p50 / p90, from capture confirm)

| Moment | p50 / p90 | Target | Hard limit |
|---|---|---|---|
| L-1 first understanding | 1.7 s / 1.7 s | 1.5 s | 3 s |
| L-2 first animated scene (awakening is client-side at L-1 + ~0.3 s; this row is the generated scene) | 8.3 s / 8.3 s | 5 s | 10 s |
| L-3 narration starts | 5.0 s / 5.0 s | 6 s | 12 s |
| L-4 complete with verification (scene v1) | 11.3 s / 11.3 s | 15 s | 30 s |
| Richer scene v2 voiced and verified (upgrade at the next loop) | 19.2 s / 19.2 s | — | — |

| Stage done | p50 / p90 |
|---|---|
| read | 2.7 s / 2.7 s |
| build | 8.3 s / 8.3 s |
| understand | 7.0 s / 7.0 s |
| verify | 11.3 s / 11.3 s |

## Per page

| Page | Kind | Lang | Conf | Elements | Steps | Moving | Ink under labels mean/worst (moved) | Values | Worked | Page-answer | Verification | Unsupported | L-2 | L-4 | Cost | Errors |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| synthetic-story-fox-crow.jpg | story | en | 1 | 7 | 4 | 4/7 | 0 % / 0 % (2) | -/0 | -/0 | 0/0 | faithful | 0 | 8.3 s | 11.3 s | $0.099 |  |
